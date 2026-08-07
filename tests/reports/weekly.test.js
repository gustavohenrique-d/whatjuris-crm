import { describe, it, expect } from 'vitest';
import {
  getPreviousWeekRange,
  normalizeGroups,
  renderWeeklyReportHtml,
  reportSubject,
} from '@/lib/reports/weekly';

describe('getPreviousWeekRange', () => {
  it('retorna segunda→segunda (7 dias), ambos segunda-feira 00:00 UTC', () => {
    const { start, end } = getPreviousWeekRange(new Date('2026-08-06T11:00:00Z'));
    expect(start.getUTCDay()).toBe(1); // segunda
    expect(end.getUTCDay()).toBe(1);   // segunda
    expect(start.getUTCHours()).toBe(0);
    expect(end - start).toBe(7 * 24 * 3600 * 1000);
  });

  it('a semana anterior termina no início da semana atual (últimos 7 dias)', () => {
    const now = new Date('2026-08-06T11:00:00Z');
    const { end } = getPreviousWeekRange(now);
    expect(end.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(now.getTime() - end.getTime()).toBeLessThan(7 * 24 * 3600 * 1000);
  });

  it('quando now já é segunda, end = essa segunda 00:00', () => {
    // 2026-08-06 é quinta; a segunda da semana é 2026-08-03.
    const { end } = getPreviousWeekRange(new Date('2026-08-03T09:00:00Z'));
    expect(end.toISOString().slice(0, 10)).toBe('2026-08-03');
    expect(end.getUTCHours()).toBe(0);
  });
});

describe('normalizeGroups', () => {
  it('ordena desc e aplica fallback para null', () => {
    const rows = [
      { legalArea: null, _count: { id: 2 } },
      { legalArea: 'trabalhista', _count: { id: 5 } },
    ];
    expect(normalizeGroups(rows, 'legalArea', { fallback: '(sem área)' })).toEqual([
      { label: 'trabalhista', total: 5 },
      { label: '(sem área)', total: 2 },
    ]);
  });

  it('lista vazia → []', () => {
    expect(normalizeGroups([], 'legalArea')).toEqual([]);
  });
});

describe('renderWeeklyReportHtml', () => {
  const range = getPreviousWeekRange(new Date('2026-08-06T11:00:00Z'));

  it('inclui total, período e as 3 tabelas; mapeia rótulo da fase', () => {
    const html = renderWeeklyReportHtml({
      range,
      total: 7,
      byArea: [{ label: 'Trabalhista', total: 4 }],
      byUrgencia: [{ label: 'Alta', total: 3 }],
      byFase: [{ label: 'qualificado', total: 2 }],
    });
    expect(html).toContain('Total de leads novos: <strong>7</strong>');
    expect(html).toContain('Por área jurídica');
    expect(html).toContain('Trabalhista');
    expect(html).toContain('Por urgência');
    expect(html).toContain('Por fase da triagem');
    expect(html).toContain('Qualificado'); // FASE_LABEL: qualificado → Qualificado
  });

  it('sem leads → "Nenhum lead no período"', () => {
    const html = renderWeeklyReportHtml({ range, total: 0, byArea: [], byUrgencia: [], byFase: [] });
    expect(html).toContain('Nenhum lead no período');
  });
});

describe('reportSubject', () => {
  it('inclui o intervalo de datas', () => {
    const range = getPreviousWeekRange(new Date('2026-08-06T11:00:00Z'));
    expect(reportSubject(range)).toMatch(
      /Relatório semanal de leads — \d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}/
    );
  });
});
