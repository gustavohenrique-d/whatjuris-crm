// =============================================================================
// WhatJuris CRM — Verificar se um outbound (from_me) foi enviado pela IA
// POST /api/internal/conversations/outbound-check
//
// Consumido pelo n8n (nó "Verificar Registro Outbound IA"). Consulta o registro
// Redis escrito pela IA antes de enviar. Sem Redis → is_ai=false (fail-closed:
// trata como possível humano, o que ATIVA o takeover — nunca o contrário).
// Auth: WEBHOOK_SECRET no header x-webhook-secret.
// =============================================================================

import { z } from 'zod';
import { isOutboundAI } from '@/lib/whatsapp/outbound-registry';

const schema = z.object({
  instance_name: z.string().trim().min(1).max(100),
  message_id: z.string().trim().min(1).max(255),
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

  try {
    const isAi = await isOutboundAI(parsed.data.instance_name, parsed.data.message_id);
    return res.status(200).json({ is_ai: isAi });
  } catch (err) {
    console.error('[outbound-check] erro:', err.message);
    return res.status(200).json({ is_ai: false }); // fail-closed
  }
}
