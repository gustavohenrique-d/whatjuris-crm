// =============================================================================
// WhatJuris CRM — Relatório semanal de leads
// lib/reports/weekly.js
//
// Parte PURA (janela de datas + formatação HTML) testável isolada, e a query
// de agregação (recebe o prisma, sem import cruzado). Cobre os leads OPEN
// criados na semana-calendário anterior (segunda a domingo).
// =============================================================================

const FASE_LABEL = {
  coletando_dados: 'Em triagem',
  qualificado: 'Qualificado',
  desqualificado: 'Desqualificado',
};

// [start, end) da semana-calendário ANTERIOR (segunda 00:00 até a segunda
// seguinte 00:00, exclusivo). Base UTC. PURA.
export function getPreviousWeekRange(now = new Date()) {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (base.getUTCDay() + 6) % 7; // Seg=0 … Dom=6
  const thisMonday = new Date(base);
  thisMonday.setUTCDate(base.getUTCDate() - daysSinceMonday);
  const start = new Date(thisMonday);
  start.setUTCDate(thisMonday.getUTCDate() - 7);
  return { start, end: thisMonday };
}

// dd/mm/aaaa em UTC (o `end` é exclusivo → mostramos o domingo, isto é, end-1d).
function fmt(d) {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

// Normaliza linhas do groupBy em [{ label, total }] ordenado desc. PURA.
export function normalizeGroups(rows, key, { fallback = '(não informado)' } = {}) {
  return rows
    .map((r) => ({ label: r[key] ?? fallback, total: r._count?.id ?? r.total ?? 0 }))
    .sort((a, b) => b.total - a.total);
}

function tableHtml(titulo, linhas) {
  if (!linhas.length) {
    return `<h3>${titulo}</h3><p style="color:#888;">Nenhum lead no período.</p>`;
  }
  const rows = linhas
    .map((l) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">${l.label}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;">${l.total}</td></tr>`)
    .join('');
  return `<h3>${titulo}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>`;
}

// Corpo HTML do relatório. PURA (recebe os dados já agregados).
export function renderWeeklyReportHtml({ range, total, byArea, byUrgencia, byFase }) {
  const dom = new Date(range.end);
  dom.setUTCDate(dom.getUTCDate() - 1); // domingo (end é exclusivo)
  const periodo = `${fmt(range.start)} a ${fmt(dom)}`;

  const fase = byFase.map((f) => ({ label: FASE_LABEL[f.label] || f.label, total: f.total }));

  return `
    <p>Relatório de leads da semana <strong>${periodo}</strong>.</p>
    <p style="font-size:22px;margin:16px 0;">Total de leads novos: <strong>${total}</strong></p>
    ${tableHtml('Por área jurídica', byArea)}
    ${tableHtml('Por urgência', byUrgencia)}
    ${tableHtml('Por fase da triagem', fase)}
  `;
}

export function reportSubject(range) {
  const dom = new Date(range.end);
  dom.setUTCDate(dom.getUTCDate() - 1);
  return `Relatório semanal de leads — ${fmt(range.start)} a ${fmt(dom)}`;
}

// Query de agregação (recebe o prisma). Leads OPEN criados no período.
export async function computeWeeklyStats(prisma, { start, end }) {
  const where = { status: 'OPEN', deletedAt: null, createdAt: { gte: start, lt: end } };
  const [total, byAreaRaw, byUrgRaw, byFaseRaw] = await Promise.all([
    prisma.deal.count({ where }),
    prisma.deal.groupBy({ by: ['legalArea'], where, _count: { id: true } }),
    prisma.deal.groupBy({ by: ['urgencia'], where, _count: { id: true } }),
    prisma.deal.groupBy({ by: ['faseTriage'], where, _count: { id: true } }),
  ]);
  return {
    total,
    byArea: normalizeGroups(byAreaRaw, 'legalArea', { fallback: '(sem área)' }),
    byUrgencia: normalizeGroups(byUrgRaw, 'urgencia', { fallback: '(sem urgência)' }),
    byFase: normalizeGroups(byFaseRaw, 'faseTriage', { fallback: '(sem fase)' }),
  };
}
