// =============================================================================
// WhatJuris CRM — Buffer: checkpoint do lote consolidado (Módulo 3)
// POST /api/internal/buffer/checkpoint   (x-webhook-secret)
// Persiste o lote em message_batches ANTES do ACK. Idempotente por
// (instance_name, chat_id, owner_message_id).
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { verifyBufferSecret } from '@/lib/buffer/config';

const schema = z.object({
  instance_name: z.string().trim().min(1).max(100),
  chat_id: z.string().trim().min(1).max(100),
  owner_message_id: z.string().trim().min(1).max(255),
  message_ids: z.array(z.string()).min(1),
  consolidated_message: z.string().min(1),
  message_count: z.number().int().positive(),
});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  if (!verifyBufferSecret(req)) return res.status(401).json({ error: 'Não autorizado.' });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const d = parsed.data;
  try {
    // Idempotente: se o lote já existe (mesmo owner_message_id), devolve-o.
    const existing = await prisma.messageBatch.findUnique({
      where: {
        instanceName_chatId_ownerMessageId: {
          instanceName: d.instance_name, chatId: d.chat_id, ownerMessageId: d.owner_message_id,
        },
      },
      select: { id: true },
    });
    if (existing) return res.status(200).json({ id: existing.id, created: false });

    const batch = await prisma.messageBatch.create({
      data: {
        instanceName: d.instance_name,
        chatId: d.chat_id,
        ownerMessageId: d.owner_message_id,
        messageIds: d.message_ids,
        consolidatedMessage: d.consolidated_message,
        messageCount: d.message_count,
        status: 'pending',
      },
      select: { id: true },
    });
    return res.status(200).json({ id: batch.id, created: true });
  } catch (err) {
    // Corrida no unique → tratado como já criado (idempotência).
    if (err?.code === 'P2002') {
      const again = await prisma.messageBatch.findUnique({
        where: {
          instanceName_chatId_ownerMessageId: {
            instanceName: d.instance_name, chatId: d.chat_id, ownerMessageId: d.owner_message_id,
          },
        },
        select: { id: true },
      });
      return res.status(200).json({ id: again?.id ?? null, created: false });
    }
    console.error('[buffer/checkpoint] erro:', err.message);
    return res.status(500).json({ error: 'Erro ao persistir checkpoint.' });
  }
}
