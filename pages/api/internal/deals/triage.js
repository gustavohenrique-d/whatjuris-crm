// =============================================================================
// WhatJuris CRM — Aplicar triagem no deal (Módulo 4)
// POST /api/internal/deals/triage   (x-webhook-secret)
//
// Recebe o resultado do agente, REVALIDA e RECALCULA no backend (nunca confia
// na LLM), verifica Human Takeover + control_version, e atualiza o deal de forma
// idempotente. null nunca apaga dado válido existente.
// =============================================================================

import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { isBlocked, sanitizeInstance, sanitizeChatId } from '@/lib/conversations/control';
import { isDuplicate, register } from '@/lib/webhooks/idempotency';
import { recordAiAction } from '@/lib/activities/record';
import { computeQualification } from '@/lib/triage/qualify';
import { normalizeDados, validateTriageOutput } from '@/lib/triage/validate-output';
import { notifyLawyer } from '@/lib/notifications/lawyer';

const schema = z.object({
  instance_name: z.string().trim().min(1).max(100),
  chat_id: z.string().trim().min(1).max(100),
  source_message_id: z.string().trim().min(1).max(255),
  buffered_message_ids: z.array(z.string()).optional().default([]),
  expected_control_version: z.number().int().optional().nullable(),
  fase_triagem: z.enum(['coletando_dados', 'qualificado', 'desqualificado']).optional(),
  dados_extraidos: z.object({
    nome: z.string().nullable().optional(),
    area: z.string().nullable().optional(),
    resumo_caso: z.string().nullable().optional(),
    urgencia: z.string().nullable().optional(),
  }).default({}),
  lead_qualificado: z.boolean().optional(), // ignorado — recalculado
});

function verifySecret(req) {
  const secret = req.headers['x-webhook-secret'];
  return !!process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET;
}

const PLACEHOLDER_NAME = /^Lead WhatsApp/i;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  if (!verifySecret(req)) return res.status(401).json({ error: 'Não autorizado.' });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const d = parsed.data;
  const instanceName = sanitizeInstance(d.instance_name);
  const whatsapp = sanitizeChatId(d.chat_id);

  // Revalida o schema no backend (não confia na LLM).
  const dados = normalizeDados(d.dados_extraidos);
  const { qualified, faseTriagem } = computeQualification(dados, d.fase_triagem);
  const { valid, errors } = validateTriageOutput({
    dados_extraidos: dados,
    mensagem_para_cliente: 'ok', // a mensagem ao cliente é validada no workflow; aqui só os dados
    fase_triagem: faseTriagem,
    lead_qualificado: qualified,
  });
  if (!valid) return res.status(422).json({ error: 'SCHEMA_VALIDATION_FAILED', fields: errors });

  try {
    // 1. Deal aberto
    const contact = await prisma.contact.findFirst({
      where: { whatsapp, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!contact) return res.status(404).json({ error: 'Contato não encontrado.' });

    const deal = await prisma.deal.findFirst({
      where: { contactId: contact.id, status: 'OPEN', deletedAt: null },
      select: { id: true, legalArea: true, urgencia: true, faseTriage: true, qualifiedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!deal) return res.status(404).json({ error: 'Deal aberto não encontrado.' });

    // 2. Human Takeover
    const block = await isBlocked(instanceName, whatsapp);
    if (block.blocked) {
      return res.status(409).json({ error: 'HUMAN_TAKEOVER_ACTIVE', human_takeover: true });
    }

    // 3. control_version (descarta resposta obsoleta)
    if (d.expected_control_version != null && Number(d.expected_control_version) !== Number(block.controlVersion ?? 0)) {
      return res.status(409).json({ error: 'STALE_CONTROL_VERSION', current: Number(block.controlVersion ?? 0) });
    }

    // 4. Idempotência por source_message_id (namespace triage: — não colide com
    //    os message_id gravados pelos módulos 1/2 em webhook_idempotency).
    const idemKey = `triage:${d.source_message_id}`;
    if (await isDuplicate(idemKey)) {
      return res.status(200).json({ updated: false, idempotent: true, deal_id: deal.id });
    }

    // 5. Monta o update sem apagar dado válido com null.
    const data = {};
    if (dados.area && dados.area !== 'Não identificado') data.legalArea = dados.area.toLowerCase();
    if (dados.urgencia) data.urgencia = dados.urgencia;
    data.faseTriage = faseTriagem;
    if (!deal.instanceName) data.instanceName = instanceName;
    // qualified_at só na PRIMEIRA qualificação
    if (qualified && !deal.qualifiedAt) data.qualifiedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.deal.update({ where: { id: deal.id }, data });

      // nome do contato só se ainda for placeholder e a LLM extraiu um nome real
      if (dados.nome && dados.nome.trim().length >= 3 && PLACEHOLDER_NAME.test(contact.name || '')) {
        await tx.contact.update({ where: { id: contact.id }, data: { name: dados.nome.trim() } });
      }

      await recordAiAction({
        dealId: deal.id,
        contactId: contact.id,
        agentName: 'Agente de Triagem',
        title: qualified ? 'Lead qualificado na triagem' : 'Triagem atualizada',
        content: dados.resumo_caso || 'Triagem processada.',
        metadata: {
          area: data.legalArea ?? deal.legalArea,
          urgencia: dados.urgencia ?? deal.urgencia,
          faseTriagem,
          triageSourceMessageId: d.source_message_id,
        },
        tx,
      });
    });

    await register(idemKey, whatsapp);

    // Notifica o advogado na PRIMEIRA qualificação (best-effort, não bloqueia a
    // resposta; roda no servidor persistente do Render).
    if (qualified && !deal.qualifiedAt) {
      const nome = dados.nome && dados.nome.trim().length >= 3 ? dados.nome.trim() : contact.name;
      notifyLawyer({
        event: 'lead_qualified',
        data: {
          name: nome,
          whatsapp,
          area: data.legalArea ?? deal.legalArea,
          urgencia: dados.urgencia ?? deal.urgencia,
          resumo: dados.resumo_caso,
        },
      }).catch((err) => console.error('[triage] notifyLawyer falhou:', err.message));
    }

    return res.status(200).json({
      updated: true,
      deal_id: deal.id,
      // response_id identifica esta resposta para a fragmentação/idempotência do Módulo 5
      response_id: crypto.randomUUID(),
      fase_triagem: faseTriagem,
      lead_qualificado: qualified,
      qualified_at: (qualified && !deal.qualifiedAt) ? true : undefined,
    });
  } catch (err) {
    console.error('[deals/triage] erro:', err.message);
    return res.status(500).json({ error: 'Erro ao aplicar triagem.' });
  }
}
