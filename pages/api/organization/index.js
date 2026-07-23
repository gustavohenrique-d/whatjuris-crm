// =============================================================================
// WhatJuris CRM — Configurações do escritório
// pages/api/organization/index.js
//
// DESVIO DA SPEC (chaves reais do banco): a spec usava `org.read`/`org.update`,
// mas o catálogo de permissões usa `organization.read`/`organization.update`.
// PATCH exige `organization.update`.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAuth, BadRequest, NotFound, Forbidden, writeAudit } from '@/lib/auth/guard';

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().max(200).nullable().optional(),
  document: z.string().trim().max(20).nullable().optional(),
  oabNumber: z.string().trim().max(30).nullable().optional(),
  timezone: z.string().optional(),
  botDisplayName: z.string().trim().max(60).nullable().optional(),
  businessHours: z.record(
    z.enum(['mon','tue','wed','thu','fri','sat','sun']),
    z.union([z.tuple([z.string(), z.string()]), z.null()])
  ).optional(),
  legalAreas: z.array(z.string()).optional(),
  settings: z.record(z.unknown()).optional(),
});

async function handler(req, res, ctx) {
  const org = await prisma.organization.findFirst();
  if (!org) throw NotFound('Configurações do escritório não encontradas.');

  if (req.method === 'GET') {
    return res.status(200).json({ organization: org });
  }

  if (req.method === 'PATCH') {
    if (!ctx.can('organization.update')) throw Forbidden();

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

    const before = { ...org };
    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: parsed.data,
    });

    await writeAudit({
      actorId: ctx.userId, action: 'org.updated', resource: 'organization',
      resourceId: org.id, before, after: parsed.data, ctx,
    });

    return res.status(200).json({ organization: updated });
  }
}

export default withAuth(handler, {
  methods: ['GET', 'PATCH'],
  permission: 'organization.read',
});
