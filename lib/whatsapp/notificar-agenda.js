// =============================================================================
// WhatJuris CRM — Avisar o cliente quando o advogado marca uma consulta no CRM
// lib/whatsapp/notificar-agenda.js
//
// O Agente Agendador (M06) já confirma pelo WhatsApp via M05. Este módulo cobre
// o outro caminho: o evento criado à mão em /api/agenda/events.
//
// ⚠️ O disparo mora no handler HTTP, NÃO em createCalendarEvent. O outro
// chamador do helper é agent-action.js (schedule_appointment), que passa
// notificarCliente:false de propósito para o M05 humanizar o envio — notificar
// dentro do helper faria o cliente receber a confirmação duas vezes.
//
// `montarMensagemAgenda` é PURA (testável). `notificarAgendamento` NUNCA lança:
// o evento já existe no banco e no Google quando ela roda.
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { sendWhatsappMessage } from '@/lib/whatsapp/send';
import { TIPOS } from '@/lib/calendar/google';
import { formatarDataBR, formatarHoraBR } from '@/lib/calendar/horario';

// Compromisso interno (TASK) não vira mensagem para o cliente.
const TIPOS_NOTIFICAVEIS = ['MEETING', 'CALL', 'HEARING'];

// Monta o texto da confirmação. PURA.
export function montarMensagemAgenda({ nome, orgName, tipo, dueAt }) {
  const quando = dueAt instanceof Date ? dueAt : new Date(dueAt);

  return [
    '✅ *Consulta agendada!*',
    '',
    `Olá, ${nome || 'tudo bem'}! Sua consulta com o escritório ${orgName || 'do seu caso'} foi confirmada.`,
    '',
    `📅 Data: ${formatarDataBR(quando)}`,
    `⏰ Horário: ${formatarHoraBR(quando)} (horário de Brasília)`,
    `📋 Tipo: ${TIPOS[tipo] || tipo}`,
    '',
    'Em caso de dúvidas, entre em contato conosco.',
  ].join('\n');
}

// Envia a confirmação ao cliente do deal. Best-effort: loga e segue.
export async function notificarAgendamento({ activity, dealId = null }) {
  const idDoDeal = activity?.dealId ?? dealId;

  // Evento sem cliente associado (agenda interna) não notifica ninguém.
  if (!idDoDeal) {
    console.log('[agenda:notificar] evento sem dealId — nada a enviar.');
    return { skipped: true, motivo: 'sem_deal' };
  }

  if (!TIPOS_NOTIFICAVEIS.includes(activity?.type)) {
    console.log(`[agenda:notificar] tipo ${activity?.type} não notifica o cliente.`);
    return { skipped: true, motivo: 'tipo_interno' };
  }

  const deal = await prisma.deal.findFirst({
    where: { id: idDoDeal, deletedAt: null },
    select: { contact: { select: { id: true, name: true, whatsapp: true } } },
  });

  const contato = deal?.contact;
  if (!contato?.whatsapp) {
    console.log(`[agenda:notificar] contato do deal ${idDoDeal} sem WhatsApp — ignorado.`);
    return { skipped: true, motivo: 'sem_whatsapp' };
  }

  const org = await prisma.organization.findFirst({ select: { name: true } });

  const texto = montarMensagemAgenda({
    nome: contato.name,
    orgName: org?.name,
    tipo: activity.type,
    dueAt: activity.dueAt,
  });

  try {
    // sendWhatsappMessage já grava o MESSAGE_OUT na timeline.
    const envio = await sendWhatsappMessage({
      to: contato.whatsapp,
      text: texto,
      dealId: idDoDeal,
      contactId: contato.id,
    });

    if (envio?.skipped) {
      console.log('[agenda:notificar] sem credenciais WhatsApp — não enviado.');
      return { skipped: true, motivo: 'sem_credenciais' };
    }

    console.log(`[agenda:notificar] enviado para ${contato.whatsapp} (deal ${idDoDeal}).`);
    return { sent: true };
  } catch (err) {
    console.error('[agenda:notificar] falhou:', err.message);
    return { skipped: true, motivo: 'erro_envio', erro: err.message };
  }
}
