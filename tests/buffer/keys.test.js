import { describe, it, expect } from 'vitest';
import { bufferKeys, bufferNamespace, sanitizeInstance, sanitizeChatId } from '@/lib/buffer/keys';

describe('sanitização das chaves do buffer', () => {
  it('instance → [a-z0-9_-]', () => {
    expect(sanitizeInstance('Escritório Principal!')).toBe('escrit_rio_principal_');
  });
  it('chat_id → só dígitos', () => {
    expect(sanitizeChatId('+55 (11) 99999-9999')).toBe('5511999999999');
  });
  it('namespace usa hash tag {inst:chat}', () => {
    expect(bufferNamespace('escritorio-principal', '5511999999999')).toBe('{escritorio-principal:5511999999999}');
  });
});

describe('bufferKeys', () => {
  it('monta as 4 chaves com prefixo buffer:v1', () => {
    const k = bufferKeys('escritorio-principal', '5511999999999', 'wamid.X');
    expect(k.messages).toBe('buffer:v1:{escritorio-principal:5511999999999}:messages');
    expect(k.latest).toBe('buffer:v1:{escritorio-principal:5511999999999}:latest');
    expect(k.seen).toBe('buffer:v1:{escritorio-principal:5511999999999}:seen');
    expect(k.processing).toBe('buffer:v1:{escritorio-principal:5511999999999}:processing:wamid.X');
  });

  it('chat_ids diferentes → chaves diferentes (caso 13)', () => {
    const a = bufferKeys('inst', '5511111111111');
    const b = bufferKeys('inst', '5522222222222');
    expect(a.messages).not.toBe(b.messages);
  });

  it('instance_names diferentes → chaves diferentes (caso 14)', () => {
    const a = bufferKeys('inst-a', '5511999999999');
    const b = bufferKeys('inst-b', '5511999999999');
    expect(a.messages).not.toBe(b.messages);
  });
});
