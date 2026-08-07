// =============================================================================
// WhatJuris CRM — Relatórios (design whatjuris.html — módulo 10B.6)
// Gráficos em SVG puro (donut + linha), copiados do HTML de referência.
// APIs do módulo 6 preservadas.
// =============================================================================

import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';
import { useSession } from 'next-auth/react';
import Seo from '../../../shared/layout-components/seo/seo';
import { WjCard, WjScreenHeader } from '../../../shared/components/wj';

const CIRCUMFERENCE = 439.8; // 2π × 70
const AREA_COLORS = {
  trabalhista: '#4F8EF7',
  civel: '#7C5CFC', 'cível': '#7C5CFC',
  familia: '#2DD4A0', 'família': '#2DD4A0',
  previdenciario: '#F5A623', 'previdenciário': '#F5A623',
};

const th = {
  textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.03em', color: 'var(--text-secondary)', padding: '10px 14px',
  borderBottom: '1px solid var(--border)',
};
const td = { padding: '13px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text)' };
const tdMono = { ...td, fontFamily: 'var(--mono)', fontSize: 12.5 };

const fmtHoras = (h) => (h == null ? '—' : `${h} h`);
const fmtSeg = (s) => (s == null ? '—' : s >= 60 ? `${Math.floor(s / 60)}min ${s % 60}s` : `${s}s`);

function CardTitle({ title, sub }) {
  return (
    <Fragment>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 18 }}>{sub}</div>
    </Fragment>
  );
}

const Relatorios = () => {
  const { data: session } = useSession();
  const canSendReport = (session?.permissions || []).includes('report.read.all');
  const [sendingReport, setSendingReport] = useState(false);

  const [areas, setAreas] = useState({ areas: [], total: 0 });
  const [conversao, setConversao] = useState([]);
  const [agentes, setAgentes] = useState([]);
  const [tempos, setTempos] = useState([]);

  const doSendReport = async () => {
    if (sendingReport) return;
    setSendingReport(true);
    try {
      const { data } = await axios.post('/api/reports/weekly/');
      const nota = data?.email?.skipped
        ? ' (RESEND_API_KEY vazia — e-mail não enviado, conteúdo logado no servidor)'
        : '';
      window.alert(`Relatório semanal processado para ${data?.to || 'destinatário'} · ${data?.total ?? 0} leads na semana.${nota}`);
    } catch (err) {
      if (err?.response?.status === 403) window.alert('Você não tem permissão para enviar o relatório.');
      else if (err?.response?.status === 400) window.alert('Destinatário não configurado (defina REPORT_EMAIL).');
      else window.alert('Não foi possível enviar o relatório.');
    } finally {
      setSendingReport(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [aRes, cRes, agRes, tRes] = await Promise.all([
          axios.get('/api/metrics/leads-por-area/'),
          axios.get('/api/metrics/conversao/?meses=6'),
          axios.get('/api/metrics/agentes/'),
          axios.get('/api/metrics/tempo-por-estagio/'),
        ]);
        setAreas(aRes.data);
        setConversao(cRes.data.pontos);
        setAgentes(agRes.data.agentes);
        setTempos(tRes.data.estagios);
      } catch { /* silencioso */ }
    })();
  }, []);

  // ----- Donut -----
  const donutSegs = areas.areas.map((a, i) => {
    const dashArray = `${(a.percentual / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
    const dashOffset = -areas.areas.slice(0, i)
      .reduce((s, x) => s + (x.percentual / 100) * CIRCUMFERENCE, 0);
    return { ...a, dashArray, dashOffset, color: AREA_COLORS[(a.area || '').toLowerCase()] || '#8892A4' };
  });

  // ----- Linha (y = 190 - (taxa/50)*135, x de 40 a 360) -----
  const pts = conversao.map((p, i) => {
    const n = Math.max(conversao.length - 1, 1);
    const x = conversao.length === 1 ? 200 : 40 + i * (320 / n);
    const y = Math.max(20, 190 - (p.taxa / 50) * 135);
    return { ...p, x, y };
  });
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = pts.length >= 2
    ? `${linePath} L${pts[pts.length - 1].x},190 L${pts[0].x},190 Z`
    : '';

  return (
    <Fragment>
      <Seo title="Relatórios" />
      <WjScreenHeader
        label="Módulo · Relatórios"
        title="Relatórios"
        sub="Desempenho de captação e dos agentes IA"
      />

      {canSendReport && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            onClick={doSendReport}
            disabled={sendingReport}
            style={{
              fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
              background: 'var(--accent, #4F8EF7)', color: '#fff', border: 'none',
              opacity: sendingReport ? 0.6 : 1,
            }}
          >
            {sendingReport ? 'Enviando…' : '✉️ Enviar relatório semanal agora'}
          </button>
        </div>
      )}

      {/* .reports-grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Donut */}
        <WjCard>
          <CardTitle title="Leads por área jurídica" sub={`Últimos 30 dias · ${areas.total} leads`} />
          {areas.areas.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12.5 }}>
              Sem leads no período.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
              <svg width="180" height="180" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="70" fill="none" stroke="var(--border)" strokeWidth="24" />
                <g transform="rotate(-90 100 100)">
                  {donutSegs.map((s) => (
                    <circle key={s.area} cx="100" cy="100" r="70" fill="none"
                      stroke={s.color} strokeWidth="24"
                      strokeDasharray={s.dashArray} strokeDashoffset={s.dashOffset}
                      strokeLinecap="round">
                      <title>{`${s.area} — ${s.percentual}%`}</title>
                    </circle>
                  ))}
                </g>
                <text x="100" y="97" textAnchor="middle" fill="var(--text)"
                  fontSize="26" fontWeight="700" fontFamily="var(--mono)">{areas.total}</text>
                <text x="100" y="115" textAnchor="middle" fill="var(--text-secondary)" fontSize="10">
                  leads no período
                </text>
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {donutSegs.map((s) => (
                  <div key={s.area} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--text)', minWidth: 170 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: s.color }} />
                    <span style={{ textTransform: 'capitalize' }}>{s.area}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {s.percentual}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </WjCard>

        {/* Linha */}
        <WjCard>
          <CardTitle title="Evolução da taxa de conversão" sub="Últimos 6 meses" />
          {pts.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12.5 }}>
              Sem dados no período.
            </div>
          ) : (
            <Fragment>
              <svg width="100%" height="210" viewBox="0 0 400 210" preserveAspectRatio="none">
                <line x1="40" y1="55" x2="380" y2="55" stroke="rgba(255,255,255,0.05)" />
                <line x1="40" y1="107.5" x2="380" y2="107.5" stroke="rgba(255,255,255,0.05)" />
                <line x1="40" y1="160" x2="380" y2="160" stroke="rgba(255,255,255,0.05)" />
                <line x1="40" y1="190" x2="380" y2="190" stroke="var(--border)" />
                <text x="30" y="59" textAnchor="end" fill="#8892A4" fontSize="9">50%</text>
                <text x="30" y="111" textAnchor="end" fill="#8892A4" fontSize="9">30%</text>
                <text x="30" y="164" textAnchor="end" fill="#8892A4" fontSize="9">10%</text>
                <defs>
                  <linearGradient id="wjLineFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#4F8EF7" stopOpacity="0.35" />
                    <stop offset="1" stopColor="#4F8EF7" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {areaPath && <path d={areaPath} fill="url(#wjLineFill)" opacity="0.5" />}
                <path d={linePath} fill="none" stroke="#4F8EF7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {pts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 4.5 : 4} fill="#4F8EF7">
                    <title>{`${p.mes}: ${p.taxa}%`}</title>
                  </circle>
                ))}
                {pts.length > 0 && (
                  <text x={pts[pts.length - 1].x} y={Math.max(pts[pts.length - 1].y - 13, 12)}
                    textAnchor="middle" fill="var(--text)" fontSize="12" fontWeight="700" fontFamily="var(--mono)">
                    {pts[pts.length - 1].taxa}%
                  </text>
                )}
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, padding: '0 6px' }}>
                {pts.map((p, i) => (
                  <span key={i} style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{p.mes}</span>
                ))}
              </div>
            </Fragment>
          )}
        </WjCard>
      </div>

      {/* Performance dos agentes */}
      <WjCard style={{ marginBottom: 24 }}>
        <CardTitle title="Performance dos agentes IA" sub="Últimos 30 dias" />
        {agentes.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12.5 }}>
            Os agentes ainda não registraram atividade.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Agente</th>
                  <th style={th}>Leads processados</th>
                  <th style={th}>Ações</th>
                  <th style={th}>Tempo médio de resposta</th>
                </tr>
              </thead>
              <tbody>
                {agentes.map((a, i) => {
                  const last = i === agentes.length - 1;
                  const c = last ? { ...td, borderBottom: 'none' } : td;
                  const cm = last ? { ...tdMono, borderBottom: 'none' } : tdMono;
                  return (
                    <tr key={a.nome}>
                      <td style={c}>{a.nome}</td>
                      <td style={cm}>{a.dealsAtendidos}</td>
                      <td style={cm}>{a.totalAcoes}</td>
                      <td style={cm}>{fmtSeg(a.latenciaMediaSegundos)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </WjCard>

      {/* Tempo por estágio */}
      <WjCard>
        <CardTitle title="Tempo por estágio" sub="Média e mediana do tempo parado em cada etapa" />
        {tempos.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12.5 }}>
            Ainda não há histórico de movimentações.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Estágio</th>
                  <th style={th}>Movimentações</th>
                  <th style={th}>Média (horas)</th>
                  <th style={th}>Mediana (horas)</th>
                </tr>
              </thead>
              <tbody>
                {tempos.map((t, i) => {
                  const last = i === tempos.length - 1;
                  const c = last ? { ...td, borderBottom: 'none' } : td;
                  const cm = last ? { ...tdMono, borderBottom: 'none' } : tdMono;
                  return (
                    <tr key={t.key}>
                      <td style={{ ...c, fontWeight: 500 }}>{t.name}</td>
                      <td style={cm}>{t.movimentacoes}</td>
                      <td style={cm}>{fmtHoras(t.mediaHoras)}</td>
                      <td style={cm}>{fmtHoras(t.medianaHoras)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </WjCard>
    </Fragment>
  );
};

Relatorios.layout = 'Contentlayout';
export default Relatorios;
