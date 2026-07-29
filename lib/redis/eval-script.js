// =============================================================================
// WhatJuris CRM — Execução de scripts Lua no Redis (Módulo 3)
// lib/redis/eval-script.js
//
// O nó Redis do n8n não suporta EVAL; então a lógica atômica do buffer roda em
// scripts Lua (redis/*.lua) executados pelo backend via redis.eval e expostos
// por rotas internas. Os scripts são cacheados em memória.
// =============================================================================

import { readFileSync } from 'fs';
import path from 'path';

const scriptCache = new Map();

export function loadScript(name) {
  if (!scriptCache.has(name)) {
    const filePath = path.join(process.cwd(), 'redis', `${name}.lua`);
    scriptCache.set(name, readFileSync(filePath, 'utf8'));
  }
  return scriptCache.get(name);
}

// Executa o script e devolve o objeto já parseado (os scripts retornam JSON).
export async function evalScript(redis, scriptName, numkeys, keys, args) {
  const script = loadScript(scriptName);
  const result = await redis.eval(script, numkeys, ...keys, ...args);
  if (typeof result === 'string') {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }
  return result;
}
