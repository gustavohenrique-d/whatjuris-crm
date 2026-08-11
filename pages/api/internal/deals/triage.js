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
  // Motivo do descarte — top-level de propósito: normalizeDados() filtra
  // dados_extraidos por whitelist e descartaria a chave silenciosamente.
  motivo_desqualificacao: z.string().trim().max(300).optional().nullable(),
  // Idem: top-level. true quando o cliente pediu, nesta mensagem, para marcar
  // consulta. A IA não agenda — isto só avisa o advogado.
  pediu_agendamento: z.boolean().optional().default(false),
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

// Janela de silêncio entre dois avisos de pedido de agendamento para o mesmo
// deal. Colapsa a rajada de "oi", "quero marcar", "tem horário?" numa
// notificação só, mas volta a cutucar o advogado se meio expediente passar sem
// ninguém marcar nada.
const JANELA_AVISO_AGENDAMENTO_MS = 6 * 60 * 60 * 1000;
const TIPOS_COMPROMISSO = ['MEETING', 'CALL', 'HEARING'];

// Avisa o advogado de que o lead quer marcar. Duas guardas, em ordem de custo:
//
// 1. Já existe compromisso futuro para o deal → o advogado já marcou; a promessa
//    feita ao cliente foi cumprida e insistir vira ruído.
// 2. Já avisamos nas últimas 6h → rajada de mensagens do mesmo lead.
//
// Notifica ANTES de registrar o marcador: um aviso perdido quebra a promessa
// feita ao cliente, enquanto um aviso repetido só incomoda. Se o registro
// falhar, o próximo pedido notifica de novo — que é o lado seguro do erro.
async function avisarPedidoDeAgendamento({ deal, contact, nome, whatsapp, area, urgencia, resumo }) {
  const agora = new Date();

  const compromissoFuturo = await prisma.activity.findFirst({
    where: { dealId: deal.id, type: { in: TIPOS_COMPROMISSO }, dueAt: { gt: agora } },
    select: { id: true },
  });
  if (compromissoFuturo) return { skipped: true, motivo: 'ja_agendado' };

  const avisoRecente = await prisma.activity.findFirst({
    where: {
      dealId: deal.id,
      type: 'AI_ACTION',
      createdAt: { gte: new Date(agora.getTime() - JANELA_AVISO_AGENDAMENTO_MS) },
      metadata: { path: ['evento'], equals: 'lead_wants_appointment' },
    },
    select: { id: true },
  });
  if (avisoRecente) return { skipped: true, motivo: 'avisado_recentemente' };

  const base = process.env.NEXTAUTH_URL?.replace(/\/+$/, '');

  await notifyLawyer({
    event: 'lead_wants_appointment',
    data: {
      name: nome,
      whatsapp,
      area,
      urgencia,
      resumo,
      dealUrl: base ? `${base}/admin/deals/${deal.id}` : null,
    },
  });

  await recordAiAction({
    dealId: deal.id,
    contactId: contact.id,
    agentName: 'Agente de Triagem',
    title: 'Lead pediu agendamento',
    content: 'O cliente pediu para marcar uma consulta. A IA não agendou — o advogado foi avisado.',
    metadata: { evento: 'lead_wants_appointment' },
  });

  return { sent: true };
}

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
  // Preliminar: serve só à validação de contrato abaixo, que roda antes de
  // tocar o banco. A fase definitiva depende de deal.qualifiedAt e por isso é
  // recalculada mais adiante, com o deal já carregado.
  const { qualified, faseTriagem: fasePreliminar } = computeQualification(dados, d.fase_triagem);
  const { valid, errors } = validateTriageOutput({
    dados_extraidos: dados,
    mensagem_para_cliente: 'ok', // a mensagem ao cliente é validada no workflow; aqui só os dados
    fase_triagem: fasePreliminar,
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

    // 5. Fase definitiva — agora com o estado durável do deal em mãos. Um lead
    //    já qualificado não regride para coletando_dados só porque esta
    //    mensagem não repetiu os dados.
    const { faseTriagem } = computeQualification(dados, d.fase_triagem, {
      jaQualificado: !!deal.qualifiedAt,
    });

    // 6. Monta o update sem apagar dado válido com null.
    const data = {};
    if (dados.area && dados.area !== 'Não identificado') data.legalArea = dados.area.toLowerCase();
    if (dados.urgencia) data.urgencia = dados.urgencia;
    data.faseTriage = faseTriagem;
    if (!deal.instanceName) data.instanceName = instanceName;
    // qualified_at só na PRIMEIRA qualificação
    if (qualified && !deal.qualifiedAt) data.qualifiedAt = new Date();

    // Transição para desqualificado — capturada ANTES do update, que sobrescreve
    // faseTriage. Evita notificar de novo a cada triagem de um lead já descartado.
    const virouDesqualificado =
      faseTriagem === 'desqualificado' && deal.faseTriage !== 'desqualificado';

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

    // Notifica o advogado (best-effort, não bloqueia a resposta; roda no
    // servidor persistente do Render).
    const nome = dados.nome && dados.nome.trim().length >= 3 ? dados.nome.trim() : contact.name;

    // ...na PRIMEIRA qualificação.
    if (qualified && !deal.qualifiedAt) {
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

    // ...e quando a triagem descarta o lead.
    if (virouDesqualificado) {
      notifyLawyer({
        event: 'lead_disqualified',
        data: {
          name: nome,
          whatsapp,
          area: data.legalArea ?? deal.legalArea,
          motivo: d.motivo_desqualificacao || dados.resumo_caso || 'Não informado pelo agente',
        },
      }).catch((err) => console.error('[triage] notifyLawyer falhou:', err.message));
    }

    // ...e quando o lead pede para marcar consulta.
    //
    // Sem a guarda `!deal.qualifiedAt` de propósito: o caso comum é justamente o
    // lead qualificado dias atrás que volta querendo marcar. Aceita `qualified`
    // (desta rodada) OU `deal.qualifiedAt` (rodadas anteriores) porque numa
    // mensagem curta como "quero marcar" o agente costuma devolver
    // dados_extraidos vazio, o que zera o `qualified` recalculado — exigir só
    // ele silenciaria exatamente o cenário que este aviso existe para cobrir.
    if (d.pediu_agendamento && (qualified || deal.qualifiedAt)) {
      avisarPedidoDeAgendamento({
        deal,
        contact,
        nome,
        whatsapp,
        area: data.legalArea ?? deal.legalArea,
        urgencia: dados.urgencia ?? deal.urgencia,
        resumo: dados.resumo_caso,
      }).catch((err) => console.error('[triage] aviso de agendamento falhou:', err.message));
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
