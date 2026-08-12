// =============================================================================
// WhatJuris CRM — Financeiro: totais dos cards
// GET /api/charges/summary
//
// Os três números da tela. "Atrasado" é DERIVADO aqui (PENDING vencido), nunca
// lido de uma coluna — por isso não existe job para virar status e nada fica
// preso em atraso depois de pago.
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { withAuth, Forbidden } from '@/lib/auth/guard';
import { hojeISO, inicioDoMesUTC } from '@/lib/financeiro/datas';

async function handler(req, res, ctx) {
  if (!ctx.can('charge.read')) throw Forbidden();

  // Só parcelas de cobranças vivas e não canceladas entram nos totais.
  const cobrancaViva = { charge: { deletedAt: null, status: 'OPEN' } };
  const hoje = new Date(`${hojeISO()}T00:00:00Z`);

  const [pendente, atrasado, recebidoMes] = await Promise.all([
    prisma.installment.aggregate({
      where: { ...cobrancaViva, status: 'PENDING' },
      _sum: { amount: true }, _count: true,
    }),
    prisma.installment.aggregate({
      // A definição de atrasado, em um lugar só.
      where: { ...cobrancaViva, status: 'PENDING', dueDate: { lt: hoje } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.installment.aggregate({
      where: { ...cobrancaViva, status: 'PAID', paidAt: { gte: inicioDoMesUTC() } },
      _sum: { paidAmount: true }, _count: true,
    }),
  ]);

  const num = (v) => Number(v ?? 0);

  return res.status(200).json({
    aReceber: { total: num(pendente._sum.amount), quantidade: pendente._count },
    atrasado: { total: num(atrasado._sum.amount), quantidade: atrasado._count },
    recebidoNoMes: { total: num(recebidoMes._sum.paidAmount), quantidade: recebidoMes._count },
  });
}

export default withAuth(handler, { methods: ['GET'] });
