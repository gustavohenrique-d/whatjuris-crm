// =============================================================================
// WhatJuris CRM — Horário de agendamento (fuso + expediente)
// lib/calendar/horario.js
//
// O agente devolve data e hora SEM fuso ("2026-08-12", "14:00"), significando
// horário de Brasília. O servidor de produção (Render) roda em UTC, então
// `new Date('2026-08-12T14:00')` resolveria 14:00 UTC = 11:00 em São Paulo e a
// consulta cairia 3h antes do combinado. Por isso o offset é explícito aqui.
//
// Funções PURAS (sem Prisma, sem rede) — testáveis isoladamente.
// =============================================================================

// O Brasil não usa mais horário de verão desde 2019, então o offset é fixo.
const OFFSET_BR = '-03:00';
const MS_POR_HORA = 60 * 60 * 1000;

// Espelha o fallback do prompt do agendador (lib/ai/prompts.js).
const EXPEDIENTE_PADRAO = {
  mon: ['09:00', '18:00'],
  tue: ['09:00', '18:00'],
  wed: ['09:00', '18:00'],
  thu: ['09:00', '18:00'],
  fri: ['09:00', '18:00'],
  sat: null,
  sun: null,
};

const DIAS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// 'HH:MM' -> minutos desde a meia-noite. null se inválido.
function paraMinutos(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm ?? ''));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Converte data ('YYYY-MM-DD') + hora ('HH:MM') de Brasília no instante UTC
// correspondente. Devolve null se o formato ou a data forem inválidos
// (31/02, 25:00 etc.). Não depende do fuso do processo.
export function paraInstante(data, hora) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data ?? ''))) return null;
  if (paraMinutos(hora) === null) return null;

  const d = new Date(`${data}T${hora}:00${OFFSET_BR}`);
  if (Number.isNaN(d.getTime())) return null;

  // V8 NÃO rejeita data inexistente: '2026-02-30' vira 02/03 silenciosamente.
  // Sem esta conferência, uma data alucinada pelo agente viraria agendamento
  // três dias depois do que ele disse.
  return relogioBR(d).data === data ? d : null;
}

// Lê o "relógio de parede" de Brasília a partir de um instante UTC.
function relogioBR(instante) {
  const deslocado = new Date(instante.getTime() - 3 * MS_POR_HORA);
  return {
    dia: DIAS[deslocado.getUTCDay()],
    data: deslocado.toISOString().slice(0, 10),
    minutos: deslocado.getUTCHours() * 60 + deslocado.getUTCMinutes(),
  };
}

// O instante cai dentro do expediente do escritório?
// `businessHours` é o JSONB de organization ({ mon: ['09:00','18:00'], sat: null }).
// Dia com valor null (fim de semana) e horário fora da faixa retornam false.
// O fim da faixa é EXCLUSIVO: marcar às 18:00 num expediente que fecha às 18:00
// terminaria fora do horário, então é recusado.
export function dentroDoExpediente(instante, businessHours) {
  if (!(instante instanceof Date) || Number.isNaN(instante.getTime())) return false;

  const horarios = businessHours && typeof businessHours === 'object'
    ? businessHours
    : EXPEDIENTE_PADRAO;

  const { dia, minutos } = relogioBR(instante);
  const faixa = horarios[dia];
  if (!Array.isArray(faixa) || faixa.length !== 2) return false;

  const inicio = paraMinutos(faixa[0]);
  const fim = paraMinutos(faixa[1]);
  if (inicio === null || fim === null) return false;

  return minutos >= inicio && minutos < fim;
}

// Data/hora em pt-BR no fuso de Brasília, para a mensagem ao cliente.
// Ex.: "12/08/2026 14:00"
export function formatarBR(instante) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(instante).replace(', ', ' ');
}

export { EXPEDIENTE_PADRAO };
