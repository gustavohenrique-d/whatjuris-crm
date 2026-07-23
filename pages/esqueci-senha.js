// =============================================================================
// WhatJuris CRM — Esqueci minha senha
// pages/esqueci-senha.js
// =============================================================================

import Link from 'next/link';
import { useState } from 'react';
import axios from 'axios';
import { Button, Card, Form } from 'react-bootstrap';

const EsqueciSenha = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      const { data } = await axios.post('/api/auth/forgot-password', {
        email: email.trim().toLowerCase(),
      });
      // A mensagem é sempre genérica — não revela se o e-mail existe.
      setMessage(data.message);
      setSent(true);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) {
        setError(err.response.data.error);
      } else {
        setError(err?.response?.data?.error || 'Não foi possível processar. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-lg">
      <div className="row justify-content-center align-items-center authentication authentication-basic h-100">
        <div className="col-xxl-4 col-xl-5 col-lg-6 col-md-8 col-sm-10 col-12">
          <Card className="custom-card my-4 border">
            <Card.Body className="p-5">
              <div className="mb-4 text-center">
                <h4 className="fw-semibold mb-1">Esqueci minha senha</h4>
                <p className="text-muted mb-0 fs-13">
                  Informe seu e-mail e enviaremos um link para redefinir a senha.
                </p>
              </div>

              {sent ? (
                <>
                  <div className="alert alert-success py-2 fs-13" role="alert">
                    {message}
                  </div>
                  <div className="text-center mt-3">
                    <Link href="/login" className="fs-13">
                      Voltar para o login
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  {error && (
                    <div className="alert alert-danger py-2 fs-13" role="alert">
                      {error}
                    </div>
                  )}

                  <Form onSubmit={handleSubmit} noValidate>
                    <div className="mb-3">
                      <Form.Label htmlFor="fp-email" className="fs-14 fw-medium">
                        E-mail
                      </Form.Label>
                      <Form.Control
                        id="fp-email"
                        type="email"
                        autoComplete="email"
                        placeholder="voce@escritorio.com.br"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>

                    <div className="d-grid mt-4">
                      <Button type="submit" variant="primary" disabled={loading}>
                        {loading ? 'Enviando…' : 'Enviar link'}
                      </Button>
                    </div>

                    <div className="text-center mt-3">
                      <Link href="/login" className="fs-13 text-muted">
                        Voltar para o login
                      </Link>
                    </div>
                  </Form>
                </>
              )}
            </Card.Body>
          </Card>
        </div>
      </div>
    </div>
  );
};

EsqueciSenha.layout = 'Authenticationlayout';

export default EsqueciSenha;
