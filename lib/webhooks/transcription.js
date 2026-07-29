// =============================================================================
// WhatJuris CRM — Transcrição de áudio (OpenAI Whisper / Gemini)
// lib/webhooks/transcription.js
//
// Provider via AUDIO_TRANSCRIPTION_PROVIDER = openai | gemini (default openai).
// Recebe o binário já baixado e validado (lib/webhooks/media.js).
// Em falha, o handler define message="", status="error",
// processing_error="AUDIO_TRANSCRIPTION_FAILED".
// =============================================================================

const GEMINI_PROMPT = `Transcreva fielmente este áudio em português do Brasil.

Regras:
- Retorne somente a transcrição.
- Não resuma nem responda ao conteúdo.
- Não dê orientação jurídica.
- Preserve nomes, datas, valores e números.
- Quando inaudível, use [inaudível].
- Não invente palavras.`;

export class TranscriptionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TranscriptionError';
    this.code = 'AUDIO_TRANSCRIPTION_FAILED';
  }
}

async function transcribeOpenAI({ buffer, mimeType }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new TranscriptionError('OPENAI_API_KEY ausente');
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1';

  const form = new FormData();
  const ext = (mimeType || 'audio/ogg').split('/')[1]?.split(';')[0] || 'ogg';
  form.append('file', new Blob([buffer], { type: mimeType || 'audio/ogg' }), `audio.${ext}`);
  form.append('model', model);
  form.append('language', 'pt');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    // não fazer retry de auth; mensagem sem corpo bruto
    throw new TranscriptionError(`OpenAI transcription status ${res.status}`);
  }
  const data = await res.json();
  return (data?.text || '').trim();
}

async function transcribeGemini({ buffer, mimeType }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new TranscriptionError('GEMINI_API_KEY ausente');
  const model = process.env.GEMINI_AUDIO_MODEL || 'gemini-1.5-pro';

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    contents: [
      {
        parts: [
          { text: GEMINI_PROMPT },
          { inline_data: { mime_type: mimeType || 'audio/ogg', data: buffer.toString('base64') } },
        ],
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) throw new TranscriptionError(`Gemini transcription status ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  return text.trim();
}

export async function transcribeAudio({ buffer, mimeType }) {
  const provider = (process.env.AUDIO_TRANSCRIPTION_PROVIDER || 'openai').toLowerCase();
  const text = provider === 'gemini'
    ? await transcribeGemini({ buffer, mimeType })
    : await transcribeOpenAI({ buffer, mimeType });

  if (!text) throw new TranscriptionError('transcrição vazia');
  return text;
}
