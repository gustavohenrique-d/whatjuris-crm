import { describe, it, expect } from 'vitest';
import { hojeISO, inicioDoMesUTC, estaAtrasada } from '@/lib/financeiro/datas';

describe('hojeISO — dia de Brasília, não do servidor', () => {
  it('22h de Brasília ainda é o mesmo dia (o servidor em UTC já virou)', () => {
    // 2026-08-13T01:00Z = 12/08 às 22:00 em Brasília
    expect(hojeISO(new Date('2026-08-13T01:00:00Z'))).toBe('2026-08-12');
  });
  it('meio-dia é trivialmente o mesmo dia', () => {
    expect(hojeISO(new Date('2026-08-12T15:00:00Z'))).toBe('2026-08-12');
  });
});

describe('estaAtrasada', () => {
  const agora = new Date('2026-08-12T15:00:00Z'); // 12/08 12:00 BRT
  it('pendente com vencimento passado', () => {
    expect(estaAtrasada({ status: 'PENDING', dueDate: '2026-08-11' }, agora)).toBe(true);
  });
  it('pendente que vence HOJE ainda não está atrasada', () => {
    expect(estaAtrasada({ status: 'PENDING', dueDate: '2026-08-12' }, agora)).toBe(false);
  });
  it('paga nunca está atrasada, mesmo vencida', () => {
    expect(estaAtrasada({ status: 'PAID', dueDate: '2026-01-01' }, agora)).toBe(false);
  });
  it('aceita Date além de string', () => {
    expect(estaAtrasada({ status: 'PENDING', dueDate: new Date('2026-08-01T00:00:00Z') }, agora)).toBe(true);
  });
});

describe('inicioDoMesUTC', () => {
  it('primeiro dia do mês corrente', () => {
    expect(inicioDoMesUTC(new Date('2026-08-12T15:00:00Z')).toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });
});
