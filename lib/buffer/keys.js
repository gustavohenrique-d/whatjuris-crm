// =============================================================================
// WhatJuris CRM — Chaves Redis do buffer de mensagens (Módulo 3)
// lib/buffer/keys.js
//
// Sanitização igual à do Módulo 2 (block:v1). Hash tag {inst:chat} para manter
// as chaves da mesma conversa no mesmo slot em Redis Cluster.
// =============================================================================

const PREFIX = () => process.env.MESSAGE_BUFFER_KEY_PREFIX || 'buffer:v1';

export function sanitizeInstance(instanceName) {
  return String(instanceName || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}
export function sanitizeChatId(chatId) {
  return String(chatId || '').replace(/\D/g, '');
}

// Devolve o namespace com hash tag: {safeInstance:safeChatId}
export function bufferNamespace(instanceName, chatId) {
  return `{${sanitizeInstance(instanceName)}:${sanitizeChatId(chatId)}}`;
}

export function bufferKeys(instanceName, chatId, messageId = null) {
  const ns = bufferNamespace(instanceName, chatId);
  const base = `${PREFIX()}:${ns}`;
  return {
    messages: `${base}:messages`,
    latest: `${base}:latest`,
    seen: `${base}:seen`,
    processing: messageId ? `${base}:processing:${messageId}` : `${base}:processing`,
  };
}
