// =============================================================================
// WhatJuris CRM — Parcela: marcar paga / desfazer
// PATCH /api/installments/[id]  { paid: true|false, paidAmount?, paidAt? }
//
// É a parcela que se marca paga, não a cobrança — por isso o endpoint vive
// aqui e não sob /charges.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAuth, BadRequest, Forbidden, NotFound } from '@/lib/auth/guard';

const schema = z.object({
  paid: z.boolean(),
  // Sem valor informado, quita pelo valor da parcela. Pagamento parcial ficou
  // para uma fase seguinte: aqui o campo só registra quanto entrou.
  paidAmount: z.union([z.number(), z.string()]).optional().nullable(),
  paidAt: z.string().datetime().optional().nullable(),
});

async function handler(req, res, ctx) {
  if (!ctx.can('charge.update')) throw Forbidden();

  const { id } = req.query;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);
  const { paid, paidAmount, paidAt } = parsed.data;

  const parcela = await prisma.installment.findFirst({
    where: { id, charge: { deletedAt: null } },
    select: { id: true, amount: true, status: true, chargeId: true },
  });
  if (!parcela) throw NotFound('Parcela não encontrada.');

  const data = paid
    ? {
        status: 'PAID',
        paidAt: paidAt ? new Date(paidAt) : new Date(),
        // String preserva a precisão do Decimal sem passar por float.
        paidAmount: paidAmount != null ? String(paidAmount) : parcela.amount,
      }
    // Desfazer devolve ao estado limpo: sem isto, uma parcela reaberta ficaria
    // PENDING carregando paidAt de um pagamento que não existe mais, e o
    // "recebido no mês" continuaria contando.
    : { status: 'PENDING', paidAt: null, paidAmount: null };

  const atualizada = await prisma.installment.update({
    where: { id },
    data,
    select: {
      id: true, number: true, amount: true, dueDate: true,
      status: true, paidAt: true, paidAmount: true,
    },
  });

  return res.status(200).json({ installment: atualizada });
}

export default withAuth(handler, { methods: ['PATCH'] });
