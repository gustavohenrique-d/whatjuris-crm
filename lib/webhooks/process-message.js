// =============================================================================
// WhatJuris CRM — Finalização do envelope por tipo (mídia + IA)
// lib/webhooks/process-message.js
//
// Recebe um envelope já normalizado (whatsapp-normalizer.js) e, para áudio e
// imagem, baixa+valida a mídia e chama transcrição/descrição, preenchendo
// `message`. Texto e tipos não suportados já vêm prontos do normalizer.
//
// Sem Prisma aqui (só rede/IA) — o handler cuida da persistência. Erros viram
// processing_error tipado, nunca exceção propagada nem detalhe sensível.
// =============================================================================

import { fetchAndValidateMedia, MediaError } from '@/lib/webhooks/media';
import { transcribeAudio, TranscriptionError } from '@/lib/webhooks/transcription';
import { describeImage, buildImageMessage, VisionError } from '@/lib/webhooks/vision';

function fail(env, code) {
  env.message = '';
  env.processing_status = 'error';
  env.processing_error = code;
  return env;
}

export async function finalizeEnvelope(env) {
  // Já resolvidos pelo normalizer: conversation (ok/EMPTY_TEXT_MESSAGE) e
  // unsupported. Só áudio/imagem precisam de mídia+IA.
  if (env.message_type === 'audio message') {
    if (!env.media_id) return fail(env, 'MISSING_MEDIA_ID');
    try {
      const { buffer, mimeType } = await fetchAndValidateMedia({
        kind: 'audio',
        mediaId: env.media_id,
        declaredMimeType: env.media_mime_type,
      });
      env.media_mime_type = mimeType || env.media_mime_type;
      const text = await transcribeAudio({ buffer, mimeType });
      env.message = text;
      env.processing_status = 'ok';
      env.processing_error = null;
    } catch (err) {
      if (err instanceof MediaError) return fail(env, err.code);
      if (err instanceof TranscriptionError) return fail(env, err.code);
      return fail(env, 'AUDIO_TRANSCRIPTION_FAILED');
    }
    return env;
  }

  if (env.message_type === 'image message') {
    if (!env.media_id) return fail(env, 'MISSING_MEDIA_ID');
    try {
      const { buffer, mimeType } = await fetchAndValidateMedia({
        kind: 'image',
        mediaId: env.media_id,
        declaredMimeType: env.media_mime_type,
      });
      env.media_mime_type = mimeType || env.media_mime_type;
      const description = await describeImage({ buffer, mimeType });
      env.message = buildImageMessage(description);
      env.processing_status = 'ok';
      env.processing_error = null;
    } catch (err) {
      if (err instanceof MediaError) return fail(env, err.code);
      if (err instanceof VisionError) return fail(env, err.code);
      return fail(env, 'IMAGE_DESCRIPTION_FAILED');
    }
    return env;
  }

  return env;
}

// Só pode seguir ao próximo módulo o envelope pronto e consumível.
export function isForwardable(env) {
  return env.processing_status === 'ok' && env.from_me === false && env.message !== '';
}
