// =============================================================================
// WhatJuris CRM — Rota interna: ações dos agentes de IA via n8n
// pages/api/internal/agent-action.js
//
// Autenticada por WEBHOOK_SECRET (header x-webhook-secret).
// NÃO usa withAuth/NextAuth — o n8n não tem sessão de usuário.
//
// DESVIOS/CORREÇÕES da spec:
//  - move_stage: a spec fazia set_config('app.actor_id', dealId) — gravaria o
//    id do DEAL em moved_by (lixo). Aqui limpo app.actor_id ('') na transação,
//    então moved_by = NULL e moved_by_ai = true.
//  - qualify_lead: a spec não limpava app.actor_id; um valor deixado por um
//    request withAuth anterior na mesma conexão do pool (is_local=false) vazaria
//    para moved_by. Aqui também limpo explicitamente.
//  - findFirst em vez de findUnique (filtro deletedAt não-único).
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { recordAiAction } from '@/lib/activities/record';
import { sendWhatsappMessage } from '@/lib/whatsapp/send';
import { createCalendarEvent } from '@/lib/calendar/create';
import { paraInstante, dentroDoExpediente, formatarBR } from '@/lib/calendar/horario';

const schema = z.object({
  action: z.enum(['move_stage', 'record_action', 'send_message', 'get_deal', 'qualify_lead', 'get_history', 'set_legal_area', 'set_priority', 'schedule_appointment']),
  dealId: z.string().uuid(),
  limit: z.number().int().positive().max(40).optional(),
  agentName: z.string().optional().default('Agente IA'),
  stageKey: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  message: z.string().optional(),
  phone: z.string().optional(),
  legalArea: z.string().trim().max(60).optional(),
  priority: z.number().int().min(0).max(2).optional(),
  // schedule_appointment — data/hora vêm do agente em horário de Brasília.
  data: z.string().trim().optional(),
  hora: z.string().trim().optional(),
  tipo: z.enum(['MEETING', 'CALL', 'HEARING']).optional().default('MEETING'),
  duracaoMin: z.number().int().min(15).max(480).optional(),
  // false quando quem avisa o cliente é o M05 (envio humanizado). Default true
  // preserva o comportamento de quem chama a ação direto.
  notificarCliente: z.boolean().optional().default(true),
});

function verifySecret(req) {
  const secret = req.headers['x-webhook-secret'];
  const expected = process.env.WEBHOOK_SECRET;
  return !!expected && secret === expected;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  if (!verifySecret(req)) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { action, dealId, agentName, stageKey, title, content, metadata, message, phone, legalArea, priority,
    data, hora, tipo, duracaoMin, notificarCliente } = parsed.data;

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, deletedAt: null },
    select: {
      id: true, title: true, stageId: true, status: true, legalArea: true,
      stage: { select: { key: true, name: true } },
      contact: { select: { id: true, name: true, whatsapp: true } },
      owner: { select: { id: true, name: true, notifyWhatsapp: true, legalAreas: true } },
    },
  });

  if (!deal) return res.status(404).json({ error: 'Deal não encontrado.' });

  switch (action) {
    case 'get_deal': {
      return res.status(200).json({ deal });
    }

    case 'get_history': {
      // Histórico da conversa para o agente reconstruir o contexto (módulo 9).
      const take = Math.min(Number(req.body.limit) || 20, 40);

      const activities = await prisma.activity.findMany({
        where: {
          dealId,
          type: { in: ['MESSAGE_IN', 'MESSAGE_OUT', 'AI_ACTION'] },
        },
        select: {
          type: true, content: true, actorType: true, actorLabel: true, occurredAt: true,
        },
        orderBy: { occurredAt: 'asc' },
        take,
      });

      // Formato de mensagens da OpenAI (MESSAGE_IN = user; resto = assistant)
      const messages = activities.map((a) => ({
        role: a.type === 'MESSAGE_IN' ? 'user' : 'assistant',
        content: a.content || '',
        _actorLabel: a.actorLabel,
        _type: a.type,
      }));

      return res.status(200).json({ messages, deal });
    }

    case 'move_stage': {
      if (!stageKey) return res.status(400).json({ error: 'stageKey obrigatório.' });

      const stage = await prisma.pipelineStage.findFirst({
        where: { key: stageKey },
        select: { id: true, name: true },
      });

      if (!stage) return res.status(400).json({ error: `Estágio '${stageKey}' não encontrado.` });

      if (stage.id === deal.stageId) {
        return res.status(200).json({ message: 'Já neste estágio.' });
      }

      await prisma.$transaction(async (tx) => {
        // Ação de IA: sem ator humano. Limpar actor_id (transação-local) para
        // não vazar valor do pool nem gravar o dealId em moved_by.
        await tx.$executeRaw`SELECT set_config('app.actor_id', '', true)`;
        await tx.$executeRaw`SELECT set_config('app.actor_is_ai', 'true', true)`;

        await tx.deal.update({
          where: { id: dealId },
          data: { stageId: stage.id },
        });

        await recordAiAction({
          dealId,
          agentName,
          title: `Movido para "${stage.name}"`,
          content: `${agentName} moveu o lead para o estágio "${stage.name}".`,
          metadata: { fromStageKey: deal.stage.key, toStageKey: stageKey },
          tx,
        });
      });

      return res.status(200).json({ moved: true, stageKey });
    }

    case 'set_legal_area': {
      const area = (legalArea || '').trim().toLowerCase();
      if (!area) return res.status(400).json({ error: 'legalArea obrigatório.' });

      await prisma.deal.update({
        where: { id: dealId },
        data: { legalArea: area },
      });

      // Mantém o registro na timeline (equivalente ao antigo record_action).
      await recordAiAction({
        dealId,
        contactId: deal.contact?.id,
        agentName,
        title: title || 'Área jurídica identificada',
        content: content || `Área classificada: ${area}.`,
        metadata: { ...(metadata || {}), legalArea: area },
      });

      return res.status(200).json({ updated: true, legalArea: area });
    }

    case 'set_priority': {
      if (priority == null) return res.status(400).json({ error: 'priority obrigatório.' });

      await prisma.deal.update({
        where: { id: dealId },
        data: { priority },
      });

      const rotulo = ['normal', 'média', 'alta'][priority];
      await recordAiAction({
        dealId,
        agentName,
        title: title || 'Prioridade definida',
        content: content || `Prioridade do lead definida como ${rotulo}.`,
        metadata: { ...(metadata || {}), priority },
      });

      return res.status(200).json({ updated: true, priority });
    }

    case 'record_action': {
      await recordAiAction({
        dealId,
        contactId: deal.contact?.id,
        agentName,
        title: title || `${agentName} atuou`,
        content: content || '',
        metadata,
      });

      return res.status(200).json({ recorded: true });
    }

    case 'send_message': {
      if (!message) return res.status(400).json({ error: 'message obrigatório.' });

      const to = phone || deal.contact?.whatsapp;
      if (!to) return res.status(400).json({ error: 'Número de WhatsApp não encontrado.' });

      let result;
      try {
        result = await sendWhatsappMessage({
          to,
          text: message,
          dealId,
          contactId: deal.contact?.id,
        });
      } catch (err) {
        // Erro da Meta (número não permitido, template, rate limit...) não deve
        // virar 500 com stack. Retorna 502 limpo — o detail ajuda o n8n a depurar.
        console.error('[send_message] falha ao enviar no WhatsApp:', err.message);
        return res.status(502).json({
          error: 'Falha ao enviar mensagem no WhatsApp.',
          detail: err.message,
        });
      }

      // Sem credenciais o send.js retorna { skipped: true } (não envia de fato).
      return res.status(200).json({ sent: !result?.skipped, skipped: result?.skipped ?? false });
    }

    case 'qualify_lead': {
      const qualifiedStage = await prisma.pipelineStage.findFirst({
        where: { key: 'qualificado' },
        select: { id: true },
      });

      if (!qualifiedStage) {
        return res.status(500).json({ error: 'Estágio qualificado não encontrado.' });
      }

      let responsibleAdvogado = null;

      if (deal.legalArea) {
        responsibleAdvogado = await prisma.user.findFirst({
          where: {
            status: 'ACTIVE',
            deletedAt: null,
            legalAreas: { has: deal.legalArea },
            notifyWhatsapp: { not: null },
          },
          select: { id: true, name: true, notifyWhatsapp: true },
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.actor_id', '', true)`;
        await tx.$executeRaw`SELECT set_config('app.actor_is_ai', 'true', true)`;

        await tx.deal.update({
          where: { id: dealId },
          data: { stageId: qualifiedStage.id },
        });

        await recordAiAction({
          dealId,
          agentName,
          title: 'Lead qualificado',
          content: `${agentName} qualificou o lead. Área: ${deal.legalArea || 'não informada'}.`,
          metadata: { legalArea: deal.legalArea, responsibleId: responsibleAdvogado?.id },
          tx,
        });
      });

      // Notificar advogado no WhatsApp pessoal (fora da transação)
      if (responsibleAdvogado?.notifyWhatsapp) {
        const ficha = [
          `*Novo lead qualificado — WhatJuris*`,
          ``,
          `*Nome:* ${deal.contact?.name}`,
          `*WhatsApp:* ${deal.contact?.whatsapp}`,
          `*Área:* ${deal.legalArea || 'não informada'}`,
          `*Caso:* ${deal.title}`,
          ``,
          `Acesse o CRM para ver a ficha completa.`,
        ].join('\n');

        await sendWhatsappMessage({
          to: responsibleAdvogado.notifyWhatsapp,
          text: ficha,
        }).catch((err) =>
          console.error('[qualify_lead] falha ao notificar advogado:', err.message)
        );
      }

      return res.status(200).json({
        qualified: true,
        notifiedAdvogado: responsibleAdvogado?.name ?? null,
      });
    }

    case 'schedule_appointment': {
      if (!data || !hora) return res.status(400).json({ error: 'data e hora obrigatórios.' });

      // Fuso explícito: o servidor roda em UTC e a hora do agente é de Brasília.
      const inicio = paraInstante(data, hora);
      if (!inicio) {
        return res.status(400).json({ error: 'Data ou hora inválida (use YYYY-MM-DD e HH:MM).' });
      }
      if (inicio.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'Não é possível agendar no passado.' });
      }

      // A LLM foi instruída a respeitar o expediente, mas a fronteira de
      // confiança é aqui — alucinação não pode marcar domingo às 3h.
      const org = await prisma.organization.findFirst({ select: { businessHours: true } });
      if (!dentroDoExpediente(inicio, org?.businessHours)) {
        return res.status(400).json({
          error: 'Horário fora do expediente do escritório.',
          detail: formatarBR(inicio),
        });
      }

      const fim = new Date(inicio.getTime() + (duracaoMin ?? 60) * 60 * 1000);

      const activity = await createCalendarEvent({
        dealId,
        contactId: deal.contact?.id ?? null,
        type: tipo,
        title: title || `Consulta — ${deal.contact?.name || 'cliente'}`,
        content: content || null,
        dueAt: inicio,
        endAt: fim,
        actorType: 'AI_AGENT',
        actorLabel: agentName,
        metadata: { ...(metadata || {}), agendadoPorAgente: true },
      });

      const dataFormatada = formatarBR(inicio);

      // Confirmação ao cliente. O número vem SEMPRE do banco — aceitar do
      // payload deixaria a LLM escolher o destinatário da mensagem.
      // Com notificarCliente=false quem avisa é o M05, e enviar aqui faria o
      // cliente receber a mesma confirmação duas vezes.
      const to = deal.contact?.whatsapp;
      let confirmacaoEnviada = false;

      if (notificarCliente && to) {
        try {
          const envio = await sendWhatsappMessage({
            to,
            text: `✅ Consulta agendada para ${dataFormatada}.`,
            dealId,
            contactId: deal.contact?.id,
          });
          confirmacaoEnviada = !envio?.skipped;
        } catch (err) {
          // O evento já existe no Google; falha de envio não desfaz o agendamento.
          console.error('[schedule_appointment] falha ao confirmar no WhatsApp:', err.message);
        }
      }

      return res.status(200).json({
        scheduled: true,
        activityId: activity.id,
        googleEventId: activity.metadata?.googleEventId ?? null,
        dueAt: inicio.toISOString(),
        endAt: fim.toISOString(),
        dataFormatada, // o M05 monta a mensagem a partir daqui
        confirmacaoEnviada,
      });
    }

    default:
      return res.status(400).json({ error: 'Ação desconhecida.' });
  }
}
