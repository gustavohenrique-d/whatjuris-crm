// =============================================================================
// WhatJuris CRM — Chave de sessão do agente de triagem (Módulo 4)
// lib/triage/session.js
//
// Mesma sanitização dos módulos anteriores. O n8n Postgres Chat Memory usa esta
// chave como session_id; sessões diferentes (instance/chat) não compartilham
// memória. O nó do workflow espelha esta expressão.
// =============================================================================

export function sessionKey(instanceName, chatId) {
  const inst = String(instanceName || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const chat = String(chatId || '').replace(/[^0-9]/g, '');
  return `chat:v1:${inst}:${chat}`;
}
