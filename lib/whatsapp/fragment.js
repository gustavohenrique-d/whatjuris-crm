// =============================================================================
// WhatJuris CRM — Fragmentação humanizada de resposta (Módulo 5)
// lib/whatsapp/fragment.js
//
// Divide a mensagem da IA em parágrafos (\n\n) para enviar como mensagens
// separadas, imitando um atendente. Preserva emojis/Unicode, não quebra
// palavras e não divide por ponto final (só por parágrafo).
// =============================================================================

export class FragmentError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'FragmentError';
    this.code = code;
  }
}

// Divide um parágrafo grande (> maxChars) por sentença ('. '); se ainda assim
// uma sentença passar do limite, divide por palavras. Nunca quebra no meio de
// uma palavra.
function splitLongParagraph(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  const sentences = text.split(/(?<=\.)\s+/); // mantém o ponto na sentença
  let buf = '';
  const push = () => { if (buf.trim()) chunks.push(buf.trim()); buf = ''; };

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      push();
      let wordBuf = '';
      for (const word of sentence.split(/\s+/)) {
        if ((wordBuf + ' ' + word).trim().length > maxChars) {
          if (wordBuf.trim()) chunks.push(wordBuf.trim());
          wordBuf = word;
        } else {
          wordBuf = (wordBuf ? wordBuf + ' ' : '') + word;
        }
      }
      if (wordBuf.trim()) chunks.push(wordBuf.trim());
    } else if ((buf + ' ' + sentence).trim().length > maxChars) {
      push();
      buf = sentence;
    } else {
      buf = (buf ? buf + ' ' : '') + sentence;
    }
  }
  push();
  return chunks;
}

export function fragmentMessage(text, options = {}) {
  const maxChars = options.maxChars ?? 4000;
  const maxFragments = options.maxFragments ?? 10;
  const responseId = options.responseId ?? null;

  const source = String(text ?? '').replace(/\r\n/g, '\n').trim();
  const paragraphs = source
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  // subdivide parágrafos que passem do limite
  const texts = [];
  for (const p of paragraphs) {
    for (const chunk of splitLongParagraph(p, maxChars)) texts.push(chunk);
  }

  if (texts.length === 0) return [];
  if (texts.length > maxFragments) {
    throw new FragmentError('TOO_MANY_FRAGMENTS', `${texts.length} fragmentos > máximo ${maxFragments}`);
  }

  const total = texts.length;
  return texts.map((t, index) => ({
    text: t,
    index,
    number: index + 1,
    total,
    fragment_id: responseId ? `${responseId}:${index}` : String(index),
  }));
}

// Delay humanizado (ms) entre fragmentos: proporcional ao tamanho + jitter,
// limitado a [minMs, maxMs].
export function calculateTypingDelay(textLength, options = {}) {
  const minMs = options.minMs ?? 2000;
  const maxMs = options.maxMs ?? 4000;
  const msPerChar = options.msPerChar ?? 30;
  const jitter = Math.floor(Math.random() * 501); // 0..500
  return Math.min(maxMs, Math.max(minMs, Number(textLength || 0) * msPerChar + jitter));
}
