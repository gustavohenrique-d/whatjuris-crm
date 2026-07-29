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

// Deriva a fase a partir da qualificação recalculada. Só respeita
// 'desqualificado' explícito da LLM; caso contrário coletando_dados.
export function computeQualification(dados = {}, faseSugerida = null) {
  const qualified = isQualified(dados);
  const faseTriagem = qualified
    ? 'qualificado'
    : faseSugerida === 'desqualificado'
      ? 'desqualificado'
      : 'coletando_dados';
  return { qualified, faseTriagem };
}

export { URGENCIAS };
