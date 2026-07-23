// Rota de teste do guard (Módulo 2A). Remover antes de produção.
import { withAuth } from '@/lib/auth/guard';

async function handler(req, res, ctx) {
  return res.status(200).json({
    userId: ctx.userId,
    name: ctx.name,
    email: ctx.email,
    role: ctx.role,
    legalAreas: ctx.legalAreas,
    permissionCount: ctx.permissions.size,
    canCreateDeal: ctx.can('deal.create'),
    dealReadScope: ctx.scopeFor('deal', 'read'),
  });
}

export default withAuth(handler, { methods: ['GET'] });
