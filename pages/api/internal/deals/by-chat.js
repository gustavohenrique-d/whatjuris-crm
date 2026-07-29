// =============================================================================
// WhatJuris CRM — Carregar deal por chat (Módulo 4)
// GET /api/internal/deals/by-chat?instance_name=X&chat_id=Y   (x-webhook-secret)
// O n8n usa isto para carregar o estado atual do deal antes de acionar o agente.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { sanitizeInstance, sanitizeChatId } from '@/lib/conversations/control';

const schema = z.object({
  instance_name: z.string().trim().min(1).max(100),
  chat_id: z.string().trim().min(1).max(100),
});

function verifySecret(req) {
  const secret = req.headers['x-webhook-secret'];
  return !!process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  if (!verifySecret(req)) return res.status(401).json({ error: 'Não autorizado.' });

  const parsed = schema.safeParse(req.query ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const instanceName = sanitizeInstance(parsed.data.instance_name);
  const whatsapp = sanitizeChatId(parsed.data.chat_id);

  try {
    const contact = await prisma.contact.findFirst({
      where: { whatsapp, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!contact) return res.status(404).json({ error: 'Contato não encontrado.' });

    const deal = await prisma.deal.findFirst({
      where: { contactId: contact.id, status: 'OPEN', deletedAt: null },
      select: { id: true, legalArea: true, faseTriage: true, urgencia: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!deal) return res.status(404).json({ error: 'Deal aberto não encontrado.' });

    // control_version vem do controle de conversa (Módulo 2); 0 se não houver.
    const control = await prisma.conversationControl.findUnique({
      where: { instanceName_chatId: { instanceName, chatId: whatsapp } },
      select: { controlVersion: true },
    });

    return res.status(200).json({
      deal_id: deal.id,
      contact_id: contact.id,
      contact_name: contact.name,
      legal_area: deal.legalArea,
      fase_triagem: deal.faseTriage,
      urgencia: deal.urgencia,
      control_version: Number(control?.controlVersion ?? 0),
    });
  } catch (err) {
    console.error('[deals/by-chat] erro:', err.message);
    return res.status(500).json({ error: 'Erro ao carregar deal.' });
  }
}
