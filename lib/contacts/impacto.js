// =============================================================================
// WhatJuris CRM — Impacto de arquivar um contato
// lib/contacts/impacto.js
//
// Conta o que sai das telas quando o contato recebe `deletedAt`, e aplica a
// GUARDA FINANCEIRA. Compartilhado pelo preview e pelo próprio DELETE — a
// guarda precisa valer no backend, não só na tela que a exibe.
//
// ⚠️ Arquivar NÃO apaga nada: o contato e tudo que está ligado a ele continuam
// no banco, apenas filtrados por `deletedAt: null` nas listagens. É por isso
// que o texto da UI fala em "arquivar/recuperável", não em exclusão.
// =============================================================================

import { prisma } from '@/lib/db/prisma';

const TIPOS_COMPROMISSO = ['MEETING', 'CALL', 'HEARING'];

export async function montarImpacto(contato) {
  const { id, whatsapp } = contato;

  const [deals, activities, cobrancas, eventosFuturos, conversas] = await Promise.all([
    prisma.deal.count({ where: { contactId: id, deletedAt: null } }),
    prisma.activity.count({ where: { contactId: id } }),
    // Guarda financeira: QUALQUER cobrança viva conta, paga ou em aberto.
    prisma.charge.findMany({
      where: { contactId: id, deletedAt: null },
      select: {
        id: true,
        installments: { select: { amount: true, status: true } },
      },
    }),
    prisma.activity.findMany({
      where: {
        contactId: id,
        type: { in: TIPOS_COMPROMISSO },
        dueAt: { gt: new Date() },
      },
      select: { id: true, title: true, dueAt: true, metadata: true },
    }),
    whatsapp
      ? prisma.conversationControl.count({ where: { chatId: whatsapp } })
      : Promise.resolve(0),
  ]);

  // triage_chat_history não é model do Prisma (o nó Postgres Chat Memory do n8n
  // a cria). A chave é session_id = 'chat:v1:<instancia>:<numero>'.
  let memoriaTriagem = 0;
  if (whatsapp) {
    try {
      const linhas = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS total
        FROM public.triage_chat_history
        WHERE session_id LIKE ${'%:' + whatsapp}
      `;
      memoriaTriagem = linhas?.[0]?.total ?? 0;
    } catch {
      // Tabela ausente num ambiente sem n8n não pode derrubar o preview.
      memoriaTriagem = 0;
    }
  }

  const cent = (v) => Math.round((Number(v) || 0) * 100);
  let totalCent = 0;
  let abertoCent = 0;
  for (const c of cobrancas) {
    for (const p of c.installments) {
      totalCent += cent(p.amount);
      if (p.status === 'PENDING') abertoCent += cent(p.amount);
    }
  }

  // Eventos que continuariam no Google se o cancelamento falhar.
  const comGoogle = eventosFuturos.filter((e) => e.metadata?.googleEventId);

  return {
    deals,
    activities,
    conversas,
    memoriaTriagem,
    eventosFuturos: eventosFuturos.length,
    eventosNoGoogle: comGoogle.length,
    cobrancas: {
      quantidade: cobrancas.length,
      total: totalCent / 100,
      emAberto: abertoCent / 100,
    },
    // A guarda: com cobrança, não arquiva. Cobrança viva sem cliente vira
    // registro financeiro órfão, e a paga é histórico que o escritório precisa.
    bloqueado: cobrancas.length > 0,
    motivoBloqueio: cobrancas.length > 0
      ? `Este cliente tem ${cobrancas.length} ${cobrancas.length === 1 ? 'cobrança' : 'cobranças'} `
        + `(${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCent / 100)}) `
        + 'e não pode ser arquivado. Resolva as cobranças primeiro.'
      : null,
  };
}

// Eventos futuros com id do Google — usados para cancelar lá fora ao arquivar.
export async function eventosGoogleFuturos(contactId) {
  const eventos = await prisma.activity.findMany({
    where: {
      contactId,
      type: { in: TIPOS_COMPROMISSO },
      dueAt: { gt: new Date() },
    },
    select: { id: true, title: true, dueAt: true, metadata: true },
  });
  return eventos
    .filter((e) => e.metadata?.googleEventId)
    .map((e) => ({ id: e.id, title: e.title, dueAt: e.dueAt, googleEventId: e.metadata.googleEventId }));
}
