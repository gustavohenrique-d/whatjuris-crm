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
