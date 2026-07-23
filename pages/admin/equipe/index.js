// =============================================================================
// WhatJuris CRM — Gestão de equipe (tela mínima)
// pages/admin/equipe/index.js
// =============================================================================

import { Fragment, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { Badge, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import Pageheader from '../../../shared/layout-components/pageheader/pageheader';
import Seo from '../../../shared/layout-components/seo/seo';

const statusBadge = {
  ACTIVE: { bg: 'success', label: 'Ativo' },
  INVITED: { bg: 'warning', label: 'Convidado' },
  SUSPENDED: { bg: 'danger', label: 'Suspenso' },
};

const Equipe = () => {
  const { data: session } = useSession();
  const permissions = session?.permissions ?? [];
  const canInvite = permissions.includes('user.invite');
  const canSuspend = permissions.includes('user.suspend');

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', roleKey: '' });

  const loadUsers = async () => {
    try {
      const { data } = await axios.get('/api/users/');
      setUsers(data.users);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível carregar a equipe.');
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const { data } = await axios.get('/api/roles/');
      // Não oferecer 'owner' como opção de convite
      setRoles(data.roles.filter((r) => r.key !== 'owner'));
    } catch {
      // role.read pode não estar disponível — o convite ainda aceita roleKey manual
    }
  };

  useEffect(() => {
    loadUsers();
    loadRoles();
  }, []);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data } = await axios.post('/api/users/invite/', form);
      toast.success(data.message || 'Convite enviado.');
      if (data.fallbackLink) {
        toast.info('E-mail não enviado — link disponível no console do servidor.');
      }
      setForm({ name: '', email: '', roleKey: '' });
      setShowInvite(false);
      loadUsers();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível convidar.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuspend = async (user) => {
    try {
      await axios.delete(`/api/users/${user.id}/`);
      toast.success('Usuário removido.');
      loadUsers();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível remover.');
    }
  };

  return (
    <Fragment>
      <Seo title="Equipe" />
      <Pageheader title="Equipe" heading="Administração" active="Equipe" />

      <Row>
        <Col xl={12}>
          <Card className="custom-card">
            <Card.Header className="justify-content-between">
              <Card.Title>Usuários do escritório</Card.Title>
              {canInvite && (
                <Button variant="primary" size="sm" onClick={() => setShowInvite((v) => !v)}>
                  <i className="ri-user-add-line me-1" />
                  {showInvite ? 'Cancelar' : 'Convidar'}
                </Button>
              )}
            </Card.Header>

            {canInvite && showInvite && (
              <Card.Body className="border-bottom bg-light">
                <Form onSubmit={handleInvite}>
                  <Row className="gy-2 align-items-end">
                    <Col md={4}>
                      <Form.Label className="fs-13">Nome</Form.Label>
                      <Form.Control
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Nome completo"
                      />
                    </Col>
                    <Col md={4}>
                      <Form.Label className="fs-13">E-mail</Form.Label>
                      <Form.Control
                        required
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="pessoa@escritorio.com.br"
                      />
                    </Col>
                    <Col md={3}>
                      <Form.Label className="fs-13">Papel</Form.Label>
                      <Form.Select
                        required
                        value={form.roleKey}
                        onChange={(e) => setForm({ ...form, roleKey: e.target.value })}
                      >
                        <option value="">Selecione…</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.key}>{r.name}</option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col md={1}>
                      <Button type="submit" variant="success" disabled={submitting} className="w-100">
                        {submitting ? '…' : 'Enviar'}
                      </Button>
                    </Col>
                  </Row>
                </Form>
              </Card.Body>
            )}

            <Card.Body>
              {loading ? (
                <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
              ) : (
                <div className="table-responsive">
                  <table className="table text-nowrap table-hover">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>E-mail</th>
                        <th>Papel</th>
                        <th>Status</th>
                        {canSuspend && <th className="text-end">Ações</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => {
                        const badge = statusBadge[u.status] || { bg: 'secondary', label: u.status };
                        const isOwner = u.role?.key === 'owner';
                        return (
                          <tr key={u.id}>
                            <td className="fw-medium">{u.name}</td>
                            <td>{u.email}</td>
                            <td>{u.role?.name}</td>
                            <td><Badge bg={badge.bg}>{badge.label}</Badge></td>
                            {canSuspend && (
                              <td className="text-end">
                                {!isOwner && u.status !== 'SUSPENDED' && (
                                  <Button
                                    variant="outline-danger"
                                    size="sm"
                                    onClick={() => handleSuspend(u)}
                                  >
                                    Suspender
                                  </Button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center text-muted py-4">
                            Nenhum usuário encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Fragment>
  );
};

Equipe.layout = 'Contentlayout';

export default Equipe;
