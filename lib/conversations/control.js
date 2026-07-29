// =============================================================================
// WhatJuris CRM — Serviço de controle de conversa (Human Takeover)
// lib/conversations/control.js
//
// Fonte de verdade: PostgreSQL (conversation_controls + _events). O Redis é
// cache OPCIONAL (lib/redis/client.js) — se ausente/fora, tudo opera no PG.
//
// Política de falha SEGURA (fail-closed): quando não é possível confirmar o
// estado (Redis e PG indisponíveis), retornamos bloqueado + stop_and_retry.
// Nunca liberar a IA sem confirmar o estado.
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { getRedis } from '@/lib/redis/client';
import { registerOutboundAI, isOutboundAI } from '@/lib/whatsapp/outbound-registry';

export { registerOutboundAI, isOutboundAI };

const BLOCK_PREFIX = 'block:v1';

// ---- sanitização (contrato seção 3/6) -------------------------------------
export function sanitizeInstance(instanceName) {
  return String(instanceName || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}
export function sanitizeChatId(chatId) {
  return String(chatId || '').replace(/\D/g, '');
}
export function blockKey(instanceName, chatId) {
  return `${BLOCK_PREFIX}:${sanitizeInstance(instanceName)}:${sanitizeChatId(chatId)}`;
}

function takeoverTtl(override) {
  const n = override != null ? Number(override) : parseInt(process.env.HUMAN_TAKEOVER_TTL_SECONDS || '3600', 10);
  return Number.isFinite(n) && n > 0 ? n : 3600;
}

// ---- resolução de origem da mensagem (seção 4) ----------------------------
// Regra fail-closed: from_me=true sem origem conhecida → human_mobile (bloqueia).
export function resolveSenderOrigin({ fromMe, outboundIsAI = false, crmHuman = false }) {
  if (!fromMe) return 'client';
  if (outboundIsAI) return 'ai';
  if (crmHuman) return 'crm_human';
  return 'human_mobile';
}

// ---- helpers Redis (nunca lançam) -----------------------------------------
async function redisSetBlock(instanceName, chatId, value, ttlSeconds) {
  const redis = getRedis();
  if (!redis) return false;
  try {
    // SET + EX atômico — nunca SET seguido de EXPIRE.
    await redis.set(blockKey(instanceName, chatId), JSON.stringify(value), 'EX', ttlSeconds);
    return true;
  } catch (err) {
    console.error('[control] redis SET falhou:', err.message);
    return false;
  }
}
async function redisDelBlock(instanceName, chatId) {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.del(blockKey(instanceName, chatId));
    return true;
  } catch (err) {
    console.error('[control] redis DEL falhou:', err.message);
    return false;
  }
}
// Devolve { hit: bool, data: object|null } — hit=false em cache miss OU erro.
async function redisGetBlock(instanceName, chatId) {
  const redis = getRedis();
  if (!redis) return { hit: false, data: null };
  try {
    const raw = await redis.get(blockKey(instanceName, chatId));
    if (raw == null || raw === '') return { hit: false, data: null };
    try {
      return { hit: true, data: JSON.parse(raw) };
    } catch {
      return { hit: true, data: null };
    }
  } catch (err) {
    console.error('[control] redis GET falhou (fallback PG):', err.message);
    return { hit: false, data: null };
  }
}

function findControl(tx, instanceName, chatId) {
  return tx.conversationControl.findUnique({
    where: { instanceName_chatId: { instanceName, chatId } },
  });
}

// ---------------------------------------------------------------------------
// isBlocked — Redis primeiro, PostgreSQL em cache miss. Reidrata o Redis.
// ---------------------------------------------------------------------------
export async function isBlocked(instanceNameRaw, chatIdRaw) {
  const instanceName = sanitizeInstance(instanceNameRaw);
  const chatId = sanitizeChatId(chatIdRaw);
  const now = new Date();

  // 1) Redis
  const cache = await redisGetBlock(instanceName, chatId);
  if (cache.hit && cache.data) {
    const until = cache.data.blocked_until ? new Date(cache.data.blocked_until) : null;
    if (until && until > now) {
      return {
        blocked: true,
        source: cache.data.source ?? null,
        blockedUntil: until,
        controlVersion: Number(cache.data.control_version ?? 0),
        rehydrated: false,
      };
    }
    // presente porém expirado no cache → cai para o PG reconciliar
  }

  // 2) PostgreSQL (fonte de verdade)
  let control;
  try {
    control = await findControl(prisma, instanceName, chatId);
  } catch (err) {
    // Redis já falhou/miss e o PG também → falha fechada (não liberar IA)
    console.error('[control] PG indisponível em isBlocked:', err.message);
    return { blocked: true, source: 'error', blockedUntil: null, controlVersion: 0, rehydrated: false, flowAction: 'stop_and_retry' };
  }

  if (!control || control.mode !== 'human') {
    return { blocked: false, source: null, blockedUntil: null, controlVersion: Number(control?.controlVersion ?? 0), rehydrated: false };
  }

  // mode = human
  if (control.blockedUntil && control.blockedUntil <= now) {
    const rec = await checkAndReconcileExpiration(instanceName, chatId);
    return { blocked: false, source: null, blockedUntil: null, controlVersion: rec.controlVersion, rehydrated: false };
  }

  // ainda bloqueado no PG → reidrata o Redis com o TTL restante
  let rehydrated = false;
  if (control.blockedUntil) {
    const remaining = Math.ceil((control.blockedUntil.getTime() - now.getTime()) / 1000);
    if (remaining > 0) {
      rehydrated = await redisSetBlock(instanceName, chatId, {
        mode: 'human',
        instance_name: instanceName,
        chat_id: chatId,
        source: control.takeoverSource,
        actor_user_id: control.takenOverBy,
        started_at: control.takenOverAt?.toISOString() ?? null,
        blocked_until: control.blockedUntil.toISOString(),
        control_version: Number(control.controlVersion),
      }, remaining);
    }
  }

  return {
    blocked: true,
    source: control.takeoverSource,
    blockedUntil: control.blockedUntil,
    controlVersion: Number(control.controlVersion),
    rehydrated,
  };
}

// ---------------------------------------------------------------------------
// activateTakeover — grava no PG (verdade) + espelha no Redis
// ---------------------------------------------------------------------------
export async function activateTakeover({ instanceName: instRaw, chatId: chatRaw, source, actorUserId = null, messageId = null, ttlSeconds }) {
  const instanceName = sanitizeInstance(instRaw);
  const chatId = sanitizeChatId(chatRaw);
  const ttl = takeoverTtl(ttlSeconds);
  const now = new Date();
  const blockedUntil = new Date(now.getTime() + ttl * 1000);

  const control = await prisma.$transaction(async (tx) => {
    const existing = await findControl(tx, instanceName, chatId);
    const previousMode = existing?.mode ?? 'ai';
    const eventType = existing && existing.mode === 'human' ? 'takeover_refreshed' : 'takeover_started';

    const saved = existing
      ? await tx.conversationControl.update({
          where: { id: existing.id },
          data: { mode: 'human', blockedUntil, takenOverAt: now, takenOverBy: actorUserId, takeoverSource: source, controlVersion: { increment: 1 } },
        })
      : await tx.conversationControl.create({
          data: { instanceName, chatId, mode: 'human', blockedUntil, takenOverAt: now, takenOverBy: actorUserId, takeoverSource: source, controlVersion: BigInt(1) },
        });

    await tx.conversationControlEvent.create({
      data: {
        conversationControlId: saved.id,
        eventType,
        actorUserId,
        source,
        messageId,
        previousMode,
        newMode: 'human',
        metadata: { ttlSeconds: ttl },
      },
    });
    // deals.atendimento_humano não existe neste schema (spec 7.3) → nada a sincronizar.
    return saved;
  });

  await redisSetBlock(instanceName, chatId, {
    mode: 'human', instance_name: instanceName, chat_id: chatId, source,
    actor_user_id: actorUserId, started_at: now.toISOString(),
    blocked_until: blockedUntil.toISOString(), control_version: Number(control.controlVersion),
  }, ttl);

  return { mode: 'human', blocked: true, blockedUntil, controlVersion: Number(control.controlVersion) };
}

// ---------------------------------------------------------------------------
// refreshTakeover — renova o TTL de um bloqueio humano existente
// ---------------------------------------------------------------------------
export async function refreshTakeover({ instanceName: instRaw, chatId: chatRaw, messageId = null }) {
  const instanceName = sanitizeInstance(instRaw);
  const chatId = sanitizeChatId(chatRaw);
  const existing = await findControl(prisma, instanceName, chatId);

  // Sem bloqueio humano ativo → ativa como human_mobile (fail-closed).
  if (!existing || existing.mode !== 'human') {
    return activateTakeover({ instanceName, chatId, source: existing?.takeoverSource || 'human_mobile', actorUserId: existing?.takenOverBy ?? null, messageId });
  }
  return activateTakeover({ instanceName, chatId, source: existing.takeoverSource || 'human_mobile', actorUserId: existing.takenOverBy, messageId });
}

// ---------------------------------------------------------------------------
// releaseTakeover — devolve para a IA e apaga a chave Redis
// ---------------------------------------------------------------------------
export async function releaseTakeover({ instanceName: instRaw, chatId: chatRaw, actorUserId = null, reason = null }) {
  const instanceName = sanitizeInstance(instRaw);
  const chatId = sanitizeChatId(chatRaw);

  const control = await prisma.$transaction(async (tx) => {
    const existing = await findControl(tx, instanceName, chatId);
    const previousMode = existing?.mode ?? 'ai';

    const saved = existing
      ? await tx.conversationControl.update({
          where: { id: existing.id },
          data: { mode: 'ai', blockedUntil: null, takeoverSource: null, controlVersion: { increment: 1 } },
        })
      : await tx.conversationControl.create({
          data: { instanceName, chatId, mode: 'ai', controlVersion: BigInt(1) },
        });

    await tx.conversationControlEvent.create({
      data: {
        conversationControlId: saved.id,
        eventType: 'takeover_released',
        actorUserId,
        source: 'crm_human',
        previousMode,
        newMode: 'ai',
        metadata: reason ? { reason } : {},
      },
    });
    return saved;
  });

  await redisDelBlock(instanceName, chatId);
  return { mode: 'ai', blocked: false, blockedUntil: null, controlVersion: Number(control.controlVersion) };
}

// ---------------------------------------------------------------------------
// checkAndReconcileExpiration — expira bloqueio vencido → mode ai
// ---------------------------------------------------------------------------
export async function checkAndReconcileExpiration(instanceNameRaw, chatIdRaw) {
  const instanceName = sanitizeInstance(instanceNameRaw);
  const chatId = sanitizeChatId(chatIdRaw);
  const now = new Date();

  const existing = await findControl(prisma, instanceName, chatId);
  if (!existing) return { mode: 'ai', blocked: false, reconciled: false, controlVersion: 0 };

  const expired = existing.mode === 'human' && existing.blockedUntil && existing.blockedUntil <= now;
  if (!expired) {
    return { mode: existing.mode, blocked: existing.mode === 'human', reconciled: false, controlVersion: Number(existing.controlVersion) };
  }

  const control = await prisma.$transaction(async (tx) => {
    const saved = await tx.conversationControl.update({
      where: { id: existing.id },
      data: { mode: 'ai', blockedUntil: null, takeoverSource: null, controlVersion: { increment: 1 } },
    });
    await tx.conversationControlEvent.create({
      data: {
        conversationControlId: saved.id,
        eventType: 'takeover_expired',
        actorUserId: null,
        source: 'automatic_timeout',
        previousMode: 'human',
        newMode: 'ai',
        metadata: {},
      },
    });
    return saved;
  });

  await redisDelBlock(instanceName, chatId);
  return { mode: 'ai', blocked: false, reconciled: true, controlVersion: Number(control.controlVersion) };
}
