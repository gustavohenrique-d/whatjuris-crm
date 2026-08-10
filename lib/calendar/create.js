// =============================================================================
// WhatJuris CRM — Criar evento de agenda
// lib/calendar/create.js
//
// Usado pelo handler HTTP e pelo Agente Agendador (módulo 9).
// Grava a Activity, sincroniza com Google Calendar se configurado, e retorna.
//
// DESVIO CONFIRMADO (5.0/7.0): campo do ator = `userId` (não actorId).
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { syncToGoogle } from './google';

export async function createCalendarEvent({
  dealId = null,
  contactId = null,
  type,
  title,
  content = null,
  dueAt,
  endAt = null,
  actorType = 'USER',
  actorLabel = null,
  userId = null,
  metadata = {},
  tx = null,
}) {
  if (!dueAt) throw new Error('createCalendarEvent: dueAt é obrigatório.');
  if (!dealId && !contactId) throw new Error('createCalendarEvent: informe dealId ou contactId.');

  const db = tx ?? prisma;

  // Buscar refresh_token do Google da configuração do escritório
  const org = await db.organization.findFirst({ select: { settings: true } });
  const refreshToken = org?.settings?.googleRefreshToken ?? null;

  // `activities` não tem coluna de término — endAt vive no metadata para não
  // se perder entre o CRM e o Google.
  const metadataBase = endAt
    ? { ...metadata, endAt: new Date(endAt).toISOString() }
    : metadata;

  // Criar a atividade
  const activity = await db.activity.create({
    data: {
      dealId,
      contactId,
      type,
      actorType,
      actorLabel,
      userId,
      title,
      content,
      dueAt: new Date(dueAt),
      occurredAt: new Date(),
      metadata: metadataBase,
    },
    select: {
      id: true, type: true, title: true, content: true,
      dueAt: true, occurredAt: true, dealId: true, metadata: true,
    },
  });

  // Sincronizar com Google Calendar (não bloqueia se falhar)
  if (refreshToken) {
    const syncResult = await syncToGoogle({ ...activity, endAt }, refreshToken);

    if (syncResult.googleEventId) {
      const metaComEvento = { ...metadataBase, googleEventId: syncResult.googleEventId };

      if (!tx) {
        // Gravar o ID do evento Google no metadata para updates futuros
        await prisma.activity.update({
          where: { id: activity.id },
          data: { metadata: metaComEvento },
        });
      }
      // Devolve o metadata já atualizado — sem isto o chamador recebe o objeto
      // criado ANTES do sync e nunca enxerga o googleEventId.
      activity.metadata = metaComEvento;
    }
  }

  return activity;
}
