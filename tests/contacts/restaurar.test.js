import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, guardMock, scopeMock } = vi.hoisted(() => ({
  prismaMock: {
    contact: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  },
  guardMock: { ctx: null },
  scopeMock: { escopo: 'all' },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/query/scope', () => ({
  assertCanWriteContact: () => {},
  // Espelha o helper real: deletedAt: null fixo, com `extra` sobrescrevendo.
  contactWhere: (ctx, extra = {}) => ({
    deletedAt: null,
    ...extra,
    ...(scopeMock.escopo === 'own' ? { ownerId: ctx.userId } : {}),
  }),
}));
vi.mock('@/lib/conversations/control', () => ({
  sanitizeChatId: (v) => String(v || '').replace(/\D/g, ''),
}));
vi.mock('@/lib/auth/guard', () => {
  class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  return {
    withAuth: (handler) => async (req, res) => {
      try { return await handler(req, res, guardMock.ctx); }
      catch (err) { return res.status(err.status || 500).json({ error: err.message }); }
    },
    BadRequest: (m) => new HttpError(400, m),
    Conflict: (m) => new HttpError(409, m),
    NotFound: (m) => new HttpError(404, m),
    Forbidden: (m) => new HttpError(403, m || 'Sem permissão.'),
    writeAudit: vi.fn(),
  };
});

import listaHandler from '@/pages/api/contacts/index';
import restoreHandler from '@/pages/api/contacts/[id]/restore';

const ID = 'c1';
function res() {
  const r = { statusCode: 200, body: null, setHeader: () => {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  guardMock.ctx = { userId: 'u1', can: () => true, scopeFor: () => 'all' };
  scopeMock.escopo = 'all';
  prismaMock.contact.findMany.mockResolvedValue([]);
  prismaMock.contact.count.mockResolvedValue(0);
  prismaMock.contact.findUnique.mockResolvedValue({
    id: ID, name: 'Gustavo', ownerId: 'u1', deletedAt: new Date('2026-08-01T10:00:00Z'),
  });
  prismaMock.contact.update.mockImplementation(async ({ data }) => ({ id: ID, name: 'Gustavo', ...data }));
});

describe('GET /api/contacts — alternar ativos × arquivados', () => {
  const req = (query = {}) => ({ method: 'GET', query });

  it('sem o parâmetro, lista SÓ os ativos', async () => {
    await listaHandler(req(), res());
    expect(prismaMock.contact.findMany.mock.calls[0][0].where.deletedAt).toBe(null);
  });

  it('?arquivados=true lista SÓ os arquivados', async () => {
    await listaHandler(req({ arquivados: 'true' }), res());
    expect(prismaMock.contact.findMany.mock.calls[0][0].where.deletedAt).toEqual({ not: null });
  });

  it('valor diferente de "true" continua trazendo os ativos', async () => {
    for (const v of ['false', '1', '', 'sim']) {
      vi.clearAllMocks();
      prismaMock.contact.findMany.mockResolvedValue([]);
      prismaMock.contact.count.mockResolvedValue(0);
      await listaHandler(req({ arquivados: v }), res());
      expect(prismaMock.contact.findMany.mock.calls[0][0].where.deletedAt).toBe(null);
    }
  });

  it('o modo arquivados NÃO afrouxa o escopo de permissão', async () => {
    scopeMock.escopo = 'own';
    await listaHandler(req({ arquivados: 'true' }), res());
    const where = prismaMock.contact.findMany.mock.calls[0][0].where;
    expect(where.ownerId).toBe('u1');       // escopo preservado
    expect(where.deletedAt).toEqual({ not: null });
  });

  it('a listagem devolve deletedAt (a aba mostra "arquivado em")', async () => {
    await listaHandler(req({ arquivados: 'true' }), res());
    expect(prismaMock.contact.findMany.mock.calls[0][0].select.deletedAt).toBe(true);
  });
});

describe('POST /api/contacts/[id]/restore', () => {
  const req = () => ({ method: 'POST', query: { id: ID }, body: {} });

  it('limpa o deletedAt — o inverso exato de arquivar', async () => {
    const r = res();
    await restoreHandler(req(), r);
    expect(r.statusCode).toBe(200);
    const data = prismaMock.contact.update.mock.calls[0][0].data;
    expect(data).toEqual({ deletedAt: null });
    expect(r.body.contact.deletedAt).toBe(null);
  });

  it('busca o contato SEM filtrar deletedAt (o alvo é o arquivado)', async () => {
    await restoreHandler(req(), res());
    const where = prismaMock.contact.findUnique.mock.calls[0][0].where;
    expect(where).toEqual({ id: ID });
  });

  it('contato já ativo → no-op, sem escrever', async () => {
    prismaMock.contact.findUnique.mockResolvedValue({ id: ID, name: 'X', ownerId: 'u1', deletedAt: null });
    const r = res();
    await restoreHandler(req(), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.message).toContain('já está ativo');
    expect(prismaMock.contact.update).not.toHaveBeenCalled();
  });

  it('inexistente → 404', async () => {
    prismaMock.contact.findUnique.mockResolvedValue(null);
    const r = res();
    await restoreHandler(req(), r);
    expect(r.statusCode).toBe(404);
  });

  it('sem contact.delete → 403 sem escrever', async () => {
    guardMock.ctx = { userId: 'u1', can: () => false, scopeFor: () => 'all' };
    const r = res();
    await restoreHandler(req(), r);
    expect(r.statusCode).toBe(403);
    expect(prismaMock.contact.update).not.toHaveBeenCalled();
  });
});
