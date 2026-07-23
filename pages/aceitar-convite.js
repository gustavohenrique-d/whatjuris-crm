// =============================================================================
// WhatJuris CRM — Aceitar convite
// pages/aceitar-convite.js
// =============================================================================

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button, Card, Form, InputGroup } from 'react-bootstrap';

function strengthOf(password) {
  if (!password) return { pct: 0, label: '', variant: 'secondary' };
  if (password.length < 10) return { pct: 33, label: 'Fraca', variant: 'danger' };
  if (password.length < 14) return { pct: 66, label: 'Média', variant: 'warning' };
  return { pct: 100, label: 'Forte', variant: 'success' };
}

const AceitarConvite = () => {
  const router = useRouter();
  const [status, setStatus] = useState('loading'); // loading | valid | invalid
  const [invite, setInvite] = useState({ email: '', name: '', roleName: '' });
  const [tokenError, setTokenError] = useState('');

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const token = router.query.token;

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
      setStatus('invalid');
      setTokenError('Link inválido. Solicite um novo convite.');
      return;
    }
    axios
      .get(`/api/auth/accept-invite?token=${encodeURIComponent(token)}`)
      .then(({ data }) => {
        setInvite({ email: data.email, name: data.name, roleName: data.roleName });
        setStatus('valid');
      })
      .catch((err) => {
        setStatus('invalid');
        setTokenError(err?.response?.data?.error || 'Este convite não é mais válido.');
      });
  }, [router.isReady, token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    if (password !== passwordConfirm) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await axios.post('/api/auth/accept-invite', { token, password, passwordConfirm });
      router.push('/login?msg=convite_aceito');
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível concluir. Tente novamente.');
      setLoading(false);
    }
  };

  const strength = strengthOf(password);

  return (
    <div className="container-lg">
      <div className="row justify-content-center align-items-center authentication authentication-basic h-100">
        <div className="col-xxl-4 col-xl-5 col-lg-6 col-md-8 col-sm-10 col-12">
          <Card className="custom-card my-4 border">
            <Card.Body className="p-5">
              <div className="mb-4 text-center">
                <h4 className="fw-semibold mb-1">Aceitar convite</h4>
                {status === 'valid' && (
                  <p className="text-muted mb-0 fs-13">
                    Definindo senha de <strong>{invite.email}</strong>
                    {invite.roleName ? ` · ${invite.roleName}` : ''}
                  </p>
                )}
              </div>

              {status === 'loading' && (
                <p className="text-center text-muted fs-13">Validando convite…</p>
              )}

              {status === 'invalid' && (
                <>
                  <div className="alert alert-danger py-2 fs-13" role="alert">
                    {tokenError}
                  </div>
                  <div className="text-center mt-3">
                    <Link href="/login" className="fs-13">
                      Ir para o login
                    </Link>
                  </div>
                </>
              )}

              {status === 'valid' && (
                <Form onSubmit={handleSubmit} noValidate>
                  {error && (
                    <div className="alert alert-danger py-2 fs-13" role="alert">
                      {error}
                    </div>
                  )}

                  <div className="mb-2">
                    <Form.Label htmlFor="ai-password" className="fs-14 fw-medium">
                      Crie sua senha
                    </Form.Label>
                    <InputGroup>
                      <Form.Control
                        id="ai-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Mínimo 10 caracteres"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoFocus
                      />
                      <Button
                        variant="light"
                        type="button"
                        className="border"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        <i className={showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} />
                      </Button>
                    </InputGroup>
                    {password && (
                      <div className="mt-2">
                        <div className="progress" style={{ height: 4 }}>
                          <div
                            className={`progress-bar bg-${strength.variant}`}
                            style={{ width: `${strength.pct}%` }}
                          />
                        </div>
                        <small className={`text-${strength.variant}`}>{strength.label}</small>
                      </div>
                    )}
                  </div>

                  <div className="mb-3">
                    <Form.Label htmlFor="ai-confirm" className="fs-14 fw-medium">
                      Confirmar senha
                    </Form.Label>
                    <Form.Control
                      id="ai-confirm"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Repita a senha"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      required
                    />
                  </div>

                  <div className="d-grid mt-4">
                    <Button type="submit" variant="primary" disabled={loading}>
                      {loading ? 'Salvando…' : 'Criar senha e entrar'}
                    </Button>
                  </div>
                </Form>
              )}
            </Card.Body>
          </Card>
        </div>
      </div>
    </div>
  );
};

AceitarConvite.layout = 'Authenticationlayout';

export default AceitarConvite;
