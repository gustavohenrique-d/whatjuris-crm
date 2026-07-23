// shared/layout-components/sidebar/sidebar.js
// Visual: .sidebar do whatjuris.html (SVGs e valores copiados do arquivo).

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';

const S = 17;
const strokeProps = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round', strokeLinejoin: 'round',
};

const DashboardIcon = () => (
  <svg width={S} height={S} viewBox="0 0 24 24" {...strokeProps}>
    <rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" />
    <rect x="13" y="11" width="8" height="10" rx="1.5" /><rect x="3" y="14" width="8" height="7" rx="1.5" />
  </svg>
);
const PipelineIcon = () => (
  <svg width={S} height={S} viewBox="0 0 24 24" {...strokeProps}>
    <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M9 4v17M15 4v17" />
  </svg>
);
const ChatIcon = () => (
  <svg width={S} height={S} viewBox="0 0 24 24" {...strokeProps}>
    <path d="M21 12c0 4.4-4 8-9 8-1.1 0-2.2-.2-3.2-.5L3 21l1.6-4.8C3.6 14.9 3 13.5 3 12c0-4.4 4-8 9-8s9 3.6 9 8z" />
    <circle cx="8.5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="15.5" cy="12" r="1" />
  </svg>
);
const ClientesIcon = () => (
  <svg width={S} height={S} viewBox="0 0 24 24" {...strokeProps}>
    <circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c.7-3.6 3.4-5.6 6.5-5.6s5.8 2 6.5 5.6" />
    <circle cx="17.5" cy="8.5" r="2.6" /><path d="M16 14.9c2.6.2 4.6 2 5.2 4.9" />
  </svg>
);
const ProcessosIcon = () => (
  <svg width={S} height={S} viewBox="0 0 24 24" {...strokeProps}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2.2h8.5A1.5 1.5 0 0 1 21 9.7V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" />
  </svg>
);
const AgendaIcon = () => (
  <svg width={S} height={S} viewBox="0 0 24 24" {...strokeProps}>
    <rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 3v3M16 3v3" />
  </svg>
);
const FinanceiroIcon = () => (
  <svg width={S} height={S} viewBox="0 0 24 24" {...strokeProps}>
    <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M14.7 9.6c-.4-.9-1.4-1.4-2.7-1.4-1.6 0-2.7.8-2.7 1.9 0 2.8 5.4 1.4 5.4 4.1 0 1.2-1.2 1.9-2.7 1.9-1.3 0-2.4-.5-2.8-1.4" />
  </svg>
);
const RelatoriosIcon = () => (
  <svg width={S} height={S} viewBox="0 0 24 24" {...strokeProps}>
    <path d="M4 20V10M11 20V4M18 20v-7" /><path d="M2.5 20h19" />
  </svg>
);
const ConfigIcon = () => (
  <svg width={S} height={S} viewBox="0 0 24 24" {...strokeProps}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1h-.2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6v-.2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z" />
  </svg>
);

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: '/admin/dashboard', icon: DashboardIcon },
  { key: 'pipeline', label: 'Pipeline de Leads', href: '/admin/pipeline', icon: PipelineIcon },
  { key: 'conversas', label: 'Conversas', href: '/admin/conversas', icon: ChatIcon },
  { key: 'clientes', label: 'Clientes', href: '/admin/clientes', icon: ClientesIcon },
  { key: 'processos', label: 'Processos', href: '/admin/processos', icon: ProcessosIcon },
  { key: 'agenda', label: 'Agenda', href: '/admin/agenda', icon: AgendaIcon },
  { key: 'financeiro', label: 'Financeiro', href: '/admin/financeiro', icon: FinanceiroIcon },
  { key: 'relatorios', label: 'Relatórios', href: '/admin/relatorios', icon: RelatoriosIcon },
  { key: 'config', label: 'Configurações', href: '/admin/configuracoes', icon: ConfigIcon },
];

export default function Sidebar() {
  const router = useRouter();
  const { data: session } = useSession();

  const name = session?.user?.name || '';
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'U';

  return (
    <aside style={{
      width: 220, position: 'fixed', top: 0, left: 0, bottom: 0,
      background: 'var(--sidebar)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', padding: '22px 14px', zIndex: 10,
    }}>
      {/* Logo (balança) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 6px' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="url(#wjLogoGrad)"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <defs>
            <linearGradient id="wjLogoGrad" x1="0" y1="0" x2="24" y2="24">
              <stop offset="0" stopColor="#4F8EF7" /><stop offset="1" stopColor="#7C5CFC" />
            </linearGradient>
          </defs>
          <path d="M12 3v18" /><path d="M5 8h14" />
          <path d="M5 8l-3 6a3.2 3.2 0 0 0 6 0l-3-6z" /><path d="M19 8l-3 6a3.2 3.2 0 0 0 6 0l-3-6z" />
          <path d="M8.5 21h7" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' }}>WhatJuris</span>
          <span style={{ fontSize: 10.5, color: 'var(--text-secondary)', fontWeight: 400 }}>Seu escritório, inteligente.</span>
        </div>
      </div>

      {/* Indicador de agentes IA */}
      <div style={{
        margin: '18px 6px 20px', padding: 12, background: 'var(--card)',
        border: '1px solid var(--border)', borderRadius: 10,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span className="wj-pulse-dot" style={{
          position: 'relative', width: 9, height: 9, borderRadius: '50%',
          background: 'var(--green)', flexShrink: 0,
        }} />
        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.35 }}>
          <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Agentes IA</strong> ativos
        </span>
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
        {NAV_ITEMS.map((item) => {
          const active = router.pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.key} href={item.href} className="wj-nav-item" style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px',
              borderRadius: 8, fontSize: 13.5, cursor: 'pointer',
              color: active ? 'var(--text)' : 'var(--text-secondary)',
              border: active ? '1px solid rgba(79,142,247,0.25)' : '1px solid transparent',
              background: active
                ? 'linear-gradient(90deg, rgba(79,142,247,0.16), rgba(124,92,252,0.08))'
                : 'transparent',
            }}>
              <span style={{ flexShrink: 0, color: active ? 'var(--accent)' : 'currentColor', opacity: active ? 1 : 0.85, display: 'inline-flex' }}>
                <Icon />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer com usuário */}
      <div style={{
        marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 6,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent2), var(--accent))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 600, color: '#fff',
        }}>{initials}</div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, minWidth: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          <button onClick={() => signOut({ callbackUrl: '/login' })} title="Sair"
            style={{ fontSize: 10.5, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
            Online · sair
          </button>
        </div>
      </div>
    </aside>
  );
}
