// Rota de diagnóstico de escopo — remover antes de produção
import { withAuth } from '@/lib/auth/guard';
import { dealWhere, contactWhere } from '@/lib/query/scope';

async function handler(req, res, ctx) {
  return res.status(200).json({
    userId: ctx.userId,
    role: ctx.role,
    dealReadScope: ctx.scopeFor('deal', 'read'),
    dealUpdateScope: ctx.scopeFor('deal', 'update'),
    contactReadScope: ctx.scopeFor('contact', 'read'),
    dealWhere: (() => { try { return dealWhere(ctx); } catch { return 'FORBIDDEN'; } })(),
    contactWhere: (() => { try { return contactWhere(ctx); } catch { return 'FORBIDDEN'; } })(),
  });
}

export default withAuth(handler, { methods: ['GET'] });
