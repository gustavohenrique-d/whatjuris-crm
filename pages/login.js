// =============================================================================
// WhatJuris CRM — Login (design whatjuris.html — módulo 10B.8)
// Lógica do módulo 2A preservada: signIn credentials, mensagens ?msg=, redirect.
// =============================================================================

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { getSession, signIn } from 'next-auth/react';

const inputStyle = {
  width: '100%', background: 'var(--card-alt)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '11px 14px', fontSize: 13, color: 'var(--text)',
  fontFamily: 'inherit', outline: 'none', marginBottom: 12,
};

const Login = () => {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const successMessages = {
    convite_aceito: 'Convite aceito! Faça login com sua nova senha.',
    senha_redefinida: 'Senha redefinida! Faça login com a nova senha.',
  };
  const success = successMessages[router.query.msg];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setError('');
    setLoading(true);

    const result = await signIn('credentials', {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    const callbackUrl = router.query.callbackUrl || '/admin/dashboard';
    router.push(callbackUrl);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Painel esquerdo — formulário */}
      <div style={{
        width: 420, background: 'var(--sidebar)', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '60px 48px', borderRight: '1px solid var(--border)',
      }}>
        {/* Logo (balança) */}
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="url(#wjLoginGrad)"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <defs>
            <linearGradient id="wjLoginGrad" x1="0" y1="0" x2="24" y2="24">
              <stop offset="0" stopColor="#4F8EF7" /><stop offset="1" stopColor="#7C5CFC" />
            </linearGradient>
          </defs>
          <path d="M12 3v18" /><path d="M5 8h14" />
          <path d="M5 8l-3 6a3.2 3.2 0 0 0 6 0l-3-6z" /><path d="M19 8l-3 6a3.2 3.2 0 0 0 6 0l-3-6z" />
          <path d="M8.5 21h7" />
        </svg>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', margin: '16px 0 4px' }}>
          WhatJuris
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 40 }}>
          Seu escritório, inteligente.
        </div>

        {success && (
          <div style={{
            width: '100%', fontSize: 12, color: 'var(--green)', textAlign: 'center',
            background: 'rgba(45,212,160,0.1)', border: '1px solid rgba(45,212,160,0.25)',
            borderRadius: 8, padding: '9px 12px', marginBottom: 16,
          }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ width: '100%' }} noValidate>
          <input
            type="email"
            placeholder="E-mail"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="Senha"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
          <button type="submit" disabled={loading} style={{
            width: '100%', background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 8, padding: 11, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', marginTop: 8, opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        {error && (
          <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 12, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <Link href="/esqueci-senha" style={{
          fontSize: 12, color: 'var(--text-secondary)', marginTop: 20,
          display: 'block', textAlign: 'center',
        }}>
          Esqueci minha senha
        </Link>
      </div>

      {/* Painel direito — gradiente sutil */}
      <div style={{
        flex: 1, background: 'var(--bg)',
        backgroundImage:
          'radial-gradient(circle at 30% 30%, rgba(124,92,252,0.08), transparent 50%), radial-gradient(circle at 70% 70%, rgba(79,142,247,0.06), transparent 50%)',
      }} />
    </div>
  );
};

Login.layout = 'Authenticationlayout';

export default Login;

// Se já autenticado, não mostra o login — manda para o painel.
export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (session) {
    return { redirect: { destination: '/admin/dashboard', permanent: false } };
  }
  return { props: {} };
}
