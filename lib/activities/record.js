// =============================================================================
// WhatJuris CRM — Gravação de atividades de sistema e IA
// lib/activities/record.js
//
// Usado pelo módulo 9 (agentes) e por qualquer código interno que precise
// registrar um evento na timeline sem passar pelo handler HTTP.
//
// NUNCA chamar prisma.activity.create diretamente fora deste arquivo (e dos
// handlers HTTP de atividade) — centraliza o actorType e garante occurredAt
// correto.
//
// DESVIO CONFIRMADO (5.0): o campo do ator no banco é `user_id` → Prisma
// `userId` (não `actorId`). `content` (não `body`). ActorType inclui CONTACT
// (adicionado em 008_actor_contact.sql para mensagens recebidas no WhatsApp).
// =============================================================================

import { prisma } from '@/lib/db/prisma';

export async function recordActivity({
  dealId = null,
  contactId = null,
  type,
  actorType = 'SYSTEM',
  actorLabel = null,
  userId = null,
  title = null,
  content,
  occurredAt = new Date(),
  metadata = {},
  tx = null, // permite ser chamada dentro de $transaction existente
}) {
  if (!dealId && !contactId) {
    throw new Error('recordActivity: informe dealId ou contactId.');
  }

  const db = tx ?? prisma;

  return db.activity.create({
    data: {
      dealId,
      contactId,
      type,
      actorType,
      actorLabel,
      userId,
      title,
      content,
      occurredAt,
      metadata,
    },
    select: { id: true, type: true, occurredAt: true },
  });
}

// Atalho para ação de agente de IA (módulo 9 vai usar isso)
export async function recordAiAction({
  dealId = null,
  contactId = null,
  agentName,      // ex.: "Agente Classificador"
  title,
  content,
  metadata = {},
  tx = null,
}) {
  return recordActivity({
    dealId,
    contactId,
    type: 'AI_ACTION',
    actorType: 'AI_AGENT',
    actorLabel: agentName,
    title,
    content,
    metadata,
    tx,
  });
}

// Atalho para mensagem do WhatsApp (módulo 8 vai usar isso)
export async function recordWhatsappMessage({
  dealId = null,
  contactId = null,
  direction,   // 'in' | 'out'
  content,
  whatsappMessageId = null,
  tx = null,
}) {
  return recordActivity({
    dealId,
    contactId,
    type: direction === 'in' ? 'MESSAGE_IN' : 'MESSAGE_OUT',
    // 'in' = enviada pelo lead (CONTACT); 'out' = enviada pelo agente (AI_AGENT)
    actorType: direction === 'in' ? 'CONTACT' : 'AI_AGENT',
    title: direction === 'in' ? 'Mensagem recebida' : 'Mensagem enviada',
    content,
    metadata: { whatsappMessageId },
    tx,
  });
}
