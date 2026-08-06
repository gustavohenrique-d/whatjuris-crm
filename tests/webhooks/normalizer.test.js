import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  parseMetaPayload,
  normalizeMessageType,
  toIso,
} from '@/lib/webhooks/whatsapp-normalizer';

function fixture(name) {
  const p = path.join(process.cwd(), 'tests/webhooks/fixtures', name);
  return JSON.parse(readFileSync(p, 'utf8'));
}

const CONTRACT_KEYS = [
  'instance_name', 'chat_id', 'content', 'from_me', 'message_id', 'message_type',
  'raw_message_type', 'message', 'interactive_reply_id', 'media_id', 'media_mime_type',
  'received_at', 'processing_status', 'processing_error',
];

describe('normalizeMessageType (caso 10 — aliases)', () => {
  it('mapeia text → conversation', () => expect(normalizeMessageType('text')).toBe('conversation'));
  it('mapeia audio e audioMessage → audio message', () => {
    expect(normalizeMessageType('audio')).toBe('audio message');
    expect(normalizeMessageType('audioMessage')).toBe('audio message');
  });
  it('mapeia image e imageMessage → image message', () => {
    expect(normalizeMessageType('image')).toBe('image message');
    expect(normalizeMessageType('imageMessage')).toBe('image message');
  });
  it('mapeia interactive → interactive', () => {
    expect(normalizeMessageType('interactive')).toBe('interactive');
  });
  it('qualquer outro → unsupported', () => {
    expect(normalizeMessageType('video')).toBe('unsupported');
    expect(normalizeMessageType('sticker')).toBe('unsupported');
  });
});

describe('toIso', () => {
  it('converte Unix (s) para ISO 8601', () => {
    expect(toIso('1785252600')).toBe(new Date(1785252600 * 1000).toISOString());
  });
  it('fallback para agora em timestamp inválido', () => {
    expect(() => new Date(toIso('lixo')).toISOString()).not.toThrow();
  });
});

describe('parseMetaPayload', () => {
  it('extrai texto (caso 6) e preenche message com content.trim()', () => {
    const { envelopes } = parseMetaPayload(fixture('text-message.json'));
    expect(envelopes).toHaveLength(1);
    const e = envelopes[0];
    expect(e.message_type).toBe('conversation');
    expect(e.raw_message_type).toBe('text');
    expect(e.chat_id).toBe('5511999999999');
    expect(e.content).toBe('Olá, preciso de atendimento.');
    expect(e.message).toBe('Olá, preciso de atendimento.');
    expect(e.from_me).toBe(false);
    expect(e.processing_status).toBe('ok');
  });

  it('extrai áudio (caso 7): media_id e mime, message pendente', () => {
    const { envelopes } = parseMetaPayload(fixture('audio-message.json'));
    const e = envelopes[0];
    expect(e.message_type).toBe('audio message');
    expect(e.media_id).toBe('MEDIA_AUDIO_1');
    expect(e.media_mime_type).toBe('audio/ogg');
    expect(e.message).toBe(''); // preenchido só após transcrição
  });

  it('extrai imagem com legenda (caso 8): content = caption', () => {
    const { envelopes } = parseMetaPayload(fixture('image-with-caption.json'));
    const e = envelopes[0];
    expect(e.message_type).toBe('image message');
    expect(e.media_id).toBe('MEDIA_IMAGE_2');
    expect(e.content).toBe('Segue o documento');
  });

  it('extrai imagem sem legenda (caso 9): content vazio', () => {
    const { envelopes } = parseMetaPayload(fixture('image-message.json'));
    const e = envelopes[0];
    expect(e.message_type).toBe('image message');
    expect(e.content).toBe('');
  });

  it('expande múltiplas mensagens/entries (caso 11)', () => {
    const { envelopes } = parseMetaPayload(fixture('batched-messages.json'));
    expect(envelopes.map((e) => e.message_id)).toEqual([
      'wamid.B1', 'wamid.B2', 'wamid.B3',
    ]);
  });

  it('payload só com statuses (caso 12): statusesOnly=true, sem envelopes', () => {
    const { envelopes, statusesOnly } = parseMetaPayload(fixture('status-update.json'));
    expect(envelopes).toHaveLength(0);
    expect(statusesOnly).toBe(true);
  });

  it('tipo não suportado → unsupported (localização)', () => {
    const { envelopes } = parseMetaPayload(fixture('unsupported-type.json'));
    const e = envelopes[0];
    expect(e.message_type).toBe('unsupported');
    expect(e.processing_status).toBe('unsupported');
    expect(e.processing_error).toBe('UNSUPPORTED_MESSAGE_TYPE');
    expect(e.message).toBe('');
  });

  it('resposta de lista interativa → message=título, interactive_reply_id=id, ok', () => {
    const payload = {
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: 'X' },
        contacts: [{ wa_id: '5513978015937' }],
        messages: [{ from: '5513978015937', id: 'wamid.LIST', timestamp: '1785252600', type: 'interactive',
          interactive: { type: 'list_reply', list_reply: { id: 'trabalhista', title: '⚖️ Trabalhista', description: 'Demissão, verbas' } } }],
      } }] }],
    };
    const e = parseMetaPayload(payload).envelopes[0];
    expect(e.message_type).toBe('interactive');
    expect(e.raw_message_type).toBe('interactive');
    expect(e.interactive_reply_id).toBe('trabalhista');
    expect(e.message).toBe('⚖️ Trabalhista');
    expect(e.content).toBe('⚖️ Trabalhista');
    expect(e.processing_status).toBe('ok');
  });

  it('resposta de botão interativo (button_reply) também é capturada', () => {
    const payload = {
      entry: [{ changes: [{ value: {
        messages: [{ from: '5513978015937', id: 'wamid.BTN', timestamp: '1785252600', type: 'interactive',
          interactive: { type: 'button_reply', button_reply: { id: 'sim', title: 'Sim' } } }],
      } }] }],
    };
    const e = parseMetaPayload(payload).envelopes[0];
    expect(e.interactive_reply_id).toBe('sim');
    expect(e.message).toBe('Sim');
    expect(e.processing_status).toBe('ok');
  });

  it('interactive sem id → unsupported (não encaminha)', () => {
    const payload = {
      entry: [{ changes: [{ value: {
        messages: [{ from: '5513978015937', id: 'wamid.BAD', timestamp: '1785252600', type: 'interactive',
          interactive: { type: 'list_reply', list_reply: { title: 'sem id' } } }],
      } }] }],
    };
    const e = parseMetaPayload(payload).envelopes[0];
    expect(e.interactive_reply_id).toBeNull();
    expect(e.processing_status).toBe('unsupported');
    expect(e.processing_error).toBe('UNSUPPORTED_INTERACTIVE_REPLY');
  });

  it('contrato completo — todos os campos presentes (caso 22)', () => {
    const { envelopes } = parseMetaPayload(fixture('text-message.json'));
    const e = envelopes[0];
    for (const k of CONTRACT_KEYS) expect(e).toHaveProperty(k);
    expect(typeof e.from_me).toBe('boolean');
    expect(typeof e.message).toBe('string');
    expect(() => new Date(e.received_at).toISOString()).not.toThrow();
  });

  it('payload inválido (value vazio) → sem envelopes, sem throw', () => {
    const { envelopes, statusesOnly } = parseMetaPayload(fixture('invalid-payload.json'));
    expect(envelopes).toHaveLength(0);
    expect(statusesOnly).toBe(false);
  });

  it('texto vazio → EMPTY_TEXT_MESSAGE', () => {
    const payload = {
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: 'X' },
        messages: [{ from: '5511999999999', id: 'wamid.EMPTY', timestamp: '1785252600', type: 'text', text: { body: '   ' } }],
      } }] }],
    };
    const { envelopes } = parseMetaPayload(payload);
    expect(envelopes[0].processing_status).toBe('error');
    expect(envelopes[0].processing_error).toBe('EMPTY_TEXT_MESSAGE');
  });
});
