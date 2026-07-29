// =============================================================================
// WhatJuris CRM — Envio manual de mensagem (usuário do CRM) (Módulo 6)
// POST /api/conversations/[instance_name]/[chat_id]/send-message
// Auth: sessão NextAuth (withAuth) + permissão conversation.takeover.
// =============================================================================

import { z } from 'zod';
import { withAuth, BadRequest } from '@/lib/auth/guard';
import { sendManualMessage } from '@/lib/conversations/send-manual';

const schema = z.object({
  content: z.string().trim().min(1, 'Mensagem vazia.').max(4000, 'Máximo de 4000 caracteres.'),
  client_request_id: z.string().trim().min(1).max(100),
});

async function handler(req, res, ctx) {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

  const { instance_name, chat_id } = req.query;

  const result = await sendManualMessage({
    instanceName: instance_name,
    chatId: chat_id,
    userId: ctx.userId,
    userName: ctx.name,
    content: parsed.data.content,
    clientRequestId: parsed.data.client_request_id,
    // override: perfis com visão ampla podem responder qualquer conversa
    canOverride: ctx.can('deal.update.all') || ctx.can('deal.reassign'),
  });

  return res.status(200).json(result);
}

export default withAuth(handler, {
  methods: ['POST'],
  permission: 'conversation.takeover',
});
