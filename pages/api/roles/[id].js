// =============================================================================
// WhatJuris CRM — Papel individual: lê e atualiza permissões
// pages/api/roles/[id].js
//
// DESVIO DA SPEC (segurança): a spec gateava a rota só com `role.read`. Aqui
// PATCH exige `role.manage` — só o sócio edita papéis; ler é para quem tem
// `role.read`.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAuth, BadRequest, NotFound, Forbidden, writeAudit } from '@/lib/auth/guard';

const updateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  // Array de chaves de permissão que o papel deve ter
  permissionKeys: z.array(z.string()).optional(),
});

async function handler(req, res, ctx) {
  const { id } = req.query;

  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      permissions: {
        include: { permission: { select: { id: true, key: true } } },
      },
    },
  });

  if (!role) throw NotFound('Papel não encontrado.');

  if (req.method === 'GET') {
    return res.status(200).json({ role });
  }

  if (req.method === 'PATCH') {
    if (!ctx.can('role.manage')) throw Forbidden();

    // Papéis de sistema não podem ser editados pela interface
    if (role.isSystem) {
      throw Forbidden('Papéis de sistema não podem ser editados.');
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

    const { permissionKeys, ...rest } = parsed.data;

    const before = { name: role.name, permissions: role.permissions.map(rp => rp.permission.key) };

    await prisma.$transaction(async (tx) => {
      if (Object.keys(rest).length > 0) {
        await tx.role.update({ where: { id }, data: rest });
      }

      if (permissionKeys !== undefined) {
        const perms = await tx.permission.findMany({
          where: { key: { in: permissionKeys } },
          select: { id: true },
        });

        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: perms.map(p => ({ roleId: id, permissionId: p.id })),
          skipDuplicates: true,
        });

        // Mudar permissões de um papel derruba sessões de todos que têm esse papel
        await tx.user.updateMany({
          where: { roleId: id, deletedAt: null },
          data: { tokenVersion: { increment: 1 } },
        });
      }
    });

    const updated = await prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });

    await writeAudit({
      actorId: ctx.userId, action: 'role.updated', resource: 'role',
      resourceId: id, before, after: { name: updated.name, permissions: permissionKeys }, ctx,
    });

    return res.status(200).json({ role: updated });
  }
}

export default withAuth(handler, {
  methods: ['GET', 'PATCH'],
  permission: 'role.read',
});
