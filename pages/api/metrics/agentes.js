// =============================================================================
// WhatJuris CRM — Performance dos agentes de IA
// pages/api/metrics/agentes.js
//
// Agrupado por actorLabel (activities onde actor_type = 'AI_AGENT').
// Pré-estruturado para o módulo 9 — retorna [] enquanto não houver agentes.
// DESVIO: gate report.read.own|all.
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { withAuth, Forbidden } from '@/lib/auth/guard';

async function handler(req, res, ctx) {
  if (!ctx.can('report.read.own') && !ctx.can('report.read.all')) throw Forbidden();

  const { from, to } = req.query;
  const inicio = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const fim = to ? new Date(to) : new Date();

  const resultado = await prisma.$queryRaw`
    SELECT
      actor_label AS agente,
      COUNT(*)::int AS total_acoes,
      COUNT(DISTINCT deal_id)::int AS deals_atendidos,
      ROUND(AVG(EXTRACT(EPOCH FROM (created_at - occurred_at))))::int AS latencia_media_segundos
    FROM activities
    WHERE actor_type = 'AI_AGENT'
      AND actor_label IS NOT NULL
      AND occurred_at BETWEEN ${inicio} AND ${fim}
    GROUP BY actor_label
    ORDER BY total_acoes DESC
  `;

  const agentes = resultado.map((r) => ({
    nome: r.agente,
    totalAcoes: r.total_acoes,
    dealsAtendidos: r.deals_atendidos,
    latenciaMediaSegundos: r.latencia_media_segundos,
  }));

  return res.status(200).json({ agentes });
}

export default withAuth(handler, { methods: ['GET'] });
