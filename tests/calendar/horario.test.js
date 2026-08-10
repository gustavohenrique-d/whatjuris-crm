import { describe, it, expect } from 'vitest';
import { paraInstante, dentroDoExpediente, formatarBR, EXPEDIENTE_PADRAO } from '@/lib/calendar/horario';

// business_hours real da organização (seg–sex 09:00–18:00, fim de semana null)
const EXPEDIENTE = {
  mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'],
  thu: ['09:00', '18:00'], fri: ['09:00', '18:00'], sat: null, sun: null,
};

describe('paraInstante — hora de Brasília vira o instante UTC certo', () => {
  it('14:00 BRT = 17:00Z (o caso que quebraria em produção)', () => {
    expect(paraInstante('2026-08-12', '14:00').toISOString()).toBe('2026-08-12T17:00:00.000Z');
  });

  it('vira o dia quando a hora passa de 21:00 BRT', () => {
    expect(paraInstante('2026-08-12', '22:30').toISOString()).toBe('2026-08-13T01:30:00.000Z');
  });

  it('independe do fuso do processo (offset explícito, não local)', () => {
    // Se usasse new Date('...T09:00') o resultado mudaria conforme o TZ do host.
    expect(paraInstante('2026-01-05', '09:00').toISOString()).toBe('2026-01-05T12:00:00.000Z');
  });

  it('formato inválido → null', () => {
    for (const [d, h] of [['12/08/2026', '14:00'], ['2026-08-12', '14h'], ['2026-08-12', '25:00'], [null, '14:00'], ['2026-08-12', null]]) {
      expect(paraInstante(d, h)).toBeNull();
    }
  });

  it('data inexistente → null (V8 faria rollover silencioso)', () => {
    // new Date('2026-02-30T...') devolve 02/03 em vez de Invalid Date.
    // Sem a conferência em paraInstante, o agendamento cairia 3 dias depois.
    expect(paraInstante('2026-02-30', '10:00')).toBeNull();
    expect(paraInstante('2026-04-31', '10:00')).toBeNull();
    expect(paraInstante('2026-13-01', '10:00')).toBeNull();
    expect(paraInstante('2025-02-29', '10:00')).toBeNull(); // 2025 não é bissexto
  });

  it('29/02 em ano bissexto continua válido', () => {
    expect(paraInstante('2028-02-29', '10:00').toISOString()).toBe('2028-02-29T13:00:00.000Z');
  });
});

describe('dentroDoExpediente', () => {
  it('terça 14:00 → dentro', () => {
    expect(dentroDoExpediente(paraInstante('2026-08-11', '14:00'), EXPEDIENTE)).toBe(true);
  });

  it('aceita exatamente a abertura (09:00)', () => {
    expect(dentroDoExpediente(paraInstante('2026-08-11', '09:00'), EXPEDIENTE)).toBe(true);
  });

  it('recusa exatamente o fechamento (18:00) — a consulta terminaria fora', () => {
    expect(dentroDoExpediente(paraInstante('2026-08-11', '18:00'), EXPEDIENTE)).toBe(false);
  });

  it('recusa antes de abrir e depois de fechar', () => {
    expect(dentroDoExpediente(paraInstante('2026-08-11', '08:59'), EXPEDIENTE)).toBe(false);
    expect(dentroDoExpediente(paraInstante('2026-08-11', '22:00'), EXPEDIENTE)).toBe(false);
  });

  it('recusa sábado e domingo (dia null)', () => {
    expect(dentroDoExpediente(paraInstante('2026-08-15', '10:00'), EXPEDIENTE)).toBe(false); // sábado
    expect(dentroDoExpediente(paraInstante('2026-08-16', '10:00'), EXPEDIENTE)).toBe(false); // domingo
  });

  it('julga pelo dia em BRASÍLIA, não em UTC', () => {
    // Sábado 00:30 BRT = sexta 03:30 UTC. Em UTC pareceria dia útil.
    expect(dentroDoExpediente(paraInstante('2026-08-15', '00:30'), EXPEDIENTE)).toBe(false);
    // Sexta 22:00 BRT = sábado 01:00 UTC. Em UTC pareceria fim de semana.
    // Continua false, mas por estar fora da faixa — não por ser sábado.
    expect(dentroDoExpediente(paraInstante('2026-08-14', '22:00'), EXPEDIENTE)).toBe(false);
    expect(dentroDoExpediente(paraInstante('2026-08-14', '17:00'), EXPEDIENTE)).toBe(true);
  });

  it('sem businessHours cai no padrão seg–sex 09–18', () => {
    expect(dentroDoExpediente(paraInstante('2026-08-11', '10:00'), null)).toBe(true);
    expect(dentroDoExpediente(paraInstante('2026-08-16', '10:00'), undefined)).toBe(false);
    expect(EXPEDIENTE_PADRAO.sun).toBeNull();
  });

  it('instante inválido → false, sem lançar', () => {
    expect(dentroDoExpediente(null, EXPEDIENTE)).toBe(false);
    expect(dentroDoExpediente(new Date('nada'), EXPEDIENTE)).toBe(false);
  });
});

describe('formatarBR', () => {
  it('mostra o horário de Brasília, não o UTC', () => {
    expect(formatarBR(paraInstante('2026-08-12', '14:00'))).toBe('12/08/2026 14:00');
  });
});
