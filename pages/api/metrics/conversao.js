// =============================================================================
// WhatJuris CRM — Evolução da taxa de conversão (últimos N meses)
// pages/api/metrics/conversao.js
//
// DESVIOS: gate report.read.own|all; Prisma.sql/Prisma.empty (não prisma.sql).
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { withAuth, Forbidden } from '@/lib/auth/guard';
import { dealWhere } from '@/lib/query/scope';

async function handler(req, res, ctx) {
  if (!ctx.can('report.read.own') && !ctx.can('report.read.all')) throw Forbidden();

  const meses = Math.min(parseInt(req.query.meses, 10) || 6, 12);
  const scopeWhere = dealWhere(ctx);

  const resultado = await prisma.$queryRaw`
    WITH meses AS (
      SELECT
        DATE_TRUNC('month', d.created_at) AS mes,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE d.status = 'WON')::int AS ganhos
      FROM deals d
      WHERE d.deleted_at IS NULL
        ${scopeWhere.ownerId
          ? Prisma.sql`AND d.owner_id = ${scopeWhere.ownerId}::uuid`
          : Prisma.empty
        }
        AND d.created_at >= DATE_TRUNC('month', NOW()) - ${meses - 1}::int * INTERVAL '1 month'
      GROUP BY DATE_TRUNC('month', d.created_at)
    )
    SELECT
      mes,
      total,
      ganhos,
      CASE WHEN total > 0 THEN ROUND(ganhos::numeric / total * 100) ELSE 0 END AS taxa
    FROM meses
    ORDER BY mes ASC
  `;

  const pontos = resultado.map((r) => ({
    // timeZone UTC: DATE_TRUNC devolve o 1º do mês à meia-noite UTC; sem isso,
    // num servidor UTC-3, formataria como o mês anterior.
    mes: new Date(r.mes).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    taxa: Number(r.taxa),
    total: r.total,
    ganhos: r.ganhos,
  }));

  return res.status(200).json({ pontos });
}

export default withAuth(handler, { methods: ['GET'] });
