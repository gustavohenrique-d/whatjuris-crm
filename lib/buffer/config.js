// =============================================================================
// WhatJuris CRM — Configuração do buffer (Módulo 3)
// lib/buffer/config.js
// =============================================================================

function intEnv(name, fallback) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const bufferConfig = {
  waitSeconds: () => intEnv('MESSAGE_BUFFER_WAIT_SECONDS', 10),
  ttlSeconds: () => intEnv('MESSAGE_BUFFER_TTL_SECONDS', 300),
  seenTtlSeconds: () => intEnv('MESSAGE_BUFFER_SEEN_TTL_SECONDS', 600),
  processingTtlSeconds: () => intEnv('MESSAGE_BUFFER_PROCESSING_TTL_SECONDS', 300),
  maxMessages: () => intEnv('MESSAGE_BUFFER_MAX_MESSAGES', 50),
  maxCharacters: () => intEnv('MESSAGE_BUFFER_MAX_CHARACTERS', 30000),
};

// x-webhook-secret igual às demais rotas internas.
export function verifyBufferSecret(req) {
  const secret = req.headers['x-webhook-secret'];
  return !!process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET;
}
