// =============================================================================
// WhatJuris CRM — Normalização de mensagens do WhatsApp (Meta Cloud API)
// lib/webhooks/whatsapp-normalizer.js
//
// Núcleo PURO (sem rede, sem Prisma) que transforma o payload cru da Meta na
// lista de envelopes normalizados do contrato do módulo. Testável isolado.
//
// O payload da Meta pode conter múltiplos entry[], changes[] e messages[].
// Expandimos tudo: um envelope por mensagem. Eventos só com statuses[] (recibo
// de entrega/leitura) não geram envelope — não devem acionar IA.
//
// Contrato de saída (ver docs): campos sempre presentes, valores padrão seguros.
// Para texto, `message` já sai preenchido. Para áudio/imagem, `message` sai ""
// e `processing_status` "ok" — o handler completa após baixar e processar a
// mídia (transcrição/descrição).
// =============================================================================

const INSTANCE_FALLBACK = 'escritorio-principal';

// Mapa: tipo cru da Meta → message_type normalizado do contrato.
// Aceita os aliases *Message que aparecem em alguns provedores/formatos.
const TYPE_MAP = {
  text: 'conversation',
  audio: 'audio message',
  audioMessage: 'audio message',
  image: 'image message',
  imageMessage: 'image message',
};

export function normalizeMessageType(rawType) {
  return TYPE_MAP[rawType] || 'unsupported';
}

// Timestamp Unix (string ou número, em segundos) → ISO 8601. Fallback: agora.
export function toIso(unixTimestamp) {
  const n = Number(unixTimestamp);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(n * 1000).toISOString();
}

function baseEnvelope(overrides = {}) {
  return {
    instance_name: process.env.WHATSAPP_INSTANCE_NAME || INSTANCE_FALLBACK,
    chat_id: '',
    content: '',
    from_me: false, // mensagens diretas da Meta são sempre do lead
    message_id: '',
    message_type: 'unsupported',
    raw_message_type: '',
    message: '',
    media_id: null,
    media_mime_type: null,
    received_at: new Date().toISOString(),
    processing_status: 'ok', // 'ok' | 'ignored' | 'unsupported' | 'error'
    processing_error: null,
    ...overrides,
  };
}

// Monta o envelope de UMA mensagem crua da Meta, dado o `value` do change
// (que traz metadata/contacts) para preencher instance_name e chat_id.
function buildEnvelope(msg, value) {
  const rawType = msg?.type || '';
  const messageType = normalizeMessageType(rawType);
  const instanceName =
    process.env.WHATSAPP_INSTANCE_NAME ||
    value?.metadata?.phone_number_id ||
    INSTANCE_FALLBACK;
  const chatId = msg?.from || value?.contacts?.[0]?.wa_id || '';

  const env = baseEnvelope({
    instance_name: instanceName,
    chat_id: chatId,
    message_id: msg?.id || '',
    message_type: messageType,
    raw_message_type: rawType,
    received_at: toIso(msg?.timestamp),
  });

  switch (messageType) {
    case 'conversation': {
      const body = (msg?.text?.body ?? '').toString();
      env.content = body;
      const trimmed = body.trim();
      if (trimmed === '') {
        env.message = '';
        env.processing_status = 'error';
        env.processing_error = 'EMPTY_TEXT_MESSAGE';
      } else {
        env.message = trimmed;
      }
      break;
    }

    case 'audio message': {
      const audio = msg?.audio || {};
      env.content = ''; // áudio não tem legenda
      env.media_id = audio.id ?? null;
      env.media_mime_type = audio.mime_type ?? null;
      // message preenchida pelo handler após transcrição; status pende da mídia
      break;
    }

    case 'image message': {
      const image = msg?.image || {};
      env.content = (image.caption ?? '').toString(); // legenda original preservada
      env.media_id = image.id ?? null;
      env.media_mime_type = image.mime_type ?? null;
      // message preenchida pelo handler após descrição
      break;
    }

    default: {
      // vídeo, sticker, localização, contato, documento, desconhecido...
      env.message = '';
      env.processing_status = 'unsupported';
      env.processing_error = 'UNSUPPORTED_MESSAGE_TYPE';
    }
  }

  return env;
}

// Expande entry[] → changes[] → messages[] e devolve todos os envelopes.
// Também sinaliza se o payload trouxe apenas statuses[] (nenhuma mensagem).
export function parseMetaPayload(body) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  const envelopes = [];
  let sawStatuses = false;
  let sawMessages = false;

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      if (Array.isArray(value.statuses) && value.statuses.length) {
        sawStatuses = true;
      }
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of messages) {
        sawMessages = true;
        envelopes.push(buildEnvelope(msg, value));
      }
    }
  }

  return {
    envelopes,
    // só-statuses: veio recibo mas nenhuma mensagem para processar
    statusesOnly: sawStatuses && !sawMessages,
  };
}

export const MESSAGE_TYPE_MAP = TYPE_MAP;
