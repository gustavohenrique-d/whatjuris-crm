import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, guardMock } = vi.hoisted(() => ({
  prismaMock: {
    contact: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
  },
  guardMock: { ctx: null },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/conversations/control', () => ({
  // Mesma normalização do resto do sistema: só dígitos.
  sanitizeChatId: (v) => String(v || '').replace(/\D/g, ''),
}));
vi.mock('@/lib/query/scope', () => ({
  contactWhere: () => ({ deletedAt: null }),
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
    Forbidden: (m) => new HttpError(403, m || 'Sem permissão.'),
  };
});

import handler from '@/pages/api/contacts/index';

function res() {
  const r = { statusCode: 200, body: null, setHeader: () => {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const req = (body) => ({ method: 'POST', query: {}, body });
const corpo = (o = {}) => ({ name: 'João Ferreira', ...o });

beforeEach(() => {
  vi.clearAllMocks();
  guardMock.ctx = { userId: 'u1', can: () => true };
  prismaMock.contact.findFirst.mockResolvedValue(null);
  prismaMock.contact.create.mockImplementation(async ({ data }) => ({ id: 'c-novo', ...data }));
});

describe('POST /api/contacts — criação', () => {
  it('sem whatsapp: cria e nem consulta duplicidade', async () => {
    const r = res();
    await handler(req(corpo()), r);
    expect(r.statusCode).toBe(201);
    expect(prismaMock.contact.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.contact.create.mock.calls[0][0].data.whatsapp).toBe(null);
  });

  it('whatsapp novo: cria normalmente', async () => {
    const r = res();
    await handler(req(corpo({ whatsapp: '5513978015937' })), r);
    expect(r.statusCode).toBe(201);
    expect(prismaMock.contact.create).toHaveBeenCalledTimes(1);
  });

  it('NORMALIZA o número para dígitos antes de gravar', async () => {
    const r = res();
    await handler(req(corpo({ whatsapp: '(13) 97801-5937' })), r);
    // Gravar com máscara desvincularia o contato das próprias conversas: o
    // webhook busca por dígitos.
    expect(prismaMock.contact.create.mock.calls[0][0].data.whatsapp).toBe('13978015937');
  });

  it('busca a duplicidade pelo número JÁ normalizado', async () => {
    await handler(req(corpo({ whatsapp: '+55 (13) 97801-5937' })), res());
    expect(prismaMock.contact.findFirst.mock.calls[0][0].where).toEqual({
      whatsapp: '5513978015937', deletedAt: null,
    });
  });

  it('whatsapp duplicado → 409 com o nome de quem já o tem, sem criar', async () => {
    prismaMock.contact.findFirst.mockResolvedValue({ id: 'c1', name: 'Gustavo' });
    const r = res();
    await handler(req(corpo({ whatsapp: '5513978015937' })), r);
    expect(r.statusCode).toBe(409);
    expect(r.body.error).toContain('Gustavo');
    expect(prismaMock.contact.create).not.toHaveBeenCalled();
  });

  it('duplicado detectado mesmo com máscara diferente do cadastrado', async () => {
    prismaMock.contact.findFirst.mockResolvedValue({ id: 'c1', name: 'Gustavo' });
    const r = res();
    await handler(req(corpo({ whatsapp: '(55) 13 97801-5937' })), r);
    expect(r.statusCode).toBe(409);
  });

  it('contato removido (soft delete) não bloqueia o número', async () => {
    // O findFirst filtra deletedAt: null — o mock devolve null porque o
    // removido não entra na busca.
    const r = res();
    await handler(req(corpo({ whatsapp: '5513978015937' })), r);
    expect(r.statusCode).toBe(201);
  });

  it('nome vazio → 400', async () => {
    const r = res();
    await handler(req({ name: '' }), r);
    expect(r.statusCode).toBe(400);
    expect(prismaMock.contact.create).not.toHaveBeenCalled();
  });

  it('email inválido → 400', async () => {
    const r = res();
    await handler(req(corpo({ email: 'abc' })), r);
    expect(r.statusCode).toBe(400);
  });

  it('type default é LEAD', async () => {
    await handler(req(corpo()), res());
    expect(prismaMock.contact.create.mock.calls[0][0].data.type).toBe('LEAD');
  });

  it('dono padrão é quem criou', async () => {
    await handler(req(corpo()), res());
    expect(prismaMock.contact.create.mock.calls[0][0].data.ownerId).toBe('u1');
  });

  it('sem contact.create → 403', async () => {
    guardMock.ctx = { userId: 'u1', can: () => false };
    const r = res();
    await handler(req(corpo()), r);
    expect(r.statusCode).toBe(403);
    expect(prismaMock.contact.create).not.toHaveBeenCalled();
  });
});
