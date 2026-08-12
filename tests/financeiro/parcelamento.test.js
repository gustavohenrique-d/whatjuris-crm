import { describe, it, expect } from 'vitest';
import {
  paraCentavos, paraDecimalString, dividirCentavos, somarMeses, gerarParcelas,
} from '@/lib/financeiro/parcelamento';

const soma = (ps) => ps.reduce((s, p) => s + p.centavos, 0);

describe('paraCentavos', () => {
  it('aceita número e string, com vírgula ou ponto', () => {
    expect(paraCentavos(6000)).toBe(600000);
    expect(paraCentavos('6000.50')).toBe(600050);
    expect(paraCentavos('6000,50')).toBe(600050);
  });

  it('não deixa float sujar o valor', () => {
    // 19.99 * 100 = 1998.9999... em float; sem o round viraria 1998.
    expect(paraCentavos(19.99)).toBe(1999);
    expect(paraCentavos(0.1 + 0.2)).toBe(30);
  });

  it('rejeita lixo', () => {
    for (const v of ['abc', '', '10.999', '-5', null, undefined, {}, NaN, Infinity]) {
      expect(paraCentavos(v)).toBe(null);
    }
  });
});

describe('paraDecimalString', () => {
  it('formata com 2 casas sempre', () => {
    expect(paraDecimalString(600000)).toBe('6000.00');
    expect(paraDecimalString(85715)).toBe('857.15');
    expect(paraDecimalString(5)).toBe('0.05');
    expect(paraDecimalString(100)).toBe('1.00');
  });
});

describe('dividirCentavos — a soma tem de bater SEMPRE', () => {
  it('divisão exata: todas iguais', () => {
    expect(dividirCentavos(600000, 6)).toEqual([100000, 100000, 100000, 100000, 100000, 100000]);
  });

  it('sobra vai toda para a PRIMEIRA parcela', () => {
    // 6000/7: piso 857,14 (x7 = 5999,98) e sobra de 2 centavos na primeira.
    const v = dividirCentavos(600000, 7);
    expect(v[0]).toBe(85716);
    expect(v.slice(1)).toEqual(Array(6).fill(85714));
    expect(v.reduce((a, b) => a + b, 0)).toBe(600000);
  });

  it('a soma bate com o total em toda combinação plausível', () => {
    for (let total = 1; total <= 2000; total += 7) {
      for (let n = 1; n <= 24; n += 1) {
        if (total < n) continue;
        const v = dividirCentavos(total, n);
        expect(v.reduce((a, b) => a + b, 0)).toBe(total);
        expect(v.every((x) => x >= 1)).toBe(true);
      }
    }
  });
});

describe('somarMeses — vencimento é dia, sem fuso', () => {
  it('avança preservando o dia', () => {
    expect(somarMeses('2026-08-12', 0)).toBe('2026-08-12');
    expect(somarMeses('2026-08-12', 1)).toBe('2026-09-12');
    expect(somarMeses('2026-08-12', 5)).toBe('2027-01-12');
  });

  it('satura no último dia quando o mês é mais curto', () => {
    // 31/01 + 1 mês não existe; o Date cru transbordaria para março.
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2026-01-31', 3)).toBe('2026-04-30');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29'); // bissexto
  });

  it('vira o ano corretamente', () => {
    expect(somarMeses('2026-12-15', 1)).toBe('2027-01-15');
  });
});

describe('gerarParcelas', () => {
  it('R$ 6.000 em 6x: parcelas iguais, vencimentos mensais', () => {
    const r = gerarParcelas({ total: 6000, parcelas: 6, primeiroVencimento: '2026-09-10' });
    expect(r.ok).toBe(true);
    expect(r.parcelas).toHaveLength(6);
    expect(r.parcelas[0]).toMatchObject({ number: 1, amount: '1000.00', dueDate: '2026-09-10' });
    expect(r.parcelas[5]).toMatchObject({ number: 6, amount: '1000.00', dueDate: '2027-02-10' });
    expect(soma(r.parcelas)).toBe(r.totalCentavos);
  });

  it('R$ 6.000 em 7x: a soma continua exata', () => {
    const r = gerarParcelas({ total: 6000, parcelas: 7, primeiroVencimento: '2026-09-10' });
    expect(r.parcelas[0].amount).toBe('857.16');
    expect(r.parcelas[1].amount).toBe('857.14');
    expect(soma(r.parcelas)).toBe(600000);
  });

  it('1x é o à vista', () => {
    const r = gerarParcelas({ total: '1500,00', parcelas: 1, primeiroVencimento: '2026-09-10' });
    expect(r.parcelas).toEqual([
      expect.objectContaining({ number: 1, amount: '1500.00', dueDate: '2026-09-10' }),
    ]);
  });

  it('rejeita entradas inválidas', () => {
    const base = { total: 6000, parcelas: 6, primeiroVencimento: '2026-09-10' };
    expect(gerarParcelas({ ...base, total: 0 }).ok).toBe(false);
    expect(gerarParcelas({ ...base, total: 'abc' }).ok).toBe(false);
    expect(gerarParcelas({ ...base, parcelas: 0 }).ok).toBe(false);
    expect(gerarParcelas({ ...base, parcelas: 1.5 }).ok).toBe(false);
    expect(gerarParcelas({ ...base, parcelas: 61 }).ok).toBe(false);
    expect(gerarParcelas({ ...base, primeiroVencimento: '10/09/2026' }).ok).toBe(false);
    expect(gerarParcelas({ ...base, primeiroVencimento: '2026-02-30' }).ok).toBe(false);
  });

  it('recusa parcelamento que geraria parcela de zero centavo', () => {
    const r = gerarParcelas({ total: '0.05', parcelas: 6, primeiroVencimento: '2026-09-10' });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('baixo demais');
  });
});
