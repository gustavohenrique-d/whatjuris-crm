// =============================================================================
// WhatJuris CRM — Cobrança individual
// GET detalhe com parcelas; DELETE soft delete.
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { withAuth, Forbidden, NotFound } from '@/lib/auth/guard';

async function handler(req, res, ctx) {
  const { id } = req.query;

  const charge = await prisma.charge.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, description: true, totalAmount: true, currency: true, status: true,
      payerName: true, notes: true, createdAt: true,
      contact: { select: { id: true, name: true, whatsapp: true } },
      deal: { select: { id: true, title: true } },
      installments: {
        orderBy: { number: 'asc' },
        select: {
          id: true, number: true, amount: true, dueDate: true,
          status: true, paidAt: true, paidAmount: true,
        },
      },
    },
  });

  if (!charge) throw NotFound('Cobrança não encontrada.');

  if (req.method === 'GET') {
    if (!ctx.can('charge.read')) throw Forbidden();
    return res.status(200).json({ charge });
  }

  // DELETE — soft delete, como Contact e Deal. As parcelas ficam no banco
  // (cascade só dispara em delete físico) e somem dos totais porque o summary
  // e a listagem filtram por charge.deletedAt: null.
  if (!ctx.can('charge.delete')) throw Forbidden();

  await prisma.charge.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return res.status(200).json({ message: 'Cobrança removida.' });
}

export default withAuth(handler, { methods: ['GET', 'DELETE'] });
