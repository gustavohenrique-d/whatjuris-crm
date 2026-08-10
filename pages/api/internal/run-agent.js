// =============================================================================
// WhatJuris CRM — Executar agente de IA
// pages/api/internal/run-agent.js
//
// Autenticada por WEBHOOK_SECRET. O n8n chama esta rota para cada agente,
// passando o dealId e a mensagem. Retorna a resposta do agente.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { callOpenAI } from '@/lib/ai/openai';
import {
  getPromptRecepcionista, getPromptClassificador, getPromptColetor,
  getPromptQualificador, getPromptEncerrador, getPromptNutritor,
  getPromptAgendador, getPromptResumidor,
} from '@/lib/ai/prompts';

const AGENT_NAMES = {
  recepcionista: 'Agente Recepcionista',
  classificador: 'Agente Classificador',
  coletor: 'Agente Coletor',
  qualificador: 'Agente Qualificador',
  encerrador: 'Agente Encerrador',
  nutritor: 'Agente Nutritor',
  agendador: 'Agente Agendador',
  resumidor: 'Agente Resumidor',
};

const AGENT_MODELS = {
  recepcionista: 'nano',
  classificador: 'nano',
  coletor: 'mini',
  qualificador: 'full',
  encerrador: 'nano',
  nutritor: 'nano',
  agendador: 'mini',
  resumidor: 'full',
};

const schema = z.object({
  agent: z.enum(['recepcionista', 'classificador', 'coletor', 'qualificador',
    'encerrador', 'nutritor', 'agendador', 'resumidor']),
  dealId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).default([]),
  // Data corrente enviada pelo n8n. Sem isto o z.object descartaria a chave em
  // silêncio e o agendador continuaria sem saber que dia é hoje.
  dataHoje: z.string().datetime().optional(),
});

function verifySecret(req) {
  const expected = process.env.WEBHOOK_SECRET;
  return !!expected && req.headers['x-webhook-secret'] === expected;
}

async function getOrgContext() {
  const org = await prisma.organization.findFirst({
    select: { name: true, settings: true, businessHours: true, legalAreas: true },
  });
  return {
    orgName: org?.name,
    botName: org?.settings?.botDisplayName,
    businessHours: org?.businessHours,
    legalAreas: org?.legalAreas || [],
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!verifySecret(req)) return res.status(401).json({ error: 'Não autorizado.' });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { agent, dealId, message, history, dataHoje } = parsed.data;

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, deletedAt: null },
    select: {
      id: true, legalArea: true, title: true,
      contact: { select: { id: true, name: true, whatsapp: true } },
    },
  });

  if (!deal) return res.status(404).json({ error: 'Deal não encontrado.' });

  const org = await getOrgContext();

  const promptMap = {
    recepcionista: () => getPromptRecepcionista(org),
    classificador: () => getPromptClassificador({ legalAreas: org.legalAreas }),
    coletor: () => getPromptColetor({ legalArea: deal.legalArea }),
    qualificador: () => getPromptQualificador({ legalArea: deal.legalArea }),
    encerrador: () => getPromptEncerrador(org),
    nutritor: () => getPromptNutritor(org),
    agendador: () => getPromptAgendador({
      orgName: org.orgName,
      businessHours: org.businessHours,
      // ausente → o próprio servidor resolve; o default do prompt cobre.
      dataHoje: dataHoje ? new Date(dataHoje) : new Date(),
    }),
    resumidor: () => getPromptResumidor(),
  };

  const systemPrompt = promptMap[agent]();
  const model = AGENT_MODELS[agent];
  const agentName = AGENT_NAMES[agent];

  let aiResponse;
  try {
    aiResponse = await callOpenAI({
      model,
      systemPrompt,
      messages: history,
      userMessage: message,
      temperature: agent === 'qualificador' || agent === 'resumidor' ? 0.1 : 0.3,
    });
  } catch (err) {
    console.error(`[${agentName}] OpenAI error:`, err.message);
    return res.status(502).json({ error: 'Falha ao chamar a OpenAI.', detail: err.message });
  }

  // Gravar a ação do agente na timeline do CRM
  await prisma.activity.create({
    data: {
      dealId,
      type: 'AI_ACTION',
      actorType: 'AI_AGENT',
      actorLabel: agentName,
      title: `${agentName} processou a mensagem`,
      content: aiResponse.content,
      occurredAt: new Date(),
      metadata: {
        model: aiResponse.model,
        usage: aiResponse.usage,
        agent,
      },
    },
  }).catch((err) => console.error('[run-agent] falha ao gravar activity:', err.message));

  return res.status(200).json({
    agent,
    agentName,
    response: aiResponse.content,
    model: aiResponse.model,
    usage: aiResponse.usage,
  });
}
