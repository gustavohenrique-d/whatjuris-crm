// =============================================================================
// WhatJuris CRM — Detalhe do deal (ficha do lead + timeline)
// pages/admin/deals/[id].js
// =============================================================================

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';
import { Badge, Button, Card, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import Pageheader from '../../../shared/layout-components/pageheader/pageheader';
import Seo from '../../../shared/layout-components/seo/seo';

const areaColor = {
  trabalhista: '#4F8EF7', civel: '#7C5CFC', 'cível': '#7C5CFC',
  familia: '#2DD4A0', 'família': '#2DD4A0', previdenciario: '#F5A623', 'previdenciário': '#F5A623',
};
const typeColor = {
  NOTE: 'secondary', STAGE_CHANGE: 'primary', MESSAGE_IN: 'success',
  MESSAGE_OUT: 'info', AI_ACTION: 'warning', CALL: 'warning', EMAIL: 'info',
  MEETING: 'primary', TASK: 'dark', SYSTEM: 'light', ASSIGNMENT: 'primary',
};
const statusColor = { OPEN: 'primary', WON: 'success', LOST: 'danger' };
const priorityLabel = ['Normal', 'Alta', 'Urgente'];

function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');
}

const DealDetail = () => {
  const router = useRouter();
  const { id } = router.query;
  const { data: session } = useSession();
  const canDeleteAny = session?.permissions?.includes('activity.delete');

  const [deal, setDeal] = useState(null);
  const [activities, setActivities] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [targetStage, setTargetStage] = useState('');
  const [moving, setMoving] = useState(false);

  const loadAll = async () => {
    try {
      const [dRes, aRes, pRes] = await Promise.all([
        axios.get(`/api/deals/${id}/`),
        axios.get(`/api/deals/${id}/activities/`),
        axios.get('/api/pipelines/'),
      ]);
      setDeal(dRes.data.deal);
      setActivities(aRes.data.activities);
      const pipe = pRes.data.pipelines.find((p) => p.id === dRes.data.deal.pipeline.id)
        || pRes.data.pipelines[0];
      setStages(pipe ? pipe.stages : []);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível carregar o negócio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (id) loadAll(); }, [id]);

  const addNote = async (e) => {
    e.preventDefault();
    if (savingNote || !note.trim()) return;
    setSavingNote(true);
    try {
      const { data } = await axios.post(`/api/deals/${id}/activities/`, {
        type: 'NOTE', content: note.trim(),
      });
      setActivities((prev) => [data.activity, ...prev]);
      setNote('');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível salvar a nota.');
    } finally {
      setSavingNote(false);
    }
  };

  const deleteNote = async (activityId) => {
    try {
      await axios.delete(`/api/activities/${activityId}/`);
      setActivities((prev) => prev.filter((a) => a.id !== activityId));
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível remover a nota.');
    }
  };

  const doMove = async () => {
    if (!targetStage || moving) return;
    setMoving(true);
    try {
      await axios.post(`/api/deals/${id}/move/`, { stageId: targetStage });
      setShowMove(false);
      setTargetStage('');
      await loadAll(); // recarrega deal (novo estágio) + timeline (STAGE_CHANGE)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível mover.');
    } finally {
      setMoving(false);
    }
  };

  if (loading) {
    return (
      <Fragment>
        <Seo title="Negócio" />
        <div className="text-center py-5"><Spinner animation="border" /></div>
      </Fragment>
    );
  }

  if (!deal) return <Seo title="Negócio" />;

  const wa = deal.contact?.whatsapp?.replace(/\D/g, '');

  return (
    <Fragment>
      <Seo title={deal.title} />
      <Pageheader title={deal.title} heading="CRM" active="Negócio" />

      <div className="mb-3">
        <Link href="/admin/pipeline" className="text-muted fs-13">
          <i className="ri-arrow-left-line me-1" />Voltar ao funil
        </Link>
      </div>

      <Row>
        {/* Ficha do lead */}
        <Col xl={5} className="mb-3">
          <Card className="custom-card">
            <Card.Body>
              <div className="d-flex align-items-center gap-3 mb-3">
                <span style={{
                  width: 48, height: 48, borderRadius: '50%', background: '#eef1f6',
                  color: '#4F8EF7', fontWeight: 700, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>{initials(deal.contact?.name)}</span>
                <div>
                  <h5 className="mb-0">{deal.contact?.name}</h5>
                  {deal.contact?.email && <div className="text-muted fs-12">{deal.contact.email}</div>}
                </div>
              </div>

              <dl className="row mb-0 fs-13">
                <dt className="col-5 text-muted fw-normal">Status</dt>
                <dd className="col-7"><Badge bg={statusColor[deal.status] || 'secondary'}>{deal.status}</Badge></dd>

                <dt className="col-5 text-muted fw-normal">Estágio</dt>
                <dd className="col-7">
                  <span style={{ color: deal.stage?.color, fontWeight: 600 }}>{deal.stage?.name}</span>
                </dd>

                {deal.legalArea && (<>
                  <dt className="col-5 text-muted fw-normal">Área jurídica</dt>
                  <dd className="col-7">
                    <Badge style={{ background: areaColor[(deal.legalArea || '').toLowerCase()] || '#8892A4' }}>
                      {deal.legalArea}
                    </Badge>
                  </dd>
                </>)}

                <dt className="col-5 text-muted fw-normal">Prioridade</dt>
                <dd className="col-7">{priorityLabel[deal.priority] || 'Normal'}</dd>

                <dt className="col-5 text-muted fw-normal">Responsável</dt>
                <dd className="col-7">{deal.owner?.name || '—'}</dd>

                {deal.contact?.whatsapp && (<>
                  <dt className="col-5 text-muted fw-normal">WhatsApp</dt>
                  <dd className="col-7">{deal.contact.whatsapp}</dd>
                </>)}
              </dl>

              <div className="d-flex gap-2 mt-4">
                <Button variant="primary" size="sm" onClick={() => setShowMove(true)}>
                  Mover estágio
                </Button>
                {wa && (
                  <a className="btn btn-success btn-sm" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                    <i className="ri-whatsapp-line me-1" />Iniciar no WhatsApp
                  </a>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Timeline */}
        <Col xl={7}>
          <Card className="custom-card">
            <Card.Header><Card.Title>Timeline</Card.Title></Card.Header>
            <Card.Body>
              <Form onSubmit={addNote} className="mb-4">
                <Form.Control
                  as="textarea" rows={2}
                  placeholder="Adicionar uma nota…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="text-end mt-2">
                  <Button type="submit" size="sm" variant="primary" disabled={savingNote || !note.trim()}>
                    {savingNote ? 'Salvando…' : 'Adicionar nota'}
                  </Button>
                </div>
              </Form>

              {activities.length === 0 && (
                <p className="text-center text-muted fs-13 py-3">Nenhuma atividade ainda.</p>
              )}

              <ul className="list-unstyled mb-0">
                {activities.map((a) => {
                  const actor = a.user?.name || a.actorLabel || (a.actorType === 'SYSTEM' ? 'Sistema' : 'IA');
                  const canDelete = a.type === 'NOTE' && (canDeleteAny || a.userId === session?.user?.id);
                  return (
                    <li key={a.id} className="d-flex gap-3 mb-3 pb-3 border-bottom">
                      <span style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: '#eef1f6', color: '#4F8EF7', fontSize: 11, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}>{initials(actor)}</span>
                      <div className="flex-grow-1">
                        <div className="d-flex align-items-center justify-content-between">
                          <div className="d-flex align-items-center gap-2">
                            <Badge bg={typeColor[a.type] || 'secondary'} className="fs-10">{a.type}</Badge>
                            <span className="fw-medium fs-13">{actor}</span>
                          </div>
                          <div className="d-flex align-items-center gap-2">
                            <small className="text-muted fs-11">{relTime(a.occurredAt)}</small>
                            {canDelete && (
                              <button
                                type="button"
                                className="btn btn-sm btn-link text-danger p-0 fs-11"
                                onClick={() => deleteNote(a.id)}
                              >
                                excluir
                              </button>
                            )}
                          </div>
                        </div>
                        {a.title && <div className="fw-medium fs-13 mt-1">{a.title}</div>}
                        {a.content && <div className="text-muted fs-13" style={{ whiteSpace: 'pre-wrap' }}>{a.content}</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Modal mover estágio */}
      <Modal show={showMove} onHide={() => setShowMove(false)} centered>
        <Modal.Header closeButton><Modal.Title>Mover estágio</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form.Select value={targetStage} onChange={(e) => setTargetStage(e.target.value)}>
            <option value="">Selecione o estágio…</option>
            {stages.filter((s) => s.id !== deal.stage?.id).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Form.Select>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={() => setShowMove(false)}>Cancelar</Button>
          <Button variant="primary" onClick={doMove} disabled={!targetStage || moving}>
            {moving ? 'Movendo…' : 'Mover'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Fragment>
  );
};

DealDetail.layout = 'Contentlayout';

export default DealDetail;
