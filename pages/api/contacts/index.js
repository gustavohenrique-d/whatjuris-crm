// =============================================================================
// WhatJuris CRM — Contacts: lista e cria
// pages/api/contacts/index.js
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAuth, BadRequest, Conflict, Forbidden } from '@/lib/auth/guard';
import { sanitizeChatId } from '@/lib/conversations/control';
import { contactWhere } from '@/lib/query/scope';

const createSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório.').max(200),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  whatsapp: z.string().trim().max(20).optional().nullable(),
  document: z.string().trim().max(20).optional().nullable(),
  source: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  type: z.enum(['LEAD', 'CLIENT']).default('LEAD'),
  ownerId: z.string().uuid().optional().nullable(),
});

async function handler(req, res, ctx) {
  if (req.method === 'GET') {
    const { q, source, type, page = '1', limit = '50' } = req.query;
    const take = Math.min(parseInt(limit, 10) || 50, 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const where = contactWhere(ctx); // lança 403 se sem permissão

    if (q) {
      where.name = { contains: q, mode: 'insensitive' };
    }
    if (source) where.source = source;
    if (type) where.type = type;

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        select: {
          id: true, name: true, email: true, phone: true, whatsapp: true,
          document: true, source: true, type: true, createdAt: true,
          owner: { select: { id: true, name: true } },
          _count: { select: { deals: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.contact.count({ where }),
    ]);

    return res.status(200).json({ contacts, total, page: parseInt(page, 10), limit: take });
  }

  if (req.method === 'POST') {
    if (!ctx.can('contact.create')) throw Forbidden();

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

    // O número precisa ser gravado em DÍGITOS, no mesmo formato que
    // findOrCreateContact/triagem usam para localizar o contato. Gravar
    // "(13) 97801-5937" faria a busca do webhook por "5513978015937" falhar, e
    // o contato nasceria desvinculado das próprias conversas.
    const whatsapp = parsed.data.whatsapp ? sanitizeChatId(parsed.data.whatsapp) : null;

    // Sem @unique no banco (dados legados podem ter duplicata), a aplicação é a
    // única guarda. Seis pontos do sistema buscam o contato por whatsapp com
    // findFirst — com dois registros no mesmo número, as mensagens cairiam ora
    // num, ora noutro, espalhando o histórico em silêncio.
    if (whatsapp) {
      const jaExiste = await prisma.contact.findFirst({
        where: { whatsapp, deletedAt: null },
        select: { id: true, name: true },
      });
      if (jaExiste) {
        throw Conflict(`Já existe um cliente com esse WhatsApp: ${jaExiste.name}.`);
      }
    }

    const data = {
      ...parsed.data,
      whatsapp,
      ownerId: parsed.data.ownerId ?? ctx.userId,
    };

    const contact = await prisma.contact.create({
      data,
      select: {
        id: true, name: true, email: true, phone: true, whatsapp: true,
        type: true, source: true, createdAt: true,
        owner: { select: { id: true, name: true } },
      },
    });

    return res.status(201).json({ contact });
  }
}

export default withAuth(handler, {
  methods: ['GET', 'POST'],
  permission: 'contact.read.own', // mínimo para entrar; scope é resolvido dentro
});
