// =============================================================================
// WhatJuris CRM — Clientes (design whatjuris.html — módulo 10B.2)
// Contatos com seus deals (join no cliente: a lista de contatos não traz deals).
// =============================================================================

import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';
import Seo from '../../../shared/layout-components/seo/seo';
import { AreaBadge, StatusBadge, WjCard, WjScreenHeader } from '../../../shared/components/wj';

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

const Clientes = () => {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [cRes, dRes] = await Promise.all([
          axios.get('/api/contacts/?limit=100'),
          axios.get('/api/deals/?limit=200'),
        ]);
        const dealsByContact = {};
        dRes.data.deals.forEach((d) => {
          (dealsByContact[d.contact?.id] = dealsByContact[d.contact?.id] || []).push(d);
        });
        setRows(cRes.data.contacts.map((c) => ({ ...c, deals: dealsByContact[c.id] || [] })));
      } catch { /* silencioso */ } finally {
        setLoaded(true);
      }
    })();
  }, []);

  return (
    <Fragment>
      <Seo title="Clientes" />
      <WjScreenHeader
        label="Módulo · Relacionamento"
        title="Clientes"
        sub="Leads convertidos em clientes ativos"
      />

      <WjCard>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Cliente</th>
                <th style={th}>Área</th>
                <th style={th}>Processo vinculado</th>
                <th style={th}>Última atividade</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loaded && rows.length === 0 && (
                <tr><td style={{ ...td, borderBottom: 'none', color: 'var(--text-secondary)' }} colSpan={5}>Nenhum cliente cadastrado.</td></tr>
              )}
              {rows.map((c, i) => {
                const last = i === rows.length - 1;
                const cellStyle = last ? { ...td, borderBottom: 'none' } : td;
                const ativo = c.deals.some((d) => d.status === 'OPEN');
                return (
                  <tr key={c.id}>
                    <td style={{ ...cellStyle, fontWeight: 500 }}>{c.name}</td>
                    <td style={cellStyle}>{c.deals[0]?.legalArea ? <AreaBadge area={c.deals[0].legalArea} /> : '—'}</td>
                    <td style={{ ...cellStyle, fontFamily: 'var(--mono)', fontSize: 12.5 }}>
                      {c.deals[0]?.id?.slice(0, 8) || '—'}
                    </td>
                    <td style={cellStyle}>{timeAgo(c.createdAt)}</td>
                    <td style={cellStyle}>
                      <StatusBadge variant={ativo ? 'green' : 'amber'}>{ativo ? 'Ativo' : 'Inativo'}</StatusBadge>
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

Clientes.layout = 'Contentlayout';

export default Clientes;
