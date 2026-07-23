// =============================================================================
// WhatJuris CRM — Configurações (design whatjuris.html — módulo 10B.7)
// Lógica do Google OAuth (módulo 7) preservada; toggles de WhatsApp/n8n são
// visuais (estado local) — as credenciais reais vivem no .env do servidor.
// =============================================================================

import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import Seo from '../../../shared/layout-components/seo/seo';
import { StatusBadge, WjCard, WjScreenHeader } from '../../../shared/components/wj';

function SettingsSection({ title, children }) {
  return (
    <WjCard style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>{title}</div>
      {children}
    </WjCard>
  );
}

function SettingsRow({ label, sub, children, last = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '13px 0', borderBottom: last ? 'none' : '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <div onClick={onChange} style={{
      width: 36, height: 20, borderRadius: 20, flexShrink: 0, cursor: 'pointer',
      background: on ? 'var(--accent)' : 'var(--border)',
      position: 'relative', transition: 'background .15s',
    }}>
      <div style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left .15s',
      }} />
    </div>
  );
}

function AvatarSm({ name = '' }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'U';
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, var(--accent2), var(--accent))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 600, color: '#fff',
    }}>{initials}</div>
  );
}

const STATUS_USER = {
  ACTIVE: { variant: 'green', label: 'Online' },
  INVITED: { variant: 'amber', label: 'Convidado' },
  SUSPENDED: { variant: 'red', label: 'Suspenso' },
};

const Configuracoes = () => {
  const router = useRouter();
  const { data: session } = useSession();
  const [org, setOrg] = useState(null);
  const [users, setUsers] = useState([]);
  const [waOn, setWaOn] = useState(true);
  const [n8nOn, setN8nOn] = useState(true);

  useEffect(() => {
    axios.get('/api/organization/')
      .then(({ data }) => setOrg(data.organization))
      .catch(() => {});
    axios.get('/api/users/')
      .then(({ data }) => setUsers(data.users))
      .catch(() => {}); // sem user.read → seção fica só com o usuário logado
  }, []);

  useEffect(() => {
    if (router.query.googleConnected) toast.success('Google Agenda conectado.');
    if (router.query.googleError) toast.error('Não foi possível conectar o Google Agenda.');
  }, [router.query]);

  const googleConnected = !!org?.settings?.googleRefreshToken;

  return (
    <Fragment>
      <Seo title="Configurações" />
      <WjScreenHeader
        label="Módulo · Sistema"
        title="Configurações"
        sub="Preferências do escritório e integrações"
      />

      <SettingsSection title="Perfil do escritório">
        <SettingsRow label="Nome do escritório" sub={org?.name || '—'} />
        <SettingsRow label="Responsável" sub={session?.user?.name || '—'} last />
      </SettingsSection>

      <SettingsSection title="Integrações">
        <SettingsRow label="WhatsApp Business API"
          sub="Credenciais configuradas no servidor (.env)">
          <Toggle on={waOn} onChange={() => setWaOn((v) => !v)} />
        </SettingsRow>
        <SettingsRow label="Agentes n8n"
          sub="Fluxo de triagem automatizada">
          <Toggle on={n8nOn} onChange={() => setN8nOn((v) => !v)} />
        </SettingsRow>
        <SettingsRow label="Google Agenda"
          sub={googleConnected ? 'Conectado · sincronização de consultas e audiências' : 'Sincronização de consultas e audiências'}
          last>
          <Toggle on={googleConnected} onChange={() => {
            if (!googleConnected) window.location.href = '/api/auth/google';
          }} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Usuários">
        {(users.length ? users : (session?.user ? [{ id: 'me', name: session.user.name, status: 'ACTIVE', role: { name: session.user.roleName } }] : []))
          .map((u, i, arr) => {
            const st = STATUS_USER[u.status] || STATUS_USER.ACTIVE;
            return (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '13px 0', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AvatarSm name={u.name} />
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {u.role?.name || '—'}
                    </div>
                  </div>
                </div>
                <StatusBadge variant={st.variant}>{st.label}</StatusBadge>
              </div>
            );
          })}
      </SettingsSection>
    </Fragment>
  );
};

Configuracoes.layout = 'Contentlayout';
export default Configuracoes;
