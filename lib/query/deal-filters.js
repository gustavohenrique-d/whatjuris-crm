// =============================================================================
// WhatJuris CRM — Filtros de listagem de deals (Módulo 6)
// lib/query/deal-filters.js
//
// Parte SÍNCRONA dos filtros (testável). O filtro "atendimento_humano" precisa
// consultar conversation_controls e é resolvido no handler (needsHumanFilter).
// =============================================================================

const FASE_POR_STATUS = {
  em_triagem: 'coletando_dados',
  qualificado: 'qualificado',
  desqualificado: 'desqualificado',
};

export function applyListFilters(where, query = {}) {
  const { stageId, stageKey, legalArea, ownerId, status, urgencia, search } = query;

  if (stageId) where.stageId = stageId;
  if (stageKey) where.stage = { key: stageKey };
  if (legalArea) where.legalArea = legalArea;
  if (ownerId) where.ownerId = ownerId;

  if (urgencia && ['Baixa', 'Média', 'Alta'].includes(urgencia)) where.urgencia = urgencia;
  if (FASE_POR_STATUS[status]) where.faseTriage = FASE_POR_STATUS[status];

  const contactAnd = [];
  if (search && String(search).trim()) {
    const term = String(search).trim();
    const digits = term.replace(/\D/g, '');
    const or = [{ name: { contains: term, mode: 'insensitive' } }];
    if (digits) or.push({ whatsapp: { contains: digits } });
    contactAnd.push({ OR: or });
  }

  return { where, contactAnd, needsHumanFilter: status === 'atendimento_humano' };
}
