// =============================================================================
// WhatJuris CRM — Buffer: ACK (apaga a chave processing) (Módulo 3)
// POST /api/internal/buffer/ack   (x-webhook-secret)
// Chamado após o checkpoint confirmado. Falha no ACK não é fatal: a chave
// processing expira pelo TTL.
// =============================================================================

import { z } from 'zod';
import { getRedis } from '@/lib/redis/client';
import { bufferKeys } from '@/lib/buffer/keys';
import { verifyBufferSecret } from '@/lib/buffer/config';

const schema = z.object({
  instance_name: z.string().trim().min(1).max(100),
  chat_id: z.string().trim().min(1).max(100),
  message_id: z.string().trim().min(1).max(255),
});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  if (!verifyBufferSecret(req)) return res.status(401).json({ error: 'Não autorizado.' });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const redis = getRedis();
  if (!redis) return res.status(503).json({ error: 'REDIS_UNAVAILABLE' });

  const d = parsed.data;
  const keys = bufferKeys(d.instance_name, d.chat_id, d.message_id);

  try {
    const removed = await redis.del(keys.processing);
    return res.status(200).json({ deleted: true, removed: Number(removed) });
  } catch (err) {
    console.error('[buffer/ack] erro:', err.message);
    return res.status(200).json({ deleted: false }); // não-fatal: expira por TTL
  }
}
