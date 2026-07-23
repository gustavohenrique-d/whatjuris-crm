// =============================================================================
// WhatJuris CRM — Agenda: evento individual
// pages/api/agenda/events/[id].js
//
// PATCH → atualiza (autor ou activity.delete); DELETE → remove.
// Sincroniza com Google se configurado. DESVIO: campo do ator = userId.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAuth, BadRequest, NotFound, Forbidden } from '@/lib/auth/guard';
import { syncToGoogle, deleteFromGoogle } from '@/lib/calendar/google';

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().max(1000).nullable().optional(),
  dueAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

async function handler(req, res, ctx) {
  const { id } = req.query;

  const event = await prisma.activity.findUnique({
    where: { id },
    select: {
      id: true, type: true, title: true, content: true,
      dueAt: true, completedAt: true, metadata: true,
      userId: true,
    },
  });

  if (!event) throw NotFound('Evento não encontrado.');

  const isAuthor = event.userId === ctx.userId;
  if (!isAuthor && !ctx.can('activity.delete')) throw Forbidden();

  const org = await prisma.organization.findFirst({ select: { settings: true } });
  const refreshToken = org?.settings?.googleRefreshToken ?? null;

  if (req.method === 'PATCH') {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

    const data = {
      ...parsed.data,
      ...(parsed.data.dueAt ? { dueAt: new Date(parsed.data.dueAt) } : {}),
      ...(parsed.data.completedAt !== undefined
        ? { completedAt: parsed.data.completedAt ? new Date(parsed.data.completedAt) : null }
        : {}),
    };

    const updated = await prisma.activity.update({
      where: { id },
      data,
      select: { id: true, type: true, title: true, dueAt: true, completedAt: true, metadata: true },
    });

    // Sincronizar atualização com Google
    if (refreshToken && updated.dueAt) {
      await syncToGoogle({ ...updated, content: event.content }, refreshToken);
    }

    return res.status(200).json({ event: updated });
  }

  if (req.method === 'DELETE') {
    const googleEventId = event.metadata?.googleEventId;
    if (googleEventId && refreshToken) {
      await deleteFromGoogle(googleEventId, refreshToken);
    }

    await prisma.activity.delete({ where: { id } });

    return res.status(200).json({ message: 'Evento removido.' });
  }
}

export default withAuth(handler, { methods: ['PATCH', 'DELETE'] });
