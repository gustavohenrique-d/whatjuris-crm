import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks dos módulos de rede/IA — nenhum teste chama API paga.
vi.mock('@/lib/webhooks/media', async () => {
  const actual = await vi.importActual('@/lib/webhooks/media');
  return {
    ...actual,
    fetchAndValidateMedia: vi.fn(),
  };
});
vi.mock('@/lib/webhooks/transcription', async () => {
  const actual = await vi.importActual('@/lib/webhooks/transcription');
  return { ...actual, transcribeAudio: vi.fn() };
});
vi.mock('@/lib/webhooks/vision', async () => {
  const actual = await vi.importActual('@/lib/webhooks/vision');
  return { ...actual, describeImage: vi.fn() };
});

import { finalizeEnvelope, isForwardable } from '@/lib/webhooks/process-message';
import { fetchAndValidateMedia, MediaError } from '@/lib/webhooks/media';
import { transcribeAudio, TranscriptionError } from '@/lib/webhooks/transcription';
import { describeImage } from '@/lib/webhooks/vision';

function envelope(overrides = {}) {
  return {
    instance_name: 'escritorio-principal',
    chat_id: '5511999999999',
    content: '',
    from_me: false,
    message_id: 'wamid.X',
    message_type: 'conversation',
    raw_message_type: 'text',
    message: '',
    media_id: null,
    media_mime_type: null,
    received_at: new Date().toISOString(),
    processing_status: 'ok',
    processing_error: null,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('finalizeEnvelope', () => {
  it('texto: não chama nenhum provedor de IA (caso 17)', async () => {
    const e = await finalizeEnvelope(envelope({ message: 'olá', content: 'olá' }));
    expect(fetchAndValidateMedia).not.toHaveBeenCalled();
    expect(transcribeAudio).not.toHaveBeenCalled();
    expect(describeImage).not.toHaveBeenCalled();
    expect(e.message).toBe('olá');
  });

  it('áudio: chama só transcrição (caso 15)', async () => {
    fetchAndValidateMedia.mockResolvedValue({ buffer: Buffer.from('x'), mimeType: 'audio/ogg', bytes: 1 });
    transcribeAudio.mockResolvedValue('transcrição do áudio');
    const e = await finalizeEnvelope(
      envelope({ message_type: 'audio message', raw_message_type: 'audio', media_id: 'M1', media_mime_type: 'audio/ogg' })
    );
    expect(transcribeAudio).toHaveBeenCalledOnce();
    expect(describeImage).not.toHaveBeenCalled();
    expect(e.message).toBe('transcrição do áudio');
    expect(e.processing_status).toBe('ok');
  });

  it('imagem: chama só visão e formata a message (caso 16)', async () => {
    fetchAndValidateMedia.mockResolvedValue({ buffer: Buffer.from('x'), mimeType: 'image/jpeg', bytes: 1 });
    describeImage.mockResolvedValue('um documento de identidade');
    const e = await finalizeEnvelope(
      envelope({ message_type: 'image message', raw_message_type: 'image', media_id: 'M2', media_mime_type: 'image/jpeg', content: 'legenda' })
    );
    expect(describeImage).toHaveBeenCalledOnce();
    expect(transcribeAudio).not.toHaveBeenCalled();
    expect(e.message).toBe('O usuário enviou uma imagem. Segue a descrição da imagem em detalhes: um documento de identidade');
    expect(e.content).toBe('legenda'); // legenda preservada
  });

  it('áudio sem media_id → MISSING_MEDIA_ID', async () => {
    const e = await finalizeEnvelope(envelope({ message_type: 'audio message', media_id: null }));
    expect(e.processing_status).toBe('error');
    expect(e.processing_error).toBe('MISSING_MEDIA_ID');
  });

  it('MIME inválido no download → INVALID_MIME_TYPE (caso 18)', async () => {
    fetchAndValidateMedia.mockRejectedValue(new MediaError('INVALID_MIME_TYPE', 'x'));
    const e = await finalizeEnvelope(envelope({ message_type: 'audio message', media_id: 'M1' }));
    expect(e.processing_error).toBe('INVALID_MIME_TYPE');
    expect(e.message).toBe('');
  });

  it('arquivo grande → MEDIA_TOO_LARGE (caso 19)', async () => {
    fetchAndValidateMedia.mockRejectedValue(new MediaError('MEDIA_TOO_LARGE', 'x'));
    const e = await finalizeEnvelope(envelope({ message_type: 'image message', media_id: 'M2' }));
    expect(e.processing_error).toBe('MEDIA_TOO_LARGE');
  });

  it('falha de transcrição → AUDIO_TRANSCRIPTION_FAILED (caso 21)', async () => {
    fetchAndValidateMedia.mockResolvedValue({ buffer: Buffer.from('x'), mimeType: 'audio/ogg', bytes: 1 });
    transcribeAudio.mockRejectedValue(new TranscriptionError('falhou'));
    const e = await finalizeEnvelope(envelope({ message_type: 'audio message', media_id: 'M1' }));
    expect(e.processing_error).toBe('AUDIO_TRANSCRIPTION_FAILED');
  });
});

describe('isForwardable', () => {
  it('só passa ok + from_me=false + message não vazia', () => {
    expect(isForwardable(envelope({ message: 'x' }))).toBe(true);
    expect(isForwardable(envelope({ message: '' }))).toBe(false);
    expect(isForwardable(envelope({ message: 'x', from_me: true }))).toBe(false);
    expect(isForwardable(envelope({ message: 'x', processing_status: 'ignored' }))).toBe(false);
    expect(isForwardable(envelope({ message: 'x', processing_status: 'unsupported' }))).toBe(false);
  });
});
