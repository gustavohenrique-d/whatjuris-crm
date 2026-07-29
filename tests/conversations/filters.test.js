import { describe, it, expect } from 'vitest';
import { applyListFilters } from '@/lib/query/deal-filters';

describe('applyListFilters (caso 7)', () => {
  it('status em_triagem → faseTriage coletando_dados', () => {
    const { where } = applyListFilters({}, { status: 'em_triagem' });
    expect(where.faseTriage).toBe('coletando_dados');
  });

  it('status qualificado → faseTriage qualificado', () => {
    expect(applyListFilters({}, { status: 'qualificado' }).where.faseTriage).toBe('qualificado');
  });

  it('urgência válida entra no where; inválida é ignorada', () => {
    expect(applyListFilters({}, { urgencia: 'Alta' }).where.urgencia).toBe('Alta');
    expect(applyListFilters({}, { urgencia: 'Urgentíssimo' }).where.urgencia).toBeUndefined();
  });

  it('busca por nome → OR em contact.name (insensitive)', () => {
    const { contactAnd } = applyListFilters({}, { search: 'joão' });
    expect(contactAnd[0].OR).toContainEqual({ name: { contains: 'joão', mode: 'insensitive' } });
  });

  it('busca com dígitos → também busca no whatsapp', () => {
    const { contactAnd } = applyListFilters({}, { search: '5511 99999' });
    expect(contactAnd[0].OR).toContainEqual({ whatsapp: { contains: '551199999' } });
  });

  it('status atendimento_humano → needsHumanFilter true', () => {
    expect(applyListFilters({}, { status: 'atendimento_humano' }).needsHumanFilter).toBe(true);
    expect(applyListFilters({}, { status: 'qualificado' }).needsHumanFilter).toBe(false);
  });

  it('sem filtros → where limpo, sem contactAnd', () => {
    const { where, contactAnd, needsHumanFilter } = applyListFilters({ deletedAt: null }, {});
    expect(where).toEqual({ deletedAt: null });
    expect(contactAnd).toEqual([]);
    expect(needsHumanFilter).toBe(false);
  });
});
