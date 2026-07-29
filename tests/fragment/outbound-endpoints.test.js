import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const { prismaMock, ctrlMock, recMock, regMock } = vi.hoisted(() => ({
  prismaMock: {
    outboundMessageFragment: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    contact: { findFirst: vi.fn() },
    deal: { findFirst: vi.fn() },
  },
  ctrlMock: { isBlocked: vi.fn() },
  recMock: { recordWhatsappMessage: vi.fn() },
  regMock: { registerOutboundAI: vi.fn() },
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/conversations/control', () => ({
  isBlocked: ctrlMock.isBlocked,
  sanitizeInstance: (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
  sanitizeChatId: (s) => String(s || '').replace(/\D/g, ''),
}));
vi.mock('@/lib/activities/record', () => ({ recordWhatsappMessage: recMock.recordWhatsappMessage }));
vi.mock('@/lib/whatsapp/outbound-registry', () => ({ registerOutboundAI: regMock.registerOutboundAI }));

import reserveHandler from '@/pages/api/internal/outbound-fragments/reserve';
import cancelHandler from '@/pages/api/internal/outbound-fragments/cancel-remaining';
import confirmHandler from '@/pages/api/internal/outbound-fragments/[reservation_id]/confirm';

const SECRET = 'segredo-teste';
function req({ headers = {}, body = {}, query = {} } = {}) {
  return { method: 'POST', headers: { 'x-webhook-secret': SECRET, ...headers }, body, query };
}
function res() {
  const r = { statusCode: 200, body: null, setHeader: () => {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const reserveBody = (o = {}) => ({
  instance_name: 'inst', chat_id: '5511999999999', response_id: 'r1', source_message_id: 'wamid.O',
  fragment_id: 'r1:0', fragment_index: 0, fragment_total: 2, content: 'Olá.', expected_control_version: 0, ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEBHOOK_SECRET = SECRET;
  ctrlMock.isBlocked.mockResolvedValue({ blocked: false, controlVersion: 0 });
  prismaMock.contact.findFirst.mockResolvedValue({ id: 'c1' });
  prismaMock.deal.findFirst.mockResolvedValue({ id: 'd1' });
});

describe('POST /reserve', () => {
  it('sem secret → 401', async () => {
    const r = res(); await reserveHandler(req({ headers: { 'x-webhook-secret': 'x' } }), r);
    expect(r.statusCode).toBe(401);
  });

  it('novo fragmento → should_send true', async () => {
    prismaMock.outboundMessageFragment.create.mockResolvedValue({ id: 'f1', status: 'reserved' });
    const r = res(); await reserveHandler(req({ body: reserveBody() }), r);
    expect(r.body).toMatchObject({ should_send: true, reservation_id: 'f1', status: 'reserved' });
  });

  it('Human Takeover → 409 (caso 25)', async () => {
    ctrlMock.isBlocked.mockResolvedValue({ blocked: true, controlVersion: 1 });
    const r = res(); await reserveHandler(req({ body: reserveBody() }), r);
    expect(r.statusCode).toBe(409);
    expect(r.body.error).toBe('HUMAN_TAKEOVER_ACTIVE');
  });

  it('control_version diferente → 409 (caso 27)', async () => {
    ctrlMock.isBlocked.mockResolvedValue({ blocked: false, controlVersion: 7 });
    const r = res(); await reserveHandler(req({ body: reserveBody({ expected_control_version: 13 }) }), r);
    expect(r.statusCode).toBe(409);
    expect(r.body.error).toBe('STALE_CONTROL_VERSION');
  });

  it('já enviado (P2002 + status sent) → should_send false (casos 8, 24)', async () => {
    const e = new Error('dup'); e.code = 'P2002';
    prismaMock.outboundMessageFragment.create.mockRejectedValue(e);
    prismaMock.outboundMessageFragment.findUnique.mockResolvedValue({ id: 'f1', status: 'sent', metaMessageId: 'wamid.X' });
    const r = res(); await reserveHandler(req({ body: reserveBody() }), r);
    expect(r.body).toMatchObject({ should_send: false, status: 'sent', meta_message_id: 'wamid.X' });
  });

  it('já reservado mas não enviado (P2002 + reserved) → should_send true (retry)', async () => {
    const e = new Error('dup'); e.code = 'P2002';
    prismaMock.outboundMessageFragment.create.mockRejectedValue(e);
    prismaMock.outboundMessageFragment.findUnique.mockResolvedValue({ id: 'f1', status: 'reserved', metaMessageId: null });
    const r = res(); await reserveHandler(req({ body: reserveBody() }), r);
    expect(r.body.should_send).toBe(true);
  });
});

describe('POST /[reservation_id]/confirm', () => {
  it('confirma: status sent + recordWhatsappMessage(ia) + registerOutboundAI (casos 10, 11)', async () => {
    prismaMock.outboundMessageFragment.findUnique.mockResolvedValue({ id: 'f1', dealId: 'd1', status: 'reserved' });
    prismaMock.outboundMessageFragment.update.mockResolvedValue({ id: 'f1' });
    prismaMock.contact.findFirst.mockResolvedValue({ id: 'c1' });
    const r = res();
    await confirmHandler(req({
      query: { reservation_id: 'f1' },
      body: { meta_message_id: 'wamid.SENT', chat_id: '5511999999999', instance_name: 'inst', content: 'Olá.' },
    }), r);
    expect(r.body).toMatchObject({ confirmed: true, meta_message_id: 'wamid.SENT' });
    expect(prismaMock.outboundMessageFragment.update.mock.calls[0][0].data.status).toBe('sent');
    expect(recMock.recordWhatsappMessage).toHaveBeenCalledWith(expect.objectContaining({ direction: 'out', whatsappMessageId: 'wamid.SENT' }));
    expect(regMock.registerOutboundAI).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'wamid.SENT' }));
  });

  it('já confirmado → idempotente, não regrava', async () => {
    prismaMock.outboundMessageFragment.findUnique.mockResolvedValue({ id: 'f1', dealId: 'd1', status: 'sent' });
    const r = res();
    await confirmHandler(req({ query: { reservation_id: 'f1' }, body: { meta_message_id: 'wamid.X', chat_id: '5511', instance_name: 'inst' } }), r);
    expect(r.body).toMatchObject({ confirmed: true, already: true });
    expect(recMock.recordWhatsappMessage).not.toHaveBeenCalled();
  });
});

describe('POST /cancel-remaining', () => {
  it('cancela fragmentos a partir do índice (caso 26)', async () => {
    prismaMock.outboundMessageFragment.updateMany.mockResolvedValue({ count: 2 });
    const r = res();
    await cancelHandler(req({ body: { instance_name: 'inst', chat_id: '5511', response_id: 'r1', from_index: 1, reason: 'human_takeover' } }), r);
    expect(r.body).toEqual({ cancelled: 2 });
    const where = prismaMock.outboundMessageFragment.updateMany.mock.calls[0][0].where;
    expect(where.fragmentIndex).toEqual({ gte: 1 });
    expect(where.status).toEqual({ notIn: ['sent', 'cancelled'] });
  });
});

describe('workflow n8n modulo-05', () => {
  const raw = readFileSync(path.join(process.cwd(), 'workflows/modulo-05-envio-humanizado-whatsapp.json'), 'utf8');
  it('é JSON válido (caso 31)', () => { expect(() => JSON.parse(raw)).not.toThrow(); });
  it('sem token/segredo hardcoded (caso 16)', () => {
    expect(/sk-[A-Za-z0-9]{6}/.test(raw)).toBe(false);
    expect(/Bearer\s+[A-Za-z0-9]{6}/.test(raw)).toBe(false);
    expect(/EAA[A-Za-z0-9]{6}/.test(raw)).toBe(false);
    expect(/"password"\s*:\s*"[^"]+"/.test(raw)).toBe(false);
  });
});
