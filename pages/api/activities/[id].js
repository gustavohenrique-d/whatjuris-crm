// =============================================================================
// WhatJuris CRM — Atividade individual
// pages/api/activities/[id].js
//
// PATCH → editar (só NOTE e só pelo autor ou quem tem activity.delete)
// DELETE → deletar (só NOTE e só pelo autor ou quem tem activity.delete)
//
// DESVIO CONFIRMADO (5.0): campo do ator = `userId` (não `actorId`).
// Gate: apenas autenticação no wrapper; autorização por autor/permissão dentro.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import {
  withAuth, BadRequest, NotFound, Forbidden, writeAudit,
} from '@/lib/auth/guard';

const updateSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  content: z.string().trim().min(1).max(5000).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

async function handler(req, res, ctx) {
  const { id } = req.query;

  const activity = await prisma.activity.findUnique({
    where: { id },
    select: {
      id: true, type: true, content: true, title: true, dueAt: true,
      completedAt: true, occurredAt: true,
      userId: true,
    },
  });

  if (!activity) throw NotFound('Atividade não encontrada.');

  // Apenas NOTEs são mutáveis
  if (activity.type !== 'NOTE') {
    throw Forbidden('Somente notas podem ser editadas ou removidas.');
  }

  const isAuthor = activity.userId === ctx.userId;

  if (req.method === 'PATCH') {
    if (!isAuthor && !ctx.can('activity.delete')) throw Forbidden();

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

    const updated = await prisma.activity.update({
      where: { id },
      data: {
        ...parsed.data,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined,
        completedAt: parsed.data.completedAt
          ? new Date(parsed.data.completedAt)
          : undefined,
      },
      select: {
        id: true, type: true, content: true, title: true,
        dueAt: true, completedAt: true,
      },
    });

    return res.status(200).json({ activity: updated });
  }

  if (req.method === 'DELETE') {
    if (!isAuthor && !ctx.can('activity.delete')) throw Forbidden();

    await writeAudit({
      actorId: ctx.userId, action: 'activity.deleted', resource: 'activity',
      resourceId: id, before: activity, ctx,
    });

    await prisma.activity.delete({ where: { id } });

    return res.status(200).json({ message: 'Nota removida.' });
  }
}

export default withAuth(handler, {
  methods: ['PATCH', 'DELETE'],
});
