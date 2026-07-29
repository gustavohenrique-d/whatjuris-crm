import { describe, it, expect, vi, beforeEach } from 'vitest';

const { redisMock, state } = vi.hoisted(() => ({
  redisMock: { set: vi.fn(), eval: vi.fn() },
  state: { redisNull: false },
}));
vi.mock('@/lib/redis/client', () => ({
  getRedis: () => (state.redisNull ? null : redisMock),
  isRedisEnabled: () => !state.redisNull,
}));

import { acquireSendLock, renewSendLock, releaseSendLock, lockKey } from '@/lib/whatsapp/send-lock';

beforeEach(() => {
  vi.clearAllMocks();
  state.redisNull = false;
});

describe('lockKey', () => {
  it('conversas diferentes → chaves diferentes (caso 29)', () => {
    expect(lockKey('inst', '5511')).toBe('send-lock:v1:inst:5511');
    expect(lockKey('inst', '5511')).not.toBe(lockKey('inst', '5522'));
    expect(lockKey('inst-a', '5511')).not.toBe(lockKey('inst-b', '5511'));
  });
});

describe('acquireSendLock', () => {
  it('SET NX EX retorna OK → adquirido (caso 28)', async () => {
    redisMock.set.mockResolvedValue('OK');
    const r = await acquireSendLock('inst', '5511', 120);
    expect(r.acquired).toBe(true);
    expect(r.lockToken).toBeTruthy();
    const call = redisMock.set.mock.calls[0];
    expect(call[0]).toBe('send-lock:v1:inst:5511');
    expect(call[2]).toBe('NX');
    expect(call[3]).toBe('EX');
    expect(call[4]).toBe(120);
  });

  it('chave já existe (null) → não adquirido (caso 28)', async () => {
    redisMock.set.mockResolvedValue(null);
    const r = await acquireSendLock('inst', '5511');
    expect(r.acquired).toBe(false);
    expect(r.lockToken).toBeNull();
  });

  it('sem Redis → degradação graciosa (acquired true, sem token)', async () => {
    state.redisNull = true;
    const r = await acquireSendLock('inst', '5511');
    expect(r).toMatchObject({ acquired: true, lockToken: null, degraded: true });
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});

describe('renew/release (compare-and-*)', () => {
  it('renova só se o token bate (Lua → 1)', async () => {
    redisMock.eval.mockResolvedValue(1);
    expect(await renewSendLock('inst', '5511', 'tok', 120)).toBe(true);
  });
  it('libera só se o token bate (Lua → 1)', async () => {
    redisMock.eval.mockResolvedValue(1);
    expect(await releaseSendLock('inst', '5511', 'tok')).toBe(true);
  });
  it('token errado (Lua → 0) → não libera', async () => {
    redisMock.eval.mockResolvedValue(0);
    expect(await releaseSendLock('inst', '5511', 'outro')).toBe(false);
  });
  it('sem token → no-op true (degradação)', async () => {
    expect(await releaseSendLock('inst', '5511', null)).toBe(true);
    expect(redisMock.eval).not.toHaveBeenCalled();
  });
});
