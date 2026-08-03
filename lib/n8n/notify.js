// =============================================================================
// WhatJuris CRM — Notificar o n8n via webhook
// lib/n8n/notify.js
//
// O CRM chama o n8n quando um evento precisa de processamento pelos agentes.
// O WEBHOOK_SECRET valida a chamada de volta do n8n para o CRM.
//
// DIAGNÓSTICO (temporário): grava o resultado da chamada em audit_logs
// (n8n.notify.ok / n8n.notify.fail) com a base URL usada e o erro, para
// depurar o handoff CRM→n8n sem depender dos logs do host. Reversível.
// =============================================================================

import { prisma } from '@/lib/db/prisma';

const N8N_BASE = process.env.N8N_BASE_URL || 'http://localhost:5678';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

async function logNotify(action, after) {
  try {
    await prisma.auditLog.create({ data: { action, resource: 'n8n', after } });
  } catch {
    /* nunca deixar o diagnóstico quebrar o envio */
  }
}

export async function notifyN8n(payload) {
  // Entrada do fluxo n8n (Módulo 1 — recepção/normalização das mensagens).
  const webhookUrl = `${N8N_BASE}/webhook/modulo-01-recepcao`;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      await logNotify('n8n.notify.fail', { base: N8N_BASE, path: 'modulo-01-recepcao', status: response.status });
      throw new Error(`n8n webhook retornou ${response.status}`);
    }

    await logNotify('n8n.notify.ok', { base: N8N_BASE, path: 'modulo-01-recepcao', status: response.status });
    return response.json().catch(() => ({}));
  } catch (err) {
    // erros de rede/timeout (fetch lança) também caem aqui
    await logNotify('n8n.notify.fail', { base: N8N_BASE, path: 'modulo-01-recepcao', error: String(err?.message || err) });
    throw err;
  }
}
