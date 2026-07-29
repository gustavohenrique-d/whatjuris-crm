// =============================================================================
// WhatJuris CRM — Cliente Redis singleton (OPCIONAL)
// lib/redis/client.js
//
// Decisão do projeto (Módulo 2): Redis é OPCIONAL. O PostgreSQL
// (conversation_controls) é a fonte de verdade; o Redis é só cache/aceleração.
// Se REDIS_URL/REDIS_HOST não estiverem configurados, getRedis() devolve null e
// todo o serviço de controle opera direto no PostgreSQL — sem erro, sem cache.
// Mesmo espírito do send.js/google.js ({ skipped } quando sem credencial).
//
// Para ligar o cache: suba um Redis (ex.: docker run -p 6379:6379 redis:7-alpine)
// e defina REDIS_HOST=localhost (ou REDIS_URL=...) no .env, depois reinicie.
// =============================================================================

import Redis from 'ioredis';

let client = null;
let built = false;

// Redis só é considerado ligado quando explicitamente configurado. Não usamos
// default 'localhost' aqui de propósito: um default silencioso faria o cliente
// tentar conectar num Redis inexistente e poluir os logs com erros de conexão.
export function isRedisEnabled() {
  return Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
}

export function getRedis() {
  if (!isRedisEnabled()) return null;
  if (built) return client;
  built = true;

  const common = {
    lazyConnect: true, // conecta no primeiro comando (dispara o connect)
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    // Limita CADA comando: com o Redis fora, o comando rejeita em ~1.5s e o
    // serviço de controle cai para o PostgreSQL (em vez de pendurar). NÃO usar
    // enableOfflineQueue:false com lazyConnect — rejeita o 1º comando antes da
    // conexão abrir e o Redis nunca seria usado.
    commandTimeout: 1500,
    // Para de reconectar após algumas tentativas (evita spam de erro no log
    // quando o Redis está fora); volta a conectar no próximo getRedis()/comando.
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
  };

  const url = process.env.REDIS_URL;
  client = url
    ? new Redis(url, common)
    : new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0', 10),
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        ...common,
      });

  client.on('error', (err) => console.error('[redis] erro de conexão:', err.message));
  return client;
}

export default getRedis;
