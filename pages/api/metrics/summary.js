// =============================================================================
// WhatJuris CRM — Métricas do dashboard
// pages/api/metrics/summary.js
//
// DESVIOS da spec (casar com o banco):
//  - Gate: a spec usava permission 'report.read', que NÃO existe no catálogo
//    (só report.read.own / report.read.all). Gate por OR dentro do handler.
//  - DealStageHistory não tem relação `toStage` — resolvo o id do estágio
//    'qualificado' e filtro por toStageId.
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { withAuth, Forbidden } from '@/lib/auth/guard';
import { dealWhere } from '@/lib/query/scope';

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function requireReport(ctx) {
  if (!ctx.can('report.read.own') && !ctx.can('report.read.all')) throw Forbidden();
}

async function handler(req, res, ctx) {
  requireReport(ctx);
  const scopeWhere = dealWhere(ctx);

  const qualificadoStage = await prisma.pipelineStage.findFirst({
    where: { key: 'qualificado' },
    select: { id: true },
  });

  const [
    leadsHoje,
    consultasAgendadas,
    receitaRaw,
    qualificadosNoMes,
    atividadesAgentes,
    totalMes,
  ] = await Promise.all([
    prisma.deal.count({
      where: { ...scopeWhere, createdAt: { gte: startOfDay() } },
    }),
    prisma.deal.count({
      where: { ...scopeWhere, stage: { key: 'consulta_agendada' } },
    }),
    prisma.deal.aggregate({
      where: {
        ...scopeWhere,
        status: 'OPEN',
        stage: { probability: { gte: 70 } },
        value: { not: null },
      },
      _sum: { value: true },
    }),
    qualificadoStage
      ? prisma.dealStageHistory.count({
          where: {
            deal: scopeWhere,
            toStageId: qualificadoStage.id,
            createdAt: { gte: startOfMonth() },
          },
        })
      : Promise.resolve(0),
    prisma.activity.count({
      where: { actorType: 'AI_AGENT', createdAt: { gte: startOfDay() } },
    }),
    prisma.deal.count({
      where: { ...scopeWhere, createdAt: { gte: startOfMonth() } },
    }),
  ]);

  const taxaConversao = totalMes > 0
    ? Math.round((qualificadosNoMes / totalMes) * 100)
    : 0;

  const proximaConsulta = await prisma.activity.findFirst({
    where: {
      type: 'MEETING',
      dueAt: { gte: new Date() },
      deal: scopeWhere,
    },
    orderBy: { dueAt: 'asc' },
    select: { dueAt: true, deal: { select: { id: true, title: true } } },
  });

  return res.status(200).json({
    leadsHoje,
    qualificadosMes: qualificadosNoMes,
    taxaConversao,
    consultasAgendadas,
    receitaPrevista: Number(receitaRaw._sum.value ?? 0),
    agentesAtivosHoje: atividadesAgentes > 0,
    proximaConsulta: proximaConsulta
      ? { dueAt: proximaConsulta.dueAt, dealTitle: proximaConsulta.deal?.title }
      : null,
  });
}

export default withAuth(handler, { methods: ['GET'] });
