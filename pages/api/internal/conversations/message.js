// =============================================================================
// WhatJuris CRM — Persistir mensagem com origem (Human Takeover)
// POST /api/internal/conversations/message
//
// Consumido pelo n8n para gravar mensagens na timeline com o sender_origin
// resolvido (client | human_mobile | crm_human | ai). Idempotente por
// message_id (reaproveita webhook_idempotency). Auth: x-webhook-secret.
//
// Mapa (spec 8.3):
//   client                → MESSAGE_IN,  actorType CONTACT
//   human_mobile/crm_human → MESSAGE_OUT, actorType USER   (atendente humano)
//   ai                     → MESSAGE_OUT, actorType AI_AGENT
// =============================================================================

import { z } from 'zod';
import { recordActivity } from '@/lib/activities/record';
import { isDuplicate, register } from '@/lib/webhooks/idempotency';
import { findOrCreateContact, findOrCreateDeal } from '@/lib/whatsapp/lead';

const schema = z.object({
  instance_name: z.string().trim().min(1).max(100),
  chat_id: z.string().trim().min(1).max(100),
  message_id: z.string().trim().min(1).max(255),
  message: z.string().default(''),
  sender_origin: z.enum(['client', 'human_mobile', 'crm_human', 'ai', 'system']),
  profile_name: z.string().max(200).optional().nullable(),
});

function verifySecret(req) {
  const secret = req.headers['x-webhook-secret'];
  return !!process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET;
}

// origem → (tipo de atividade, actorType, rótulo)
function mapOrigin(origin) {
  switch (origin) {
    case 'client':
      return { type: 'MESSAGE_IN', actorType: 'CONTACT', actorLabel: null };
    case 'ai':
      return { type: 'MESSAGE_OUT', actorType: 'AI_AGENT', actorLabel: 'Agente IA' };
    case 'human_mobile':
    case 'crm_human':
      return { type: 'MESSAGE_OUT', actorType: 'USER', actorLabel: 'Atendente' };
    default: // system
      return { type: 'MESSAGE_OUT', actorType: 'SYSTEM', actorLabel: 'Sistema' };
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  if (!verifySecret(req)) return res.status(401).json({ error: 'Não autorizado.' });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { instance_name, chat_id, message_id, message, sender_origin, profile_name } = parsed.data;

  try {
    // Idempotência por message_id — reentrega não duplica na timeline.
    if (await isDuplicate(message_id)) {
      return res.status(200).json({ persisted: false, duplicate: true });
    }

    const contact = await findOrCreateContact(chat_id, profile_name);
    const deal = await findOrCreateDeal(contact);
    const { type, actorType, actorLabel } = mapOrigin(sender_origin);

    await recordActivity({
      dealId: deal.id,
      contactId: contact.id,
      type,
      actorType,
      actorLabel,
      title: type === 'MESSAGE_IN' ? 'Mensagem recebida' : 'Mensagem enviada',
      content: message,
      metadata: { whatsappMessageId: message_id, senderOrigin: sender_origin, instanceName: instance_name },
    });

    await register(message_id, chat_id);

    return res.status(200).json({ persisted: true, deal_id: deal.id, contact_id: contact.id });
  } catch (err) {
    console.error('[conversations/message] erro:', err.message);
    return res.status(500).json({ error: 'Erro ao persistir mensagem.' });
  }
}
