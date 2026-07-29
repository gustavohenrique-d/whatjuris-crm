import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// ---- mocks (sem NextAuth/Prisma/Redis reais) ------------------------------
vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }));
vi.mock('@/pages/api/auth/[...nextauth]', () => ({ authOptions: {} }));
vi.mock('@/lib/webhooks/idempotency', () => ({ isDuplicate: vi.fn(), register: vi.fn() }));
vi.mock('@/lib/activities/record', () => ({ recordActivity: vi.fn() }));
vi.mock('@/lib/whatsapp/lead', () => ({
  findOrCreateContact: vi.fn(async () => ({ id: 'contact-1', name: 'Lead' })),
  findOrCreateDeal: vi.fn(async () => ({ id: 'deal-1', stage: { key: 'novo_contato' } })),
}));

import { getServerSession } from 'next-auth/next';
import { resolveConversationActor } from '@/lib/conversations/http-auth';
import messageHandler from '@/pages/api/internal/conversations/message';
import { isDuplicate, register } from '@/lib/webhooks/idempotency';
import { recordActivity } from '@/lib/activities/record';

function mockReq({ method = 'POST', headers = {}, body = {}, query = {} } = {}) {
  return { method, headers, body, query };
}
function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEBHOOK_SECRET = 'segredo-teste';
});

// ---------------------------------------------------------------------------
describe('resolveConversationActor (auth combinada)', () => {
  it('sem sessão e sem secret → 401', async () => {
    getServerSession.mockResolvedValue(null);
    const r = await resolveConversationActor(mockReq({ headers: {} }), mockRes(), { permission: 'conversation.takeover' });
    expect(r.error).toBe(401);
  });

  it('usuário SEM a permissão → 403 (caso 15)', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1' }, permissions: ['deal.read.own'] });
    const r = await resolveConversationActor(mockReq(), mockRes(), { permission: 'conversation.takeover' });
    expect(r.error).toBe(403);
  });

  it('usuário COM a permissão → autorizado', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1' }, permissions: ['conversation.takeover'] });
    const r = await resolveConversationActor(mockReq(), mockRes(), { permission: 'conversation.takeover' });
    expect(r).toMatchObject({ internal: false, userId: 'u1' });
  });

  it('n8n com x-webhook-secret válido → interno (sem sessão)', async () => {
    const r = await resolveConversationActor(
      mockReq({ headers: { 'x-webhook-secret': 'segredo-teste' } }), mockRes(),
      { permission: 'conversation.takeover' },
    );
    expect(r).toMatchObject({ internal: true });
    expect(getServerSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('POST /api/internal/conversations/message', () => {
  const auth = { 'x-webhook-secret': 'segredo-teste' };

  it('mensagem duplicada (mesmo message_id) → não duplica (caso 13)', async () => {
    isDuplicate.mockResolvedValue(true);
    const res = mockRes();
    await messageHandler(mockReq({
      headers: auth,
      body: { instance_name: 'x', chat_id: '5511999999999', message_id: 'wamid.DUP', message: 'oi', sender_origin: 'client' },
    }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ persisted: false, duplicate: true });
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it('mensagem nova → persiste com sender_origin', async () => {
    isDuplicate.mockResolvedValue(false);
    register.mockResolvedValue({ created: true });
    recordActivity.mockResolvedValue({ id: 'a1' });
    const res = mockRes();
    await messageHandler(mockReq({
      headers: auth,
      body: { instance_name: 'x', chat_id: '5511999999999', message_id: 'wamid.NEW', message: 'olá', sender_origin: 'human_mobile' },
    }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.persisted).toBe(true);
    expect(recordActivity).toHaveBeenCalledTimes(1);
    const arg = recordActivity.mock.calls[0][0];
    expect(arg.type).toBe('MESSAGE_OUT');
    expect(arg.metadata.senderOrigin).toBe('human_mobile');
  });

  it('sem secret → 401', async () => {
    const res = mockRes();
    await messageHandler(mockReq({ headers: {}, body: {} }), res);
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('workflow n8n modulo-02', () => {
  const raw = readFileSync(path.join(process.cwd(), 'workflows/modulo-02-human-takeover.json'), 'utf8');

  it('é JSON válido (caso 17)', () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('não contém segredos hardcoded (caso 16)', () => {
    // aceita apenas referências $env; nenhum valor real de token/senha
    expect(/sk-[A-Za-z0-9]/.test(raw)).toBe(false);
    expect(/Bearer\s+[A-Za-z0-9]/.test(raw)).toBe(false);
    expect(/"password"\s*:\s*"[^"]+"/.test(raw)).toBe(false);
    // auth via credencial Custom Auth no n8n — o header x-webhook-secret foi
    // removido dos nós, então o workflow não referencia mais o segredo.
    expect(raw.includes('WEBHOOK_SECRET')).toBe(false);
  });
});
