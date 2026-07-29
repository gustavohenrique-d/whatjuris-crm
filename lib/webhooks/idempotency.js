// =============================================================================
// WhatJuris CRM — Idempotência do webhook do WhatsApp
// lib/webhooks/idempotency.js
//
// A Meta reentrega quando não recebe 200 a tempo. Guardamos o message_id já
// processado em webhook_idempotency (message_id UNIQUE) para não reprocessar.
//
// Usado tanto pelo handler do webhook (inline) quanto pelas rotas internas que
// o n8n chama. O registro é feito ANTES de acionar IA (register) e a checagem
// (isDuplicate) antes de processar.
// =============================================================================

import { prisma } from '@/lib/db/prisma';

export async function isDuplicate(messageId) {
  if (!messageId) return false;
  const existing = await prisma.webhookIdempotency.findUnique({
    where: { messageId },
    select: { id: true },
  });
  return !!existing;
}

// Registra o message_id. Idempotente: corrida (P2002 no UNIQUE) é tratada como
// "já registrado", devolvendo created=false — nunca lança por duplicidade.
export async function register(messageId, chatId) {
  if (!messageId) return { created: false };
  try {
    await prisma.webhookIdempotency.create({
      data: { messageId, chatId: chatId || '' },
      select: { id: true },
    });
    return { created: true };
  } catch (err) {
    if (err?.code === 'P2002') return { created: false };
    throw err;
  }
}
