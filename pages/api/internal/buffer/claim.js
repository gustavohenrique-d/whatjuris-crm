// =============================================================================
// WhatJuris CRM — Buffer: claim + drain atômico (Módulo 3)
// POST /api/internal/buffer/claim   (x-webhook-secret)
// Executa redis/buffer_claim_and_drain.lua. Só o último message_id reclama.
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
    const result = await evalScript(
      redis, 'buffer_claim_and_drain', 3,
      [keys.messages, keys.latest, keys.processing],
      [d.message_id, bufferConfig.processingTtlSeconds()],
    );
    // Lua devolve {} (objeto) para lista vazia; normaliza para array.
    const items = Array.isArray(result.items) ? result.items : [];
    return res.status(200).json({
      claimed: !!result.claimed,
      recovered: !!result.recovered,
      owner_message_id: result.owner_message_id ?? null,
      items,
      reason: result.reason ?? null,
    });
  } catch (err) {
    console.error('[buffer/claim] erro:', err.message);
    return res.status(503).json({ error: 'REDIS_UNAVAILABLE' });
  }
}
