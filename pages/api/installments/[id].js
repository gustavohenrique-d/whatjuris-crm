// =============================================================================
// WhatJuris CRM — Parcela: marcar paga / desfazer / editar valor
// PATCH /api/installments/[id]
//
// Dois usos no mesmo endpoint:
//   { paid: true|false }                    quita ou reabre
//   { amount, confirmarEdicaoPaga? }        corrige o valor
//
// ⚠️ A trava de edição de parcela PAGA é validada AQUI, não na UI: sem
// `confirmarEdicaoPaga` o backend recusa, venha a requisição de onde vier.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAuth, BadRequest, Forbidden, NotFound } from '@/lib/auth/guard';
import { paraCentavos, paraDecimalString } from '@/lib/financeiro/parcelamento';

const schema = z.object({
  paid: z.boolean().optional(),
  paidAmount: z.union([z.number(), z.string()]).optional().nullable(),
  paidAt: z.string().datetime().optional().nullable(),
  // Correção de valor.
  amount: z.union([z.number(), z.string()]).optional(),
  confirmarEdicaoPaga: z.boolean().optional(),
}).refine((d) => d.paid !== undefined || d.amount !== undefined, {
  message: 'Informe o novo status ou o novo valor.',
});

async function handler(req, res, ctx) {
  if (!ctx.can('charge.update')) throw Forbidden();

  const { id } = req.query;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);
  const d = parsed.data;

  const parcela = await prisma.installment.findFirst({
    where: { id, charge: { deletedAt: null } },
    select: { id: true, amount: true, status: true, originalAmount: true },
  });
  if (!parcela) throw NotFound('Parcela não encontrada.');

  const data = {};

  // ------------------------------------------------------- editar valor ----
  if (d.amount !== undefined) {
    const centavos = paraCentavos(d.amount);
    if (centavos === null || centavos <= 0) throw BadRequest('Valor inválido.');

    if (parcela.status === 'PAID') {
      // A trava. Só um pedido explícito altera registro de pagamento.
      if (d.confirmarEdicaoPaga !== true) {
        throw BadRequest('Esta parcela já foi paga. Confirme a edição para alterar o valor.');
      }
      // Só na PRIMEIRA edição: originalAmount guarda o valor original, não o
      // penúltimo. Editar de novo não reescreve o histórico.
      if (parcela.originalAmount === null) {
        data.originalAmount = parcela.amount;
      }
      // paidAmount NÃO é tocado: é o que de fato entrou. A diferença entre
      // amount e paidAmount passa a ser o saldo, e por isso o "recebido no mês"
      // (que soma paidAmount) não se altera com esta edição.
    }

    data.amount = paraDecimalString(centavos);
  }

  // -------------------------------------------------- quitar / reabrir ----
  if (d.paid !== undefined) {
    Object.assign(data, d.paid
      ? {
          status: 'PAID',
          paidAt: d.paidAt ? new Date(d.paidAt) : new Date(),
          paidAmount: d.paidAmount != null ? String(d.paidAmount) : (data.amount ?? parcela.amount),
        }
      // Reabrir limpa o pagamento, senão a parcela seguiria contando no
      // "recebido no mês" com um paidAt que não vale mais.
      : { status: 'PENDING', paidAt: null, paidAmount: null });
  }

  const atualizada = await prisma.installment.update({
    where: { id },
    data,
    select: {
      id: true, number: true, amount: true, dueDate: true,
      status: true, paidAt: true, paidAmount: true, originalAmount: true,
    },
  });

  return res.status(200).json({ installment: atualizada });
}

export default withAuth(handler, { methods: ['PATCH'] });
