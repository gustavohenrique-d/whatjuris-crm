// =============================================================================
// WhatJuris CRM — Cancelar fragmentos restantes (Módulo 5)
// POST /api/internal/outbound-fragments/cancel-remaining   (x-webhook-secret)
//
// Marca como 'cancelled' os fragmentos de uma resposta a partir de from_index
// (ex.: quando um humano assume a conversa no meio do envio). Nunca cancela os
// que já foram enviados.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { sanitizeInstance, sanitizeChatId } from '@/lib/conversations/control';

const schema = z.object({
  instance_name: z.string().trim().min(1).max(100),
  chat_id: z.string().trim().min(1).max(100),
  response_id: z.string().trim().min(1).max(255),
  from_index: z.number().int().min(0).default(0),
  reason: z.string().max(100).optional().default('cancelled'),
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
    const result = await prisma.outboundMessageFragment.updateMany({
      where: {
        instanceName, chatId, responseId: d.response_id,
        fragmentIndex: { gte: d.from_index },
        status: { notIn: ['sent', 'cancelled'] },
      },
      data: { status: 'cancelled', lastErrorCode: d.reason },
    });
    return res.status(200).json({ cancelled: result.count });
  } catch (err) {
    console.error('[outbound-fragments/cancel-remaining] erro:', err.message);
    return res.status(500).json({ error: 'Erro ao cancelar fragmentos.' });
  }
}
