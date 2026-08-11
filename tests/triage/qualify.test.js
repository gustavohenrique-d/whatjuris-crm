import { describe, it, expect } from 'vitest';
import { isQualified, computeQualification } from '@/lib/triage/qualify';

const base = { nome: 'João da Silva', area: 'Trabalhista', resumo_caso: 'Demissão sem pagamento das verbas.', urgencia: 'Média' };

describe('isQualified', () => {
  it('todos os dados válidos → true (caso 4)', () => {
    expect(isQualified(base)).toBe(true);
  });
  it('sem nome (ou < 3 chars) → false (caso 5)', () => {
    expect(isQualified({ ...base, nome: 'Jo' })).toBe(false);
    expect(isQualified({ ...base, nome: null })).toBe(false);
  });
  it('área "Não identificado" → false (caso 6)', () => {
    expect(isQualified({ ...base, area: 'Não identificado' })).toBe(false);
  });
  it('resumo curto (< 10 chars) → false', () => {
    expect(isQualified({ ...base, resumo_caso: 'curto' })).toBe(false);
  });
  it('urgência inválida → false', () => {
    expect(isQualified({ ...base, urgencia: 'Urgentíssimo' })).toBe(false);
    expect(isQualified({ ...base, urgencia: null })).toBe(false);
  });
});

describe('computeQualification', () => {
  it('qualificado → fase qualificado', () => {
    expect(computeQualification(base)).toEqual({ qualified: true, faseTriagem: 'qualificado' });
  });
  it('não qualificado + sugestão desqualificado → desqualificado', () => {
    expect(computeQualification({ ...base, nome: null }, 'desqualificado').faseTriagem).toBe('desqualificado');
  });
  it('não qualificado sem sugestão → coletando_dados', () => {
    expect(computeQualification({ ...base, nome: null }).faseTriagem).toBe('coletando_dados');
  });
});

describe('computeQualification — estado acumulado (não rebaixar por ausência)', () => {
  const vazio = { nome: null, area: null, resumo_caso: null, urgencia: null };

  it('(a) já qualificado + mensagem sem dados → continua qualificado', () => {
    const r = computeQualification(vazio, 'coletando_dados', { jaQualificado: true });
    expect(r.faseTriagem).toBe('qualificado');
  });

  it('(d) nunca qualificado + mensagem sem dados → coletando_dados', () => {
    const r = computeQualification(vazio, 'coletando_dados', { jaQualificado: false });
    expect(r.faseTriagem).toBe('coletando_dados');
    expect(computeQualification(vazio, null, {}).faseTriagem).toBe('coletando_dados');
  });

  it('(e) qualified continua vindo só da mensagem, mesmo com a fase forçada', () => {
    const r = computeQualification(vazio, null, { jaQualificado: true });
    expect(r.faseTriagem).toBe('qualificado');
    expect(r.qualified).toBe(false); // senão lead_qualified redispararia
  });

  it('(b) desqualificado explícito vence o estado acumulado', () => {
    const r = computeQualification(vazio, 'desqualificado', { jaQualificado: true });
    expect(r.faseTriagem).toBe('desqualificado');
  });

  it('(b) desqualificado explícito vence até ficha completa (precedência invertida)', () => {
    const r = computeQualification(base, 'desqualificado', { jaQualificado: true });
    expect(r.faseTriagem).toBe('desqualificado');
    expect(r.qualified).toBe(true); // os dados seguem completos; só a fase muda
  });

  it('(c) coleta que completa os dados qualifica normalmente', () => {
    const r = computeQualification(base, 'coletando_dados', { jaQualificado: false });
    expect(r).toEqual({ qualified: true, faseTriagem: 'qualificado' });
  });
});
