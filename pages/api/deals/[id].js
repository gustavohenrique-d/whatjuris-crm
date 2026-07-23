// =============================================================================
// WhatJuris CRM — Deal individual: lê, atualiza e exclui
// pages/api/deals/[id].js
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import {
  withAuth, BadRequest, NotFound, Forbidden, writeAudit,
} from '@/lib/auth/guard';
import { assertCanReadDeal, assertCanWriteDeal } from '@/lib/query/scope';

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  legalArea: z.string().trim().max(60).nullable().optional(),
  priority: z.number().int().min(0).max(2).optional(),
  value: z.number().nonnegative().nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  lostReason: z.string().trim().max(500).nullable().optional(),
  customData: z.record(z.unknown()).optional(),
});

const dealSelect = {
  id: true, title: true, status: true, legalArea: true, priority: true,
  value: true, position: true, lostReason: true, customData: true,
  enteredStageAt: true, closedAt: true, createdAt: true, updatedAt: true,
  contact: { select: { id: true, name: true, whatsapp: true, email: true } },
  stage: { select: { id: true, key: true, name: true, color: true, type: true } },
  pipeline: { select: { id: true, key: true, name: true } },
  owner: { select: { id: true, name: true, legalAreas: true, notifyWhatsapp: true } },
};

async function handler(req, res, ctx) {
  const { id } = req.query;

  const deal = await prisma.deal.findFirst({
    where: { id, deletedAt: null },
    select: dealSelect,
  });

  if (!deal) throw NotFound('Negócio não encontrado.');

  assertCanReadDeal(ctx, deal);

  if (req.method === 'GET') {
    return res.status(200).json({ deal });
  }

  if (req.method === 'PATCH') {
    assertCanWriteDeal(ctx, deal);

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

    const before = { ...deal };
    const updated = await prisma.deal.update({
      where: { id },
      data: parsed.data,
      select: dealSelect,
    });

    await writeAudit({
      actorId: ctx.userId, action: 'deal.updated', resource: 'deal',
      resourceId: id, before, after: parsed.data, ctx,
    });

    return res.status(200).json({ deal: updated });
  }

  if (req.method === 'DELETE') {
    assertCanWriteDeal(ctx, deal);
    if (!ctx.can('deal.delete')) throw Forbidden();

    await prisma.deal.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await writeAudit({
      actorId: ctx.userId, action: 'deal.deleted', resource: 'deal',
      resourceId: id, before: deal, ctx,
    });

    return res.status(200).json({ message: 'Negócio removido.' });
  }
}

export default withAuth(handler, {
  methods: ['GET', 'PATCH', 'DELETE'],
  permission: 'deal.read.own',
});
