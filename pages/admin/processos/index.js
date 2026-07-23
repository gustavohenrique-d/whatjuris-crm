// =============================================================================
// WhatJuris CRM — Processos (design whatjuris.html — módulo 10B.3)
// Os deals são os "processos". Vara/Comarca virá de customData.vara quando
// esse dado for capturado (por ora '—').
// =============================================================================

import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';
import Seo from '../../../shared/layout-components/seo/seo';
import { StatusBadge, WjCard, WjScreenHeader } from '../../../shared/components/wj';

const STATUS_PROCESSO = {
  OPEN: { variant: 'green', label: 'Em andamento' },
  WON: { variant: 'green', label: 'Concluído' },
  LOST: { variant: 'red', label: 'Arquivado' },
};

const th = {
  textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.03em', color: 'var(--text-secondary)', padding: '10px 14px',
  borderBottom: '1px solid var(--border)',
};
const td = { padding: '13px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text)' };

function timeAgo(iso) {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d < 1) return 'hoje';
  if (d === 1) return 'há 1 dia';
  return `há ${d} dias`;
}

const Processos = () => {
  const [deals, setDeals] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    axios.get('/api/deals/?limit=200')
      .then(({ data }) => setDeals(data.deals))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return (
    <Fragment>
      <Seo title="Processos" />
      <WjScreenHeader
        label="Módulo · Jurídico"
        title="Processos"
        sub="Andamento processual dos casos ativos"
      />

      <WjCard>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Número</th>
                <th style={th}>Cliente</th>
                <th style={th}>Vara / Comarca</th>
                <th style={th}>Última movimentação</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loaded && deals.length === 0 && (
                <tr><td style={{ ...td, borderBottom: 'none', color: 'var(--text-secondary)' }} colSpan={5}>Nenhum processo em andamento.</td></tr>
              )}
              {deals.map((d, i) => {
                const last = i === deals.length - 1;
                const cellStyle = last ? { ...td, borderBottom: 'none' } : td;
                const st = STATUS_PROCESSO[d.status] || STATUS_PROCESSO.OPEN;
                return (
                  <tr key={d.id}>
                    <td style={{ ...cellStyle, fontFamily: 'var(--mono)', fontSize: 12.5 }}>{d.id.slice(0, 8)}</td>
                    <td style={cellStyle}>{d.contact?.name}</td>
                    <td style={cellStyle}>{d.customData?.vara || '—'}</td>
                    <td style={cellStyle}>{timeAgo(d.updatedAt)}</td>
                    <td style={cellStyle}>
                      <StatusBadge variant={st.variant}>{st.label}</StatusBadge>
                    </td>
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

Processos.layout = 'Contentlayout';

export default Processos;
