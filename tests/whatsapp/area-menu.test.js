import { describe, it, expect } from 'vitest';
import {
  areaFromReplyId,
  buildAreaMenuPayload,
  AREA_MENU_ROWS,
} from '@/lib/whatsapp/area-menu';

describe('areaFromReplyId', () => {
  it('mapeia ids conhecidos para o rótulo de área', () => {
    expect(areaFromReplyId('trabalhista')).toBe('Trabalhista');
    expect(areaFromReplyId('empresarial')).toBe('Empresarial');
    expect(areaFromReplyId('civil')).toBe('Civil e Contratual');
    expect(areaFromReplyId('meio_ambiente')).toBe('Meio Ambiente e ESG');
    expect(areaFromReplyId('investimentos')).toBe('Investimentos Internacionais');
  });
  it('"outra" e id desconhecido → null (agente investiga)', () => {
    expect(areaFromReplyId('outra')).toBeNull();
    expect(areaFromReplyId('inexistente')).toBeNull();
    expect(areaFromReplyId('')).toBeNull();
    expect(areaFromReplyId(null)).toBeNull();
  });
  it('todo id do menu está no mapa de áreas', () => {
    for (const row of AREA_MENU_ROWS) {
      // não deve lançar; retorna string (área) ou null (outra)
      const v = areaFromReplyId(row.id);
      expect(v === null || typeof v === 'string').toBe(true);
    }
  });
});

describe('buildAreaMenuPayload', () => {
  it('monta lista interativa da Cloud API com as 6 áreas', () => {
    const p = buildAreaMenuPayload('55 (13) 97801-5937');
    expect(p.messaging_product).toBe('whatsapp');
    expect(p.type).toBe('interactive');
    expect(p.interactive.type).toBe('list');
    expect(p.to).toBe('5513978015937'); // sanitizado (só dígitos)
    const rows = p.interactive.action.sections[0].rows;
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.id)).toContain('trabalhista');
    expect(rows.map((r) => r.id)).toContain('outra');
    // cada linha tem id, title e description
    for (const r of rows) {
      expect(r).toHaveProperty('id');
      expect(r).toHaveProperty('title');
      expect(r).toHaveProperty('description');
    }
  });

  it('respeita os limites de tamanho da Cloud API (senão #131009)', () => {
    const p = buildAreaMenuPayload('5513978015937');
    const it = p.interactive;
    expect([...it.action.button].length).toBeLessThanOrEqual(20);
    for (const s of it.action.sections) {
      expect([...s.title].length).toBeLessThanOrEqual(24);
      for (const r of s.rows) {
        // conta por code points (spread), como o WhatsApp
        expect([...r.title].length).toBeLessThanOrEqual(24);
        expect([...r.description].length).toBeLessThanOrEqual(72);
      }
    }
    expect([...it.header.text].length).toBeLessThanOrEqual(60);
    expect([...it.footer.text].length).toBeLessThanOrEqual(60);
  });
});
