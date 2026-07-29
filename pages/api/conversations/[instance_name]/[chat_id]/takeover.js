// =============================================================================
// WhatJuris CRM — Ativar Human Takeover
// POST /api/conversations/[instance_name]/[chat_id]/takeover
//
// Chamado pela UI do CRM (usuário com conversation.takeover → source crm_human)
// ou pelo n8n (x-webhook-secret → source do corpo, ex.: human_mobile).
// =============================================================================

import { z } from 'zod';
import { resolveConversationActor } from '@/lib/conversations/http-auth';
import { activateTakeover } from '@/lib/conversations/control';

const schema = z.object({
  source: z.enum(['human_mobile', 'crm_human', 'admin', 'automatic_timeout']).optional(),
  actor_user_id: z.string().uuid().optional().nullable(),
  message_id: z.string().max(255).optional().nullable(),
  ttl_seconds: z.number().int().positive().max(86400).optional(),
});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const actor = await resolveConversationActor(req, res, { permission: 'conversation.takeover' });
  if (actor.error === 401) return res.status(401).json({ error: 'Não autenticado.' });
  if (actor.error === 403) return res.status(403).json({ error: 'Sem permissão para esta ação.' });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { instance_name, chat_id } = req.query;

  // Usuário do CRM: origem sempre crm_human e ator = ele mesmo (não confiar no corpo).
  // n8n interno: usa o que veio no corpo (fallback human_mobile — fail-closed).
  const source = actor.internal ? (parsed.data.source || 'human_mobile') : 'crm_human';
  const actorUserId = actor.internal ? (parsed.data.actor_user_id ?? null) : actor.userId;

  try {
    const result = await activateTakeover({
      instanceName: instance_name,
      chatId: chat_id,
      source,
      actorUserId,
      messageId: parsed.data.message_id ?? null,
      ttlSeconds: parsed.data.ttl_seconds,
    });

    const ttlRemaining = result.blockedUntil
      ? Math.max(0, Math.ceil((result.blockedUntil.getTime() - Date.now()) / 1000))
      : 0;

    return res.status(200).json({
      mode: result.mode,
      blocked: result.blocked,
      blocked_until: result.blockedUntil?.toISOString() ?? null,
      ttl_remaining_seconds: ttlRemaining,
      control_version: result.controlVersion,
    });
  } catch (err) {
    console.error('[takeover] erro:', err.message);
    return res.status(500).json({ error: 'Erro ao ativar atendimento humano.' });
  }
}
