// =============================================================================
// WhatJuris CRM — Financeiro (design whatjuris.html — módulo 10B.5)
// MVP: deals OPEN com valor = pendentes; WON com valor = pagos.
// =============================================================================

import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';
import Seo from '../../../shared/layout-components/seo/seo';
import { StatusBadge, WjCard, WjScreenHeader } from '../../../shared/components/wj';

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const PAYMENT_STATUS = {
  pago: { variant: 'green', label: 'Pago' },
  pendente: { variant: 'amber', label: 'Pendente' },
  atrasado: { variant: 'red', label: 'Atrasado' },
};

const th = {
  textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.03em', color: 'var(--text-secondary)', padding: '10px 14px',
  borderBottom: '1px solid var(--border)',
};
const td = { padding: '13px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text)' };

function FinCard({ label, value, note, valueColor }) {
  return (
    <WjCard>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{label}</div>
      <div style={{
        fontSize: 24, fontWeight: 700, fontFamily: 'var(--mono)',
        color: valueColor || 'var(--text)',
      }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 8 }}>{note}</div>
    </WjCard>
  );
}

const Financeiro = () => {
  const [deals, setDeals] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    axios.get('/api/deals/?limit=200')
      .then(({ data }) => setDeals(data.deals.filter((d) => d.value != null)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const pendentes = deals.filter((d) => d.status === 'OPEN');
  const pagos = deals.filter((d) => d.status === 'WON');
  const totalReceber = pendentes.reduce((s, d) => s + Number(d.value || 0), 0);
  const recebidoMes = pagos.reduce((s, d) => s + Number(d.value || 0), 0);
  const inadimplente = 0; // sem dado de vencimento/atraso ainda

  const statusDe = (d) => (d.status === 'WON' ? 'pago' : 'pendente');

  return (
    <Fragment>
      <Seo title="Financeiro" />
      <WjScreenHeader
        label="Módulo · Financeiro"
        title="Financeiro"
        sub="Visão simplificada de honorários"
      />

      {/* .fin-summary — grid 3 colunas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <FinCard label="Total a receber" value={brl(totalReceber)}
          note={`${pendentes.length} ${pendentes.length === 1 ? 'lançamento pendente' : 'lançamentos pendentes'}`} />
        <FinCard label="Recebido no mês" value={brl(recebidoMes)} valueColor="var(--green)"
          note={`${pagos.length} ${pagos.length === 1 ? 'pagamento confirmado' : 'pagamentos confirmados'}`} />
        <FinCard label="Inadimplente" value={brl(inadimplente)} valueColor="var(--red)"
          note="0 lançamentos em atraso" />
      </div>

      <WjCard>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Cliente</th>
                <th style={th}>Descrição</th>
                <th style={th}>Valor</th>
                <th style={th}>Vencimento</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loaded && deals.length === 0 && (
                <tr><td style={{ ...td, borderBottom: 'none', color: 'var(--text-secondary)' }} colSpan={5}>Nenhum lançamento registrado.</td></tr>
              )}
              {deals.map((d, i) => {
                const last = i === deals.length - 1;
                const cellStyle = last ? { ...td, borderBottom: 'none' } : td;
                const st = PAYMENT_STATUS[statusDe(d)];
                return (
                  <tr key={d.id}>
                    <td style={cellStyle}>{d.contact?.name}</td>
                    <td style={cellStyle}>Honorários — {d.title}</td>
                    <td style={{ ...cellStyle, fontFamily: 'var(--mono)', fontSize: 12.5 }}>{brl(Number(d.value))}</td>
                    <td style={{ ...cellStyle, fontFamily: 'var(--mono)', fontSize: 12.5 }}>—</td>
                    <td style={cellStyle}><StatusBadge variant={st.variant}>{st.label}</StatusBadge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </WjCard>
    </Fragment>
  );
};

Financeiro.layout = 'Contentlayout';

export default Financeiro;
