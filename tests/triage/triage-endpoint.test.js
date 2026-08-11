import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const { prismaMock, ctrlMock, idemMock, notifyMock, recordMock } = vi.hoisted(() => ({
  prismaMock: {
    contact: { findFirst: vi.fn(), update: vi.fn() },
    deal: { findFirst: vi.fn(), update: vi.fn() },
    activity: { findFirst: vi.fn() },
  },
  ctrlMock: { isBlocked: vi.fn() },
  idemMock: { isDuplicate: vi.fn(), register: vi.fn() },
  notifyMock: { notifyLawyer: vi.fn() },
  recordMock: { recordAiAction: vi.fn() },
}));
prismaMock.$transaction = async (fn) => fn(prismaMock);

vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/conversations/control', () => ({
  isBlocked: ctrlMock.isBlocked,
  sanitizeInstance: (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
  sanitizeChatId: (s) => String(s || '').replace(/\D/g, ''),
}));
vi.mock('@/lib/webhooks/idempotency', () => ({ isDuplicate: idemMock.isDuplicate, register: idemMock.register }));
vi.mock('@/lib/activities/record', () => ({ recordAiAction: recordMock.recordAiAction }));
vi.mock('@/lib/notifications/lawyer', () => ({ notifyLawyer: notifyMock.notifyLawyer }));

import triageHandler from '@/pages/api/internal/deals/triage';
import { sessionKey } from '@/lib/triage/session';

const SECRET = 'segredo-teste';
function req(body) { return { method: 'POST', headers: { 'x-webhook-secret': SECRET }, body }; }
function res() {
  const r = { statusCode: 200, body: null, setHeader: () => {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const goodBody = (over = {}) => ({
  instance_name: 'escritorio-principal', chat_id: '5511999999999', source_message_id: 'wamid.T1',
  expected_control_version: 0,
  dados_extraidos: { nome: 'João da Silva', area: 'Trabalhista', resumo_caso: 'Demissão sem verbas rescisórias.', urgencia: 'Média' },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEBHOOK_SECRET = SECRET;
  process.env.NEXTAUTH_URL = 'https://crm.exemplo.com';
  prismaMock.contact.findFirst.mockResolvedValue({ id: 'c1', name: 'Lead WhatsApp 9999' });
  prismaMock.deal.findFirst.mockResolvedValue({ id: 'd1', legalArea: null, urgencia: null, faseTriage: 'coletando_dados', qualifiedAt: null });
  prismaMock.deal.update.mockResolvedValue({ id: 'd1' });
  prismaMock.contact.update.mockResolvedValue({ id: 'c1' });
  ctrlMock.isBlocked.mockResolvedValue({ blocked: false, controlVersion: 0 });
  idemMock.isDuplicate.mockResolvedValue(false);
  idemMock.register.mockResolvedValue({ created: true });
  notifyMock.notifyLawyer.mockResolvedValue({ email: true, whatsapp: false });
  prismaMock.activity.findFirst.mockResolvedValue(null); // sem compromisso futuro, sem aviso recente
  recordMock.recordAiAction.mockResolvedValue({ id: 'a1' });
});

// O aviso de agendamento consulta o banco antes de notificar e roda solto
// (sem await no handler) — sem ceder o event loop, o mock ainda não foi chamado.
const flush = () => new Promise((r) => setTimeout(r, 0));

// Extrai o payload do notifyLawyer disparado para um evento, ou undefined.
function notificacao(evento) {
  const call = notifyMock.notifyLawyer.mock.calls.find((c) => c[0].event === evento);
  return call?.[0];
}

describe('POST /api/internal/deals/triage', () => {
  it('sem secret → 401', async () => {
    const r = res();
    await triageHandler({ method: 'POST', headers: {}, body: {} }, r);
    expect(r.statusCode).toBe(401);
  });

  it('qualificado → atualiza deal (legalArea minúsculo, urgencia, qualified_at) e contato', async () => {
    const r = res();
    await triageHandler(req(goodBody()), r);
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ updated: true, lead_qualificado: true, fase_triagem: 'qualificado' });
    const data = prismaMock.deal.update.mock.calls[0][0].data;
    expect(data.legalArea).toBe('trabalhista');
    expect(data.urgencia).toBe('Média');
    expect(data.qualifiedAt).toBeInstanceOf(Date);
    // nome placeholder → atualiza contato
    expect(prismaMock.contact.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { name: 'João da Silva' } });
  });

  it('Human Takeover ativo → 409 (caso 10)', async () => {
    ctrlMock.isBlocked.mockResolvedValue({ blocked: true, controlVersion: 2 });
    const r = res();
    await triageHandler(req(goodBody()), r);
    expect(r.statusCode).toBe(409);
    expect(r.body.error).toBe('HUMAN_TAKEOVER_ACTIVE');
  });

  it('control_version diferente → 409 STALE (caso 11)', async () => {
    ctrlMock.isBlocked.mockResolvedValue({ blocked: false, controlVersion: 5 });
    const r = res();
    await triageHandler(req(goodBody({ expected_control_version: 13 })), r);
    expect(r.statusCode).toBe(409);
    expect(r.body.error).toBe('STALE_CONTROL_VERSION');
  });

  it('source_message_id duplicado → idempotente (caso 12)', async () => {
    idemMock.isDuplicate.mockResolvedValue(true);
    const r = res();
    await triageHandler(req(goodBody()), r);
    expect(r.body).toMatchObject({ updated: false, idempotent: true });
    expect(prismaMock.deal.update).not.toHaveBeenCalled();
  });

  it('null não apaga dado válido existente (caso 13)', async () => {
    // area null (não coletada) → não deve incluir legalArea no update
    const r = res();
    await triageHandler(req(goodBody({ dados_extraidos: { nome: null, area: null, resumo_caso: null, urgencia: 'Alta' } })), r);
    const data = prismaMock.deal.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('legalArea'); // não sobrescreve com null
    expect(data.urgencia).toBe('Alta');
    // não qualificado → sem qualified_at
    expect(data).not.toHaveProperty('qualifiedAt');
    expect(prismaMock.contact.update).not.toHaveBeenCalled(); // sem nome, não toca no contato
  });
});

describe('POST /api/internal/deals/triage — notificação de descarte', () => {
  // Lead incompleto: não qualifica, então respeita o 'desqualificado' da LLM.
  const descarte = (over = {}) => goodBody({
    fase_triagem: 'desqualificado',
    dados_extraidos: { nome: 'Carlos Souza', area: null, resumo_caso: null, urgencia: null },
    ...over,
  });

  it('coletando_dados → desqualificado notifica o advogado com o motivo', async () => {
    const r = res();
    await triageHandler(req(descarte({ motivo_desqualificacao: 'Fora das áreas de atuação.' })), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.fase_triagem).toBe('desqualificado');
    expect(notificacao('lead_disqualified')).toMatchObject({
      data: { name: 'Carlos Souza', whatsapp: '5511999999999', motivo: 'Fora das áreas de atuação.' },
    });
  });

  it('sem motivo explícito, cai no resumo_caso', async () => {
    const r = res();
    await triageHandler(req(descarte({
      dados_extraidos: { nome: 'Carlos Souza', area: null, resumo_caso: 'Cliente já tem advogado.', urgencia: null },
    })), r);
    expect(notificacao('lead_disqualified').data.motivo).toBe('Cliente já tem advogado.');
  });

  it('sem motivo e sem resumo, usa texto padrão', async () => {
    const r = res();
    await triageHandler(req(descarte()), r);
    expect(notificacao('lead_disqualified').data.motivo).toBe('Não informado pelo agente');
  });

  it('deal JÁ desqualificado → não notifica de novo', async () => {
    prismaMock.deal.findFirst.mockResolvedValue({
      id: 'd1', legalArea: null, urgencia: null, faseTriage: 'desqualificado', qualifiedAt: null,
    });
    const r = res();
    await triageHandler(req(descarte({ source_message_id: 'wamid.T2' })), r);
    expect(r.statusCode).toBe(200);
    expect(notificacao('lead_disqualified')).toBeUndefined();
  });

  it('qualificado continua notificando lead_qualified e não dispara descarte', async () => {
    const r = res();
    await triageHandler(req(goodBody()), r);
    expect(notificacao('lead_qualified')).toMatchObject({ data: { name: 'João da Silva', area: 'trabalhista' } });
    expect(notificacao('lead_disqualified')).toBeUndefined();
  });

  it('falha na notificação não derruba a resposta', async () => {
    notifyMock.notifyLawyer.mockRejectedValue(new Error('resend fora do ar'));
    const r = res();
    await triageHandler(req(descarte()), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.updated).toBe(true);
  });
});

describe('pedido de agendamento → avisa o advogado', () => {
  // Lead qualificado numa rodada ANTERIOR que volta só dizendo "quero marcar":
  // dados_extraidos vem vazio, então o `qualified` recalculado é false.
  const jaQualificado = (over = {}) => ({
    id: 'd1', legalArea: 'trabalhista', urgencia: 'Média',
    faseTriage: 'qualificado', qualifiedAt: new Date('2026-08-01T12:00:00Z'), ...over,
  });
  const soPedido = (over = {}) => goodBody({
    source_message_id: 'wamid.AG1',
    pediu_agendamento: true,
    dados_extraidos: { nome: null, area: null, resumo_caso: null, urgencia: null },
    ...over,
  });

  it('lead já qualificado que só pede para marcar → notifica (sem a guarda de 1ª qualificação)', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(jaQualificado());
    const r = res();
    await triageHandler(req(soPedido()), r);
    await flush();
    expect(r.statusCode).toBe(200);
    const n = notificacao('lead_wants_appointment');
    expect(n).toBeDefined();
    expect(n.data.name).toBe('Lead WhatsApp 9999');
    expect(n.data.area).toBe('trabalhista');
    expect(n.data.dealUrl).toContain('/admin/deals/d1');
  });

  it('qualifica e pede agendamento no mesmo turno → dispara os dois eventos', async () => {
    const r = res();
    await triageHandler(req(goodBody({ pediu_agendamento: true })), r);
    await flush();
    expect(notificacao('lead_qualified')).toBeDefined();
    expect(notificacao('lead_wants_appointment')).toBeDefined();
  });

  it('registra a marcação na timeline para servir de dedupe', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(jaQualificado());
    const r = res();
    await triageHandler(req(soPedido()), r);
    await flush();
    const call = recordMock.recordAiAction.mock.calls
      .find((c) => c[0].metadata?.evento === 'lead_wants_appointment');
    expect(call).toBeDefined();
    expect(call[0].dealId).toBe('d1');
    expect(call[0].title).toBe('Lead pediu agendamento');
  });

  it('já existe compromisso futuro → não notifica', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(jaQualificado());
    prismaMock.activity.findFirst.mockResolvedValue({ id: 'ev-futuro' });
    const r = res();
    await triageHandler(req(soPedido()), r);
    await flush();
    expect(notificacao('lead_wants_appointment')).toBeUndefined();
    expect(recordMock.recordAiAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Lead pediu agendamento' }),
    );
  });

  it('aviso recente dentro da janela → não notifica de novo', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(jaQualificado());
    // 1ª consulta (compromisso futuro) = null; 2ª (aviso recente) = achou.
    prismaMock.activity.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'aviso-anterior' });
    const r = res();
    await triageHandler(req(soPedido()), r);
    await flush();
    expect(notificacao('lead_wants_appointment')).toBeUndefined();
  });

  it('lead ainda em coleta que pede agendamento → não notifica', async () => {
    prismaMock.deal.findFirst.mockResolvedValue({
      id: 'd1', legalArea: null, urgencia: null, faseTriage: 'coletando_dados', qualifiedAt: null,
    });
    const r = res();
    await triageHandler(req(soPedido()), r);
    await flush();
    expect(notificacao('lead_wants_appointment')).toBeUndefined();
  });

  it('sem pediu_agendamento → não notifica', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(jaQualificado());
    const r = res();
    await triageHandler(req(goodBody({ source_message_id: 'wamid.AG9' })), r);
    await flush();
    expect(notificacao('lead_wants_appointment')).toBeUndefined();
  });

  it('falha no aviso não derruba a resposta', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(jaQualificado());
    prismaMock.activity.findFirst.mockRejectedValue(new Error('banco fora'));
    const r = res();
    await triageHandler(req(soPedido()), r);
    await flush();
    expect(r.statusCode).toBe(200);
    expect(r.body.updated).toBe(true);
  });
});

describe('sessionKey (caso 14 — memória isolada)', () => {
  it('sessões diferentes → chaves diferentes', () => {
    expect(sessionKey('escritorio-principal', '5511999999999')).toBe('chat:v1:escritorio-principal:5511999999999');
    expect(sessionKey('inst', '5511')).not.toBe(sessionKey('inst', '5522'));
    expect(sessionKey('inst-a', '5511')).not.toBe(sessionKey('inst-b', '5511'));
  });
});

describe('workflow n8n modulo-04', () => {
  const raw = readFileSync(path.join(process.cwd(), 'workflows/modulo-04-agente-triagem-juridica.json'), 'utf8');
  it('é JSON válido (caso 16)', () => { expect(() => JSON.parse(raw)).not.toThrow(); });
  it('não contém segredos hardcoded (caso 15)', () => {
    expect(/sk-[A-Za-z0-9]{6}/.test(raw)).toBe(false);
    expect(/Bearer\s+[A-Za-z0-9]{6}/.test(raw)).toBe(false);
    expect(/"password"\s*:\s*"[^"]+"/.test(raw)).toBe(false);
  });
});
