// =============================================================================
// WhatJuris CRM — Tempo médio que os deals ficam em cada estágio
// pages/api/metrics/tempo-por-estagio.js
//
// Usa deal_stage_history.duration_seconds gravado pelo trigger.
// DESVIOS: gate report.read.own|all; Prisma.sql/Prisma.empty (não prisma.sql).
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { withAuth, Forbidden } from '@/lib/auth/guard';

async function handler(req, res, ctx) {
  if (!ctx.can('report.read.own') && !ctx.can('report.read.all')) throw Forbidden();

  const { from, to } = req.query;

  const dateFilter = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) dateFilter.lte = new Date(to);

  const resultado = await prisma.$queryRaw`
    SELECT
      ps.key AS stage_key,
      ps.name AS stage_name,
      ps.position,
      COUNT(dsh.id)::int AS movimentacoes,
      ROUND(AVG(dsh.duration_seconds))::int AS media_segundos,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dsh.duration_seconds))::int AS mediana_segundos
    FROM deal_stage_history dsh
    JOIN pipeline_stages ps ON ps.id = dsh.from_stage_id
    WHERE dsh.duration_seconds IS NOT NULL
      ${Object.keys(dateFilter).length
        ? Prisma.sql`AND dsh.created_at BETWEEN ${dateFilter.gte ?? new Date(0)} AND ${dateFilter.lte ?? new Date()}`
        : Prisma.empty
      }
    GROUP BY ps.id, ps.key, ps.name, ps.position
    ORDER BY ps.position ASC
  `;

  const estagios = resultado.map((r) => ({
    key: r.stage_key,
    name: r.stage_name,
    position: Number(r.position),
    movimentacoes: r.movimentacoes,
    mediaSegundos: r.media_segundos,
    mediaHoras: r.media_segundos ? Math.round(r.media_segundos / 3600 * 10) / 10 : null,
    medianaHoras: r.mediana_segundos ? Math.round(r.mediana_segundos / 3600 * 10) / 10 : null,
  }));

  return res.status(200).json({ estagios });
}

export default withAuth(handler, { methods: ['GET'] });
