// =============================================================================
// WhatJuris CRM — Contact individual
// pages/api/contacts/[id].js
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import {
  withAuth, BadRequest, NotFound, Forbidden, writeAudit,
} from '@/lib/auth/guard';
import { assertCanReadContact, assertCanWriteContact } from '@/lib/query/scope';

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().toLowerCase().email().nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  whatsapp: z.string().trim().max(20).nullable().optional(),
  document: z.string().trim().max(20).nullable().optional(),
  source: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  type: z.enum(['LEAD', 'CLIENT']).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  customData: z.record(z.unknown()).optional(),
});

const contactSelect = {
  id: true, name: true, email: true, phone: true, whatsapp: true,
  document: true, source: true, type: true, notes: true,
  customData: true, consentAt: true, createdAt: true, updatedAt: true,
  owner: { select: { id: true, name: true } },
  deals: {
    where: { deletedAt: null },
    select: { id: true, title: true, status: true, legalArea: true,
      stage: { select: { name: true, color: true } } },
  },
};

async function handler(req, res, ctx) {
  const { id } = req.query;

  const contact = await prisma.contact.findFirst({
    where: { id, deletedAt: null },
    select: contactSelect,
  });

  if (!contact) throw NotFound('Contato não encontrado.');

  assertCanReadContact(ctx, contact); // lança 403 se escopo own e não é dono

  if (req.method === 'GET') {
    return res.status(200).json({ contact });
  }

  if (req.method === 'PATCH') {
    assertCanWriteContact(ctx, contact);

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

    const before = { ...contact };
    const updated = await prisma.contact.update({
      where: { id },
      data: parsed.data,
      select: contactSelect,
    });

    await writeAudit({
      actorId: ctx.userId, action: 'contact.updated', resource: 'contact',
      resourceId: id, before, after: parsed.data, ctx,
    });

    return res.status(200).json({ contact: updated });
  }

  if (req.method === 'DELETE') {
    assertCanWriteContact(ctx, contact);

    if (!ctx.can('contact.delete')) throw Forbidden();

    await prisma.contact.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await writeAudit({
      actorId: ctx.userId, action: 'contact.deleted', resource: 'contact',
      resourceId: id, before: contact, ctx,
    });

    return res.status(200).json({ message: 'Contato removido.' });
  }
}

export default withAuth(handler, {
  methods: ['GET', 'PATCH', 'DELETE'],
  permission: 'contact.read.own',
});
