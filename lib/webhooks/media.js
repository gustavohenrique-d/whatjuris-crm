// =============================================================================
// WhatJuris CRM — Download e validação de mídia da Meta (Graph API)
// lib/webhooks/media.js
//
// Fluxo em 2 etapas (Meta): 1) GET /{version}/{media_id} devolve uma URL
// temporária; 2) GET nessa URL (com Bearer) devolve o binário. Só seguimos
// URLs retornadas pela própria Meta — nunca URLs arbitrárias do payload.
//
// Nunca logar binário/base64/URL temporária. Timeout 30s. Retry em 429/5xx.
// =============================================================================

const AUDIO_ALLOWLIST = new Set([
  'audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp3', 'audio/mp4',
  'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/flac',
]);

const IMAGE_ALLOWLIST = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
]);

const GRAPH_VERSION = () => process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0';
const TOKEN = () => process.env.WHATSAPP_ACCESS_TOKEN;

// Erro tipado para o handler mapear em processing_error sem vazar detalhe.
export class MediaError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'MediaError';
    this.code = code; // ex.: META_AUTH_FAILED, MISSING_MEDIA_ID...
  }
}

function allowlistFor(kind) {
  return kind === 'audio' ? AUDIO_ALLOWLIST : IMAGE_ALLOWLIST;
}

function maxBytesFor(kind) {
  const raw = kind === 'audio' ? process.env.MAX_AUDIO_BYTES : process.env.MAX_IMAGE_BYTES;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  return kind === 'audio' ? 26214400 : 10485760; // 25MiB / 10MiB
}

// fetch com timeout + retry (backoff exponencial + jitter) para 429/5xx.
async function fetchWithRetry(url, options = {}, { retries = 3, timeoutMs = 30000 } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        lastErr = new MediaError('META_TRANSIENT', `status ${res.status}`);
      } else {
        return res;
      }
    } catch (err) {
      // timeout/rede — tratar como transitório
      lastErr = err;
    }
    attempt += 1;
    if (attempt > retries) break;
    const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000) + Math.floor(Math.random() * 250);
    await new Promise((r) => setTimeout(r, backoff));
  }
  throw lastErr || new MediaError('META_DOWNLOAD_FAILED', 'falha ao baixar mídia');
}

// Etapa 1 — metadados: devolve { url, mime_type, file_size }.
export async function getMediaMetadata(mediaId) {
  if (!mediaId) throw new MediaError('MISSING_MEDIA_ID', 'media_id ausente');
  const token = TOKEN();
  if (!token) throw new MediaError('META_AUTH_FAILED', 'WHATSAPP_ACCESS_TOKEN ausente');

  const url = `https://graph.facebook.com/${GRAPH_VERSION()}/${encodeURIComponent(mediaId)}`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) {
    throw new MediaError('META_AUTH_FAILED', 'token Meta inválido');
  }
  if (!res.ok) throw new MediaError('META_DOWNLOAD_FAILED', `metadados status ${res.status}`);

  const data = await res.json();
  if (!data?.url) throw new MediaError('META_DOWNLOAD_FAILED', 'resposta sem url');
  return { url: data.url, mime_type: data.mime_type || null, file_size: data.file_size ?? null };
}

// Etapa 2 — binário: devolve { buffer, mimeType, bytes }.
export async function downloadMediaBinary(mediaUrl) {
  const token = TOKEN();
  if (!token) throw new MediaError('META_AUTH_FAILED', 'WHATSAPP_ACCESS_TOKEN ausente');

  const res = await fetchWithRetry(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) {
    throw new MediaError('META_AUTH_FAILED', 'token Meta inválido no download');
  }
  if (!res.ok) throw new MediaError('META_DOWNLOAD_FAILED', `download status ${res.status}`);

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || null;
  return { buffer, mimeType, bytes: buffer.length };
}

// Valida MIME (allowlist), tamanho (limite) e arquivo vazio. Não confia só na
// extensão — usa o MIME real do metadado/resposta. Lança MediaError tipado.
export function validateMedia({ kind, mimeType, bytes }) {
  if (!bytes || bytes <= 0) throw new MediaError('EMPTY_MEDIA_FILE', 'arquivo vazio');
  if (bytes > maxBytesFor(kind)) throw new MediaError('MEDIA_TOO_LARGE', 'arquivo acima do limite');
  const mime = (mimeType || '').split(';')[0].trim().toLowerCase();
  if (!allowlistFor(kind).has(mime)) throw new MediaError('INVALID_MIME_TYPE', `mime não permitido: ${mime}`);
  return true;
}

// Orquestra: metadados → download → validação. Devolve o binário pronto p/ IA.
export async function fetchAndValidateMedia({ kind, mediaId, declaredMimeType }) {
  const meta = await getMediaMetadata(mediaId);
  const { buffer, mimeType, bytes } = await downloadMediaBinary(meta.url);
  const effectiveMime = mimeType || meta.mime_type || declaredMimeType || null;
  validateMedia({ kind, mimeType: effectiveMime, bytes });
  return { buffer, mimeType: effectiveMime, bytes };
}

export const _internal = { AUDIO_ALLOWLIST, IMAGE_ALLOWLIST, maxBytesFor };
