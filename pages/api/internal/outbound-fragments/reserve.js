// =============================================================================
// WhatJuris CRM — Reservar fragmento de saída (Módulo 5)
// POST /api/internal/outbound-fragments/reserve   (x-webhook-secret)
//
// Idempotente por (instance, chat, response_id, fragment_index). Verifica Human
// Takeover e control_version. should_send=false quando o fragmento já foi
// enviado (sent) ou cancelado — evita reenvio na presença de retries.
// =============================================================================

import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { isBlocked, sanitizeInstance, sanitizeChatId } from '@/lib/conversations/control';

const schema = z.object({
  instance_name: z.string().trim().min(1).max(100),
  chat_id: z.string().trim().min(1).max(100),
  response_id: z.string().trim().min(1).max(255),
  source_message_id: z.string().trim().min(1).max(255),
  fragment_id: z.string().trim().min(1).max(300),
  fragment_index: z.number().int().min(0),
  fragment_total: z.number().int().positive(),
  content: z.string().min(1),
  expected_control_version: z.number().int().optional().nullable(),
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

  const d = parsed.data;
  const instanceName = sanitizeInstance(d.instance_name);
  const chatId = sanitizeChatId(d.chat_id);

  try {
    // Human Takeover
    const block = await isBlocked(instanceName, chatId);
    if (block.blocked) return res.status(409).json({ error: 'HUMAN_TAKEOVER_ACTIVE', human_takeover: true });

    // control_version
    if (d.expected_control_version != null && Number(d.expected_control_version) !== Number(block.controlVersion ?? 0)) {
      return res.status(409).json({ error: 'STALE_CONTROL_VERSION', current: Number(block.controlVersion ?? 0) });
    }

    const contentHash = crypto.createHash('sha256').update(d.content, 'utf8').digest('hex');

    // deal_id (best-effort) para vincular o fragmento
    const contact = await prisma.contact.findFirst({ where: { whatsapp: chatId, deletedAt: null }, select: { id: true } });
    let dealId = null;
    if (contact) {
      const deal = await prisma.deal.findFirst({
        where: { contactId: contact.id, status: 'OPEN', deletedAt: null },
        select: { id: true }, orderBy: { createdAt: 'desc' },
      });
      dealId = deal?.id ?? null;
    }

    try {
      const frag = await prisma.outboundMessageFragment.create({
        data: {
          dealId, instanceName, chatId,
          responseId: d.response_id, sourceMessageId: d.source_message_id,
          fragmentId: d.fragment_id, fragmentIndex: d.fragment_index, fragmentTotal: d.fragment_total,
          contentHash, status: 'reserved',
        },
        select: { id: true, status: true },
      });
      return res.status(200).json({ should_send: true, reservation_id: frag.id, status: frag.status });
    } catch (err) {
      if (err?.code !== 'P2002') throw err;
      // Já existe (idempotência). should_send=false só se já enviado/cancelado.
      const existing = await prisma.outboundMessageFragment.findUnique({
        where: {
          instanceName_chatId_responseId_fragmentIndex: {
            instanceName, chatId, responseId: d.response_id, fragmentIndex: d.fragment_index,
          },
        },
        select: { id: true, status: true, metaMessageId: true },
      });
      const terminal = existing && (existing.status === 'sent' || existing.status === 'cancelled');
      return res.status(200).json({
        should_send: !terminal,
        reservation_id: existing?.id ?? null,
        status: existing?.status ?? 'unknown',
        meta_message_id: existing?.metaMessageId ?? undefined,
      });
    }
  } catch (err) {
    console.error('[outbound-fragments/reserve] erro:', err.message);
    return res.status(500).json({ error: 'Erro ao reservar fragmento.' });
  }
}
