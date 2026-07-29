import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- mocks de infraestrutura (nenhum Redis/Supabase real) -----------------
// vi.hoisted: as factories do vi.mock são içadas ao topo; os mocks precisam
// existir antes delas.
const { redisMock, prismaMock, state } = vi.hoisted(() => {
  const redisMock = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
  const prismaMock = {
    conversationControl: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    conversationControlEvent: { create: vi.fn() },
  };
  prismaMock.$transaction = async (fn) => fn(prismaMock);
  return { redisMock, prismaMock, state: { redisEnabled: true } };
});

vi.mock('@/lib/redis/client', () => ({
  getRedis: () => (state.redisEnabled ? redisMock : null),
  isRedisEnabled: () => state.redisEnabled,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));

import {
  resolveSenderOrigin, sanitizeInstance, sanitizeChatId, blockKey,
  isBlocked, activateTakeover, refreshTakeover, releaseTakeover, checkAndReconcileExpiration,
} from '@/lib/conversations/control';

beforeEach(() => {
  vi.clearAllMocks();
  state.redisEnabled = true;
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue('OK');
  redisMock.del.mockResolvedValue(1);
});

// ---------------------------------------------------------------------------
describe('resolveSenderOrigin (seção 4)', () => {
  it('from_me=false → client (caso 1)', () => {
    expect(resolveSenderOrigin({ fromMe: false })).toBe('client');
  });
  it('from_me=true + outbound IA → ai (caso 2)', () => {
    expect(resolveSenderOrigin({ fromMe: true, outboundIsAI: true })).toBe('ai');
  });
  it('from_me=true + sem outbound → human_mobile (caso 3, fail-closed)', () => {
    expect(resolveSenderOrigin({ fromMe: true, outboundIsAI: false })).toBe('human_mobile');
  });
  it('from_me=true + usuário do CRM → crm_human', () => {
    expect(resolveSenderOrigin({ fromMe: true, crmHuman: true })).toBe('crm_human');
  });
});

describe('sanitização e chave Redis (seção 6)', () => {
  it('instance_name → [a-z0-9_-]', () => {
    expect(sanitizeInstance('Escritório Principal!')).toBe('escrit_rio_principal_');
  });
  it('chat_id → só dígitos', () => {
    expect(sanitizeChatId('+55 (11) 99999-9999')).toBe('5511999999999');
  });
  it('blockKey monta block:v1:{inst}:{chat}', () => {
    expect(blockKey('Escritorio', '+5511999999999')).toBe('block:v1:escritorio:5511999999999');
  });
});

// ---------------------------------------------------------------------------
describe('activateTakeover', () => {
  it('cria controle e grava Redis com SET EX no TTL (casos 4, 6)', async () => {
    prismaMock.conversationControl.findUnique.mockResolvedValue(null);
    prismaMock.conversationControl.create.mockResolvedValue({ id: 'c1', controlVersion: 1n });
    prismaMock.conversationControlEvent.create.mockResolvedValue({ id: 'e1' });

    const r = await activateTakeover({
      instanceName: 'escritorio-principal', chatId: '5511999999999',
      source: 'human_mobile', messageId: 'wamid.1', ttlSeconds: 3600,
    });

    expect(r).toMatchObject({ mode: 'human', blocked: true, controlVersion: 1 });
    // SET + EX atômico
    const call = redisMock.set.mock.calls[0];
    expect(call[0]).toBe('block:v1:escritorio-principal:5511999999999');
    expect(call[2]).toBe('EX');
    expect(call[3]).toBe(3600);
    // evento de auditoria
    expect(prismaMock.conversationControlEvent.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.conversationControlEvent.create.mock.calls[0][0].data.eventType).toBe('takeover_started');
  });

  it('em controle já humano, incrementa control_version e registra refreshed', async () => {
    prismaMock.conversationControl.findUnique.mockResolvedValue({ id: 'c1', mode: 'human', controlVersion: 4n });
    prismaMock.conversationControl.update.mockResolvedValue({ id: 'c1', controlVersion: 5n });
    prismaMock.conversationControlEvent.create.mockResolvedValue({ id: 'e2' });

    const r = await activateTakeover({ instanceName: 'x', chatId: '551199', source: 'crm_human' });

    expect(prismaMock.conversationControl.update.mock.calls[0][0].data.controlVersion).toEqual({ increment: 1 });
    expect(prismaMock.conversationControlEvent.create.mock.calls[0][0].data.eventType).toBe('takeover_refreshed');
    expect(r.controlVersion).toBe(5);
  });
});

describe('refreshTakeover (caso 5)', () => {
  it('renova o TTL de um bloqueio humano existente (novo SET EX)', async () => {
    prismaMock.conversationControl.findUnique.mockResolvedValue({ id: 'c1', mode: 'human', controlVersion: 2n, takeoverSource: 'human_mobile', takenOverBy: null });
    prismaMock.conversationControl.update.mockResolvedValue({ id: 'c1', controlVersion: 3n });
    prismaMock.conversationControlEvent.create.mockResolvedValue({ id: 'e3' });

    await refreshTakeover({ instanceName: 'x', chatId: '551199', messageId: 'wamid.2' });

    expect(redisMock.set).toHaveBeenCalled();
    expect(redisMock.set.mock.calls[0][2]).toBe('EX');
  });
});

describe('releaseTakeover (caso 7)', () => {
  it('muda para mode ai e DELeta a chave Redis', async () => {
    prismaMock.conversationControl.findUnique.mockResolvedValue({ id: 'c1', mode: 'human', controlVersion: 3n });
    prismaMock.conversationControl.update.mockResolvedValue({ id: 'c1', controlVersion: 4n });
    prismaMock.conversationControlEvent.create.mockResolvedValue({ id: 'e4' });

    const r = await releaseTakeover({ instanceName: 'x', chatId: '551199', actorUserId: 'u1', reason: 'fim' });

    expect(r).toMatchObject({ mode: 'ai', blocked: false, controlVersion: 4 });
    expect(redisMock.del).toHaveBeenCalledWith('block:v1:x:551199');
    expect(prismaMock.conversationControlEvent.create.mock.calls[0][0].data.eventType).toBe('takeover_released');
  });
});

// ---------------------------------------------------------------------------
describe('isBlocked', () => {
  it('cache miss no Redis consulta o PostgreSQL (caso 8)', async () => {
    redisMock.get.mockResolvedValue(null);
    prismaMock.conversationControl.findUnique.mockResolvedValue({ mode: 'ai', controlVersion: 0n });

    const r = await isBlocked('x', '551199');
    expect(prismaMock.conversationControl.findUnique).toHaveBeenCalled();
    expect(r.blocked).toBe(false);
  });

  it('PG bloqueado → reidrata o Redis com TTL restante (caso 9)', async () => {
    redisMock.get.mockResolvedValue(null); // cache miss
    const blockedUntil = new Date(Date.now() + 1800 * 1000);
    prismaMock.conversationControl.findUnique.mockResolvedValue({
      mode: 'human', blockedUntil, controlVersion: 7n, takeoverSource: 'human_mobile', takenOverBy: null, takenOverAt: new Date(),
    });

    const r = await isBlocked('x', '551199');
    expect(r.blocked).toBe(true);
    expect(r.rehydrated).toBe(true);
    const call = redisMock.set.mock.calls[0];
    expect(call[2]).toBe('EX');
    expect(call[3]).toBeGreaterThan(0);
    expect(call[3]).toBeLessThanOrEqual(1800);
  });

  it('bloqueio expirado (blocked_until <= now) → reconcilia para ai (caso 10)', async () => {
    redisMock.get.mockResolvedValue(null);
    const past = new Date(Date.now() - 1000);
    prismaMock.conversationControl.findUnique.mockResolvedValue({ id: 'c1', mode: 'human', blockedUntil: past, controlVersion: 2n });
    prismaMock.conversationControl.update.mockResolvedValue({ id: 'c1', controlVersion: 3n });
    prismaMock.conversationControlEvent.create.mockResolvedValue({ id: 'e5' });

    const r = await isBlocked('x', '551199');
    expect(r.blocked).toBe(false);
    expect(prismaMock.conversationControlEvent.create.mock.calls[0][0].data.eventType).toBe('takeover_expired');
    expect(redisMock.del).toHaveBeenCalled();
  });

  it('Redis indisponível → fallback para PostgreSQL (caso 11)', async () => {
    redisMock.get.mockRejectedValue(new Error('ECONNREFUSED'));
    prismaMock.conversationControl.findUnique.mockResolvedValue({ mode: 'ai', controlVersion: 0n });

    const r = await isBlocked('x', '551199');
    expect(prismaMock.conversationControl.findUnique).toHaveBeenCalled();
    expect(r.blocked).toBe(false);
  });

  it('Redis E PostgreSQL indisponíveis → falha fechada, stop_and_retry (caso 12)', async () => {
    redisMock.get.mockRejectedValue(new Error('redis down'));
    prismaMock.conversationControl.findUnique.mockRejectedValue(new Error('pg down'));

    const r = await isBlocked('x', '551199');
    expect(r.blocked).toBe(true);
    expect(r.source).toBe('error');
    expect(r.flowAction).toBe('stop_and_retry');
  });

  it('bloqueio válido no cache Redis não consulta o PG', async () => {
    redisMock.get.mockResolvedValue(JSON.stringify({
      source: 'human_mobile', blocked_until: new Date(Date.now() + 600 * 1000).toISOString(), control_version: 3,
    }));
    const r = await isBlocked('x', '551199');
    expect(r.blocked).toBe(true);
    expect(prismaMock.conversationControl.findUnique).not.toHaveBeenCalled();
  });
});

describe('Redis desligado (PG-first)', () => {
  it('opera só no PostgreSQL sem tocar no Redis', async () => {
    state.redisEnabled = false;
    prismaMock.conversationControl.findUnique.mockResolvedValue({ mode: 'ai', controlVersion: 0n });
    const r = await isBlocked('x', '551199');
    expect(r.blocked).toBe(false);
    expect(redisMock.get).not.toHaveBeenCalled();
  });
});
