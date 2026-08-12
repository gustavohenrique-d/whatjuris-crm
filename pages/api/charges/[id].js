// =============================================================================
// WhatJuris CRM — Cobrança individual
// GET detalhe com parcelas; DELETE soft delete.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAuth, BadRequest, Forbidden, NotFound } from '@/lib/auth/guard';

// totalAmount NÃO entra: é o valor contratado e não se edita. Ajuste de valor
// acontece por parcela, e a divergência entre contratado e a soma das parcelas
// é informação que a tela mostra.
const updateSchema = z.object({
  serviceType: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().min(1).max(300).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

async function handler(req, res, ctx) {
  const { id } = req.query;

  const charge = await prisma.charge.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, description: true, serviceType: true, totalAmount: true, currency: true,
      status: true, payerName: true, notes: true, createdAt: true,
      contact: { select: { id: true, name: true, whatsapp: true } },
      deal: { select: { id: true, title: true } },
      installments: {
        orderBy: { number: 'asc' },
        select: {
          id: true, number: true, amount: true, dueDate: true,
          status: true, paidAt: true, paidAmount: true, originalAmount: true,
        },
      },
    },
  });

  if (!charge) throw NotFound('Cobrança não encontrada.');

  if (req.method === 'GET') {
    if (!ctx.can('charge.read')) throw Forbidden();
    return res.status(200).json({ charge });
  }

  if (req.method === 'PATCH') {
    if (!ctx.can('charge.update')) throw Forbidden();
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);
    const d = parsed.data;

    const data = {};
    // `?? null` e não `|| null`: string vazia significa "limpar o campo".
    if (d.serviceType !== undefined) data.serviceType = d.serviceType?.trim() || null;
    if (d.description !== undefined) data.description = d.description;
    if (d.notes !== undefined) data.notes = d.notes ?? null;

    const atualizada = await prisma.charge.update({
      where: { id },
      data,
      select: { id: true, description: true, serviceType: true, notes: true },
    });
    return res.status(200).json({ charge: atualizada });
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

export default withAuth(handler, { methods: ['GET', 'PATCH', 'DELETE'] });
