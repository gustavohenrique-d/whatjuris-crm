import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyMetaSignature, verifyVerifyToken } from '@/lib/webhooks/signature';

const SECRET = 'app-secret-de-teste';

function sign(body, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyMetaSignature (HMAC do corpo raw)', () => {
  const raw = Buffer.from(JSON.stringify({ hello: 'world' }));

  it('aceita assinatura válida (caso 3)', () => {
    expect(verifyMetaSignature(raw, sign(raw), SECRET)).toBe(true);
  });

  it('rejeita assinatura inválida (caso 4)', () => {
    expect(verifyMetaSignature(raw, sign(Buffer.from('outro')), SECRET)).toBe(false);
  });

  it('rejeita assinatura ausente (caso 5)', () => {
    expect(verifyMetaSignature(raw, undefined, SECRET)).toBe(false);
  });

  it('rejeita quando o secret não está configurado', () => {
    expect(verifyMetaSignature(raw, sign(raw), '')).toBe(false);
  });
});

describe('verifyVerifyToken (desafio GET)', () => {
  it('aceita token correto (caso 1)', () => {
    expect(verifyVerifyToken('tok-123', 'tok-123')).toBe(true);
  });
  it('rejeita token errado (caso 2)', () => {
    expect(verifyVerifyToken('errado', 'tok-123')).toBe(false);
  });
  it('rejeita token vazio', () => {
    expect(verifyVerifyToken('', 'tok-123')).toBe(false);
  });
});
