// =============================================================================
// WhatJuris CRM — Confirmar fragmento enviado (Módulo 5)
// POST /api/internal/outbound-fragments/[reservation_id]/confirm   (x-webhook-secret)
//
// Marca 'sent', grava meta_message_id, persiste MESSAGE_OUT (remetente=ia) e
// registra a saída da IA no Redis (para o Módulo 2 não tratar o eco como humano).
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { recordWhatsappMessage } from '@/lib/activities/record';
import { registerOutboundAI } from '@/lib/whatsapp/outbound-registry';
import { sanitizeInstance, sanitizeChatId } from '@/lib/conversations/control';

const schema = z.object({
  meta_message_id: z.string().trim().min(1).max(255),
  sent_at: z.string().optional(),
  chat_id: z.string().trim().min(1).max(100),
  instance_name: z.string().trim().min(1).max(100),
  content: z.string().default(''),
  source_message_id: z.string().trim().min(1).max(255).optional(),
});

function verifySecret(req) {
  const secret = req.headers['x-webhook-secret'];
  return !!process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  if (!verifySecret(req)) return res.status(401).json({ error: 'Não autorizado.' });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const reservationId = req.query.reservation_id;
  const d = parsed.data;
  const instanceName = sanitizeInstance(d.instance_name);
  const chatId = sanitizeChatId(d.chat_id);

  try {
    const frag = await prisma.outboundMessageFragment.findUnique({
      where: { id: reservationId },
      select: { id: true, dealId: true, status: true },
    });
    if (!frag) return res.status(404).json({ error: 'Fragmento não encontrado.' });

    // Idempotente: se já confirmado, não regrava.
    if (frag.status === 'sent') {
      return res.status(200).json({ confirmed: true, already: true });
    }

    await prisma.outboundMessageFragment.update({
      where: { id: reservationId },
      data: {
        status: 'sent',
        metaMessageId: d.meta_message_id,
        sentAt: d.sent_at ? new Date(d.sent_at) : new Date(),
        attempts: { increment: 1 },
      },
    });

    // contactId para a timeline
    const contact = await prisma.contact.findFirst({ where: { whatsapp: chatId, deletedAt: null }, select: { id: true } });

    // MESSAGE_OUT (remetente = ia). recordWhatsappMessage('out') usa actorType AI_AGENT.
    await recordWhatsappMessage({
      dealId: frag.dealId,
      contactId: contact?.id ?? null,
      direction: 'out',
      content: d.content,
      whatsappMessageId: d.meta_message_id,
    });

    // Registra no Redis para o Módulo 2 reconhecer o eco from_me=true como IA.
    await registerOutboundAI({ instanceName, messageId: d.meta_message_id, chatId });

    return res.status(200).json({ confirmed: true, meta_message_id: d.meta_message_id });
  } catch (err) {
    console.error('[outbound-fragments/confirm] erro:', err.message);
    return res.status(500).json({ error: 'Erro ao confirmar fragmento.' });
  }
}
