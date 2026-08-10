// =============================================================================
// WhatJuris CRM — Parse/normalização/validação da saída do agente (Módulo 4)
// lib/triage/validate-output.js
//
// Espelha o nó Code "Validar e Recalcular Resultado" do workflow, mas em JS
// testável e reusado pelo backend (o endpoint revalida — nunca confia na LLM).
// =============================================================================

import { computeQualification } from '@/lib/triage/qualify';

const DADOS_KEYS = ['nome', 'area', 'resumo_caso', 'urgencia'];
const FASES = ['coletando_dados', 'qualificado', 'desqualificado'];

// Remove cercas ```json ... ``` e espaços.
function stripFences(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export function parseTriageOutput(raw) {
  const cleaned = stripFences(raw);
  if (!cleaned) return { ok: false, error: 'INVALID_JSON_OUTPUT' };
  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch {
    return { ok: false, error: 'INVALID_JSON_OUTPUT' };
  }
}

// Mantém só as chaves permitidas (remove propriedades extras — caso 8),
// converte '' → null e faz trim das strings.
export function normalizeDados(dados) {
  const out = {};
  for (const k of DADOS_KEYS) {
    let v = dados?.[k];
    if (typeof v === 'string') {
      v = v.trim();
      if (v === '') v = null;
    } else if (v === undefined) {
      v = null;
    }
    out[k] = v;
  }
  return out;
}

// Motivo do descarte: trim, '' → null, corte no limite aceito pelo endpoint.
export function normalizeMotivo(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, 300);
}

// Validação estrita (manual — sem dependência de ajv) do objeto já normalizado.
export function validateTriageOutput(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['not_an_object'] };

  if (typeof obj.mensagem_para_cliente !== 'string' || obj.mensagem_para_cliente.trim() === '') {
    errors.push('mensagem_para_cliente');
  }
  if (!FASES.includes(obj.fase_triagem)) errors.push('fase_triagem');

  const d = obj.dados_extraidos;
  if (!d || typeof d !== 'object') {
    errors.push('dados_extraidos');
  } else {
    for (const k of ['nome', 'area', 'resumo_caso']) {
      if (!(d[k] === null || typeof d[k] === 'string')) errors.push(`dados_extraidos.${k}`);
    }
    if (!(d.urgencia === null || ['Baixa', 'Média', 'Alta'].includes(d.urgencia))) {
      errors.push('dados_extraidos.urgencia');
    }
  }

  // Opcional — só valida o tipo quando o agente mandou algo.
  const motivo = obj.motivo_desqualificacao;
  if (!(motivo === undefined || motivo === null || typeof motivo === 'string')) {
    errors.push('motivo_desqualificacao');
  }

  return { valid: errors.length === 0, errors };
}

// Pipeline completo (mirror do nó Code): parse → normaliza → recalcula
// qualificação → valida. Devolve o "envelope" pronto para o próximo passo.
export function processAgentOutput(raw) {
  const parsed = parseTriageOutput(raw);
  if (!parsed.ok) {
    return { agent_status: 'error', agent_error: parsed.error, allow_send: false };
  }
  const result = parsed.value;
  const dados = normalizeDados(result.dados_extraidos || {});
  const { qualified, faseTriagem } = computeQualification(dados, result.fase_triagem);

  const normalized = {
    dados_extraidos: dados,
    mensagem_para_cliente: result.mensagem_para_cliente,
    fase_triagem: faseTriagem,
    lead_qualificado: qualified,
    // Campo top-level: o objeto é reconstruído do zero aqui, então sem isto
    // o motivo se perderia antes de chegar no endpoint.
    motivo_desqualificacao: normalizeMotivo(result.motivo_desqualificacao),
  };

  if (typeof normalized.mensagem_para_cliente !== 'string' || normalized.mensagem_para_cliente.trim() === '') {
    return { agent_status: 'error', agent_error: 'MISSING_CLIENT_MESSAGE', allow_send: false };
  }

  const { valid, errors } = validateTriageOutput(normalized);
  if (!valid) {
    return { agent_status: 'error', agent_error: 'SCHEMA_VALIDATION_FAILED', errors, allow_send: false };
  }

  return { agent_status: 'success', allow_send: true, result_valid: true, ...normalized };
}
