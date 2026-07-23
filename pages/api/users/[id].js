// =============================================================================
// WhatJuris CRM — Usuário individual
// pages/api/users/[id].js
//
// DESVIO DA SPEC (segurança): a spec gateava a rota inteira só com `user.read`,
// o que deixaria qualquer um que lê usuários (advogado, assistente) editar e
// excluir usuários. Aqui a rota exige `user.read` para entrar (necessário no
// GET), mas PATCH exige `user.update` e DELETE exige `user.suspend`.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAuth, BadRequest, NotFound, Forbidden, writeAudit } from '@/lib/auth/guard';

const safeSelect = {
  id: true, name: true, email: true, avatarUrl: true, status: true,
  oabNumber: true, oabState: true, legalAreas: true, notifyWhatsapp: true,
  phone: true, lastLoginAt: true, createdAt: true,
  role: { select: { id: true, key: true, name: true } },
};

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  oabNumber: z.string().trim().max(20).nullable().optional(),
  oabState: z.string().trim().length(2).toUpperCase().nullable().optional(),
  legalAreas: z.array(z.string()).optional(),
  notifyWhatsapp: z.string().trim().max(20).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  roleKey: z.string().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

async function handler(req, res, ctx) {
  const { id } = req.query;

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: safeSelect,
  });

  if (!user) throw NotFound('Usuário não encontrado.');

  if (req.method === 'GET') {
    return res.status(200).json({ user });
  }

  // Sócio não pode ser rebaixado ou suspenso por outro usuário
  if (user.role.key === 'owner' && ctx.userId !== user.id) {
    throw Forbidden('Não é possível alterar o papel de Sócio Proprietário.');
  }

  if (req.method === 'PATCH') {
    if (!ctx.can('user.update')) throw Forbidden();

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

    const { roleKey, ...rest } = parsed.data;
    const data = { ...rest };

    if (roleKey) {
      if (roleKey === 'owner') {
        throw Forbidden('O papel de Sócio Proprietário não pode ser atribuído via API.');
      }

      const role = await prisma.role.findUnique({ where: { key: roleKey } });
      if (!role) throw BadRequest('Papel não encontrado.');

      data.roleId = role.id;
      // Mudar de papel derruba sessões ativas — permissões mudam imediatamente
      data.tokenVersion = { increment: 1 };
    }

    const before = { ...user };
    const updated = await prisma.user.update({
      where: { id },
      data,
      select: safeSelect,
    });

    await writeAudit({
      actorId: ctx.userId, action: 'user.updated', resource: 'user',
      resourceId: id, before, after: updated, ctx,
    });

    return res.status(200).json({ user: updated });
  }

  if (req.method === 'DELETE') {
    if (!ctx.can('user.suspend')) throw Forbidden();

    // Soft delete: o usuário some da listagem mas o histórico permanece.
    // tokenVersion++ derruba a sessão ativa imediatamente.
    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'SUSPENDED', tokenVersion: { increment: 1 } },
    });

    await writeAudit({
      actorId: ctx.userId, action: 'user.removed', resource: 'user',
      resourceId: id, before: user, ctx,
    });

    return res.status(200).json({ message: 'Usuário removido.' });
  }
}

export default withAuth(handler, {
  methods: ['GET', 'PATCH', 'DELETE'],
  permission: 'user.read',
});
