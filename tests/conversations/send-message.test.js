import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, ctrlMock, idemMock, recMock, sendMock } = vi.hoisted(() => ({
  prismaMock: {
    conversationControl: { findUnique: vi.fn() },
    contact: { findFirst: vi.fn() },
    deal: { findFirst: vi.fn() },
  },
  ctrlMock: { refreshTakeover: vi.fn() },
  idemMock: { isDuplicate: vi.fn(), register: vi.fn() },
  recMock: { recordActivity: vi.fn() },
  sendMock: { sendWhatsappMessage: vi.fn() },
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/conversations/control', () => ({
  refreshTakeover: ctrlMock.refreshTakeover,
  sanitizeInstance: (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
  sanitizeChatId: (s) => String(s || '').replace(/\D/g, ''),
}));
vi.mock('@/lib/webhooks/idempotency', () => ({ isDuplicate: idemMock.isDuplicate, register: idemMock.register }));
vi.mock('@/lib/activities/record', () => ({ recordActivity: recMock.recordActivity }));
vi.mock('@/lib/whatsapp/send', () => ({ sendWhatsappMessage: sendMock.sendWhatsappMessage }));

import { sendManualMessage } from '@/lib/conversations/send-manual';

const future = () => new Date(Date.now() + 3600 * 1000);
const args = (o = {}) => ({ instanceName: 'escritorio-principal', chatId: '5511999999999', userId: 'u1', userName: 'Ana', content: 'Olá', clientRequestId: 'req-1', canOverride: false, ...o });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.conversationControl.findUnique.mockResolvedValue({ mode: 'human', blockedUntil: future(), takenOverBy: 'u1' });
  prismaMock.contact.findFirst.mockResolvedValue({ id: 'c1' });
  prismaMock.deal.findFirst.mockResolvedValue({ id: 'd1' });
  idemMock.isDuplicate.mockResolvedValue(false);
  idemMock.register.mockResolvedValue({ created: true });
  recMock.recordActivity.mockResolvedValue({ id: 'a1' });
  sendMock.sendWhatsappMessage.mockResolvedValue({ sent: true, whatsappMessageId: 'wamid.M' });
  ctrlMock.refreshTakeover.mockResolvedValue({ mode: 'human' });
});

describe('sendManualMessage', () => {
  it('conversa não está em atendimento humano → 409 (casos 1, 3)', async () => {
    prismaMock.conversationControl.findUnique.mockResolvedValue({ mode: 'ai', blockedUntil: null, takenOverBy: null });
    await expect(sendManualMessage(args())).rejects.toMatchObject({ statusCode: 409 });
  });

  it('bloqueio expirado (não humano ativo) → 409', async () => {
    prismaMock.conversationControl.findUnique.mockResolvedValue({ mode: 'human', blockedUntil: new Date(Date.now() - 1000), takenOverBy: 'u1' });
    await expect(sendManualMessage(args())).rejects.toMatchObject({ statusCode: 409 });
  });

  it('usuário não é o responsável e sem override → 403 (caso 4)', async () => {
    prismaMock.conversationControl.findUnique.mockResolvedValue({ mode: 'human', blockedUntil: future(), takenOverBy: 'outro' });
    await expect(sendManualMessage(args({ userId: 'u1', canOverride: false }))).rejects.toMatchObject({ statusCode: 403 });
  });

  it('override permite responder conversa de outro atendente', async () => {
    prismaMock.conversationControl.findUnique.mockResolvedValue({ mode: 'human', blockedUntil: future(), takenOverBy: 'outro' });
    const r = await sendManualMessage(args({ canOverride: true }));
    expect(r.status).toBe('sent');
  });

  it('sucesso: envia, grava atividade humano/crm_human e renova TTL (casos 2, 6)', async () => {
    const r = await sendManualMessage(args());
    expect(sendMock.sendWhatsappMessage).toHaveBeenCalledWith(expect.objectContaining({ to: '5511999999999', text: 'Olá' }));
    // atividade como humano
    const act = recMock.recordActivity.mock.calls[0][0];
    expect(act.type).toBe('MESSAGE_OUT');
    expect(act.actorType).toBe('USER');
    expect(act.metadata.senderOrigin).toBe('crm_human');
    // renova o TTL do takeover
    expect(ctrlMock.refreshTakeover).toHaveBeenCalled();
    expect(r).toMatchObject({ message_id: 'wamid.M', status: 'sent' });
  });

  it('idempotente por client_request_id → não reenvia (caso 1)', async () => {
    idemMock.isDuplicate.mockResolvedValue(true);
    const r = await sendManualMessage(args());
    expect(r).toMatchObject({ idempotent: true, status: 'sent' });
    expect(sendMock.sendWhatsappMessage).not.toHaveBeenCalled();
    expect(recMock.recordActivity).not.toHaveBeenCalled();
  });

  it('send.js sem credencial (skipped) → status skipped mas grava atividade', async () => {
    sendMock.sendWhatsappMessage.mockResolvedValue({ skipped: true });
    const r = await sendManualMessage(args());
    expect(r.status).toBe('skipped');
    expect(recMock.recordActivity).toHaveBeenCalled();
  });
});
