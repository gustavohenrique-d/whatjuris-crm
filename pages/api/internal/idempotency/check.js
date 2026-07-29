// =============================================================================
// WhatJuris CRM — Rota interna: checar idempotência (n8n)
// pages/api/internal/idempotency/check.js
//
// Autenticada por WEBHOOK_SECRET (header x-webhook-secret) — mesmo padrão de
// pages/api/internal/agent-action.js. O n8n chama antes de processar.
//
// DESVIO da spec: a spec usava X-Internal-Secret / INTERNAL_API_SECRET; aqui
// reutilizamos a convenção já existente no projeto (WEBHOOK_SECRET).
// =============================================================================

import { z } from 'zod';
import { isDuplicate } from '@/lib/webhooks/idempotency';

const schema = z.object({ messageId: z.string().trim().min(1).max(200) });

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
    const duplicate = await isDuplicate(parsed.data.messageId);
    return res.status(200).json({ isDuplicate: duplicate });
  } catch (err) {
    console.error('[idempotency:check] erro:', err.message);
    return res.status(500).json({ error: 'Erro ao checar idempotência.' });
  }
}
