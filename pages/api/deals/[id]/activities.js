// =============================================================================
// WhatJuris CRM — Atividades de um deal
// pages/api/deals/[id]/activities.js
//
// GET  → lista atividades em ordem cronológica (occurredAt DESC)
// POST → registra nova atividade (tipos humanos: NOTE, CALL, MEETING, TASK, EMAIL)
//
// DESVIO CONFIRMADO (5.0): o campo do ator é `userId` (não `actorId`).
//
// DESVIO DE GATE (segurança/correção): a spec gateava a rota com a permissão
// única `activity.read.own`, o que barraria o assistente (tem activity.read.all
// mas não .own). Aqui a rota exige autenticação e verifica escopo dentro:
// ler exige activity.read.own OU activity.read.all; criar exige activity.create.
// A autorização por deal é resolvida por assertCanReadDeal (herda o escopo do
// negócio).
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import {
  withAuth, BadRequest, NotFound, Forbidden,
} from '@/lib/auth/guard';
import { assertCanReadDeal } from '@/lib/query/scope';

// Tipos que um usuário humano pode criar manualmente
const HUMAN_TYPES = ['NOTE', 'CALL', 'MEETING', 'TASK', 'EMAIL'];

const createSchema = z.object({
  type: z.enum(HUMAN_TYPES, {
    errorMap: () => ({ message: `Tipo deve ser um de: ${HUMAN_TYPES.join(', ')}.` }),
  }),
  title: z.string().trim().min(1).max(200).optional().nullable(),
  content: z.string().trim().min(1, 'Informe o conteúdo.').max(5000),
  occurredAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const activitySelect = {
  id: true,
  type: true,
  title: true,
  content: true,
  occurredAt: true,
  dueAt: true,
  completedAt: true,
  createdAt: true,
  actorType: true,
  actorLabel: true,
  metadata: true,
  userId: true,
  user: {
    select: { id: true, name: true, avatarUrl: true },
  },
};

function canReadActivities(ctx) {
  return ctx.can('activity.read.own') || ctx.can('activity.read.all');
}

async function handler(req, res, ctx) {
  const { id } = req.query;

  if (!canReadActivities(ctx)) throw Forbidden();

  // Verificar que o deal existe e o usuário pode lê-lo
  const deal = await prisma.deal.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, ownerId: true },
  });

  if (!deal) throw NotFound('Negócio não encontrado.');
  assertCanReadDeal(ctx, deal);

  if (req.method === 'GET') {
    const { limit = '50', before } = req.query;
    const take = Math.min(parseInt(limit, 10) || 50, 100);

    const where = {
      dealId: id,
      ...(before ? { occurredAt: { lt: new Date(before) } } : {}),
    };

    const activities = await prisma.activity.findMany({
      where,
      select: activitySelect,
      orderBy: { occurredAt: 'desc' },
      take,
    });

    return res.status(200).json({ activities });
  }

  if (req.method === 'POST') {
    if (!ctx.can('activity.create')) throw Forbidden();

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

    const { occurredAt, dueAt, ...rest } = parsed.data;

    const activity = await prisma.activity.create({
      data: {
        ...rest,
        dealId: id,
        actorType: 'USER',
        userId: ctx.userId,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        dueAt: dueAt ? new Date(dueAt) : null,
      },
      select: activitySelect,
    });

    return res.status(201).json({ activity });
  }
}

export default withAuth(handler, {
  methods: ['GET', 'POST'],
});
