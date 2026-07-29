// =============================================================================
// WhatJuris CRM — Devolver conversa para a IA
// POST /api/conversations/[instance_name]/[chat_id]/release
// =============================================================================

import { z } from 'zod';
import { resolveConversationActor } from '@/lib/conversations/http-auth';
import { releaseTakeover } from '@/lib/conversations/control';

const schema = z.object({
  actor_user_id: z.string().uuid().optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
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
  const actorUserId = actor.internal ? (parsed.data.actor_user_id ?? null) : actor.userId;

  try {
    const result = await releaseTakeover({
      instanceName: instance_name,
      chatId: chat_id,
      actorUserId,
      reason: parsed.data.reason ?? null,
    });

    return res.status(200).json({
      mode: result.mode,
      blocked: result.blocked,
      blocked_until: null,
      control_version: result.controlVersion,
    });
  } catch (err) {
    console.error('[release] erro:', err.message);
    return res.status(500).json({ error: 'Erro ao devolver conversa para a IA.' });
  }
}
