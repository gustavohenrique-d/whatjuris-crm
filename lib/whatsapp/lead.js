// =============================================================================
// WhatJuris CRM — Resolução de lead a partir do WhatsApp
// lib/whatsapp/lead.js
//
// Encontra ou cria o Contact (por número) e o Deal aberto correspondente.
// Extraído do webhook do Módulo 1 para ser reaproveitado pela persistência de
// mensagens do Módulo 2 (Human Takeover) sem duplicar a lógica.
// =============================================================================

import { prisma } from '@/lib/db/prisma';

export async function findOrCreateContact(phone, profileName) {
  const whatsapp = String(phone || '').replace(/\D/g, '');

  let contact = await prisma.contact.findFirst({
    where: { whatsapp, deletedAt: null },
    select: { id: true, name: true, ownerId: true },
  });

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        name: profileName || `Lead WhatsApp ${whatsapp.slice(-4)}`,
        whatsapp,
        source: 'whatsapp',
        type: 'LEAD',
      },
      select: { id: true, name: true, ownerId: true },
    });
  }

  return contact;
}

export async function findOrCreateDeal(contact) {
  let deal = await prisma.deal.findFirst({
    where: { contactId: contact.id, status: 'OPEN', deletedAt: null },
    select: { id: true, stageId: true, stage: { select: { key: true } } },
    orderBy: { createdAt: 'desc' },
  });

  if (!deal) {
    const pipeline = await prisma.pipeline.findFirst({
      where: { isDefault: true },
      select: { id: true },
    });

    const stage = await prisma.pipelineStage.findFirst({
      where: { pipelineId: pipeline.id, key: 'novo_contato' },
      select: { id: true },
    });

    const maxPos = await prisma.deal.aggregate({
      where: { stageId: stage.id, deletedAt: null },
      _max: { position: true },
    });

    deal = await prisma.deal.create({
      data: {
        title: `Lead: ${contact.name}`,
        contactId: contact.id,
        pipelineId: pipeline.id,
        stageId: stage.id,
        position: (maxPos._max.position ?? -1) + 1,
      },
      select: { id: true, stageId: true, stage: { select: { key: true } } },
    });
  }

  return deal;
}
