import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, guardMock } = vi.hoisted(() => ({
  prismaMock: { deal: { findMany: vi.fn() } },
  guardMock: { ctx: null },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));

// withAuth real exigiria NextAuth; aqui o wrapper só injeta o ctx do teste e
// devolve 401 quando não há sessão — o suficiente para exercitar o handler.
vi.mock('@/lib/auth/guard', () => {
  class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  return {
    withAuth: (handler) => async (req, res) => {
      if (!guardMock.ctx) return res.status(401).json({ error: 'Não autorizado.' });
      try {
        return await handler(req, res, guardMock.ctx);
      } catch (err) {
        return res.status(err.status || 500).json({ error: err.message });
      }
    },
    BadRequest: (msg) => new HttpError(400, msg),
    Forbidden: (msg) => new HttpError(403, msg || 'Sem permissão.'),
  };
});

import handler from '@/pages/api/deals/search';

function req(query) { return { method: 'GET', query }; }
function res() {
  const r = { statusCode: 200, body: null, setHeader: () => {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

const LINHA = {
  id: 'f63bafc3-c9be-4172-b305-d8a371cd19a4',
  legalArea: 'trabalhista',
  contact: { name: 'Gustavo', whatsapp: '5513978015937' },
  stage: { name: 'Qualificado' },
};

beforeEach(() => {
  vi.clearAllMocks();
  guardMock.ctx = { userId: 'u1', scopeFor: () => 'all' };
  prismaMock.deal.findMany.mockResolvedValue([LINHA]);
});

describe('GET /api/deals/search — autenticação', () => {
  it('sem sessão → 401', async () => {
    guardMock.ctx = null;
    const r = res();
    await handler(req({ q: 'gustavo' }), r);
    expect(r.statusCode).toBe(401);
    expect(prismaMock.deal.findMany).not.toHaveBeenCalled();
  });

  it('sem escopo de leitura → 403 e nada é consultado', async () => {
    guardMock.ctx = { userId: 'u1', scopeFor: () => null };
    const r = res();
    await handler(req({ q: 'gustavo' }), r);
    expect(r.statusCode).toBe(403);
    expect(prismaMock.deal.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/deals/search — validação', () => {
  it('termo com menos de 2 caracteres → 400', async () => {
    const r = res();
    await handler(req({ q: 'g' }), r);
    expect(r.statusCode).toBe(400);
    expect(prismaMock.deal.findMany).not.toHaveBeenCalled();
  });

  it('sem q → 400', async () => {
    const r = res();
    await handler(req({}), r);
    expect(r.statusCode).toBe(400);
  });
});

describe('GET /api/deals/search — busca', () => {
  it('por nome monta filtro case-insensitive no contato', async () => {
    const r = res();
    await handler(req({ q: 'gustavo' }), r);
    expect(r.statusCode).toBe(200);
    const where = prismaMock.deal.findMany.mock.calls[0][0].where;
    const or = where.contact.AND[0].OR;
    expect(or).toContainEqual({ name: { contains: 'gustavo', mode: 'insensitive' } });
  });

  it('por telefone busca pelos dígitos', async () => {
    const r = res();
    await handler(req({ q: '(13) 97801-5937' }), r);
    const or = prismaMock.deal.findMany.mock.calls[0][0].where.contact.AND[0].OR;
    expect(or).toContainEqual({ whatsapp: { contains: '13978015937' } });
  });

  it('restringe a deals OPEN e não deletados', async () => {
    const r = res();
    await handler(req({ q: 'gustavo' }), r);
    const where = prismaMock.deal.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('OPEN');
    expect(where.deletedAt).toBeNull();
  });

  it('escopo own filtra pelo dono', async () => {
    guardMock.ctx = { userId: 'u9', scopeFor: () => 'own' };
    const r = res();
    await handler(req({ q: 'gustavo' }), r);
    expect(prismaMock.deal.findMany.mock.calls[0][0].where.ownerId).toBe('u9');
  });

  it('limita a 10 resultados', async () => {
    const r = res();
    await handler(req({ q: 'gustavo' }), r);
    expect(prismaMock.deal.findMany.mock.calls[0][0].take).toBe(10);
  });

  it('achata o resultado no formato do autocomplete', async () => {
    const r = res();
    await handler(req({ q: 'gustavo' }), r);
    expect(r.body.results).toEqual([{
      id: 'f63bafc3-c9be-4172-b305-d8a371cd19a4',
      contactName: 'Gustavo',
      whatsapp: '5513978015937',
      area: 'trabalhista',
      stage: 'Qualificado',
    }]);
  });

  it('sem resultados devolve lista vazia, não erro', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    const r = res();
    await handler(req({ q: 'zzzz' }), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.results).toEqual([]);
  });

  it('campos nulos não quebram o achatamento', async () => {
    prismaMock.deal.findMany.mockResolvedValue([
      { id: 'd1', legalArea: null, contact: null, stage: null },
    ]);
    const r = res();
    await handler(req({ q: 'gustavo' }), r);
    expect(r.body.results[0]).toEqual({
      id: 'd1', contactName: null, whatsapp: null, area: null, stage: null,
    });
  });
});
