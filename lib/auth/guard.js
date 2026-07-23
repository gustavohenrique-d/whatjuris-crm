// =============================================================================
// WhatJuris CRM — Guard de API
// lib/auth/guard.js
//
// Todo handler passa por aqui. Nenhuma rota de negócio precisa lembrar de
// verificar sessão, tratar erro ou logar auditoria.
// =============================================================================

import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/db/prisma';

export class ApiError extends Error {
  constructor(statusCode, message, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const Unauthorized = (m = 'Não autenticado.') => new ApiError(401, m, 'UNAUTHORIZED');
export const Forbidden = (m = 'Sem permissão para esta ação.') => new ApiError(403, m, 'FORBIDDEN');
export const NotFound = (m = 'Recurso não encontrado.') => new ApiError(404, m, 'NOT_FOUND');
export const BadRequest = (m = 'Requisição inválida.') => new ApiError(400, m, 'BAD_REQUEST');
export const Conflict = (m = 'Conflito de estado.') => new ApiError(409, m, 'CONFLICT');

// -----------------------------------------------------------------------------
// Contexto do ator — montado uma vez por requisição
// -----------------------------------------------------------------------------

function buildContext(session, req) {
  const permissions = new Set(session.permissions ?? []);

  return {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    legalAreas: session.user.legalAreas ?? [],
    permissions,

    can(key) {
      return permissions.has(key);
    },

    // Resolve o escopo de um recurso: 'all', 'own' ou null.
    // O Módulo 3 usa isso para montar o filtro da query sem espalhar
    // `if` pelos handlers.
    scopeFor(resource, action) {
      if (permissions.has(`${resource}.${action}.all`)) return 'all';
      if (permissions.has(`${resource}.${action}.own`)) return 'own';
      if (permissions.has(`${resource}.${action}`)) return 'all';
      return null;
    },

    ip:
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

// -----------------------------------------------------------------------------
// withAuth
//
//   export default withAuth(handler, { permission: 'deal.create' });
// -----------------------------------------------------------------------------

export function withAuth(handler, options = {}) {
  const { permission = null, methods = null, audit = null } = options;

  return async function wrapped(req, res) {
    // Respostas de API nunca são cacheadas: sem isso o Next.js gera ETag e o
    // navegador recebe 304 (corpo vazio) em requisições XHR, entregando dados
    // vazios para a aplicação.
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    try {
      if (methods && !methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        throw new ApiError(405, `Método ${req.method} não permitido.`);
      }

      const session = await getServerSession(req, res, authOptions);
      if (!session?.user?.id) throw Unauthorized();

      const ctx = buildContext(session, req);

      if (permission && !ctx.can(permission)) {
        // Acesso negado vira registro: em sistema jurídico isso importa
        // tanto quanto o acesso concedido.
        await writeAudit({
          actorId: ctx.userId,
          action: 'access.denied',
          resource: permission.split('.')[0],
          after: { permission, path: req.url },
          ctx,
        }).catch(() => {});
        throw Forbidden();
      }

      // Informa os triggers do banco quem está agindo, para o histórico de
      // movimentação de card sair preenchido.
      await prisma.$executeRaw`SELECT set_config('app.actor_id', ${ctx.userId}, false)`;

      const result = await handler(req, res, ctx);

      if (audit && !res.writableEnded) {
        await writeAudit({
          actorId: ctx.userId,
          action: audit,
          resource: audit.split('.')[0],
          ctx,
        }).catch(() => {});
      }

      return result;
    } catch (err) {
      return handleError(err, req, res);
    }
  };
}

// Rota pública com tratamento de erro (login, aceitar convite, reset)
export function withPublic(handler, options = {}) {
  const { methods = null } = options;

  return async function wrapped(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    try {
      if (methods && !methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        throw new ApiError(405, `Método ${req.method} não permitido.`);
      }
      return await handler(req, res);
    } catch (err) {
      return handleError(err, req, res);
    }
  };
}

// -----------------------------------------------------------------------------
// Erro nunca vaza stack trace. Mensagem do Prisma expõe nome de tabela.
// -----------------------------------------------------------------------------

function handleError(err, req, res) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }

  if (err?.code === 'P2002') {
    return res.status(409).json({
      error: 'Já existe um registro com esses dados.',
      code: 'DUPLICATE',
    });
  }

  if (err?.code === 'P2003' || err?.code === 'P2025') {
    return res.status(400).json({
      error: 'Referência inválida.',
      code: 'BAD_REFERENCE',
    });
  }

  console.error(`[api] ${req.method} ${req.url}`, err);

  return res.status(500).json({ error: 'Erro interno. Tente novamente.', code: 'INTERNAL' });
}

// -----------------------------------------------------------------------------
// Auditoria com redação automática
// -----------------------------------------------------------------------------

const REDACTED_FIELDS = new Set([
  'passwordHash', 'password', 'tokenHash', 'mfaSecret', 'token',
]);

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACTED_FIELDS.has(k)) out[k] = '[REDIGIDO]';
    else if (v && typeof v === 'object') out[k] = redact(v);
    else out[k] = v;
  }
  return out;
}

export async function writeAudit({
  actorId, action, resource, resourceId = null,
  before = null, after = null, ctx = null,
}) {
  return prisma.auditLog.create({
    data: {
      actorId,
      action,
      resource,
      resourceId,
      before: before ? redact(before) : null,
      after: after ? redact(after) : null,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    },
  });
}
