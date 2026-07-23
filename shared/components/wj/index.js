// shared/components/wj/index.js
// Componentes reutilizáveis do design WhatJuris (valores copiados do whatjuris.html).

export function WjCard({ children, style = {} }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 20, minWidth: 0, ...style,
    }}>
      {children}
    </div>
  );
}

const AREA_STYLES = {
  trabalhista: { bg: 'rgba(79,142,247,0.15)', color: '#7EAAF9' },
  civel: { bg: 'rgba(124,92,252,0.16)', color: '#A491FC' },
  'cível': { bg: 'rgba(124,92,252,0.16)', color: '#A491FC' },
  familia: { bg: 'rgba(45,212,160,0.15)', color: '#4FDDB4' },
  'família': { bg: 'rgba(45,212,160,0.15)', color: '#4FDDB4' },
  previdenciario: { bg: 'rgba(245,166,35,0.16)', color: '#F7B94F' },
  'previdenciário': { bg: 'rgba(245,166,35,0.16)', color: '#F7B94F' },
};

export function AreaBadge({ area }) {
  if (!area) return null;
  const s = AREA_STYLES[String(area).toLowerCase()] || { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 500, fontFamily: 'var(--mono)',
      padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap',
      background: s.bg, color: s.color,
    }}>{area}</span>
  );
}

const STATUS_STYLES = {
  green: { bg: 'rgba(45,212,160,0.15)', color: 'var(--green)' },
  amber: { bg: 'rgba(245,166,35,0.15)', color: 'var(--amber)' },
  red: { bg: 'rgba(240,78,78,0.15)', color: 'var(--red)' },
};

export function StatusBadge({ variant = 'green', children }) {
  const s = STATUS_STYLES[variant] || STATUS_STYLES.green;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 600, fontFamily: 'var(--mono)',
      padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
      {children}
    </span>
  );
}

export function MiniAvatar({ name = '', size = 26 }) {
  const initials = String(name).split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, var(--accent2), var(--accent))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 600, color: '#fff', fontFamily: 'var(--mono)',
    }}>{initials}</div>
  );
}

export function WjButton({ variant = 'primary', children, style = {}, ...props }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontSize: 13, fontWeight: 600, padding: '10px 18px',
    borderRadius: 8, border: '1px solid transparent', cursor: 'pointer', fontFamily: 'inherit',
  };
  const variants = {
    primary: { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' },
    outline: { background: 'transparent', color: 'var(--text)', borderColor: 'var(--border)' },
  };
  return (
    <button style={{ ...base, ...variants[variant], ...style }} {...props}>{children}</button>
  );
}

// Cabeçalho de tela padrão (.screen-label + .screen-title + .screen-sub)
export function WjScreenHeader({ label, title, sub, right }) {
  return (
    <div style={{ marginBottom: 24 }}>
      {label && (
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8,
        }}>{label}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{title}</h1>
          {sub && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}
