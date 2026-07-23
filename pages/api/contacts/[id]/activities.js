// =============================================================================
// WhatJuris CRM — Atividades de um contato
// pages/api/contacts/[id]/activities.js
//
// Mesma estrutura de deals/[id]/activities.js, trocando dealId por contactId.
// DESVIOS: campo do ator = userId; gate por escopo (own OU all) dentro do
// handler em vez da permissão única da spec.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import {
  withAuth, BadRequest, NotFound, Forbidden,
} from '@/lib/auth/guard';
import { assertCanReadContact } from '@/lib/query/scope';

const HUMAN_TYPES = ['NOTE', 'CALL', 'MEETING', 'TASK', 'EMAIL'];

const createSchema = z.object({
  type: z.enum(HUMAN_TYPES),
  title: z.string().trim().max(200).optional().nullable(),
  content: z.string().trim().min(1).max(5000),
  occurredAt: z.string().datetime().optional(),
});

const activitySelect = {
  id: true, type: true, title: true, content: true,
  occurredAt: true, createdAt: true, actorType: true, actorLabel: true,
  userId: true,
  user: { select: { id: true, name: true, avatarUrl: true } },
};

function canReadActivities(ctx) {
  return ctx.can('activity.read.own') || ctx.can('activity.read.all');
}

async function handler(req, res, ctx) {
  const { id } = req.query;

  if (!canReadActivities(ctx)) throw Forbidden();

  const contact = await prisma.contact.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, ownerId: true },
  });

  if (!contact) throw NotFound('Contato não encontrado.');
  assertCanReadContact(ctx, contact);

  if (req.method === 'GET') {
    const { limit = '30' } = req.query;
    const take = Math.min(parseInt(limit, 10) || 30, 100);

    const activities = await prisma.activity.findMany({
      where: { contactId: id },
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

    const { occurredAt, ...rest } = parsed.data;

    const activity = await prisma.activity.create({
      data: {
        ...rest,
        contactId: id,
        actorType: 'USER',
        userId: ctx.userId,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      },
      select: activitySelect,
    });

    return res.status(201).json({ activity });
  }
}

export default withAuth(handler, {
  methods: ['GET', 'POST'],
});
