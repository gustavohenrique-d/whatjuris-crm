import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, waMock } = vi.hoisted(() => ({
  prismaMock: {
    deal: { findFirst: vi.fn() },
    organization: { findFirst: vi.fn() },
  },
  waMock: { sendWhatsappMessage: vi.fn() },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/whatsapp/send', () => ({ sendWhatsappMessage: waMock.sendWhatsappMessage }));

import {
  montarMensagemAgenda, notificarAgendamento,
  montarMensagemRemarcacao, notificarRemarcacao,
  montarMensagemCancelamento, notificarCancelamento,
} from '@/lib/whatsapp/notificar-agenda';

// 11/08/2026 14:00 em Brasília
const QUANDO = new Date('2026-08-11T17:00:00.000Z');
const DEAL_ID = 'f63bafc3-c9be-4172-b305-d8a371cd19a4';

const evento = (over = {}) => ({
  id: 'act-1', type: 'MEETING', dealId: DEAL_ID, dueAt: QUANDO, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.deal.findFirst.mockResolvedValue({
    contact: { id: 'c1', name: 'Gustavo', whatsapp: '5513978015937' },
  });
  prismaMock.organization.findFirst.mockResolvedValue({ name: 'Bezerra & Nabarrete' });
  waMock.sendWhatsappMessage.mockResolvedValue({ sent: true, whatsappMessageId: 'wamid.x' });
});

describe('montarMensagemAgenda — função pura', () => {
  const msg = montarMensagemAgenda({
    nome: 'Gustavo', orgName: 'Bezerra & Nabarrete', tipo: 'MEETING', dueAt: QUANDO,
  });

  it('traz o cabeçalho e o nome do cliente', () => {
    expect(msg).toContain('✅ *Consulta agendada!*');
    expect(msg).toContain('Olá, Gustavo!');
  });

  it('usa o nome do escritório vindo do banco', () => {
    expect(msg).toContain('escritório Bezerra & Nabarrete');
  });

  it('mostra data e hora em Brasília, não em UTC', () => {
    expect(msg).toContain('📅 Data: 11/08/2026');
    expect(msg).toContain('⏰ Horário: 14:00 (horário de Brasília)');
    expect(msg).not.toContain('17:00');
  });

  it('traduz o tipo do evento', () => {
    expect(msg).toContain('📋 Tipo: Reunião');
    expect(montarMensagemAgenda({ tipo: 'CALL', dueAt: QUANDO })).toContain('Tipo: Ligação');
    expect(montarMensagemAgenda({ tipo: 'HEARING', dueAt: QUANDO })).toContain('Tipo: Audiência');
  });

  it('aceita string ISO além de Date', () => {
    const m = montarMensagemAgenda({ nome: 'X', tipo: 'MEETING', dueAt: '2026-08-11T17:00:00.000Z' });
    expect(m).toContain('11/08/2026');
    expect(m).toContain('14:00');
  });

  it('fecha com o convite de contato', () => {
    expect(msg.trim().endsWith('Em caso de dúvidas, entre em contato conosco.')).toBe(true);
  });
});

describe('notificarAgendamento — quando NÃO envia', () => {
  it('evento sem dealId', async () => {
    const r = await notificarAgendamento({ activity: evento({ dealId: null }) });
    expect(r).toMatchObject({ skipped: true, motivo: 'sem_deal' });
    expect(waMock.sendWhatsappMessage).not.toHaveBeenCalled();
    expect(prismaMock.deal.findFirst).not.toHaveBeenCalled();
  });

  it('tipo TASK (compromisso interno)', async () => {
    const r = await notificarAgendamento({ activity: evento({ type: 'TASK' }) });
    expect(r).toMatchObject({ skipped: true, motivo: 'tipo_interno' });
    expect(waMock.sendWhatsappMessage).not.toHaveBeenCalled();
  });

  it('contato sem WhatsApp', async () => {
    prismaMock.deal.findFirst.mockResolvedValue({ contact: { id: 'c1', name: 'X', whatsapp: null } });
    const r = await notificarAgendamento({ activity: evento() });
    expect(r).toMatchObject({ skipped: true, motivo: 'sem_whatsapp' });
    expect(waMock.sendWhatsappMessage).not.toHaveBeenCalled();
  });

  it('deal inexistente não quebra', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(null);
    const r = await notificarAgendamento({ activity: evento() });
    expect(r.skipped).toBe(true);
  });

  it('sem credenciais WhatsApp', async () => {
    waMock.sendWhatsappMessage.mockResolvedValue({ skipped: true });
    const r = await notificarAgendamento({ activity: evento() });
    expect(r).toMatchObject({ skipped: true, motivo: 'sem_credenciais' });
  });
});

describe('notificarAgendamento — quando envia', () => {
  it('manda para o número do contato, com dealId e contactId', async () => {
    const r = await notificarAgendamento({ activity: evento() });
    expect(r).toEqual({ sent: true });
    expect(waMock.sendWhatsappMessage).toHaveBeenCalledTimes(1);
    const arg = waMock.sendWhatsappMessage.mock.calls[0][0];
    expect(arg.to).toBe('5513978015937');
    expect(arg.dealId).toBe(DEAL_ID);
    expect(arg.contactId).toBe('c1');
    expect(arg.text).toContain('Consulta agendada!');
    expect(arg.text).toContain('11/08/2026');
  });

  it('aceita dealId por parâmetro quando a activity não tem', async () => {
    const r = await notificarAgendamento({ activity: evento({ dealId: null }), dealId: DEAL_ID });
    expect(r).toEqual({ sent: true });
  });

  it('falha do WhatsApp NÃO propaga exceção', async () => {
    waMock.sendWhatsappMessage.mockRejectedValue(new Error('Meta fora do ar'));
    const r = await notificarAgendamento({ activity: evento() });
    expect(r).toMatchObject({ skipped: true, motivo: 'erro_envio' });
    expect(r.erro).toBe('Meta fora do ar');
  });
});

// 12/08/2026 09:30 em Brasília — o novo horário nos testes de remarcação.
const NOVO = new Date('2026-08-12T12:30:00.000Z');

describe('montarMensagemRemarcacao — função pura', () => {
  const msg = montarMensagemRemarcacao({
    nome: 'Gustavo', orgName: 'Bezerra & Nabarrete', tipo: 'MEETING',
    dueAtAntigo: QUANDO, dueAtNovo: NOVO,
  });

  it('identifica a mudança e o cliente', () => {
    expect(msg).toContain('🔄 *Consulta remarcada*');
    expect(msg).toContain('Olá, Gustavo!');
    expect(msg).toContain('escritório Bezerra & Nabarrete');
  });

  it('mostra o horário antigo E o novo, ambos em Brasília', () => {
    expect(msg).toContain('❌ Antes: 11/08/2026 às 14:00');
    expect(msg).toContain('✅ Agora: 12/08/2026 às 09:30');
    expect(msg).not.toContain('17:00');
    expect(msg).not.toContain('12:30');
  });

  it('usa o rótulo do tipo em minúscula na frase', () => {
    expect(msg).toContain('Sua reunião com o escritório');
    expect(montarMensagemRemarcacao({ tipo: 'HEARING', dueAtAntigo: QUANDO, dueAtNovo: NOVO }))
      .toContain('Sua audiência com');
  });
});

describe('montarMensagemCancelamento — função pura', () => {
  const msg = montarMensagemCancelamento({
    nome: 'Gustavo', orgName: 'Bezerra & Nabarrete', tipo: 'CALL', dueAt: QUANDO,
  });

  it('avisa do cancelamento com o horário que valia', () => {
    expect(msg).toContain('❌ *Consulta cancelada*');
    expect(msg).toContain('Sua ligação com o escritório Bezerra & Nabarrete');
    expect(msg).toContain('marcada para 11/08/2026 às 14:00 foi cancelada');
  });

  it('promete retorno em vez do rodapé padrão', () => {
    expect(msg.trim().endsWith('Entraremos em contato para remarcar.')).toBe(true);
  });
});

describe('notificarRemarcacao', () => {
  it('envia com o texto de remarcação', async () => {
    const r = await notificarRemarcacao({
      activity: evento({ dueAt: NOVO }), dueAtAntigo: QUANDO,
    });
    expect(r).toEqual({ sent: true });
    const arg = waMock.sendWhatsappMessage.mock.calls[0][0];
    expect(arg.to).toBe('5513978015937');
    expect(arg.text).toContain('remarcada');
    expect(arg.text).toContain('11/08/2026 às 14:00');
    expect(arg.text).toContain('12/08/2026 às 09:30');
  });

  it('sem horário antigo não envia', async () => {
    const r = await notificarRemarcacao({ activity: evento({ dueAt: NOVO }), dueAtAntigo: null });
    expect(r).toMatchObject({ skipped: true, motivo: 'sem_horario_antigo' });
    expect(waMock.sendWhatsappMessage).not.toHaveBeenCalled();
  });

  it('respeita as mesmas guardas da criação', async () => {
    const semDeal = await notificarRemarcacao({ activity: evento({ dealId: null, dueAt: NOVO }), dueAtAntigo: QUANDO });
    expect(semDeal).toMatchObject({ skipped: true, motivo: 'sem_deal' });

    const task = await notificarRemarcacao({ activity: evento({ type: 'TASK', dueAt: NOVO }), dueAtAntigo: QUANDO });
    expect(task).toMatchObject({ skipped: true, motivo: 'tipo_interno' });

    prismaMock.deal.findFirst.mockResolvedValue({ contact: { id: 'c1', name: 'X', whatsapp: null } });
    const semZap = await notificarRemarcacao({ activity: evento({ dueAt: NOVO }), dueAtAntigo: QUANDO });
    expect(semZap).toMatchObject({ skipped: true, motivo: 'sem_whatsapp' });

    expect(waMock.sendWhatsappMessage).not.toHaveBeenCalled();
  });

  it('falha do WhatsApp NÃO propaga', async () => {
    waMock.sendWhatsappMessage.mockRejectedValue(new Error('Meta fora do ar'));
    const r = await notificarRemarcacao({ activity: evento({ dueAt: NOVO }), dueAtAntigo: QUANDO });
    expect(r).toMatchObject({ skipped: true, motivo: 'erro_envio' });
  });
});

describe('notificarCancelamento', () => {
  it('envia com o texto de cancelamento', async () => {
    const r = await notificarCancelamento({ activity: evento() });
    expect(r).toEqual({ sent: true });
    const arg = waMock.sendWhatsappMessage.mock.calls[0][0];
    expect(arg.text).toContain('cancelada');
    expect(arg.text).toContain('11/08/2026 às 14:00');
    expect(arg.dealId).toBe(DEAL_ID);
  });

  it('respeita as mesmas guardas da criação', async () => {
    const semDeal = await notificarCancelamento({ activity: evento({ dealId: null }) });
    expect(semDeal).toMatchObject({ skipped: true, motivo: 'sem_deal' });

    const task = await notificarCancelamento({ activity: evento({ type: 'TASK' }) });
    expect(task).toMatchObject({ skipped: true, motivo: 'tipo_interno' });

    expect(waMock.sendWhatsappMessage).not.toHaveBeenCalled();
  });

  it('falha do WhatsApp NÃO propaga', async () => {
    waMock.sendWhatsappMessage.mockRejectedValue(new Error('rate limit'));
    const r = await notificarCancelamento({ activity: evento() });
    expect(r).toMatchObject({ skipped: true, motivo: 'erro_envio', erro: 'rate limit' });
  });
});
