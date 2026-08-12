import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, guardMock } = vi.hoisted(() => ({
  prismaMock: {
    charge: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    installment: { findFirst: vi.fn(), update: vi.fn(), createMany: vi.fn(), aggregate: vi.fn() },
    contact: { findFirst: vi.fn() },
    deal: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  guardMock: { ctx: null },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));
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
  };
});

import chargesHandler from '@/pages/api/charges/index';
import chargeIdHandler from '@/pages/api/charges/[id]';
import summaryHandler from '@/pages/api/charges/summary';
import installmentHandler from '@/pages/api/installments/[id]';

const ID = '11111111-1111-4111-8111-111111111111';
function res() {
  const r = { statusCode: 200, body: null, setHeader: () => {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const podeTudo = { userId: 'u1', can: () => true };
const naoPode = { userId: 'u1', can: () => false };

beforeEach(() => {
  vi.clearAllMocks();
  guardMock.ctx = podeTudo;
  prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock));
  prismaMock.charge.create.mockResolvedValue({ id: ID });
  prismaMock.installment.createMany.mockResolvedValue({ count: 3 });
  prismaMock.charge.findUnique.mockResolvedValue({ id: ID, installments: [] });
  prismaMock.charge.findFirst.mockResolvedValue({ id: ID, installments: [] });
  prismaMock.charge.findMany.mockResolvedValue([]);
  prismaMock.charge.update.mockResolvedValue({ id: ID });
  prismaMock.contact.findFirst.mockResolvedValue({ id: 'c1' });
  prismaMock.deal.findFirst.mockResolvedValue({ id: 'd1' });
});

describe('POST /api/charges', () => {
  const corpo = (over = {}) => ({
    payerName: 'Fulano', description: 'Honorários',
    totalAmount: '1000,00', installments: 3, firstDueDate: '2026-03-31', ...over,
  });

  it('cria a cobrança e as parcelas na MESMA transação', async () => {
    const r = res();
    await chargesHandler({ method: 'POST', body: corpo(), query: {} }, r);
    expect(r.statusCode).toBe(201);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.charge.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.installment.createMany).toHaveBeenCalledTimes(1);
  });

  it('as parcelas geradas somam exatamente o total', async () => {
    const r = res();
    await chargesHandler({ method: 'POST', body: corpo(), query: {} }, r);
    const linhas = prismaMock.installment.createMany.mock.calls[0][0].data;
    expect(linhas).toHaveLength(3);
    const soma = linhas.reduce((s, l) => s + Math.round(Number(l.amount) * 100), 0);
    expect(soma).toBe(100000);
    expect(linhas[0].amount).toBe('333.34'); // sobra na primeira
  });

  it('grava totalAmount como STRING (não passa por float)', async () => {
    const r = res();
    await chargesHandler({ method: 'POST', body: corpo(), query: {} }, r);
    const data = prismaMock.charge.create.mock.calls[0][0].data;
    expect(typeof data.totalAmount).toBe('string');
    expect(data.totalAmount).toBe('1000.00');
  });

  it('exige cliente ou nome do pagador', async () => {
    const r = res();
    await chargesHandler({ method: 'POST', body: corpo({ payerName: null }), query: {} }, r);
    expect(r.statusCode).toBe(400);
  });

  it('cobrança avulsa (sem contato) é aceita', async () => {
    const r = res();
    await chargesHandler({ method: 'POST', body: corpo({ contactId: null }), query: {} }, r);
    expect(r.statusCode).toBe(201);
    expect(prismaMock.contact.findFirst).not.toHaveBeenCalled();
  });

  it('contactId inexistente → 404, sem criar nada', async () => {
    prismaMock.contact.findFirst.mockResolvedValue(null);
    const r = res();
    await chargesHandler({ method: 'POST', body: corpo({ contactId: ID }), query: {} }, r);
    expect(r.statusCode).toBe(404);
    expect(prismaMock.charge.create).not.toHaveBeenCalled();
  });

  it('parcelamento inválido → 400 antes de tocar o banco', async () => {
    const r = res();
    await chargesHandler({ method: 'POST', body: corpo({ totalAmount: '0,05', installments: 6 }), query: {} }, r);
    expect(r.statusCode).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('sem charge.create → 403', async () => {
    guardMock.ctx = naoPode;
    const r = res();
    await chargesHandler({ method: 'POST', body: corpo(), query: {} }, r);
    expect(r.statusCode).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('GET sem charge.read → 403', async () => {
    guardMock.ctx = naoPode;
    const r = res();
    await chargesHandler({ method: 'GET', query: {} }, r);
    expect(r.statusCode).toBe(403);
  });
});

describe('PATCH /api/installments/[id]', () => {
  beforeEach(() => {
    prismaMock.installment.findFirst.mockResolvedValue({
      id: ID, amount: '333.34', status: 'PENDING', originalAmount: null,
    });
    prismaMock.installment.update.mockImplementation(async ({ data }) => ({ id: ID, ...data }));
  });

  it('marcar paga sem valor quita pelo valor da parcela', async () => {
    const r = res();
    await installmentHandler({ method: 'PATCH', query: { id: ID }, body: { paid: true } }, r);
    expect(r.statusCode).toBe(200);
    const data = prismaMock.installment.update.mock.calls[0][0].data;
    expect(data.status).toBe('PAID');
    expect(data.paidAmount).toBe('333.34');
    expect(data.paidAt).toBeInstanceOf(Date);
  });

  it('desfazer limpa paidAt e paidAmount', async () => {
    const r = res();
    await installmentHandler({ method: 'PATCH', query: { id: ID }, body: { paid: false } }, r);
    const data = prismaMock.installment.update.mock.calls[0][0].data;
    expect(data).toEqual({ status: 'PENDING', paidAt: null, paidAmount: null });
  });

  it('parcela de cobrança removida → 404', async () => {
    prismaMock.installment.findFirst.mockResolvedValue(null);
    const r = res();
    await installmentHandler({ method: 'PATCH', query: { id: ID }, body: { paid: true } }, r);
    expect(r.statusCode).toBe(404);
  });

  it('sem charge.update → 403', async () => {
    guardMock.ctx = naoPode;
    const r = res();
    await installmentHandler({ method: 'PATCH', query: { id: ID }, body: { paid: true } }, r);
    expect(r.statusCode).toBe(403);
    expect(prismaMock.installment.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/charges/[id] — soft delete', () => {
  it('marca deletedAt em vez de apagar', async () => {
    const r = res();
    await chargeIdHandler({ method: 'DELETE', query: { id: ID } }, r);
    expect(r.statusCode).toBe(200);
    const data = prismaMock.charge.update.mock.calls[0][0].data;
    expect(data.deletedAt).toBeInstanceOf(Date);
  });

  it('cobrança já removida → 404', async () => {
    prismaMock.charge.findFirst.mockResolvedValue(null);
    const r = res();
    await chargeIdHandler({ method: 'DELETE', query: { id: ID } }, r);
    expect(r.statusCode).toBe(404);
  });

  it('sem charge.delete → 403 sem tocar no banco', async () => {
    guardMock.ctx = naoPode;
    const r = res();
    await chargeIdHandler({ method: 'DELETE', query: { id: ID } }, r);
    expect(r.statusCode).toBe(403);
    expect(prismaMock.charge.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/charges/summary', () => {
  beforeEach(() => {
    prismaMock.installment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: '7000.00' }, _count: 10 })   // a receber
      .mockResolvedValueOnce({ _sum: { amount: '857.16' }, _count: 1 })     // atrasado
      .mockResolvedValueOnce({ _sum: { paidAmount: '333.34' }, _count: 1 }); // recebido no mês
  });

  it('devolve os três totais', async () => {
    const r = res();
    await summaryHandler({ method: 'GET', query: {} }, r);
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({
      aReceber: { total: 7000, quantidade: 10 },
      atrasado: { total: 857.16, quantidade: 1 },
      recebidoNoMes: { total: 333.34, quantidade: 1 },
    });
  });

  it('atrasado é PENDING com vencimento passado — nunca um status gravado', async () => {
    const r = res();
    await summaryHandler({ method: 'GET', query: {} }, r);
    const where = prismaMock.installment.aggregate.mock.calls[1][0].where;
    expect(where.status).toBe('PENDING');
    expect(where.dueDate.lt).toBeInstanceOf(Date);
  });

  it('ignora parcelas de cobrança removida ou cancelada', async () => {
    const r = res();
    await summaryHandler({ method: 'GET', query: {} }, r);
    for (const chamada of prismaMock.installment.aggregate.mock.calls) {
      expect(chamada[0].where.charge).toEqual({ deletedAt: null, status: 'OPEN' });
    }
  });

  it('sem charge.read → 403', async () => {
    guardMock.ctx = naoPode;
    const r = res();
    await summaryHandler({ method: 'GET', query: {} }, r);
    expect(r.statusCode).toBe(403);
  });
});

describe('PATCH /api/installments/[id] — editar valor (Fatia 2)', () => {
  const paga = (over = {}) => prismaMock.installment.findFirst.mockResolvedValue({
    id: ID, amount: '857.14', status: 'PAID', originalAmount: null, ...over,
  });
  const pendente = () => prismaMock.installment.findFirst.mockResolvedValue({
    id: ID, amount: '857.14', status: 'PENDING', originalAmount: null,
  });
  const dados = () => prismaMock.installment.update.mock.calls[0][0].data;

  beforeEach(() => {
    prismaMock.installment.update.mockImplementation(async ({ data }) => ({ id: ID, ...data }));
  });

  it('PENDENTE: edita o valor livremente, sem originalAmount', async () => {
    pendente();
    const r = res();
    await installmentHandler({ method: 'PATCH', query: { id: ID }, body: { amount: '800,00' } }, r);
    expect(r.statusCode).toBe(200);
    expect(dados().amount).toBe('800.00');
    expect(dados().originalAmount).toBeUndefined();
  });

  it('PAGA sem confirmação → rejeitada, sem tocar no banco', async () => {
    paga();
    const r = res();
    await installmentHandler({ method: 'PATCH', query: { id: ID }, body: { amount: '800,00' } }, r);
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toContain('já foi paga');
    expect(prismaMock.installment.update).not.toHaveBeenCalled();
  });

  it('PAGA com confirmação: grava originalAmount e NÃO toca paidAmount', async () => {
    paga();
    const r = res();
    await installmentHandler({
      method: 'PATCH', query: { id: ID },
      body: { amount: '800,00', confirmarEdicaoPaga: true },
    }, r);
    expect(r.statusCode).toBe(200);
    expect(dados().originalAmount).toBe('857.14'); // o valor de ANTES
    expect(dados().amount).toBe('800.00');
    // paidAmount intocado: é o que de fato entrou, e o "recebido no mês" o usa.
    expect(dados()).not.toHaveProperty('paidAmount');
  });

  it('2ª edição NÃO sobrescreve o originalAmount', async () => {
    paga({ amount: '800.00', originalAmount: '857.14' });
    const r = res();
    await installmentHandler({
      method: 'PATCH', query: { id: ID },
      body: { amount: '750,00', confirmarEdicaoPaga: true },
    }, r);
    expect(dados()).not.toHaveProperty('originalAmount'); // preservado
    expect(dados().amount).toBe('750.00');
  });

  it('confirmarEdicaoPaga não burla a validação de valor', async () => {
    paga();
    const r = res();
    await installmentHandler({
      method: 'PATCH', query: { id: ID },
      body: { amount: '0', confirmarEdicaoPaga: true },
    }, r);
    expect(r.statusCode).toBe(400);
  });

  it('body sem status nem valor → 400', async () => {
    pendente();
    const r = res();
    await installmentHandler({ method: 'PATCH', query: { id: ID }, body: {} }, r);
    expect(r.statusCode).toBe(400);
  });

  it('sem charge.update → 403 mesmo com confirmação', async () => {
    guardMock.ctx = naoPode;
    const r = res();
    await installmentHandler({
      method: 'PATCH', query: { id: ID },
      body: { amount: '800,00', confirmarEdicaoPaga: true },
    }, r);
    expect(r.statusCode).toBe(403);
  });
});

describe('serviceType (Fatia 2)', () => {
  it('POST aceita e grava o tipo de serviço', async () => {
    const r = res();
    await chargesHandler({ method: 'POST', query: {}, body: {
      payerName: 'F', description: 'D', totalAmount: '100,00',
      installments: 1, firstDueDate: '2026-09-10', serviceType: '  Ação trabalhista  ',
    } }, r);
    expect(r.statusCode).toBe(201);
    expect(prismaMock.charge.create.mock.calls[0][0].data.serviceType).toBe('Ação trabalhista');
  });

  it('POST sem serviceType grava null (retrocompatível)', async () => {
    const r = res();
    await chargesHandler({ method: 'POST', query: {}, body: {
      payerName: 'F', description: 'D', totalAmount: '100,00',
      installments: 1, firstDueDate: '2026-09-10',
    } }, r);
    expect(prismaMock.charge.create.mock.calls[0][0].data.serviceType).toBe(null);
  });

  it('PATCH /charges/[id] edita o tipo de serviço', async () => {
    prismaMock.charge.update.mockResolvedValue({ id: ID, serviceType: 'Consultoria' });
    const r = res();
    await chargeIdHandler({ method: 'PATCH', query: { id: ID }, body: { serviceType: 'Consultoria' } }, r);
    expect(r.statusCode).toBe(200);
    expect(prismaMock.charge.update.mock.calls[0][0].data.serviceType).toBe('Consultoria');
  });

  it('PATCH NÃO aceita totalAmount — o contratado é imutável', async () => {
    prismaMock.charge.update.mockResolvedValue({ id: ID });
    const r = res();
    await chargeIdHandler({ method: 'PATCH', query: { id: ID }, body: { totalAmount: '99,00' } }, r);
    expect(prismaMock.charge.update.mock.calls[0][0].data).not.toHaveProperty('totalAmount');
  });

  it('PATCH sem charge.update → 403', async () => {
    guardMock.ctx = naoPode;
    const r = res();
    await chargeIdHandler({ method: 'PATCH', query: { id: ID }, body: { serviceType: 'X' } }, r);
    expect(r.statusCode).toBe(403);
  });
});
