// =============================================================================
// WhatJuris CRM — Lock de envio por conversa (Módulo 5)
// lib/whatsapp/send-lock.js
//
// Impede que duas respostas sejam enviadas ao mesmo chat simultaneamente.
// SET NX EX atômico; só o dono (lockToken) renova/libera (Lua compare-and-*).
// Redis OPCIONAL: sem Redis → degrada graciosamente (acquired:true, sem lock).
// =============================================================================

import crypto from 'crypto';
import { getRedis } from '@/lib/redis/client';
import { sanitizeInstance, sanitizeChatId } from '@/lib/buffer/keys';

function lockKey(instanceName, chatId) {
  return `send-lock:v1:${sanitizeInstance(instanceName)}:${sanitizeChatId(chatId)}`;
}

const RENEW_LUA = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('EXPIRE', KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE_LUA = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

export async function acquireSendLock(instanceName, chatId, ttlSeconds = 120) {
  const redis = getRedis();
  if (!redis) {
    console.warn('[send-lock] Redis indisponível — seguindo SEM lock (degradação graciosa).');
    return { acquired: true, lockToken: null, degraded: true };
  }
  const token = crypto.randomUUID();
  try {
    const ok = await redis.set(lockKey(instanceName, chatId), token, 'NX', 'EX', ttlSeconds);
    return ok === 'OK' ? { acquired: true, lockToken: token } : { acquired: false, lockToken: null };
  } catch (err) {
    console.warn('[send-lock] erro ao adquirir lock, seguindo sem lock:', err.message);
    return { acquired: true, lockToken: null, degraded: true };
  }
}

export async function renewSendLock(instanceName, chatId, lockToken, ttlSeconds = 120) {
  const redis = getRedis();
  if (!redis || !lockToken) return true;
  try {
    const r = await redis.eval(RENEW_LUA, 1, lockKey(instanceName, chatId), lockToken, String(ttlSeconds));
    return Number(r) === 1;
  } catch (err) {
    console.warn('[send-lock] erro ao renovar lock:', err.message);
    return false;
  }
}

export async function releaseSendLock(instanceName, chatId, lockToken) {
  const redis = getRedis();
  if (!redis || !lockToken) return true;
  try {
    const r = await redis.eval(RELEASE_LUA, 1, lockKey(instanceName, chatId), lockToken);
    return Number(r) === 1;
  } catch (err) {
    console.warn('[send-lock] erro ao liberar lock:', err.message);
    return false;
  }
}

export { lockKey };
