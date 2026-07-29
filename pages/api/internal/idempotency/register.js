// =============================================================================
// WhatJuris CRM — Rota interna: registrar idempotência (n8n)
// pages/api/internal/idempotency/register.js
//
// Autenticada por WEBHOOK_SECRET (header x-webhook-secret). O n8n chama logo
// após confirmar que vai processar a mensagem (antes de acionar IA).
// Idempotente: registrar de novo o mesmo message_id devolve created=false.
// =============================================================================

import { z } from 'zod';
import { register } from '@/lib/webhooks/idempotency';

const schema = z.object({
  messageId: z.string().trim().min(1).max(200),
  chatId: z.string().trim().max(200).optional().default(''),
});

function verifySecret(req) {
  const secret = req.headers['x-webhook-secret'];
  const expected = process.env.WEBHOOK_SECRET;
  return !!expected && secret === expected;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  if (!verifySecret(req)) return res.status(401).json({ error: 'Não autorizado.' });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const { created } = await register(parsed.data.messageId, parsed.data.chatId);
    return res.status(200).json({ registered: true, created });
  } catch (err) {
    console.error('[idempotency:register] erro:', err.message);
    return res.status(500).json({ error: 'Erro ao registrar idempotência.' });
  }
}
