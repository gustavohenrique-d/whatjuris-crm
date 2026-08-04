// =============================================================================
// WhatJuris CRM — Notificar o n8n via webhook
// lib/n8n/notify.js
//
// O CRM chama o n8n quando um evento precisa de processamento pelos agentes.
// O WEBHOOK_SECRET valida a chamada (o n8n confere o header x-webhook-secret).
// =============================================================================

const N8N_BASE = process.env.N8N_BASE_URL || 'http://localhost:5678';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

export async function notifyN8n(payload) {
  // Entrada do fluxo n8n (Módulo 1 — recepção/normalização das mensagens).
  const webhookUrl = `${N8N_BASE}/webhook/modulo-01-recepcao`;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': WEBHOOK_SECRET,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000), // 10s timeout
  });

  if (!response.ok) throw new Error(`n8n webhook retornou ${response.status}`);
  return response.json().catch(() => ({}));
}
