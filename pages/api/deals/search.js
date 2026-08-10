// =============================================================================
// WhatJuris CRM — Busca de leads para autocomplete
// GET /api/deals/search?q=<termo>
//
// Alimenta o seletor de cliente do modal "Novo evento" da agenda. O advogado
// digita nome ou telefone; o dealId viaja escondido para o POST do evento, que
// é do que notificarAgendamento depende para avisar o cliente no WhatsApp.
//
// Reusa `applyListFilters` (mesma semântica de busca da listagem de deals) e
// `dealWhere` (escopo own/all por permissão) — nada de regra nova aqui.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAuth, BadRequest } from '@/lib/auth/guard';
import { dealWhere } from '@/lib/query/scope';
import { applyListFilters } from '@/lib/query/deal-filters';

const LIMITE = 10;

const schema = z.object({
  q: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(80),
});

async function handler(req, res, ctx) {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

  // Só deals OPEN: um mesmo contato acumula casos encerrados, e listá-los
  // encheria o dropdown de linhas praticamente idênticas.
  const { where, contactAnd } = applyListFilters(
    dealWhere(ctx, { status: 'OPEN' }),
    { search: parsed.data.q },
  );
  if (contactAnd.length) where.contact = { ...(where.contact || {}), AND: contactAnd };

  const rows = await prisma.deal.findMany({
    where,
    select: {
      id: true,
      legalArea: true,
      contact: { select: { name: true, whatsapp: true } },
      stage: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: LIMITE,
  });

  return res.status(200).json({
    results: rows.map((d) => ({
      id: d.id,
      contactName: d.contact?.name ?? null,
      whatsapp: d.contact?.whatsapp ?? null,
      area: d.legalArea ?? null,
      stage: d.stage?.name ?? null,
    })),
  });
}

export default withAuth(handler, {
  methods: ['GET'],
  permission: 'deal.read.own',
});
