// =============================================================================
// WhatJuris CRM — Criar novo lead
// pages/admin/leads/novo.js
//
// Cria um Contact (LEAD) e um Deal no estágio 'novo_contato', depois redireciona
// para o kanban.
// =============================================================================

import { useRouter } from 'next/router';
import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';
import { Button, Card, Col, Form, Row } from 'react-bootstrap';
import { toast } from 'react-toastify';
import Pageheader from '../../../shared/layout-components/pageheader/pageheader';
import Seo from '../../../shared/layout-components/seo/seo';

const NovoLead = () => {
  const router = useRouter();
  const [areas, setAreas] = useState([]);
  const [users, setUsers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '', whatsapp: '', legalArea: '', ownerId: '', priority: 0,
  });

  useEffect(() => {
    axios.get('/api/organization/')
      .then(({ data }) => setAreas(data.organization.legalAreas || []))
      .catch(() => {});
    axios.get('/api/users/')
      .then(({ data }) => setUsers(data.users.filter((u) => u.status === 'ACTIVE')))
      .catch(() => {}); // sem user.read: campo de responsável fica oculto
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      // 1. Cria o contato (lead)
      const { data: cData } = await axios.post('/api/contacts/', {
        name: form.name.trim(),
        whatsapp: form.whatsapp.trim() || null,
        type: 'LEAD',
        source: 'manual',
      });

      // 2. Cria o negócio no estágio inicial
      await axios.post('/api/deals/', {
        title: form.name.trim(),
        contactId: cData.contact.id,
        stageKey: 'novo_contato',
        legalArea: form.legalArea || null,
        ownerId: form.ownerId || undefined,
        priority: Number(form.priority) || 0,
      });

      toast.success('Lead criado.');
      router.push('/admin/pipeline');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível criar o lead.');
      setSubmitting(false);
    }
  };

  return (
    <Fragment>
      <Seo title="Novo lead" />
      <Pageheader title="Novo lead" heading="CRM" active="Novo lead" />

      <Row className="justify-content-center">
        <Col xxl={6} lg={8}>
          <Card className="custom-card">
            <Card.Header><Card.Title>Cadastrar lead</Card.Title></Card.Header>
            <Card.Body>
              <Form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <Form.Label className="fs-14">Nome do lead <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    required
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="Nome completo"
                    autoFocus
                  />
                </div>

                <div className="mb-3">
                  <Form.Label className="fs-14">WhatsApp / telefone</Form.Label>
                  <Form.Control
                    value={form.whatsapp}
                    onChange={(e) => set('whatsapp', e.target.value)}
                    placeholder="11987654321"
                  />
                </div>

                <div className="mb-3">
                  <Form.Label className="fs-14">Área jurídica</Form.Label>
                  <Form.Select value={form.legalArea} onChange={(e) => set('legalArea', e.target.value)}>
                    <option value="">Selecione…</option>
                    {areas.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </Form.Select>
                </div>

                {users.length > 0 && (
                  <div className="mb-3">
                    <Form.Label className="fs-14">Responsável</Form.Label>
                    <Form.Select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
                      <option value="">Eu mesmo</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </Form.Select>
                  </div>
                )}

                <div className="mb-4">
                  <Form.Label className="fs-14">Prioridade</Form.Label>
                  <Form.Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                    <option value={0}>Normal</option>
                    <option value={1}>Alta</option>
                    <option value={2}>Urgente</option>
                  </Form.Select>
                </div>

                <div className="d-flex gap-2 justify-content-end">
                  <Button variant="light" type="button" onClick={() => router.push('/admin/pipeline')}>
                    Cancelar
                  </Button>
                  <Button variant="primary" type="submit" disabled={submitting}>
                    {submitting ? 'Criando…' : 'Criar lead'}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Fragment>
  );
};

NovoLead.layout = 'Contentlayout';

export default NovoLead;
