// =============================================================================
// WhatJuris CRM — Consolidação do buffer (Módulo 3)
// lib/buffer/consolidate.js
//
// Lógica pura (sem Redis/rede) usada pelo nó Code do workflow n8n e testável
// isolada: parseia os itens do buffer, ordena por received_at, e junta com
// "\n\n". Também checa os limites (máx. mensagens / caracteres).
// Regra crítica (seção 13): identidade é por message_id, NUNCA por texto.
// =============================================================================

// rawItems: array de strings JSON (vindo do Redis LRANGE) ou de objetos.
// Item inválido (JSON quebrado, sem message_id/message) é FILTRADO, não quebra.
export function parseBufferItems(rawItems) {
  const items = Array.isArray(rawItems) ? rawItems : [];

  const parsed = items
    .map((item) => {
      if (typeof item === 'string') {
        try {
          return JSON.parse(item);
        } catch {
          return null;
        }
      }
      return item;
    })
    .filter(
      (i) =>
        i &&
        typeof i.message_id === 'string' &&
        typeof i.message === 'string' &&
        i.message.trim() !== '',
    );

  parsed.sort((a, b) => {
    const ta = Date.parse(a.received_at);
    const tb = Date.parse(b.received_at);
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
    return String(a.buffered_at ?? '').localeCompare(String(b.buffered_at ?? ''));
  });

  return parsed;
}

export function consolidate(parsedItems) {
  const messages = parsedItems.map((i) => String(i.message).trim()).filter(Boolean);
  const messageIds = parsedItems.map((i) => i.message_id);
  const message = messages.join('\n\n');
  return {
    message,
    content: message,
    buffered_message_ids: messageIds,
    buffer_count: parsedItems.length,
    buffer_total_characters: messages.reduce((t, m) => t + m.length, 0),
    buffer_started_at: parsedItems[0]?.received_at ?? null,
    buffer_ended_at: parsedItems[parsedItems.length - 1]?.received_at ?? null,
  };
}

// { ok: bool, reason: string|null }
export function checkLimits({ count, characters, message, maxMessages, maxCharacters }) {
  if (!message || message.trim() === '') {
    return { ok: false, reason: 'BUFFER_EMPTY_MESSAGE' };
  }
  if (count > maxMessages || characters > maxCharacters) {
    return { ok: false, reason: 'BUFFER_LIMIT_EXCEEDED' };
  }
  return { ok: true, reason: null };
}
