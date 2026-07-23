// =============================================================================
// WhatJuris CRM — Leads captados por semana (últimas N semanas)
// pages/api/metrics/leads-por-semana.js
//
// DESVIOS: gate report.read.own|all (não 'report.read'); usa Prisma.sql/
// Prisma.empty (a spec escreveu prisma.sql, que não existe no client).
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { withAuth, Forbidden } from '@/lib/auth/guard';
import { dealWhere } from '@/lib/query/scope';

async function handler(req, res, ctx) {
  if (!ctx.can('report.read.own') && !ctx.can('report.read.all')) throw Forbidden();

  const semanas = Math.min(parseInt(req.query.semanas, 10) || 6, 12);
  const scopeWhere = dealWhere(ctx);

  const resultado = await prisma.$queryRaw`
    SELECT
      DATE_TRUNC('week', d.created_at) AS semana,
      COUNT(*)::int AS total
    FROM deals d
    WHERE d.deleted_at IS NULL
      ${scopeWhere.ownerId ? Prisma.sql`AND d.owner_id = ${scopeWhere.ownerId}::uuid` : Prisma.empty}
      AND d.created_at >= NOW() - ${semanas}::int * INTERVAL '1 week'
    GROUP BY semana
    ORDER BY semana ASC
  `;

  // Preencher semanas sem dados com 0.
  // DATE_TRUNC('week') do Postgres começa na SEGUNDA e devolve meia-noite UTC —
  // as chaves precisam ser a segunda-feira da semana em UTC para casar.
  const semanasFilled = Array.from({ length: semanas }, (_, i) => {
    const ref = new Date();
    ref.setUTCDate(ref.getUTCDate() - (semanas - 1 - i) * 7);
    const dow = (ref.getUTCDay() + 6) % 7; // 0 = segunda
    const monday = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() - dow));
    const key = monday.toISOString().slice(0, 10);
    const found = resultado.find((r) =>
      new Date(r.semana).toISOString().slice(0, 10) === key
    );
    return { semana: key, total: found?.total ?? 0, label: `Sem ${i + 1}` };
  });

  return res.status(200).json({ semanas: semanasFilled });
}

export default withAuth(handler, { methods: ['GET'] });
