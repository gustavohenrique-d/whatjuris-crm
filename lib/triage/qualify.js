// =============================================================================
// WhatJuris CRM — Qualificação de triagem (Módulo 4)
// lib/triage/qualify.js
//
// O backend RECALCULA a qualificação — nunca confia no `lead_qualificado` que a
// LLM devolveu. Critério fixo (seção 9 do prompt).
// =============================================================================

const URGENCIAS = ['Baixa', 'Média', 'Alta'];

export function isQualified(dados = {}) {
  const nome = typeof dados.nome === 'string' ? dados.nome.trim() : '';
  const area = typeof dados.area === 'string' ? dados.area.trim() : '';
  const resumo = typeof dados.resumo_caso === 'string' ? dados.resumo_caso.trim() : '';
  return (
    nome.length >= 3 &&
    !!area &&
    area !== 'Não identificado' &&
    resumo.length >= 10 &&
    URGENCIAS.includes(dados.urgencia)
  );
}

// Deriva a fase a partir da qualificação recalculada.
//
// `estado.jaQualificado` (deal.qualifiedAt != null) é a prova durável de que o
// deal já atingiu o critério alguma vez. Sem ele, uma mensagem sem dados novos
// — "quero marcar", um "oi" — rebaixava o lead de qualificado para
// coletando_dados, porque o agente não repete a cada turno o que já coletou.
// Dado só acumula; não faz sentido a fase regredir por ausência.
//
// `qualified` continua saindo SÓ da mensagem atual: ele governa `qualifiedAt` e
// a notificação `lead_qualified`, que devem disparar uma única vez. A fase é a
// única coisa que o estado acumulado influencia.
export function computeQualification(dados = {}, faseSugerida = null, estado = {}) {
  const qualified = isQualified(dados);

  // Desqualificação explícita da LLM vence tudo, inclusive ficha completa: um
  // lead com todos os dados que diz "já tenho advogado" precisa poder ser
  // descartado. É o caminho de saída que impede a fase de travar em qualificado.
  if (faseSugerida === 'desqualificado') {
    return { qualified, faseTriagem: 'desqualificado' };
  }

  if (qualified || estado.jaQualificado) {
    return { qualified, faseTriagem: 'qualificado' };
  }

  return { qualified, faseTriagem: 'coletando_dados' };
}

export { URGENCIAS };
