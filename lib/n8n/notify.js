// =============================================================================
// WhatJuris CRM — Notificar o n8n via webhook
// lib/n8n/notify.js
//
// O CRM chama o n8n quando um evento precisa de processamento pelos agentes.
// O n8n processa e chama de volta o CRM via /api/internal/agent-action.
// O WEBHOOK_SECRET valida a chamada de volta do n8n para o CRM.
// =============================================================================

const N8N_BASE = process.env.N8N_BASE_URL || 'http://localhost:5678';

export async function notifyN8n(payload) {
  // Workflow de triagem com os 8 agentes (módulo 9). Antes do módulo 9 era
  // 'whatjuris-message' (fluxo simples do módulo 8).
  const webhookUrl = `${N8N_BASE}/webhook/whatjuris-agents`;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000), // 10s timeout
  });

  if (!response.ok) {
    throw new Error(`n8n webhook retornou ${response.status}`);
  }

  return response.json().catch(() => ({}));
}
