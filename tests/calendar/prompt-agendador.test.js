import { describe, it, expect } from 'vitest';
import { getPromptAgendador } from '@/lib/ai/prompts';
import { formatarDataExtensoBR, dataISOBrasilia } from '@/lib/calendar/horario';

const EXPEDIENTE = {
  mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'],
  thu: ['09:00', '18:00'], fri: ['09:00', '18:00'], sat: null, sun: null,
};

describe('getPromptAgendador — data corrente', () => {
  // 10/08/2026 14:00 BRT = segunda-feira
  const segunda = new Date('2026-08-10T17:00:00.000Z');

  it('declara a data de hoje por extenso e em ISO', () => {
    const p = getPromptAgendador({ orgName: 'Escritório X', businessHours: EXPEDIENTE, dataHoje: segunda });
    expect(p).toContain('segunda-feira');
    expect(p).toContain('10/08/2026');
    expect(p).toContain('2026-08-10');
  });

  it('proíbe inventar a data', () => {
    const p = getPromptAgendador({ orgName: 'X', businessHours: EXPEDIENTE, dataHoje: segunda });
    expect(p).toContain('NUNCA invente a data');
  });

  it('aceita string ISO além de Date (é o que o n8n envia)', () => {
    const p = getPromptAgendador({ orgName: 'X', businessHours: EXPEDIENTE, dataHoje: '2026-08-10T17:00:00.000Z' });
    expect(p).toContain('10/08/2026');
  });

  it('usa o dia de BRASÍLIA, não o de UTC', () => {
    // 11/08 00:30 UTC ainda é 10/08 21:30 em Brasília.
    const p = getPromptAgendador({ orgName: 'X', businessHours: EXPEDIENTE, dataHoje: new Date('2026-08-11T00:30:00.000Z') });
    expect(p).toContain('2026-08-10');
    expect(p).not.toContain('2026-08-11');
  });

  it('data inválida não quebra o prompt (cai em hoje)', () => {
    const p = getPromptAgendador({ orgName: 'X', businessHours: EXPEDIENTE, dataHoje: 'nao-e-data' });
    expect(p).toContain('HOJE É');
    expect(p).toContain('HORÁRIOS DISPONÍVEIS');
  });

  it('sem dataHoje usa o momento atual', () => {
    const p = getPromptAgendador({ orgName: 'X', businessHours: EXPEDIENTE });
    expect(p).toContain(dataISOBrasilia(new Date()));
  });

  it('mantém o contrato de saída com duracao_min', () => {
    const p = getPromptAgendador({ orgName: 'X', businessHours: EXPEDIENTE, dataHoje: segunda });
    expect(p).toContain('AGENDAMENTO_CONFIRMADO');
    expect(p).toContain('duracao_min');
  });
});

describe('helpers de data em Brasília', () => {
  it('formatarDataExtensoBR traz dia da semana e data', () => {
    expect(formatarDataExtensoBR(new Date('2026-08-10T17:00:00.000Z'))).toContain('segunda-feira');
    expect(formatarDataExtensoBR(new Date('2026-08-10T17:00:00.000Z'))).toContain('10/08/2026');
  });

  it('dataISOBrasilia recua o dia quando ainda não virou em SP', () => {
    expect(dataISOBrasilia(new Date('2026-08-11T02:00:00.000Z'))).toBe('2026-08-10');
    expect(dataISOBrasilia(new Date('2026-08-11T03:00:00.000Z'))).toBe('2026-08-11');
  });
});
