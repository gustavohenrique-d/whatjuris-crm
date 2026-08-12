// =============================================================================
// WhatJuris CRM — Cobranças: lista e cria (Financeiro, fatia 1)
// pages/api/charges/index.js
//
// POST cria a cobrança e TODAS as parcelas numa transação: uma cobrança sem
// parcelas não significa nada, e uma parcela órfã menos ainda.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAuth, BadRequest, Forbidden, NotFound } from '@/lib/auth/guard';
import { gerarParcelas } from '@/lib/financeiro/parcelamento';

const createSchema = z.object({
  // Pagador: contato do CRM OU nome livre (lançamento avulso).
  contactId: z.string().uuid('Contato inválido.').optional().nullable(),
  dealId: z.string().uuid('Caso inválido.').optional().nullable(),
  payerName: z.string().trim().min(1).max(200).optional().nullable(),
  description: z.string().trim().min(1, 'Descrição obrigatória.').max(300),
  // Texto livre — o escritório escreve o que quiser ("Ação trabalhista").
  serviceType: z.string().trim().max(120).optional().nullable(),
  // Aceita número ou string: o formulário manda "6000,00" e o valor precisa
  // chegar sem passar por float. A validação fina é do gerarParcelas.
  totalAmount: z.union([z.number(), z.string()]),
  installments: z.number().int().min(1).max(60).default(1),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data do primeiro vencimento inválida.'),
  notes: z.string().trim().max(1000).optional().nullable(),
}).refine((d) => d.contactId || (d.payerName && d.payerName.trim()), {
  message: 'Informe o cliente ou o nome do pagador.',
});

const listSchema = z.object({
  status: z.enum(['OPEN', 'CANCELED']).optional(),
  contactId: z.string().uuid().optional(),
  vencendoAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

async function handler(req, res, ctx) {
  // ---------------------------------------------------------------- GET ----
  if (req.method === 'GET') {
    if (!ctx.can('charge.read')) throw Forbidden();

    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);
    const { status, contactId, vencendoAte } = parsed.data;

    const where = { deletedAt: null };
    if (status) where.status = status;
    if (contactId) where.contactId = contactId;
    if (vencendoAte) {
      where.installments = { some: { dueDate: { lte: new Date(`${vencendoAte}T00:00:00Z`) } } };
    }

    const charges = await prisma.charge.findMany({
      where,
      select: {
        id: true, description: true, serviceType: true, totalAmount: true, currency: true,
        status: true, payerName: true, notes: true, createdAt: true,
        contact: { select: { id: true, name: true } },
        deal: { select: { id: true, title: true } },
        installments: {
          orderBy: { number: 'asc' },
          select: { id: true, number: true, amount: true, dueDate: true, status: true, paidAt: true, paidAmount: true, originalAmount: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return res.status(200).json({ charges });
  }

  // --------------------------------------------------------------- POST ----
  if (!ctx.can('charge.create')) throw Forbidden();

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);
  const d = parsed.data;

  // Toda a aritmética de dinheiro acontece aqui, em centavos inteiros.
  const plano = gerarParcelas({
    total: d.totalAmount,
    parcelas: d.installments,
    primeiroVencimento: d.firstDueDate,
  });
  if (!plano.ok) throw BadRequest(plano.erro);

  // Vínculos precisam existir — FK com SetNull não protege contra id inventado
  // no momento da criação.
  if (d.contactId) {
    const contato = await prisma.contact.findFirst({
      where: { id: d.contactId, deletedAt: null }, select: { id: true },
    });
    if (!contato) throw NotFound('Cliente não encontrado.');
  }
  if (d.dealId) {
    const deal = await prisma.deal.findFirst({
      where: { id: d.dealId, deletedAt: null }, select: { id: true },
    });
    if (!deal) throw NotFound('Caso não encontrado.');
  }

  const charge = await prisma.$transaction(async (tx) => {
    const criada = await tx.charge.create({
      data: {
        contactId: d.contactId ?? null,
        dealId: d.dealId ?? null,
        payerName: d.payerName?.trim() || null,
        description: d.description,
        serviceType: d.serviceType?.trim() || null,
        // String, não Number: o Prisma converte para Decimal sem passar por
        // float. `plano.totalCentavos` é a fonte da verdade do valor.
        totalAmount: (plano.totalCentavos / 100).toFixed(2),
        notes: d.notes ?? null,
        createdById: ctx.userId,
      },
      select: { id: true },
    });

    await tx.installment.createMany({
      data: plano.parcelas.map((p) => ({
        chargeId: criada.id,
        number: p.number,
        amount: p.amount,
        dueDate: new Date(`${p.dueDate}T00:00:00Z`),
      })),
    });

    return tx.charge.findUnique({
      where: { id: criada.id },
      select: {
        id: true, description: true, serviceType: true, totalAmount: true, currency: true, status: true,
        payerName: true, createdAt: true,
        contact: { select: { id: true, name: true } },
        deal: { select: { id: true, title: true } },
        installments: {
          orderBy: { number: 'asc' },
          select: { id: true, number: true, amount: true, dueDate: true, status: true },
        },
      },
    });
  });

  return res.status(201).json({ charge });
}

export default withAuth(handler, { methods: ['GET', 'POST'] });
