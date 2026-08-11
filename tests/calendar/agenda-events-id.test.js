import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, googleMock, notifMock, guardMock, funilMock } = vi.hoisted(() => ({
  prismaMock: {
    activity: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    organization: { findFirst: vi.fn() },
  },
  googleMock: { syncToGoogle: vi.fn(), deleteFromGoogle: vi.fn() },
  notifMock: { notificarRemarcacao: vi.fn(), notificarCancelamento: vi.fn() },
  funilMock: { voltarDeConsultaAgendada: vi.fn() },
  guardMock: { ctx: null },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/calendar/google', () => ({
  syncToGoogle: googleMock.syncToGoogle,
  deleteFromGoogle: googleMock.deleteFromGoogle,
}));
vi.mock('@/lib/whatsapp/notificar-agenda', () => ({
  notificarRemarcacao: notifMock.notificarRemarcacao,
  notificarCancelamento: notifMock.notificarCancelamento,
}));
vi.mock('@/lib/pipeline/mover-por-agenda', () => ({
  voltarDeConsultaAgendada: funilMock.voltarDeConsultaAgendada,
}));
vi.mock('@/lib/auth/guard', () => {
  class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  return {
    withAuth: (handler) => async (req, res) => {
      try {
        return await handler(req, res, guardMock.ctx);
      } catch (err) {
        return res.status(err.status || 500).json({ error: err.message });
      }
    },
    BadRequest: (m) => new HttpError(400, m),
    NotFound: (m) => new HttpError(404, m),
    Forbidden: (m) => new HttpError(403, m || 'Sem permissão.'),
  };
});

import handler from '@/pages/api/agenda/events/[id]';

const ID = 'act-1';
const DEAL_ID = 'f63bafc3-c9be-4172-b305-d8a371cd19a4';
const ANTIGO = new Date('2026-08-11T17:00:00.000Z'); // 11/08 14:00 BRT
const NOVO = new Date('2026-08-12T12:30:00.000Z');   // 12/08 09:30 BRT

function req(method, body = {}) { return { method, query: { id: ID }, body }; }
function res() {
  const r = { statusCode: 200, body: null, setHeader: () => {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  guardMock.ctx = { userId: 'u1', can: () => true };
  prismaMock.activity.findUnique.mockResolvedValue({
    id: ID, type: 'MEETING', title: 'Consulta', content: null,
    dueAt: ANTIGO, completedAt: null, metadata: { googleEventId: 'gcal-1' },
    userId: 'u1', dealId: DEAL_ID,
  });
  prismaMock.activity.update.mockImplementation(async ({ data }) => ({
    id: ID, type: 'MEETING', title: data.title ?? 'Consulta',
    dueAt: data.dueAt ?? ANTIGO, completedAt: null, metadata: { googleEventId: 'gcal-1' },
  }));
  prismaMock.activity.delete.mockResolvedValue({ id: ID });
  prismaMock.organization.findFirst.mockResolvedValue({ settings: { googleRefreshToken: 'rt' } });
  notifMock.notificarRemarcacao.mockResolvedValue({ sent: true });
  notifMock.notificarCancelamento.mockResolvedValue({ sent: true });
  funilMock.voltarDeConsultaAgendada.mockResolvedValue({ moved: true, de: 'consulta_agendada', para: 'qualificado' });
});

describe('PATCH /api/agenda/events/[id] — remarcação', () => {
  it('mudar o dueAt dispara notificarRemarcacao com o horário antigo', async () => {
    const r = res();
    await handler(req('PATCH', { dueAt: NOVO.toISOString() }), r);
    expect(r.statusCode).toBe(200);
    expect(notifMock.notificarRemarcacao).toHaveBeenCalledTimes(1);
    const arg = notifMock.notificarRemarcacao.mock.calls[0][0];
    expect(new Date(arg.dueAtAntigo).toISOString()).toBe(ANTIGO.toISOString());
    expect(new Date(arg.activity.dueAt).toISOString()).toBe(NOVO.toISOString());
    // dealId vem do findUnique — o update não o seleciona.
    expect(arg.activity.dealId).toBe(DEAL_ID);
  });

  it('mudar SÓ o título não notifica', async () => {
    const r = res();
    await handler(req('PATCH', { title: 'Novo título' }), r);
    expect(r.statusCode).toBe(200);
    expect(prismaMock.activity.update).toHaveBeenCalledTimes(1);
    expect(notifMock.notificarRemarcacao).not.toHaveBeenCalled();
  });

  it('reenviar o MESMO dueAt não notifica', async () => {
    const r = res();
    await handler(req('PATCH', { dueAt: ANTIGO.toISOString() }), r);
    expect(r.statusCode).toBe(200);
    expect(notifMock.notificarRemarcacao).not.toHaveBeenCalled();
  });

  it('marcar como concluído não notifica', async () => {
    const r = res();
    await handler(req('PATCH', { completedAt: new Date().toISOString() }), r);
    expect(notifMock.notificarRemarcacao).not.toHaveBeenCalled();
  });

  it('falha da notificação não derruba a resposta', async () => {
    notifMock.notificarRemarcacao.mockRejectedValue(new Error('boom'));
    const r = res();
    await handler(req('PATCH', { dueAt: NOVO.toISOString() }), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.event.id).toBe(ID);
  });
});

describe('DELETE /api/agenda/events/[id] — cancelamento', () => {
  it('notifica com os dados capturados antes do delete', async () => {
    const r = res();
    await handler(req('DELETE'), r);
    expect(r.statusCode).toBe(200);
    expect(prismaMock.activity.delete).toHaveBeenCalledTimes(1);
    expect(notifMock.notificarCancelamento).toHaveBeenCalledTimes(1);
    const arg = notifMock.notificarCancelamento.mock.calls[0][0];
    expect(arg.activity.dealId).toBe(DEAL_ID);
    expect(new Date(arg.activity.dueAt).toISOString()).toBe(ANTIGO.toISOString());
  });

  it('remove do Google antes de apagar', async () => {
    const r = res();
    await handler(req('DELETE'), r);
    expect(googleMock.deleteFromGoogle).toHaveBeenCalledWith('gcal-1', 'rt');
  });

  it('falha da notificação não derruba a resposta', async () => {
    notifMock.notificarCancelamento.mockRejectedValue(new Error('boom'));
    const r = res();
    await handler(req('DELETE'), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.message).toBe('Evento removido.');
  });

  it('devolve o resultado do funil na resposta (a UI precisa do motivo)', async () => {
    const r = res();
    await handler(req('DELETE'), r);
    expect(funilMock.voltarDeConsultaAgendada).toHaveBeenCalledWith({
      dealId: DEAL_ID, tipo: 'MEETING', userId: 'u1',
    });
    expect(r.body.funil).toEqual({ moved: true, de: 'consulta_agendada', para: 'qualificado' });
  });

  it('propaga o motivo do skip que a UI mostra', async () => {
    funilMock.voltarDeConsultaAgendada.mockResolvedValue({ skipped: true, motivo: 'outro_evento_futuro' });
    const r = res();
    await handler(req('DELETE'), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.funil.motivo).toBe('outro_evento_futuro');
  });

  it('movimento que lança NÃO derruba o cancelamento — 200 com funil null', async () => {
    funilMock.voltarDeConsultaAgendada.mockRejectedValue(new Error('banco fora'));
    const r = res();
    await handler(req('DELETE'), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.message).toBe('Evento removido.');
    expect(r.body.funil).toBeNull();
    expect(prismaMock.activity.delete).toHaveBeenCalledTimes(1); // o evento foi apagado mesmo assim
  });
});

describe('guardas do handler', () => {
  it('evento inexistente → 404 sem notificar', async () => {
    prismaMock.activity.findUnique.mockResolvedValue(null);
    const r = res();
    await handler(req('DELETE'), r);
    expect(r.statusCode).toBe(404);
    expect(notifMock.notificarCancelamento).not.toHaveBeenCalled();
  });

  it('não-autor sem activity.delete → 403 sem notificar', async () => {
    guardMock.ctx = { userId: 'outro', can: () => false };
    const r = res();
    await handler(req('PATCH', { dueAt: NOVO.toISOString() }), r);
    expect(r.statusCode).toBe(403);
    expect(prismaMock.activity.update).not.toHaveBeenCalled();
    expect(notifMock.notificarRemarcacao).not.toHaveBeenCalled();
  });
});
