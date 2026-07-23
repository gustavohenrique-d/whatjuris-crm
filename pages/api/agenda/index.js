// =============================================================================
// WhatJuris CRM — Agenda: lista eventos do período
// pages/api/agenda/index.js
//
// GET ?from=<ISO>&to=<ISO>  — default: semana corrente (segunda a domingo).
//
// DESVIOS: campo do ator = userId. Autorização via activityWhere (lança
// Forbidden se o papel não tem activity.read.own nem .all) em vez da permissão
// única da spec, que barraria o assistente.
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { withAuth } from '@/lib/auth/guard';
import { activityWhere } from '@/lib/query/scope';

const TIPOS_AGENDA = ['MEETING', 'CALL', 'TASK', 'HEARING'];

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=dom, 1=seg, ...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // segunda-feira
  return new Date(d.setDate(diff));
}

function endOfWeek(date = new Date()) {
  const start = startOfWeek(date);
  return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000 + 23 * 3600000 + 59 * 60000 + 59000);
}

async function handler(req, res, ctx) {
  const from = req.query.from ? new Date(req.query.from) : startOfWeek();
  const to = req.query.to ? new Date(req.query.to) : endOfWeek();

  const scopeWhere = activityWhere(ctx);

  const events = await prisma.activity.findMany({
    where: {
      ...scopeWhere,
      type: { in: TIPOS_AGENDA },
      dueAt: { gte: from, lte: to },
    },
    select: {
      id: true, type: true, title: true, content: true,
      dueAt: true, completedAt: true, occurredAt: true,
      metadata: true,
      userId: true,
      user: { select: { id: true, name: true } },
      deal: { select: { id: true, title: true, contact: { select: { name: true } } } },
      contact: { select: { id: true, name: true } },
    },
    orderBy: { dueAt: 'asc' },
  });

  return res.status(200).json({ events, from: from.toISOString(), to: to.toISOString() });
}

export default withAuth(handler, { methods: ['GET'] });
