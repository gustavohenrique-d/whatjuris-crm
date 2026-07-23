// =============================================================================
// WhatJuris CRM — Filtros de escopo por permissão
// lib/query/scope.js
//
// Traduz o resultado de ctx.scopeFor() em cláusulas WHERE do Prisma.
//
// Uso no handler:
//
//   import { dealWhere, contactWhere } from '@/lib/query/scope';
//
//   const where = dealWhere(ctx);          // lança Forbidden se sem permissão
//   const deals = await prisma.deal.findMany({ where });
//
// O handler não sabe se o filtro é por ownerId ou não — só declara o recurso.
// =============================================================================

import { Forbidden } from '@/lib/auth/guard';

// -----------------------------------------------------------------------------
// Deals
// -----------------------------------------------------------------------------

export function dealWhere(ctx, extra = {}) {
  const scope = ctx.scopeFor('deal', 'read');

  if (!scope) throw Forbidden();

  const base = {
    deletedAt: null,
    ...extra,
  };

  if (scope === 'own') {
    base.ownerId = ctx.userId;
  }

  return base;
}

// Para operações de escrita (update, delete): garante que o usuário
// só pode modificar o que pode ler.
export function dealWriteWhere(ctx, id, extra = {}) {
  const scope = ctx.scopeFor('deal', 'update');

  if (!scope) throw Forbidden();

  const base = {
    id,
    deletedAt: null,
    ...extra,
  };

  if (scope === 'own') {
    base.ownerId = ctx.userId;
  }

  return base;
}

// -----------------------------------------------------------------------------
// Contacts
// -----------------------------------------------------------------------------

export function contactWhere(ctx, extra = {}) {
  const scope = ctx.scopeFor('contact', 'read');

  if (!scope) throw Forbidden();

  const base = {
    deletedAt: null,
    ...extra,
  };

  if (scope === 'own') {
    base.ownerId = ctx.userId;
  }

  return base;
}

export function contactWriteWhere(ctx, id, extra = {}) {
  const scope = ctx.scopeFor('contact', 'update');

  if (!scope) throw Forbidden();

  const base = {
    id,
    deletedAt: null,
    ...extra,
  };

  if (scope === 'own') {
    base.ownerId = ctx.userId;
  }

  return base;
}

// -----------------------------------------------------------------------------
// Activities — sempre associadas a deal ou contact que o usuário pode ler.
// Não têm ownerId próprio; o escopo é herdado do recurso pai.
// -----------------------------------------------------------------------------

export function activityWhere(ctx, extra = {}) {
  const scope = ctx.scopeFor('activity', 'read');
  if (!scope) throw Forbidden();

  // Se o usuário só lê as próprias atividades, filtramos pelo actorId
  // (userId gravado na atividade). Se lê todas, sem filtro adicional.
  const base = { ...extra };

  if (scope === 'own') {
    base.userId = ctx.userId;
  }

  return base;
}

// -----------------------------------------------------------------------------
// Helpers genéricos para verificação pontual de acesso
// -----------------------------------------------------------------------------

// Verifica se o usuário pode acessar um deal específico já carregado.
// Útil quando o deal já está em memória e não vale fazer uma segunda query.
export function assertCanReadDeal(ctx, deal) {
  const scope = ctx.scopeFor('deal', 'read');
  if (!scope) throw Forbidden();
  if (scope === 'own' && deal.ownerId !== ctx.userId) throw Forbidden();
}

export function assertCanWriteDeal(ctx, deal) {
  const scope = ctx.scopeFor('deal', 'update');
  if (!scope) throw Forbidden();
  if (scope === 'own' && deal.ownerId !== ctx.userId) throw Forbidden();
}

export function assertCanReadContact(ctx, contact) {
  const scope = ctx.scopeFor('contact', 'read');
  if (!scope) throw Forbidden();
  if (scope === 'own' && contact.ownerId !== ctx.userId) throw Forbidden();
}

export function assertCanWriteContact(ctx, contact) {
  const scope = ctx.scopeFor('contact', 'update');
  if (!scope) throw Forbidden();
  if (scope === 'own' && contact.ownerId !== ctx.userId) throw Forbidden();
}
