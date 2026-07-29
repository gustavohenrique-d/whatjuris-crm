// =============================================================================
// WhatJuris CRM — Verificação da assinatura do webhook da Meta
// lib/webhooks/signature.js
//
// A Meta assina o corpo RAW do POST com HMAC-SHA256 usando o APP SECRET do app
// (WHATSAPP_APP_SECRET), não o access token. O header chega como
// "sha256=<hex>". Comparação em tempo constante (timingSafeEqual).
//
// Extraído do handler para permitir teste unitário sem servidor HTTP.
// =============================================================================

import crypto from 'crypto';

// Recebe o corpo como Buffer (bytes exatos) — nunca a string já parseada, pois
// JSON.parse + re-stringify muda os bytes e invalida o HMAC.
export function verifyMetaSignature(rawBody, signature, secret = process.env.WHATSAPP_APP_SECRET) {
  if (!signature || !secret) return false;

  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Verificação do desafio GET da Meta (hub.challenge). Comparação do token em
// tempo constante para não vazar por timing.
export function verifyVerifyToken(token, expected = process.env.WHATSAPP_VERIFY_TOKEN) {
  if (!token || !expected) return false;
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
