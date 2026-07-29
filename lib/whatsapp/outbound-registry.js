// =============================================================================
// WhatJuris CRM — Registro de mensagens enviadas pela IA (Redis)
// lib/whatsapp/outbound-registry.js
//
// Quando a IA envia uma mensagem, registra aqui ANTES de enviar. Assim, quando
// o webhook receber o eco `from_me=true`, o Módulo 2 sabe que foi a IA (e não um
// humano no celular) e NÃO ativa o human takeover.
//
// Chave:  outbound:v1:{instance_name}:{message_id}
// TTL:    OUTBOUND_ORIGIN_TTL_SECONDS (padrão 86400)
//
// Redis OPCIONAL: sem Redis, register vira no-op e isOutboundAI devolve false.
// Consequência (fail-closed, seguro): sem Redis não dá para provar origem IA;
// um eco from_me=true seria tratado como humano. Com a Meta Cloud API isso é
// raro (ela não ecoa outbound como `messages`); habilite o Redis se usar um
// provedor que ecoa (Evolution/Baileys).
// =============================================================================

import { getRedis } from '@/lib/redis/client';

const PREFIX = 'outbound:v1';

function ttl() {
  const n = parseInt(process.env.OUTBOUND_ORIGIN_TTL_SECONDS || '86400', 10);
  return Number.isFinite(n) && n > 0 ? n : 86400;
}

export function outboundKey(instanceName, messageId) {
  return `${PREFIX}:${instanceName}:${messageId}`;
}

// Registra a saída da IA. SET + EX em uma única operação (nunca SET + EXPIRE).
export async function registerOutboundAI({ instanceName, messageId, chatId }) {
  const redis = getRedis();
  if (!redis) return { skipped: true };
  if (!instanceName || !messageId) return { skipped: true };

  const value = JSON.stringify({
    sender_origin: 'ai',
    chat_id: chatId ?? null,
    sent_at: new Date().toISOString(),
  });

  try {
    await redis.set(outboundKey(instanceName, messageId), value, 'EX', ttl());
    return { registered: true };
  } catch (err) {
    console.error('[outbound-registry] falha ao registrar saída IA:', err.message);
    return { skipped: true, error: true };
  }
}

// True se a mensagem outbound consta como enviada pela IA. Sem Redis → false.
export async function isOutboundAI(instanceName, messageId) {
  const redis = getRedis();
  if (!redis || !instanceName || !messageId) return false;
  try {
    const raw = await redis.get(outboundKey(instanceName, messageId));
    return raw != null && raw !== '';
  } catch (err) {
    console.error('[outbound-registry] falha ao consultar saída IA:', err.message);
    return false;
  }
}
