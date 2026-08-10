import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, waMock, calendarMock } = vi.hoisted(() => ({
  prismaMock: {
    deal: { findFirst: vi.fn() },
    organization: { findFirst: vi.fn() },
  },
  waMock: { sendWhatsappMessage: vi.fn() },
  calendarMock: { createCalendarEvent: vi.fn() },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/whatsapp/send', () => ({ sendWhatsappMessage: waMock.sendWhatsappMessage }));
vi.mock('@/lib/calendar/create', () => ({ createCalendarEvent: calendarMock.createCalendarEvent }));
vi.mock('@/lib/activities/record', () => ({ recordAiAction: vi.fn() }));

import handler from '@/pages/api/internal/agent-action';

const SECRET = 'segredo-teste';
const DEAL_ID = '2015cf09-49c2-4753-aa2a-52b87791bedc';

function req(body) { return { method: 'POST', headers: { 'x-webhook-secret': SECRET }, body }; }
function res() {
  const r = { statusCode: 200, body: null, setHeader: () => {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

// Terça-feira, dentro do expediente (seg–sex 09:00–18:00).
const base = (over = {}) => ({
  action: 'schedule_appointment',
  dealId: DEAL_ID,
  agentName: 'Agente Agendador',
  data: '2099-08-11',
  hora: '14:00',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEBHOOK_SECRET = SECRET;
  prismaMock.deal.findFirst.mockResolvedValue({
    id: DEAL_ID, title: 'Lead: Carlos', stageId: 's1', status: 'OPEN', legalArea: 'trabalhista',
    stage: { key: 'qualificado', name: 'Qualificado' },
    contact: { id: 'c1', name: 'Carlos', whatsapp: '5513978015937' },
    owner: null,
  });
  prismaMock.organization.findFirst.mockResolvedValue({
    businessHours: {
      mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'],
      thu: ['09:00', '18:00'], fri: ['09:00', '18:00'], sat: null, sun: null,
    },
  });
  calendarMock.createCalendarEvent.mockResolvedValue({
    id: 'act-1', metadata: { googleEventId: 'gcal-123' },
  });
  waMock.sendWhatsappMessage.mockResolvedValue({ sent: true });
});

describe('schedule_appointment — notificarCliente', () => {
  it('default (ausente) envia a confirmação no WhatsApp', async () => {
    const r = res();
    await handler(req(base()), r);
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ scheduled: true, confirmacaoEnviada: true });
    expect(waMock.sendWhatsappMessage).toHaveBeenCalledTimes(1);
    expect(waMock.sendWhatsappMessage.mock.calls[0][0].text).toContain('✅ Consulta agendada para');
  });

  it('false NÃO envia, mas devolve dataFormatada para o M05 montar a mensagem', async () => {
    const r = res();
    await handler(req(base({ notificarCliente: false })), r);
    expect(r.statusCode).toBe(200);
    expect(waMock.sendWhatsappMessage).not.toHaveBeenCalled();
    expect(r.body.confirmacaoEnviada).toBe(false);
    expect(r.body.dataFormatada).toBe('11/08/2099 14:00');
    expect(r.body.scheduled).toBe(true);
  });

  it('dataFormatada vem em horário de Brasília, não UTC', async () => {
    const r = res();
    await handler(req(base({ notificarCliente: false })), r);
    // 14:00 BRT gravado como 17:00Z, exibido como 14:00
    expect(r.body.dueAt).toBe('2099-08-11T17:00:00.000Z');
    expect(r.body.dataFormatada).toContain('14:00');
  });

  it('o evento é criado independentemente do flag', async () => {
    const r = res();
    await handler(req(base({ notificarCliente: false })), r);
    expect(calendarMock.createCalendarEvent).toHaveBeenCalledTimes(1);
    const arg = calendarMock.createCalendarEvent.mock.calls[0][0];
    expect(arg.actorType).toBe('AI_AGENT');
    expect(arg.dealId).toBe(DEAL_ID);
    expect(r.body.googleEventId).toBe('gcal-123');
  });
});

describe('schedule_appointment — validações antes de criar', () => {
  it('fora do expediente → 400 e nada é criado', async () => {
    const r = res();
    await handler(req(base({ data: '2099-08-15' })), r); // sábado
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toContain('expediente');
    expect(calendarMock.createCalendarEvent).not.toHaveBeenCalled();
    expect(waMock.sendWhatsappMessage).not.toHaveBeenCalled();
  });

  it('data no passado → 400', async () => {
    const r = res();
    await handler(req(base({ data: '2020-08-11' })), r);
    expect(r.statusCode).toBe(400);
    expect(calendarMock.createCalendarEvent).not.toHaveBeenCalled();
  });

  it('data inexistente → 400 (sem rollover silencioso)', async () => {
    const r = res();
    await handler(req(base({ data: '2099-02-30' })), r);
    expect(r.statusCode).toBe(400);
    expect(calendarMock.createCalendarEvent).not.toHaveBeenCalled();
  });

  it('duracaoMin define o fim do evento', async () => {
    const r = res();
    await handler(req(base({ duracaoMin: 30, notificarCliente: false })), r);
    expect(r.body.dueAt).toBe('2099-08-11T17:00:00.000Z');
    expect(r.body.endAt).toBe('2099-08-11T17:30:00.000Z');
  });
});
