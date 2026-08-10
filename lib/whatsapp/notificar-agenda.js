// =============================================================================
// WhatJuris CRM — Avisar o cliente sobre a agenda gerida no CRM
// lib/whatsapp/notificar-agenda.js
//
// Cobre os três momentos do ciclo: criar, remarcar e cancelar. O Agente
// Agendador (M06) tem caminho próprio — confirma via M05 e passa
// notificarCliente:false para não duplicar.
//
// ⚠️ Os disparos moram nos handlers HTTP, NÃO em createCalendarEvent. O outro
// chamador do helper é agent-action.js (schedule_appointment); notificar
// dentro do helper faria o cliente receber a confirmação duas vezes.
//
// As funções `montarMensagem*` são PURAS (testáveis). As `notificar*` NUNCA
// lançam: quando rodam, a alteração já está gravada no banco e no Google.
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { sendWhatsappMessage } from '@/lib/whatsapp/send';
import { TIPOS } from '@/lib/calendar/google';
import { formatarDataBR, formatarHoraBR } from '@/lib/calendar/horario';

// Compromisso interno (TASK) não vira mensagem para o cliente.
const TIPOS_NOTIFICAVEIS = ['MEETING', 'CALL', 'HEARING'];

const RODAPE = 'Em caso de dúvidas, entre em contato conosco.';

function comoData(v) {
  return v instanceof Date ? v : new Date(v);
}

// "11/08/2026 às 14:00"
function quando(v) {
  const d = comoData(v);
  return `${formatarDataBR(d)} às ${formatarHoraBR(d)}`;
}

function rotuloTipo(tipo) {
  return TIPOS[tipo] || tipo;
}

// -----------------------------------------------------------------------------
// Mensagens (puras)
// -----------------------------------------------------------------------------

export function montarMensagemAgenda({ nome, orgName, tipo, dueAt }) {
  const d = comoData(dueAt);

  return [
    '✅ *Consulta agendada!*',
    '',
    `Olá, ${nome || 'tudo bem'}! Sua consulta com o escritório ${orgName || 'do seu caso'} foi confirmada.`,
    '',
    `📅 Data: ${formatarDataBR(d)}`,
    `⏰ Horário: ${formatarHoraBR(d)} (horário de Brasília)`,
    `📋 Tipo: ${rotuloTipo(tipo)}`,
    '',
    RODAPE,
  ].join('\n');
}

export function montarMensagemRemarcacao({ nome, orgName, tipo, dueAtAntigo, dueAtNovo }) {
  return [
    '🔄 *Consulta remarcada*',
    '',
    `Olá, ${nome || 'tudo bem'}! Sua ${rotuloTipo(tipo).toLowerCase()} com o escritório ${orgName || 'do seu caso'} foi remarcada.`,
    '',
    `❌ Antes: ${quando(dueAtAntigo)}`,
    `✅ Agora: ${quando(dueAtNovo)} (horário de Brasília)`,
    '',
    RODAPE,
  ].join('\n');
}

export function montarMensagemCancelamento({ nome, orgName, tipo, dueAt }) {
  return [
    '❌ *Consulta cancelada*',
    '',
    `Olá, ${nome || 'tudo bem'}! Sua ${rotuloTipo(tipo).toLowerCase()} com o escritório ${orgName || 'do seu caso'} marcada para ${quando(dueAt)} foi cancelada.`,
    '',
    'Entraremos em contato para remarcar.',
  ].join('\n');
}

// -----------------------------------------------------------------------------
// Envio
// -----------------------------------------------------------------------------

// Guardas + contato + nome do escritório. Devolve { ok:false, motivo } quando
// não se deve notificar — os três eventos compartilham exatamente estas regras.
async function resolverDestinatario({ activity, dealId, rotulo }) {
  const idDoDeal = activity?.dealId ?? dealId;

  if (!idDoDeal) {
    console.log(`[agenda:${rotulo}] evento sem dealId — nada a enviar.`);
    return { ok: false, motivo: 'sem_deal' };
  }

  if (!TIPOS_NOTIFICAVEIS.includes(activity?.type)) {
    console.log(`[agenda:${rotulo}] tipo ${activity?.type} não notifica o cliente.`);
    return { ok: false, motivo: 'tipo_interno' };
  }

  const deal = await prisma.deal.findFirst({
    where: { id: idDoDeal, deletedAt: null },
    select: { contact: { select: { id: true, name: true, whatsapp: true } } },
  });

  const contato = deal?.contact;
  if (!contato?.whatsapp) {
    console.log(`[agenda:${rotulo}] contato do deal ${idDoDeal} sem WhatsApp — ignorado.`);
    return { ok: false, motivo: 'sem_whatsapp' };
  }

  const org = await prisma.organization.findFirst({ select: { name: true } });

  return { ok: true, idDoDeal, contato, orgName: org?.name };
}

async function enviar({ contato, idDoDeal, texto, rotulo }) {
  try {
    // sendWhatsappMessage já grava o MESSAGE_OUT na timeline.
    const envio = await sendWhatsappMessage({
      to: contato.whatsapp,
      text: texto,
      dealId: idDoDeal,
      contactId: contato.id,
    });

    if (envio?.skipped) {
      console.log(`[agenda:${rotulo}] sem credenciais WhatsApp — não enviado.`);
      return { skipped: true, motivo: 'sem_credenciais' };
    }

    console.log(`[agenda:${rotulo}] enviado para ${contato.whatsapp} (deal ${idDoDeal}).`);
    return { sent: true };
  } catch (err) {
    console.error(`[agenda:${rotulo}] falhou:`, err.message);
    return { skipped: true, motivo: 'erro_envio', erro: err.message };
  }
}

export async function notificarAgendamento({ activity, dealId = null }) {
  const alvo = await resolverDestinatario({ activity, dealId, rotulo: 'notificar' });
  if (!alvo.ok) return { skipped: true, motivo: alvo.motivo };

  const texto = montarMensagemAgenda({
    nome: alvo.contato.name,
    orgName: alvo.orgName,
    tipo: activity.type,
    dueAt: activity.dueAt,
  });

  return enviar({ ...alvo, texto, rotulo: 'notificar' });
}

// `dueAtAntigo` tem que ser capturado ANTES do update — depois dele o valor
// original já se perdeu.
export async function notificarRemarcacao({ activity, dealId = null, dueAtAntigo }) {
  if (!dueAtAntigo) {
    console.log('[agenda:remarcar] sem horário anterior — nada a comparar.');
    return { skipped: true, motivo: 'sem_horario_antigo' };
  }

  const alvo = await resolverDestinatario({ activity, dealId, rotulo: 'remarcar' });
  if (!alvo.ok) return { skipped: true, motivo: alvo.motivo };

  const texto = montarMensagemRemarcacao({
    nome: alvo.contato.name,
    orgName: alvo.orgName,
    tipo: activity.type,
    dueAtAntigo,
    dueAtNovo: activity.dueAt,
  });

  return enviar({ ...alvo, texto, rotulo: 'remarcar' });
}

// Chamada DEPOIS do delete, com os dados do evento capturados antes — notificar
// antes faria o cliente receber cancelamento de algo que talvez não seja apagado.
export async function notificarCancelamento({ activity, dealId = null }) {
  const alvo = await resolverDestinatario({ activity, dealId, rotulo: 'cancelar' });
  if (!alvo.ok) return { skipped: true, motivo: alvo.motivo };

  const texto = montarMensagemCancelamento({
    nome: alvo.contato.name,
    orgName: alvo.orgName,
    tipo: activity.type,
    dueAt: activity.dueAt,
  });

  return enviar({ ...alvo, texto, rotulo: 'cancelar' });
}
