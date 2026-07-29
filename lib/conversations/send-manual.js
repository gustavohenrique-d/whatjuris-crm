// =============================================================================
// WhatJuris CRM — Envio manual de mensagem pelo atendente (Módulo 6)
// lib/conversations/send-manual.js
//
// Só permite enviar quando a conversa está em atendimento humano (mode=human) e
// o usuário é o responsável (ou tem override). Envia pela Meta, grava a
// atividade como humano (crm_human) e renova o TTL do takeover. Idempotente.
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { Conflict, Forbidden } from '@/lib/auth/guard';
import { sanitizeInstance, sanitizeChatId, refreshTakeover } from '@/lib/conversations/control';
import { isDuplicate, register } from '@/lib/webhooks/idempotency';
import { recordActivity } from '@/lib/activities/record';
import { sendWhatsappMessage } from '@/lib/whatsapp/send';

export async function sendManualMessage({ instanceName, chatId, userId, userName, content, clientRequestId, canOverride = false }) {
  const inst = sanitizeInstance(instanceName);
  const chat = sanitizeChatId(chatId);
  const now = new Date();

  // 1. A conversa precisa estar em atendimento humano ativo.
  const control = await prisma.conversationControl.findUnique({
    where: { instanceName_chatId: { instanceName: inst, chatId: chat } },
    select: { mode: true, blockedUntil: true, takenOverBy: true },
  });
  const human = control && control.mode === 'human' && control.blockedUntil && control.blockedUntil > now;
  if (!human) throw Conflict('A conversa não está em atendimento humano.');

  // 2. Responsável (ou override — perfis com visão ampla).
  if (control.takenOverBy && control.takenOverBy !== userId && !canOverride) {
    throw Forbidden('Apenas o atendente responsável pode enviar mensagens nesta conversa.');
  }

  // 3. Idempotência por client_request_id (namespace 'manual:').
  const idemKey = `manual:${clientRequestId}`;
  if (await isDuplicate(idemKey)) {
    return { idempotent: true, status: 'sent', message_id: null };
  }

  // contato/deal para a timeline
  const contact = await prisma.contact.findFirst({ where: { whatsapp: chat, deletedAt: null }, select: { id: true } });
  let dealId = null;
  if (contact) {
    const deal = await prisma.deal.findFirst({
      where: { contactId: contact.id, status: 'OPEN', deletedAt: null },
      select: { id: true }, orderBy: { createdAt: 'desc' },
    });
    dealId = deal?.id ?? null;
  }

  // 4. Envia pela Meta. Sem dealId/contactId aqui de propósito: o send.js grava
  //    MESSAGE_OUT como AI_AGENT; nós gravamos manualmente como humano abaixo.
  let result;
  try {
    result = await sendWhatsappMessage({ to: chat, text: content });
  } catch (err) {
    throw Conflict(`Falha ao enviar no WhatsApp: ${err.message}`);
  }
  const status = result?.skipped ? 'skipped' : 'sent';
  const messageId = result?.whatsappMessageId ?? null;

  // 5. Grava a atividade como humano (remetente=humano / origem=crm_human).
  if (dealId || contact?.id) {
    await recordActivity({
      dealId,
      contactId: contact?.id ?? null,
      type: 'MESSAGE_OUT',
      actorType: 'USER',
      actorLabel: userName || 'Atendente',
      userId,
      title: 'Mensagem enviada',
      content,
      metadata: { whatsappMessageId: messageId, senderOrigin: 'crm_human', clientRequestId },
    });
  }

  // 6. Renova o TTL do takeover (cada mensagem humana estende o bloqueio).
  await refreshTakeover({ instanceName: inst, chatId: chat });

  // 7. Marca o client_request_id como processado.
  await register(idemKey, chat);

  return { message_id: messageId, status };
}
