import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, guardMock, googleMock } = vi.hoisted(() => ({
  prismaMock: {
    contact: { findFirst: vi.fn(), update: vi.fn() },
    deal: { count: vi.fn() },
    activity: { count: vi.fn(), findMany: vi.fn() },
    charge: { findMany: vi.fn() },
    conversationControl: { count: vi.fn() },
    organization: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
  },
  guardMock: { ctx: null },
  googleMock: { deleteFromGoogle: vi.fn() },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/calendar/google', () => ({ deleteFromGoogle: googleMock.deleteFromGoogle }));
vi.mock('@/lib/query/scope', () => ({
  assertCanReadContact: () => {},
  assertCanWriteContact: () => {},
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
    NotFound: (m) => new HttpError(404, m),
    Forbidden: (m) => new HttpError(403, m || 'Sem permissão.'),
    writeAudit: vi.fn(),
  };
});

import contatoHandler from '@/pages/api/contacts/[id]';
import previewHandler from '@/pages/api/contacts/[id]/delete-preview';

const ID = 'c1';
const CONTATO = { id: ID, name: 'Gustavo', whatsapp: '5513978015937', ownerId: 'u1' };

function res() {
  const r = { statusCode: 200, body: null, setHeader: () => {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const parcela = (amount, status = 'PENDING') => ({ amount, status });

beforeEach(() => {
  vi.clearAllMocks();
  guardMock.ctx = { userId: 'u1', can: () => true };
  prismaMock.contact.findFirst.mockResolvedValue(CONTATO);
  prismaMock.contact.update.mockResolvedValue({ id: ID });
  prismaMock.deal.count.mockResolvedValue(3);
  prismaMock.activity.count.mockResolvedValue(12);
  prismaMock.activity.findMany.mockResolvedValue([]);
  prismaMock.charge.findMany.mockResolvedValue([]);
  prismaMock.conversationControl.count.mockResolvedValue(1);
  prismaMock.organization.findFirst.mockResolvedValue({ settings: { googleRefreshToken: 'rt' } });
  prismaMock.$queryRaw.mockResolvedValue([{ total: 26 }]);
  googleMock.deleteFromGoogle.mockResolvedValue({ ok: true });
});

describe('GET delete-preview', () => {
  it('conta o que sai das telas', async () => {
    const r = res();
    await previewHandler({ method: 'GET', query: { id: ID } }, r);
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({
      deals: 3, activities: 12, conversas: 1, memoriaTriagem: 26, bloqueado: false,
    });
    expect(r.body.contact.name).toBe('Gustavo');
  });

  it('não altera nada', async () => {
    await previewHandler({ method: 'GET', query: { id: ID } }, res());
    expect(prismaMock.contact.update).not.toHaveBeenCalled();
  });

  it('cobrança EM ABERTO bloqueia, com valor', async () => {
    prismaMock.charge.findMany.mockResolvedValue([
      { id: 'ch1', installments: [parcela('857.14'), parcela('857.14')] },
    ]);
    const r = res();
    await previewHandler({ method: 'GET', query: { id: ID } }, r);
    expect(r.body.bloqueado).toBe(true);
    expect(r.body.cobrancas).toMatchObject({ quantidade: 1, total: 1714.28, emAberto: 1714.28 });
    expect(r.body.motivoBloqueio).toContain('não pode ser arquivado');
  });

  it('cobrança TOTALMENTE PAGA também bloqueia', async () => {
    prismaMock.charge.findMany.mockResolvedValue([
      { id: 'ch1', installments: [parcela('500.00', 'PAID'), parcela('500.00', 'PAID')] },
    ]);
    const r = res();
    await previewHandler({ method: 'GET', query: { id: ID } }, r);
    expect(r.body.bloqueado).toBe(true);
    expect(r.body.cobrancas.total).toBe(1000);
    expect(r.body.cobrancas.emAberto).toBe(0); // paga não conta como aberto
  });

  it('memória da triagem ausente não derruba o preview', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('relation does not exist'));
    const r = res();
    await previewHandler({ method: 'GET', query: { id: ID } }, r);
    expect(r.statusCode).toBe(200);
    expect(r.body.memoriaTriagem).toBe(0);
  });

  it('sem contact.delete → 403', async () => {
    guardMock.ctx = { userId: 'u1', can: () => false };
    const r = res();
    await previewHandler({ method: 'GET', query: { id: ID } }, r);
    expect(r.statusCode).toBe(403);
  });
});

describe('DELETE — guarda financeira no backend', () => {
  const req = () => ({ method: 'DELETE', query: { id: ID }, body: {} });

  it('com cobrança → 422 e NÃO arquiva', async () => {
    prismaMock.charge.findMany.mockResolvedValue([
      { id: 'ch1', installments: [parcela('100.00')] },
    ]);
    const r = res();
    await contatoHandler(req(), r);
    expect(r.statusCode).toBe(422);
    expect(r.body.error).toContain('não pode ser arquivado');
    expect(prismaMock.contact.update).not.toHaveBeenCalled();
  });

  it('sem cobrança → arquiva com deletedAt (NÃO apaga)', async () => {
    const r = res();
    await contatoHandler(req(), r);
    expect(r.statusCode).toBe(200);
    const data = prismaMock.contact.update.mock.calls[0][0].data;
    expect(data.deletedAt).toBeInstanceOf(Date);
    // Soft delete: o webhook e a triagem dependem deste campo.
    expect(Object.keys(data)).toEqual(['deletedAt']);
  });

  it('sem contact.delete → 403 sem tocar no banco', async () => {
    guardMock.ctx = { userId: 'u1', can: () => false };
    const r = res();
    await contatoHandler(req(), r);
    expect(r.statusCode).toBe(403);
    expect(prismaMock.contact.update).not.toHaveBeenCalled();
  });
});

describe('DELETE — eventos no Google', () => {
  const comEvento = [{
    id: 'a1', title: 'Consulta', dueAt: new Date('2027-01-01'),
    metadata: { googleEventId: 'gcal-1' },
  }];
  const req = () => ({ method: 'DELETE', query: { id: ID }, body: {} });

  it('cancela os futuros no Google ao arquivar', async () => {
    prismaMock.activity.findMany.mockResolvedValue(comEvento);
    const r = res();
    await contatoHandler(req(), r);
    expect(googleMock.deleteFromGoogle).toHaveBeenCalledWith('gcal-1', 'rt');
    expect(r.body.eventosNaoCancelados).toEqual([]);
  });

  it('falha no Google NÃO trava o arquivamento e volta na resposta', async () => {
    prismaMock.activity.findMany.mockResolvedValue(comEvento);
    googleMock.deleteFromGoogle.mockRejectedValue(new Error('Google fora'));
    const r = res();
    await contatoHandler(req(), r);
    expect(r.statusCode).toBe(200);
    expect(prismaMock.contact.update).toHaveBeenCalled(); // arquivou mesmo assim
    expect(r.body.eventosNaoCancelados).toHaveLength(1);
    expect(r.body.eventosNaoCancelados[0].title).toBe('Consulta');
  });

  it('sem credencial do Google, reporta em vez de tentar', async () => {
    prismaMock.activity.findMany.mockResolvedValue(comEvento);
    prismaMock.organization.findFirst.mockResolvedValue({ settings: {} });
    const r = res();
    await contatoHandler(req(), r);
    expect(googleMock.deleteFromGoogle).not.toHaveBeenCalled();
    expect(r.body.eventosNaoCancelados).toHaveLength(1);
  });
});
