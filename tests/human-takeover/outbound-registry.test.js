import { describe, it, expect, vi, beforeEach } from 'vitest';

const redisMock = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
let redisEnabled = true;

vi.mock('@/lib/redis/client', () => ({
  getRedis: () => (redisEnabled ? redisMock : null),
  isRedisEnabled: () => redisEnabled,
}));

import { registerOutboundAI, isOutboundAI, outboundKey } from '@/lib/whatsapp/outbound-registry';

beforeEach(() => {
  vi.clearAllMocks();
  redisEnabled = true;
  redisMock.set.mockResolvedValue('OK');
});

describe('outboundKey', () => {
  it('monta outbound:v1:{instance}:{message_id}', () => {
    expect(outboundKey('escritorio-principal', 'wamid.X')).toBe('outbound:v1:escritorio-principal:wamid.X');
  });
});

describe('registerOutboundAI', () => {
  it('grava SET EX com o TTL configurado', async () => {
    process.env.OUTBOUND_ORIGIN_TTL_SECONDS = '86400';
    const r = await registerOutboundAI({ instanceName: 'escritorio-principal', messageId: 'wamid.X', chatId: '5511999999999' });
    expect(r).toEqual({ registered: true });
    const call = redisMock.set.mock.calls[0];
    expect(call[0]).toBe('outbound:v1:escritorio-principal:wamid.X');
    expect(call[2]).toBe('EX');
    expect(call[3]).toBe(86400);
    expect(JSON.parse(call[1]).sender_origin).toBe('ai');
  });

  it('sem Redis → no-op (skipped), não lança', async () => {
    redisEnabled = false;
    const r = await registerOutboundAI({ instanceName: 'x', messageId: 'wamid.Y', chatId: '551199' });
    expect(r).toEqual({ skipped: true });
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});

describe('isOutboundAI', () => {
  it('true quando a chave existe', async () => {
    redisMock.get.mockResolvedValue(JSON.stringify({ sender_origin: 'ai' }));
    expect(await isOutboundAI('x', 'wamid.X')).toBe(true);
  });
  it('false quando a chave não existe', async () => {
    redisMock.get.mockResolvedValue(null);
    expect(await isOutboundAI('x', 'wamid.X')).toBe(false);
  });
  it('sem Redis → false (fail-closed: trata como possível humano)', async () => {
    redisEnabled = false;
    expect(await isOutboundAI('x', 'wamid.X')).toBe(false);
  });
  it('erro no Redis → false', async () => {
    redisMock.get.mockRejectedValue(new Error('down'));
    expect(await isOutboundAI('x', 'wamid.X')).toBe(false);
  });
});
