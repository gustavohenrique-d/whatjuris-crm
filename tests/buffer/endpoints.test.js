import { describe, it, expect, vi, beforeEach } from 'vitest';

const { redisMock, prismaMock, state } = vi.hoisted(() => ({
  redisMock: { eval: vi.fn(), get: vi.fn(), del: vi.fn() },
  prismaMock: { messageBatch: { findUnique: vi.fn(), create: vi.fn() } },
  state: { redisNull: false },
}));

vi.mock('@/lib/redis/client', () => ({
  getRedis: () => (state.redisNull ? null : redisMock),
  isRedisEnabled: () => !state.redisNull,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));

import appendHandler from '@/pages/api/internal/buffer/append';
import claimHandler from '@/pages/api/internal/buffer/claim';
import ackHandler from '@/pages/api/internal/buffer/ack';
import latestHandler from '@/pages/api/internal/buffer/latest';
import checkpointHandler from '@/pages/api/internal/buffer/checkpoint';

const SECRET = 'segredo-teste';
function req({ method = 'POST', headers = {}, body = {}, query = {} } = {}) {
  return { method, headers: { 'x-webhook-secret': SECRET, ...headers }, body, query };
}
function res() {
  const r = { statusCode: 200, body: null, setHeader: () => {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.redisNull = false;
  process.env.WEBHOOK_SECRET = SECRET;
});

describe('POST /append', () => {
  it('sem secret → 401', async () => {
    const r = res();
    await appendHandler(req({ headers: { 'x-webhook-secret': 'errado' }, body: {} }), r);
    expect(r.statusCode).toBe(401);
  });

  it('body inválido → 400', async () => {
    const r = res();
    await appendHandler(req({ body: { instance_name: 'x' } }), r);
    expect(r.statusCode).toBe(400);
  });

  it('Redis indisponível → 503 (caso 9: workflow não libera IA)', async () => {
    state.redisNull = true;
    const r = res();
    await appendHandler(req({ body: { instance_name: 'x', chat_id: '5511', message_id: 'w1', message: 'oi' } }), r);
    expect(r.statusCode).toBe(503);
  });

  it('append normal → mapeia resultado do Lua', async () => {
    redisMock.eval.mockResolvedValue(JSON.stringify({ appended: true, duplicate: false, length: 1, force_flush: false }));
    const r = res();
    await appendHandler(req({ body: { instance_name: 'x', chat_id: '5511', message_id: 'w1', message: 'oi' } }), r);
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ appended: true, duplicate: false, length: 1, force_flush: false });
  });

  it('mensagem duplicada → duplicate=true (caso 3)', async () => {
    redisMock.eval.mockResolvedValue(JSON.stringify({ appended: false, duplicate: true, length: 2, force_flush: false }));
    const r = res();
    await appendHandler(req({ body: { instance_name: 'x', chat_id: '5511', message_id: 'w1', message: 'oi' } }), r);
    expect(r.body.duplicate).toBe(true);
  });
});

describe('POST /claim', () => {
  it('normaliza items {} (lista vazia do Lua) para []', async () => {
    redisMock.eval.mockResolvedValue(JSON.stringify({ claimed: false, recovered: false, reason: 'BUFFER_NOT_FOUND', items: {} }));
    const r = res();
    await claimHandler(req({ body: { instance_name: 'x', chat_id: '5511', message_id: 'w1' } }), r);
    expect(Array.isArray(r.body.items)).toBe(true);
    expect(r.body.claimed).toBe(false);
    expect(r.body.reason).toBe('BUFFER_NOT_FOUND');
  });

  it('claim confirmado devolve items', async () => {
    redisMock.eval.mockResolvedValue(JSON.stringify({ claimed: true, recovered: false, owner_message_id: 'w2', items: ['{"message_id":"w1"}', '{"message_id":"w2"}'] }));
    const r = res();
    await claimHandler(req({ body: { instance_name: 'x', chat_id: '5511', message_id: 'w2' } }), r);
    expect(r.body.claimed).toBe(true);
    expect(r.body.items).toHaveLength(2);
  });
});

describe('POST /ack e GET /latest', () => {
  it('ack deleta a chave processing', async () => {
    redisMock.del.mockResolvedValue(1);
    const r = res();
    await ackHandler(req({ body: { instance_name: 'x', chat_id: '5511', message_id: 'w1' } }), r);
    expect(r.body.deleted).toBe(true);
  });

  it('latest devolve o message_id atual', async () => {
    redisMock.get.mockResolvedValue('w9');
    const r = res();
    await latestHandler(req({ method: 'GET', query: { instance_name: 'x', chat_id: '5511' } }), r);
    expect(r.body).toEqual({ latest_message_id: 'w9' });
  });

  it('latest sem buffer → null', async () => {
    redisMock.get.mockResolvedValue(null);
    const r = res();
    await latestHandler(req({ method: 'GET', query: { instance_name: 'x', chat_id: '5511' } }), r);
    expect(r.body).toEqual({ latest_message_id: null });
  });
});

describe('POST /checkpoint (idempotente)', () => {
  const body = { instance_name: 'x', chat_id: '5511', owner_message_id: 'w3', message_ids: ['w1', 'w2', 'w3'], consolidated_message: 'a\n\nb', message_count: 3 };

  it('novo lote → created=true', async () => {
    prismaMock.messageBatch.findUnique.mockResolvedValue(null);
    prismaMock.messageBatch.create.mockResolvedValue({ id: 'batch-1' });
    const r = res();
    await checkpointHandler(req({ body }), r);
    expect(r.body).toEqual({ id: 'batch-1', created: true });
  });

  it('lote já existe (mesmo owner_message_id) → created=false', async () => {
    prismaMock.messageBatch.findUnique.mockResolvedValue({ id: 'batch-1' });
    const r = res();
    await checkpointHandler(req({ body }), r);
    expect(r.body).toEqual({ id: 'batch-1', created: false });
    expect(prismaMock.messageBatch.create).not.toHaveBeenCalled();
  });
});
