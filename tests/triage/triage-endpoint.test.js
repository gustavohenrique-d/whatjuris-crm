import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const { prismaMock, ctrlMock, idemMock } = vi.hoisted(() => ({
  prismaMock: {
    contact: { findFirst: vi.fn(), update: vi.fn() },
    deal: { findFirst: vi.fn(), update: vi.fn() },
  },
  ctrlMock: { isBlocked: vi.fn() },
  idemMock: { isDuplicate: vi.fn(), register: vi.fn() },
}));
prismaMock.$transaction = async (fn) => fn(prismaMock);

vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/conversations/control', () => ({
  isBlocked: ctrlMock.isBlocked,
  sanitizeInstance: (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
  sanitizeChatId: (s) => String(s || '').replace(/\D/g, ''),
}));
vi.mock('@/lib/webhooks/idempotency', () => ({ isDuplicate: idemMock.isDuplicate, register: idemMock.register }));
vi.mock('@/lib/activities/record', () => ({ recordAiAction: vi.fn() }));

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
  prismaMock.contact.findFirst.mockResolvedValue({ id: 'c1', name: 'Lead WhatsApp 9999' });
  prismaMock.deal.findFirst.mockResolvedValue({ id: 'd1', legalArea: null, urgencia: null, faseTriage: 'coletando_dados', qualifiedAt: null });
  prismaMock.deal.update.mockResolvedValue({ id: 'd1' });
  prismaMock.contact.update.mockResolvedValue({ id: 'c1' });
  ctrlMock.isBlocked.mockResolvedValue({ blocked: false, controlVersion: 0 });
  idemMock.isDuplicate.mockResolvedValue(false);
  idemMock.register.mockResolvedValue({ created: true });
});

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
