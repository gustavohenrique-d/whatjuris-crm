import { describe, it, expect } from 'vitest';
import { validateMedia, MediaError } from '@/lib/webhooks/media';

describe('validateMedia', () => {
  it('aceita áudio ogg dentro do limite', () => {
    expect(validateMedia({ kind: 'audio', mimeType: 'audio/ogg', bytes: 1024 })).toBe(true);
  });

  it('aceita imagem jpeg dentro do limite', () => {
    expect(validateMedia({ kind: 'image', mimeType: 'image/jpeg', bytes: 2048 })).toBe(true);
  });

  it('rejeita MIME fora da allowlist (caso 18)', () => {
    try {
      validateMedia({ kind: 'audio', mimeType: 'application/pdf', bytes: 1024 });
      throw new Error('deveria ter lançado');
    } catch (err) {
      expect(err).toBeInstanceOf(MediaError);
      expect(err.code).toBe('INVALID_MIME_TYPE');
    }
  });

  it('rejeita arquivo vazio', () => {
    try {
      validateMedia({ kind: 'image', mimeType: 'image/png', bytes: 0 });
      throw new Error('deveria ter lançado');
    } catch (err) {
      expect(err).toBeInstanceOf(MediaError);
      expect(err.code).toBe('EMPTY_MEDIA_FILE');
    }
  });

  it('rejeita arquivo acima do limite (caso 19)', () => {
    const overImage = 10485760 + 1;
    try {
      validateMedia({ kind: 'image', mimeType: 'image/jpeg', bytes: overImage });
      throw new Error('deveria ter lançado');
    } catch (err) {
      expect(err.code).toBe('MEDIA_TOO_LARGE');
    }
  });

  it('normaliza MIME com parâmetros (audio/ogg; codecs=opus)', () => {
    expect(validateMedia({ kind: 'audio', mimeType: 'audio/ogg; codecs=opus', bytes: 512 })).toBe(true);
  });
});
