// =============================================================================
// WhatJuris CRM — Auth combinada dos endpoints de conversa (Módulo 2)
// lib/conversations/http-auth.js
//
// As rotas /api/conversations/... são chamadas por DOIS atores:
//   - o n8n (server-to-server) via header x-webhook-secret = WEBHOOK_SECRET
//   - o usuário do CRM (UI) via sessão NextAuth + permissão
//
// Este helper resolve qual é o caso. Fail-closed: sem secret válido e sem
// sessão → 401; sessão sem a permissão → 403.
// =============================================================================

import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';

// Retorna:
//   { internal: true, userId: null }                     ← chamada do n8n
//   { internal: false, userId, permissions }             ← usuário autorizado
//   { error: 401 } | { error: 403 }                      ← negado
export async function resolveConversationActor(req, res, { permission = null } = {}) {
  const secret = req.headers['x-webhook-secret'];
  if (secret && process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET) {
    return { internal: true, userId: null };
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return { error: 401 };

  const permissions = new Set(session.permissions ?? []);
  if (permission && !permissions.has(permission)) return { error: 403 };

  return { internal: false, userId: session.user.id, permissions };
}
