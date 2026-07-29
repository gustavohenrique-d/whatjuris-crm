// =============================================================================
// WhatJuris CRM — Buffer: append atômico (Módulo 3)
// POST /api/internal/buffer/append   (x-webhook-secret)
// Executa redis/buffer_append.lua. Idempotente por message_id (set `seen`).
// =============================================================================

import { z } from 'zod';
import { getRedis } from '@/lib/redis/client';
import { evalScript } from '@/lib/redis/eval-script';
import { bufferKeys } from '@/lib/buffer/keys';
import { bufferConfig, verifyBufferSecret } from '@/lib/buffer/config';

const schema = z.object({
  instance_name: z.string().trim().min(1).max(100),
  chat_id: z.string().trim().min(1).max(100),
  message_id: z.string().trim().min(1).max(255),
  message: z.string().min(1),
  message_type: z.string().max(50).optional().default('conversation'),
  received_at: z.string().optional(),
  control_version: z.number().int().optional().nullable(),
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
  const keys = bufferKeys(d.instance_name, d.chat_id);
  const payload = JSON.stringify({
    message_id: d.message_id,
    message: d.message,
    message_type: d.message_type,
    received_at: d.received_at || new Date().toISOString(),
    buffered_at: new Date().toISOString(),
    control_version: d.control_version ?? null,
  });

  try {
    const result = await evalScript(
      redis, 'buffer_append', 3,
      [keys.messages, keys.latest, keys.seen],
      [payload, d.message_id, bufferConfig.ttlSeconds(), bufferConfig.seenTtlSeconds(), bufferConfig.maxMessages()],
    );
    return res.status(200).json({
      appended: !!result.appended,
      duplicate: !!result.duplicate,
      length: Number(result.length ?? 0),
      force_flush: !!result.force_flush,
    });
  } catch (err) {
    console.error('[buffer/append] erro:', err.message);
    return res.status(503).json({ error: 'REDIS_UNAVAILABLE' });
  }
}
