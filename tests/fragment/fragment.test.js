import { describe, it, expect } from 'vitest';
import { fragmentMessage, calculateTypingDelay, FragmentError } from '@/lib/whatsapp/fragment';

describe('fragmentMessage', () => {
  it('um parágrafo → 1 fragmento (caso 1)', () => {
    const f = fragmentMessage('Olá, tudo bem?');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ text: 'Olá, tudo bem?', index: 0, number: 1, total: 1 });
  });

  it('dois parágrafos → 2 fragmentos (caso 2)', () => {
    const f = fragmentMessage('Primeira.\n\nSegunda.');
    expect(f.map((x) => x.text)).toEqual(['Primeira.', 'Segunda.']);
  });

  it('CRLF \\r\\n\\r\\n → fragmenta (caso 3)', () => {
    const f = fragmentMessage('Um.\r\n\r\nDois.');
    expect(f).toHaveLength(2);
  });

  it('três linhas vazias → fragmenta (caso 4)', () => {
    const f = fragmentMessage('Um.\n\n\n\nDois.');
    expect(f).toHaveLength(2);
  });

  it('espaços em branco → fragmentos limpos (caso 5)', () => {
    const f = fragmentMessage('  Um.  \n\n   Dois.   ');
    expect(f.map((x) => x.text)).toEqual(['Um.', 'Dois.']);
  });

  it('emojis preservados (caso 6)', () => {
    const f = fragmentMessage('Bem-vindo! 👋😊\n\nComo posso ajudar? ⚖️');
    expect(f[0].text).toContain('👋😊');
    expect(f[1].text).toContain('⚖️');
  });

  it('links não quebrados (caso 7)', () => {
    const url = 'https://exemplo.com/caso?id=123&ref=abc';
    const f = fragmentMessage(`Veja: ${url}`);
    expect(f[0].text).toContain(url);
  });

  it('mensagem vazia → [] (caso 9)', () => {
    expect(fragmentMessage('   ')).toEqual([]);
    expect(fragmentMessage('')).toEqual([]);
  });

  it('parágrafo > maxChars → subdividido por sentença (caso 10)', () => {
    const big = ('Frase de tamanho médio para teste. '.repeat(20)).trim(); // ~700 chars
    const f = fragmentMessage(big, { maxChars: 200 });
    expect(f.length).toBeGreaterThan(1);
    expect(f.every((x) => x.text.length <= 200)).toBe(true);
  });

  it('> maxFragments → lança TOO_MANY_FRAGMENTS (caso 11)', () => {
    const many = Array.from({ length: 11 }, (_, i) => `Parágrafo ${i}.`).join('\n\n');
    try {
      fragmentMessage(many, { maxFragments: 10 });
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(FragmentError);
      expect(e.code).toBe('TOO_MANY_FRAGMENTS');
    }
  });

  it('ordem preservada por index (caso 12)', () => {
    const f = fragmentMessage('A.\n\nB.\n\nC.', { responseId: 'r1' });
    expect(f.map((x) => x.index)).toEqual([0, 1, 2]);
    expect(f.map((x) => x.fragment_id)).toEqual(['r1:0', 'r1:1', 'r1:2']);
    expect(f.every((x) => x.total === 3)).toBe(true);
  });
});

describe('calculateTypingDelay', () => {
  it('sempre entre min e max (caso 13)', () => {
    for (const len of [0, 10, 100, 5000]) {
      const d = calculateTypingDelay(len, { minMs: 2000, maxMs: 4000, msPerChar: 30 });
      expect(d).toBeGreaterThanOrEqual(2000);
      expect(d).toBeLessThanOrEqual(4000);
    }
  });
});
