import { describe, it, expect } from 'vitest';
import { applyListFilters, attachControlState } from '@/lib/query/deal-filters';

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

describe('attachControlState', () => {
  const deals = [
    { id: 'a', contact: { whatsapp: '5511111111111' } }, // falha da IA
    { id: 'b', contact: { whatsapp: '5522222222222' } }, // takeover manual
    { id: 'c', contact: { whatsapp: '5533333333333' } }, // sem controle (IA)
    { id: 'd', contact: null },                            // sem contato
  ];
  const controls = [
    { chatId: '5511111111111', takeoverSource: 'automatic_timeout' },
    { chatId: '5522222222222', takeoverSource: 'crm_human' },
  ];

  it('marca automatic_timeout (falha da IA) como human + source', () => {
    const out = attachControlState(deals, controls);
    expect(out[0].control).toEqual({ mode: 'human', source: 'automatic_timeout' });
  });

  it('marca crm_human (manual) como human + source', () => {
    const out = attachControlState(deals, controls);
    expect(out[1].control).toEqual({ mode: 'human', source: 'crm_human' });
  });

  it('deal sem controle ativo → mode ai, source null', () => {
    const out = attachControlState(deals, controls);
    expect(out[2].control).toEqual({ mode: 'ai', source: null });
    expect(out[3].control).toEqual({ mode: 'ai', source: null }); // sem contato
  });

  it('takeoverSource null (humano sem source) → mode human, source null', () => {
    const out = attachControlState(
      [{ id: 'x', contact: { whatsapp: '55999' } }],
      [{ chatId: '55999', takeoverSource: null }]
    );
    expect(out[0].control).toEqual({ mode: 'human', source: null });
  });

  it('sem controles → todos em modo ai; não muta o deal original', () => {
    const out = attachControlState(deals, []);
    expect(out.every((d) => d.control.mode === 'ai')).toBe(true);
    expect(deals[0].control).toBeUndefined(); // original intacto
  });
});
