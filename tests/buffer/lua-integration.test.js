// Integração REAL com Redis (roda os scripts Lua de fato). Usa DB 15 isolado na
// porta 6380 (Redis dedicado do WhatJuris). Se o Redis não responder, os testes
// fazem SKIP em vez de falhar.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Redis from 'ioredis';
import { evalScript } from '@/lib/redis/eval-script';
import { bufferKeys } from '@/lib/buffer/keys';

let redis = null;
let hasRedis = false;

beforeAll(async () => {
  const client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6380,
    db: 15, // DB de teste, isolado do dev (db 0)
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    commandTimeout: 1500,
    retryStrategy: () => null,
  });
  try {
    await client.connect();
    await client.flushdb();
    redis = client;
    hasRedis = true;
  } catch {
    hasRedis = false;
    try { client.disconnect(); } catch { /* noop */ }
    console.warn('[lua-integration] Redis indisponível em 6380/db15 — testes pulados.');
  }
});

afterAll(async () => {
  if (redis) { try { await redis.flushdb(); await redis.quit(); } catch { /* noop */ } }
});

beforeEach(async () => {
  if (hasRedis) await redis.flushdb();
});

const payload = (id, message, receivedAt = '2026-07-29T14:30:00.000Z') =>
  JSON.stringify({ message_id: id, message, received_at: receivedAt, buffered_at: new Date().toISOString() });

async function append(inst, chat, id, message, max = 50) {
  const k = bufferKeys(inst, chat);
  return evalScript(redis, 'buffer_append', 3, [k.messages, k.latest, k.seen], [payload(id, message), id, 300, 600, max]);
}
async function claim(inst, chat, id) {
  const k = bufferKeys(inst, chat, id);
  return evalScript(redis, 'buffer_claim_and_drain', 3, [k.messages, k.latest, k.processing], [id, 300]);
}

describe('buffer_append.lua (Redis real)', () => {
  it('append de dois ids distintos → length cresce', async () => {
    if (!hasRedis) return;
    const r1 = await append('inst', '5511', 'w1', 'primeira');
    const r2 = await append('inst', '5511', 'w2', 'segunda');
    expect(r1.appended).toBe(true);
    expect(r2.length).toBe(2);
  });

  it('mesmo message_id duas vezes → duplicate=true, não cresce (caso 3)', async () => {
    if (!hasRedis) return;
    await append('inst', '5511', 'w1', 'oi');
    const dup = await append('inst', '5511', 'w1', 'oi');
    expect(dup.duplicate).toBe(true);
    expect(dup.appended).toBe(false);
    expect(dup.length).toBe(1);
  });

  it('force_flush quando length >= max (caso 19)', async () => {
    if (!hasRedis) return;
    await append('inst', '5511', 'w1', 'a', 2);
    const r2 = await append('inst', '5511', 'w2', 'b', 2);
    expect(r2.force_flush).toBe(true);
  });
});

describe('buffer_claim_and_drain.lua (Redis real)', () => {
  it('claim pelo último id → claimed, drena e apaga as chaves', async () => {
    if (!hasRedis) return;
    await append('inst', '5511', 'w1', 'a');
    await append('inst', '5511', 'w2', 'b');
    const c = await claim('inst', '5511', 'w2');
    expect(c.claimed).toBe(true);
    expect(c.items).toHaveLength(2);
    const k = bufferKeys('inst', '5511');
    expect(await redis.exists(k.messages)).toBe(0);
    expect(await redis.exists(k.latest)).toBe(0);
  });

  it('claim com id que não é o latest → NOT_LATEST_EXECUTION (casos 5, 6)', async () => {
    if (!hasRedis) return;
    await append('inst', '5511', 'w1', 'a');
    await append('inst', '5511', 'w2', 'b'); // latest = w2
    const c = await claim('inst', '5511', 'w1');
    expect(c.claimed).toBe(false);
    expect(c.reason).toBe('NOT_LATEST_EXECUTION');
  });

  it('sem buffer → BUFFER_NOT_FOUND (caso 8)', async () => {
    if (!hasRedis) return;
    const c = await claim('inst', '5511', 'w1');
    expect(c.claimed).toBe(false);
    expect(c.reason).toBe('BUFFER_NOT_FOUND');
  });

  it('claim repetido (chave processing existe) → recovery (caso 7)', async () => {
    if (!hasRedis) return;
    await append('inst', '5511', 'w1', 'a');
    const first = await claim('inst', '5511', 'w1');
    const second = await claim('inst', '5511', 'w1');
    expect(first.claimed).toBe(true);
    expect(second.recovered).toBe(true);
    expect(second.items).toHaveLength(first.items.length);
  });

  it('chaves de conversas diferentes não interferem (casos 13, 14)', async () => {
    if (!hasRedis) return;
    await append('inst', '5511', 'w1', 'a');
    await append('inst', '5522', 'x1', 'b');
    const c = await claim('inst', '5511', 'w1');
    expect(c.items).toHaveLength(1); // só a mensagem do 5511
  });
});
