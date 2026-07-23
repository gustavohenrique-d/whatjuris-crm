// =============================================================================
// WhatJuris CRM — Distribuição de leads por área jurídica (donut)
// pages/api/metrics/leads-por-area.js
//
// DESVIO: gate report.read.own|all (não 'report.read').
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { withAuth, Forbidden } from '@/lib/auth/guard';
import { dealWhere } from '@/lib/query/scope';

async function handler(req, res, ctx) {
  if (!ctx.can('report.read.own') && !ctx.can('report.read.all')) throw Forbidden();

  const { from, to } = req.query;
  const scopeWhere = dealWhere(ctx);

  const dateFilter = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) dateFilter.lte = new Date(to);

  const resultado = await prisma.deal.groupBy({
    by: ['legalArea'],
    where: {
      ...scopeWhere,
      legalArea: { not: null },
      ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const total = resultado.reduce((s, r) => s + r._count.id, 0);

  const areas = resultado.map((r) => ({
    area: r.legalArea,
    total: r._count.id,
    percentual: total > 0 ? Math.round((r._count.id / total) * 100) : 0,
  }));

  return res.status(200).json({ areas, total });
}

export default withAuth(handler, { methods: ['GET'] });
