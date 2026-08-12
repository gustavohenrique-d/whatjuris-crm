import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import {
  COLUNAS, montarLinhas, calcularTotais, nomeArquivo, exportarExcel, exportarPDF,
} from '@/lib/financeiro/export';

// A suíte roda em ambiente `node` (vitest.config.js) e o módulo toca o DOM só
// no passo de download. Em vez de somar jsdom às dependências, stub mínimo do
// que o navegador daria — o clique fica observável para os testes.
let cliques;
beforeEach(() => {
  cliques = [];
  global.URL.createObjectURL = vi.fn(() => 'blob:teste');
  global.URL.revokeObjectURL = vi.fn();
  global.document = {
    createElement: () => ({
      set href(v) { this._href = v; },
      set download(v) { this._nome = v; },
      click() { cliques.push(this._nome); },
      remove() {},
    }),
    body: { appendChild() {} },
  };
});

// 12/08/2026 é "hoje" nos testes de atraso.
const HOJE = new Date('2026-08-12T15:00:00Z');
const parcela = (o = {}) => ({
  id: 'i1', number: 1, totalParcelas: 3, cliente: 'Gustavo',
  descricao: 'Honorários', serviceType: 'Ação trabalhista',
  amount: '857.14', dueDate: '2026-09-15', status: 'PENDING',
  paidAt: null, paidAmount: null, ...o,
});

describe('montarLinhas', () => {
  it('achata a parcela nas colunas do relatório', () => {
    const [l] = montarLinhas([parcela()]);
    expect(l.cliente).toBe('Gustavo');
    expect(l.tipoServico).toBe('Ação trabalhista');
    expect(l.parcela).toBe('1/3');
    expect(l.valor).toBe(857.14);
    expect(l.vencimento).toBeInstanceOf(Date);
    expect(l.status).toBe('Pendente');
  });

  it('valor é NÚMERO, não string formatada', () => {
    const [l] = montarLinhas([parcela()]);
    expect(typeof l.valor).toBe('number');
    expect(l.valor).not.toBe('R$ 857,14');
  });

  it('parcela vencida vira Atrasado', () => {
    vi.setSystemTime(HOJE);
    const [l] = montarLinhas([parcela({ dueDate: '2026-08-05' })]);
    expect(l.status).toBe('Atrasado');
    expect(l.atrasada).toBe(true);
    vi.useRealTimers();
  });

  it('paga traz valorPago; pendente traz null (não zero)', () => {
    const [pg] = montarLinhas([parcela({ status: 'PAID', paidAmount: '857.14', paidAt: '2026-08-01T12:00:00Z' })]);
    expect(pg.valorPago).toBe(857.14);
    expect(pg.pagoEm).toBeInstanceOf(Date);
    const [pd] = montarLinhas([parcela()]);
    expect(pd.valorPago).toBe(null); // zero sugeriria "recebeu nada"
  });

  it('lista vazia → array vazio', () => {
    expect(montarLinhas([])).toEqual([]);
    expect(montarLinhas()).toEqual([]);
  });
});

describe('calcularTotais', () => {
  it('valor soma todas; valorPago soma SÓ as pagas', () => {
    const linhas = montarLinhas([
      parcela({ amount: '100.00', status: 'PAID', paidAmount: '100.00' }),
      parcela({ amount: '200.00' }),
      parcela({ amount: '300.50' }),
    ]);
    const t = calcularTotais(linhas);
    expect(t.valor).toBe(600.5);
    expect(t.valorPago).toBe(100);   // não infla com as pendentes
    expect(t.aReceber).toBe(500.5);
    expect(t.quantidade).toBe(3);
  });

  it('atrasado conta só pendente vencida', () => {
    vi.setSystemTime(HOJE);
    const linhas = montarLinhas([
      parcela({ amount: '100.00', dueDate: '2026-08-01' }),                      // atrasada
      parcela({ amount: '200.00', dueDate: '2026-12-01' }),                      // futura
      parcela({ amount: '300.00', dueDate: '2026-01-01', status: 'PAID', paidAmount: '300.00' }), // paga
    ]);
    expect(calcularTotais(linhas).atrasado).toBe(100);
    vi.useRealTimers();
  });

  it('soma em centavos — sem erro de float', () => {
    const linhas = montarLinhas([parcela({ amount: '0.10' }), parcela({ amount: '0.20' })]);
    expect(calcularTotais(linhas).valor).toBe(0.3); // 0.1+0.2 em float daria 0.30000000000000004
  });

  it('lista vazia → tudo zero', () => {
    expect(calcularTotais([])).toMatchObject({ valor: 0, valorPago: 0, atrasado: 0, quantidade: 0 });
  });
});

describe('nomeArquivo', () => {
  it('geral e por cliente, com acento normalizado', () => {
    vi.setSystemTime(HOJE);
    expect(nomeArquivo({}, 'xlsx')).toBe('cobrancas_2026-08-12.xlsx');
    expect(nomeArquivo({ cliente: 'Gustavo Henrique' }, 'pdf')).toBe('cobrancas_gustavo_henrique_2026-08-12.pdf');
    expect(nomeArquivo({ cliente: 'José Antônio' }, 'xlsx')).toBe('cobrancas_jose_antonio_2026-08-12.xlsx');
    vi.useRealTimers();
  });
});

describe('exportarExcel — a planilha precisa ser somável', () => {
  const tres = [
    parcela({ amount: '100.00', status: 'PAID', paidAmount: '100.00', paidAt: '2026-08-01T12:00:00Z' }),
    parcela({ amount: '200.00' }),
    parcela({ amount: '300.50' }),
  ];

  it('gera e dispara o download', async () => {
    const r = await exportarExcel(tres, {});
    expect(r.linhas).toBe(3);
    expect(cliques).toHaveLength(1);
    expect(cliques[0]).toMatch(/^cobrancas_.*\.xlsx$/);
  });

  it('MOEDA é número com formato de célula, NÃO texto', async () => {
    // Reconstrói a planilha do mesmo jeito que a função e inspeciona as células.
    const XLSXm = XLSX;
    const espiao = vi.spyOn(XLSXm.utils, 'aoa_to_sheet');
    await exportarExcel(tres, {});
    const ws = espiao.mock.results[0].value;

    const valorB2 = ws[XLSXm.utils.encode_cell({ r: 1, c: 4 })];
    expect(valorB2.t).toBe('n');               // number, não 's' (string)
    expect(valorB2.v).toBe(100);               // o número cru
    expect(valorB2.z).toBe('R$ #,##0.00');     // formato de exibição
    espiao.mockRestore();
  });

  it('vencimento é data real, não string', async () => {
    const espiao = vi.spyOn(XLSX.utils, 'aoa_to_sheet');
    await exportarExcel(tres, {});
    const ws = espiao.mock.results[0].value;
    const cel = ws[XLSX.utils.encode_cell({ r: 1, c: 5 })];
    expect(cel.t).toBe('d');
    expect(cel.z).toBe('dd/mm/yyyy');
    espiao.mockRestore();
  });

  it('linha de TOTAIS: valor soma tudo, pago soma só as pagas', async () => {
    const espiao = vi.spyOn(XLSX.utils, 'aoa_to_sheet');
    const r = await exportarExcel(tres, {});
    const ws = espiao.mock.results[0].value;
    const linhaTotais = r.ultimaLinha - 1; // 0-based
    expect(ws[XLSX.utils.encode_cell({ r: linhaTotais, c: 0 })].v).toBe('TOTAIS');
    expect(ws[XLSX.utils.encode_cell({ r: linhaTotais, c: 4 })].v).toBe(600.5);
    expect(ws[XLSX.utils.encode_cell({ r: linhaTotais, c: 8 })].v).toBe(100);
    espiao.mockRestore();
  });

  it('cabeçalho com as colunas na ordem', async () => {
    const espiao = vi.spyOn(XLSX.utils, 'aoa_to_sheet');
    await exportarExcel(tres, {});
    const ws = espiao.mock.results[0].value;
    COLUNAS.forEach((nome, c) => {
      expect(ws[XLSX.utils.encode_cell({ r: 0, c })].v).toBe(nome);
    });
    espiao.mockRestore();
  });

  it('lista vazia não quebra', async () => {
    const r = await exportarExcel([], {});
    expect(r.linhas).toBe(0);
    expect(r.totais.valor).toBe(0);
  });
});

describe('exportarPDF', () => {
  it('gera o documento sem erro e devolve o total de páginas', async () => {
    const r = await exportarPDF(
      [parcela(), parcela({ amount: '300.00', dueDate: '2026-08-01' })],
      { cliente: 'Gustavo' },
      'Bezerra & Nabarrete Sociedade de Advogados',
    );
    expect(r.linhas).toBe(2);
    expect(r.paginas).toBeGreaterThanOrEqual(1);
  });

  it('lista vazia gera PDF mesmo assim (relatório sem linhas)', async () => {
    const r = await exportarPDF([], {}, 'Escritório');
    expect(r.linhas).toBe(0);
    expect(r.paginas).toBeGreaterThanOrEqual(1);
  });

  it('sem orgName não quebra', async () => {
    const r = await exportarPDF([parcela()], {});
    expect(r.linhas).toBe(1);
  });
});
