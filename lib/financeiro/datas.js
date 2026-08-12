// =============================================================================
// WhatJuris CRM — Datas do Financeiro
// lib/financeiro/datas.js
//
// Vencimento é DIA, não instante: `due_date` é DATE no banco. O servidor do
// Render roda em UTC e o escritório em UTC−3, então "hoje" precisa ser o dia
// de Brasília — senão, entre 21h e 0h local, o backend já viraria o dia e
// marcaria como atrasada uma parcela que vence amanhã.
// =============================================================================

const OFFSET_BR_MS = 3 * 60 * 60 * 1000;

// Data-calendário de hoje em Brasília, como 'YYYY-MM-DD'.
export function hojeISO(agora = new Date()) {
  return new Date(agora.getTime() - OFFSET_BR_MS).toISOString().slice(0, 10);
}

// Primeiro instante do mês corrente (referência de "recebido no mês"), também
// ancorado no calendário de Brasília.
export function inicioDoMesUTC(agora = new Date()) {
  const [ano, mes] = hojeISO(agora).split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0));
}

// Uma parcela está atrasada quando segue pendente e o vencimento já passou.
// Definição única, usada pela API e pela UI para não divergirem.
export function estaAtrasada(parcela, agora = new Date()) {
  if (!parcela || parcela.status !== 'PENDING' || !parcela.dueDate) return false;
  return diaISO(parcela.dueDate) < hojeISO(agora);
}

// O Prisma devolve uma coluna DATE como objeto Date (meia-noite UTC do dia).
// String(date) daria "Fri Aug 01 2026 ..." e a comparação lexicográfica com
// 'YYYY-MM-DD' seria sempre falsa — nada apareceria como atrasado.
function diaISO(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
