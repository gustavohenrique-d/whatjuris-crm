import { describe, it, expect } from 'vitest';
import { parseTriageOutput, normalizeDados, validateTriageOutput, processAgentOutput } from '@/lib/triage/validate-output';

const validOutput = {
  dados_extraidos: { nome: 'João da Silva', area: 'Trabalhista', resumo_caso: 'Demissão sem verbas rescisórias.', urgencia: 'Média' },
  mensagem_para_cliente: 'Obrigado, João. Vou encaminhar seu caso ao advogado.',
  fase_triagem: 'qualificado',
  lead_qualificado: true,
};

describe('parseTriageOutput', () => {
  it('JSON válido → ok (caso 2)', () => {
    const r = parseTriageOutput(JSON.stringify(validOutput));
    expect(r.ok).toBe(true);
    expect(r.value.dados_extraidos.nome).toBe('João da Silva');
  });
  it('remove cercas ```json', () => {
    const r = parseTriageOutput('```json\n' + JSON.stringify(validOutput) + '\n```');
    expect(r.ok).toBe(true);
  });
  it('JSON inválido → INVALID_JSON_OUTPUT (caso 3)', () => {
    expect(parseTriageOutput('não sou json {').error).toBe('INVALID_JSON_OUTPUT');
  });
});

describe('normalizeDados', () => {
  it('string vazia → null (caso 7)', () => {
    expect(normalizeDados({ nome: '', area: 'Cível', resumo_caso: '  ', urgencia: 'Baixa' }))
      .toEqual({ nome: null, area: 'Cível', resumo_caso: null, urgencia: 'Baixa' });
  });
  it('propriedade extra é removida (caso 8)', () => {
    const out = normalizeDados({ nome: 'Ana', area: 'Família', resumo_caso: 'x'.repeat(20), urgencia: 'Alta', hacker: 'DROP TABLE' });
    expect(out).not.toHaveProperty('hacker');
    expect(Object.keys(out).sort()).toEqual(['area', 'nome', 'resumo_caso', 'urgencia']);
  });
});

describe('validateTriageOutput', () => {
  it('saída válida → valid', () => {
    expect(validateTriageOutput(validOutput).valid).toBe(true);
  });
  it('sem mensagem_para_cliente → inválido', () => {
    expect(validateTriageOutput({ ...validOutput, mensagem_para_cliente: '' }).valid).toBe(false);
  });
  it('fase_triagem inválida → inválido', () => {
    expect(validateTriageOutput({ ...validOutput, fase_triagem: 'qualquer' }).valid).toBe(false);
  });
});

describe('processAgentOutput (pipeline completo)', () => {
  it('recalcula lead_qualificado — não confia na LLM (caso 9)', () => {
    // LLM diz qualificado=true, mas sem nome → backend recalcula false
    const mentiroso = { ...validOutput, dados_extraidos: { ...validOutput.dados_extraidos, nome: null }, lead_qualificado: true };
    const r = processAgentOutput(JSON.stringify(mentiroso));
    expect(r.agent_status).toBe('success');
    expect(r.lead_qualificado).toBe(false);
    expect(r.fase_triagem).toBe('coletando_dados');
  });
  it('JSON inválido → error INVALID_JSON_OUTPUT (caso 3)', () => {
    expect(processAgentOutput('lixo').agent_error).toBe('INVALID_JSON_OUTPUT');
  });
  it('sem mensagem_para_cliente → MISSING_CLIENT_MESSAGE', () => {
    const semMsg = { ...validOutput }; delete semMsg.mensagem_para_cliente;
    expect(processAgentOutput(JSON.stringify(semMsg)).agent_error).toBe('MISSING_CLIENT_MESSAGE');
  });
});

describe('pediu_agendamento', () => {
  const comPedido = (v) => JSON.stringify({ ...validOutput, pediu_agendamento: v });

  it('true sobrevive à reconstrução do objeto no pipeline', () => {
    expect(processAgentOutput(comPedido(true)).pediu_agendamento).toBe(true);
  });

  it('ausente vira false — nunca undefined, que sumiria no JSON do body', () => {
    expect(processAgentOutput(JSON.stringify(validOutput)).pediu_agendamento).toBe(false);
  });

  it('só o booleano true conta: string, número e objeto viram false', () => {
    for (const v of ['true', 1, 'sim', {}, [], null]) {
      expect(processAgentOutput(comPedido(v)).pediu_agendamento).toBe(false);
    }
  });

  it('validateTriageOutput rejeita tipo errado só quando o campo veio', () => {
    expect(validateTriageOutput({ ...validOutput }).valid).toBe(true);
    expect(validateTriageOutput({ ...validOutput, pediu_agendamento: true }).valid).toBe(true);
    const ruim = validateTriageOutput({ ...validOutput, pediu_agendamento: 'sim' });
    expect(ruim.valid).toBe(false);
    expect(ruim.errors).toContain('pediu_agendamento');
  });
});
