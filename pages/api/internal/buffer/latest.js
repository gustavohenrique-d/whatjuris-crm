// =============================================================================
// WhatJuris CRM — Buffer: consultar o último message_id (Módulo 3)
// GET /api/internal/buffer/latest?instance_name=X&chat_id=Y   (x-webhook-secret)
// =============================================================================

import { z } from 'zod';
import { getRedis } from '@/lib/redis/client';
import { bufferKeys } from '@/lib/buffer/keys';
import { verifyBufferSecret } from '@/lib/buffer/config';

const schema = z.object({
  instance_name: z.string().trim().min(1).max(100),
  chat_id: z.string().trim().min(1).max(100),
});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  if (!verifyBufferSecret(req)) return res.status(401).json({ error: 'Não autorizado.' });

  const parsed = schema.safeParse(req.query ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const redis = getRedis();
  if (!redis) return res.status(503).json({ error: 'REDIS_UNAVAILABLE' });

  const keys = bufferKeys(parsed.data.instance_name, parsed.data.chat_id);
  try {
    const latest = await redis.get(keys.latest);
    return res.status(200).json({ latest_message_id: latest || null });
  } catch (err) {
    console.error('[buffer/latest] erro:', err.message);
    return res.status(503).json({ error: 'REDIS_UNAVAILABLE' });
  }
}
