// =============================================================================
// WhatJuris CRM — Exportação do Financeiro (fatia 3)
// lib/financeiro/export.js
//
// Roda no NAVEGADOR: as libs são importadas dinamicamente dentro das funções,
// para não entrarem no bundle das páginas que nunca exportam nada.
//
// `montarLinhas` e `calcularTotais` são PUROS e testáveis. As funções
// `exportar*` só montam o arquivo e disparam o download.
// =============================================================================

import { estaAtrasada, hojeISO } from '@/lib/financeiro/datas';

const ROTULO_STATUS = { PAID: 'Pago', PENDING: 'Pendente' };

// Cabeçalhos na ordem das colunas — usados pelo Excel e pelo PDF, para os dois
// não divergirem.
export const COLUNAS = [
  'Cliente', 'Descrição', 'Tipo de serviço', 'Parcela',
  'Valor', 'Vencimento', 'Status', 'Pago em', 'Valor pago',
];

// 'YYYY-MM-DD' | Date -> Date em UTC puro. Vencimento é DATE: construir com
// new Date('2026-08-05') já dá meia-noite UTC, que é o que queremos na célula.
function comoData(v) {
  if (!v) return null;
  const iso = String(v instanceof Date ? v.toISOString() : v).slice(0, 10);
  const [a, m, d] = iso.split('-').map(Number);
  return Number.isFinite(a) ? new Date(Date.UTC(a, m - 1, d)) : null;
}

function dataBR(v) {
  const iso = String(v instanceof Date ? v.toISOString() : (v ?? '')).slice(0, 10);
  const [a, m, d] = iso.split('-');
  return d ? `${d}/${m}/${a}` : '';
}

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const cent = (v) => Math.round((Number(v) || 0) * 100);

// Normaliza uma parcela (com o contexto da cobrança já embutido pela tela) na
// linha que os dois formatos consomem.
export function montarLinhas(parcelas = []) {
  return parcelas.map((p) => ({
    cliente: p.cliente || '—',
    descricao: p.descricao || '',
    tipoServico: p.serviceType || '',
    parcela: p.totalParcelas ? `${p.number}/${p.totalParcelas}` : String(p.number ?? ''),
    valor: Number(p.amount) || 0,
    vencimento: comoData(p.dueDate),
    status: estaAtrasada(p) ? 'Atrasado' : (ROTULO_STATUS[p.status] || p.status || ''),
    atrasada: estaAtrasada(p),
    pagoEm: p.paidAt ? comoData(p.paidAt) : null,
    // null (não 0) quando não houve pagamento: zero na planilha sugeriria
    // "recebeu nada", quando o certo é "não recebeu ainda".
    valorPago: p.status === 'PAID' ? (Number(p.paidAmount ?? p.amount) || 0) : null,
  }));
}

export function calcularTotais(linhas = []) {
  const somaCent = (arr, campo) => arr.reduce((s, l) => s + cent(l[campo]), 0);
  const pagas = linhas.filter((l) => l.valorPago != null);
  const pendentes = linhas.filter((l) => l.valorPago == null);
  return {
    // Total de TODAS as parcelas; pago só das que foram pagas — somar
    // pendentes aqui inflaria o recebido.
    valor: somaCent(linhas, 'valor') / 100,
    valorPago: somaCent(pagas, 'valorPago') / 100,
    aReceber: somaCent(pendentes, 'valor') / 100,
    atrasado: somaCent(pendentes.filter((l) => l.atrasada), 'valor') / 100,
    quantidade: linhas.length,
  };
}

// cobrancas_2026-08-12.xlsx | cobrancas_gustavo_2026-08-12.xlsx
export function nomeArquivo(contexto, extensao) {
  const alvo = (contexto?.cliente || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // tira acento
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `cobrancas${alvo ? `_${alvo}` : ''}_${hojeISO()}.${extensao}`;
}

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------------
// Excel — planilha para TRABALHAR
// -----------------------------------------------------------------------------
export async function exportarExcel(parcelas, contexto = {}) {
  const XLSX = await import('xlsx');
  const linhas = montarLinhas(parcelas);
  const totais = calcularTotais(linhas);

  const aoa = [
    COLUNAS,
    ...linhas.map((l) => [
      l.cliente, l.descricao, l.tipoServico, l.parcela,
      l.valor, l.vencimento, l.status, l.pagoEm, l.valorPago,
    ]),
    [],
    ['TOTAIS', '', '', '', totais.valor, '', '', '', totais.valorPago],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });

  // ⚠️ O requisito central: moeda vira NÚMERO com formato de célula, não texto.
  // A célula guarda 857.14 e mostra "R$ 857,14" — some, filtre e ordene no
  // Excel normalmente. Texto "R$ 857,14" não somaria.
  const MOEDA = 'R$ #,##0.00';
  const DATA = 'dd/mm/yyyy';
  const ultimaLinha = aoa.length; // 1-based, é a linha de TOTAIS

  for (let i = 0; i < aoa.length; i += 1) {
    for (const [col, fmt] of [[4, MOEDA], [5, DATA], [7, DATA], [8, MOEDA]]) {
      const ref = XLSX.utils.encode_cell({ r: i, c: col });
      const cel = ws[ref];
      if (!cel || cel.v == null || cel.v === '') continue;
      if (i === 0) continue;               // cabeçalho
      cel.t = fmt === MOEDA ? 'n' : 'd';
      cel.z = fmt;
    }
  }

  ws['!cols'] = [
    { wch: 26 }, { wch: 38 }, { wch: 20 }, { wch: 9 },
    { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 13 }, { wch: 13 },
  ];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };  // cabeçalho fixo ao rolar

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cobranças');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  baixar(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    nomeArquivo(contexto, 'xlsx'));

  return { linhas: linhas.length, totais, ultimaLinha };
}

// -----------------------------------------------------------------------------
// PDF — documento para ENVIAR/GUARDAR
// -----------------------------------------------------------------------------
export async function exportarPDF(parcelas, contexto = {}, orgName = '') {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const linhas = montarLinhas(parcelas);
  const totais = calcularTotais(linhas);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const larg = doc.internal.pageSize.getWidth();

  doc.setFontSize(14).setFont(undefined, 'bold');
  doc.text(orgName || 'Relatório de cobranças', 40, 48);

  doc.setFontSize(10).setFont(undefined, 'normal').setTextColor(90);
  doc.text(contexto.cliente ? `Cliente: ${contexto.cliente}` : 'Todas as cobranças', 40, 66);
  if (contexto.filtros) doc.text(`Filtros: ${contexto.filtros}`, 40, 80);

  autoTable(doc, {
    startY: contexto.filtros ? 96 : 84,
    head: [COLUNAS],
    body: linhas.map((l) => [
      l.cliente, l.descricao, l.tipoServico, l.parcela,
      brl(l.valor), dataBR(l.vencimento), l.status,
      dataBR(l.pagoEm), l.valorPago != null ? brl(l.valorPago) : '—',
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [79, 142, 247], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 252] },
    columnStyles: { 4: { halign: 'right' }, 8: { halign: 'right' } },
    // Atrasado em vermelho — aqui o destaque existe (no Excel, o SheetJS
    // comunitário não pinta célula).
    didParseCell: (d) => {
      if (d.section === 'body' && linhas[d.row.index]?.atrasada) {
        d.cell.styles.textColor = [214, 69, 69];
        if (d.column.index === 6) d.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: 40, right: 40 },
  });

  let y = doc.lastAutoTable.finalY + 24;
  if (y > doc.internal.pageSize.getHeight() - 110) { doc.addPage(); y = 60; }

  doc.setFontSize(11).setFont(undefined, 'bold').setTextColor(30);
  doc.text('Resumo', 40, y);
  doc.setFontSize(10).setFont(undefined, 'normal').setTextColor(60);
  doc.text(`Total a receber: ${brl(totais.aReceber)}`, 40, y + 18);
  doc.text(`Recebido: ${brl(totais.valorPago)}`, 40, y + 34);
  doc.setTextColor(214, 69, 69);
  doc.text(`Atrasado: ${brl(totais.atrasado)}`, 40, y + 50);

  // Rodapé em todas as páginas, com paginação.
  const geradoEm = new Date().toLocaleString('pt-BR');
  const paginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= paginas; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(140);
    doc.text(`Gerado em ${geradoEm}`, 40, doc.internal.pageSize.getHeight() - 24);
    doc.text(`Página ${i} de ${paginas}`, larg - 40, doc.internal.pageSize.getHeight() - 24, { align: 'right' });
  }

  // Mesmo caminho de download do Excel (em vez de doc.save()): um só ponto que
  // toca o DOM, e o PDF não depende do save() do jsPDF, que em Node tentaria
  // escrever em disco.
  baixar(doc.output('blob'), nomeArquivo(contexto, 'pdf'));
  return { linhas: linhas.length, totais, paginas };
}
