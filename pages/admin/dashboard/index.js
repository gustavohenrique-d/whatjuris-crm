// =============================================================================
// WhatJuris CRM — Dashboard (design whatjuris.html — módulo 10)
// =============================================================================

import Link from 'next/link';
import { Fragment, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Seo from '../../../shared/layout-components/seo/seo';
import { WjCard, WjScreenHeader } from '../../../shared/components/wj';

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

const RobotIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="8" width="16" height="11" rx="2" /><path d="M9 8V6a3 3 0 0 1 6 0v2" />
    <circle cx="9" cy="13.5" r="1" /><circle cx="15" cy="13.5" r="1" />
  </svg>
);

function MetricCard({ label, value, note }) {
  return (
    <WjCard>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.01em', color: 'var(--text)' }}>{value}</div>
      {note && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 8 }}>{note}</div>}
    </WjCard>
  );
}

const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [semanas, setSemanas] = useState([]);
  const [triagem, setTriagem] = useState([]);
  const timer = useRef(null);

  const load = async () => {
    try {
      const [sRes, wRes, tRes] = await Promise.all([
        axios.get('/api/metrics/summary/'),
        axios.get('/api/metrics/leads-por-semana/'),
        axios.get('/api/deals/?limit=5&stageKey=em_triagem'),
      ]);
      setSummary(sRes.data);
      setSemanas(wRes.data.semanas);
      setTriagem(tRes.data.deals);
    } catch { /* silencioso */ }
  };

  useEffect(() => {
    load();
    timer.current = setInterval(load, 60000);
    return () => clearInterval(timer.current);
  }, []);

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const maxTotal = Math.max(1, ...semanas.map((s) => s.total));

  const noteVerde = (t) => <span style={{ color: 'var(--green)', fontWeight: 600 }}>{t}</span>;

  return (
    <Fragment>
      <Seo title="Dashboard" />
      <WjScreenHeader label="Módulo · Visão Geral" title="Dashboard" sub={hoje} />

      {/* 4 métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <MetricCard label="Leads hoje" value={summary?.leadsHoje ?? '—'}
          note={summary?.agentesAtivosHoje ? noteVerde('agentes ativos') : 'sem agentes ativos'} />
        <MetricCard label="Qualificados este mês" value={summary?.qualificadosMes ?? '—'}
          note={<>Taxa de conversão: {noteVerde(`${summary?.taxaConversao ?? 0}%`)}</>} />
        <MetricCard label="Consultas agendadas" value={summary?.consultasAgendadas ?? '—'}
          note={summary?.proximaConsulta ? <>Próxima: {noteVerde(relTime(summary.proximaConsulta.dueAt))}</> : 'nenhuma agendada'} />
        <MetricCard label="Receita prevista" value={summary ? brl(summary.receitaPrevista) : '—'}
          note="deals com alta probabilidade" />
      </div>

      {/* grid 3fr / 2fr */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, alignItems: 'stretch' }}>
        {/* Barras */}
        <WjCard>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>Leads captados por semana</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 18 }}>Últimos 30 dias</div>
          <div style={{ position: 'relative', height: 210, display: 'flex', alignItems: 'flex-end', gap: 18, borderBottom: '1px solid var(--border)', paddingBottom: 2 }}>
            {[0, 33, 66].map((b) => (
              <div key={b} style={{ position: 'absolute', left: 0, right: 0, bottom: `${b}%`, height: 1, background: 'rgba(255,255,255,0.05)' }} />
            ))}
            {semanas.map((s, i) => {
              const pct = maxTotal > 0 ? (s.total / maxTotal) * 100 : 0;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-secondary)', marginBottom: 6 }}>{s.total}</span>
                  <div style={{ width: '100%', maxWidth: 46, borderRadius: '5px 5px 2px 2px', background: 'linear-gradient(180deg, var(--accent2), var(--accent))', height: `${pct}%` }} />
                  <span style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 10 }}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </WjCard>

        {/* Atividade dos agentes */}
        <WjCard>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>Atividade dos Agentes IA</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 18 }}>Ao vivo via n8n</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {triagem.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', padding: '8px 0' }}>Nenhum lead em triagem no momento.</div>
            )}
            {triagem.map((d, i) => (
              <div key={d.id} style={{ display: 'flex', gap: 10, paddingBottom: i === triagem.length - 1 ? 0 : 14, borderBottom: i === triagem.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: 'rgba(79,142,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                  <RobotIcon />
                </div>
                <div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text)' }}>
                    <Link href={`/admin/deals/${d.id}`} style={{ fontWeight: 600, color: 'var(--text)' }}>{d.contact?.name || d.title}</Link>
                    {d.legalArea ? <> — em triagem · <b style={{ fontWeight: 600 }}>{d.legalArea}</b></> : ' — em triagem pela IA'}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 3, fontFamily: 'var(--mono)' }}>{relTime(d.enteredStageAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </WjCard>
      </div>
    </Fragment>
  );
};

Dashboard.layout = 'Contentlayout';

export default Dashboard;
