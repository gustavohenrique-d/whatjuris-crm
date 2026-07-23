// =============================================================================
// WhatJuris CRM — Webhook do WhatsApp Business API (Meta)
// pages/api/webhooks/whatsapp.js
//
// GET  → verificação do webhook (challenge da Meta)
// POST → recebe mensagens; cria Contact/Deal, grava MESSAGE_IN, notifica o n8n.
//
// DESVIO DA SPEC (correção): a assinatura x-hub-signature-256 da Meta é
// HMAC-SHA256 com o APP SECRET do app, não com o access token. Uso
// WHATSAPP_APP_SECRET. A verificação só roda em produção.
// =============================================================================

import crypto from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { recordWhatsappMessage } from '@/lib/activities/record';
import { notifyN8n } from '@/lib/n8n/notify';

// Body parser desligado para validar a assinatura no raw body
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, signature) {
  if (!signature) return false;
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function findOrCreateContact(phone, profileName) {
  const whatsapp = phone.replace(/\D/g, '');

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

async function findOrCreateDeal(contact) {
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

export default async function handler(req, res) {
  // GET — verificação do webhook pela Meta
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.status(403).json({ error: 'Verificação falhou.' });
  }

  // POST — mensagens e eventos
  if (req.method === 'POST') {
    const rawBody = await getRawBody(req);
    const signature = req.headers['x-hub-signature-256'];

    if (process.env.NODE_ENV === 'production' && !verifySignature(rawBody, signature)) {
      return res.status(401).json({ error: 'Assinatura inválida.' });
    }

    // A Meta exige 200 em < 20s — responder já e processar em seguida
    res.status(200).json({ status: 'ok' });

    try {
      const body = JSON.parse(rawBody.toString());
      const changes = body?.entry?.[0]?.changes?.[0]?.value;
      const messages = changes?.messages;

      if (!messages?.length) return;

      for (const msg of messages) {
        if (msg.type !== 'text') continue;

        const phone = msg.from;
        const text = msg.text?.body || '';
        const profileName = changes?.contacts?.[0]?.profile?.name;
        const whatsappMessageId = msg.id;

        const contact = await findOrCreateContact(phone, profileName);
        const deal = await findOrCreateDeal(contact);

        await recordWhatsappMessage({
          dealId: deal.id,
          contactId: contact.id,
          direction: 'in',
          content: text,
          whatsappMessageId,
        });

        notifyN8n({
          event: 'message.received',
          dealId: deal.id,
          contactId: contact.id,
          contactName: contact.name,
          phone,
          message: text,
          stageKey: deal.stage?.key,
          whatsappMessageId,
        }).catch((err) => console.error('[webhook] n8n notify falhou:', err.message));
      }
    } catch (err) {
      console.error('[webhook:whatsapp] erro ao processar:', err);
    }

    return;
  }

  return res.status(405).json({ error: 'Método não permitido.' });
}
