// =============================================================================
// WhatJuris CRM — Agenda (design whatjuris.html — módulo 10B.4)
// Lógica do módulo 7 preservada (FullCalendar + criação de evento).
// =============================================================================

import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { Fragment, useCallback, useRef, useState } from 'react';
import axios from 'axios';
import { Form, Modal, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import Seo from '../../../shared/layout-components/seo/seo';
import { WjButton, WjCard, WjScreenHeader } from '../../../shared/components/wj';

// Cores por tipo (whatjuris.html: consulta=accent, audiência=accent2, reunião=amber)
const eventColor = {
  MEETING: '#4F8EF7',  // var(--accent)
  HEARING: '#7C5CFC',  // var(--accent2)
  TASK: '#F5A623',     // var(--amber)
  CALL: '#F5A623',
};
// Texto: #0F1117 sobre accent/amber; #fff sobre accent2 (do HTML)
const eventTextColor = { MEETING: '#0F1117', HEARING: '#fff', TASK: '#0F1117', CALL: '#0F1117' };

const LABEL_TIPO = { MEETING: 'Reunião', CALL: 'Ligação', HEARING: 'Audiência', TASK: 'Tarefa' };

const LEGEND = [
  { label: 'Consulta inicial', color: 'var(--accent)' },
  { label: 'Audiência', color: 'var(--accent2)' },
  { label: 'Reunião interna', color: 'var(--amber)' },
];

const Agenda = () => {
  const calendarRef = useRef(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: 'MEETING', title: '', content: '', dueAt: '', dealId: '', contactId: '',
  });

  const fetchEvents = useCallback(async (info, successCallback, failureCallback) => {
    try {
      const { data } = await axios.get(`/api/agenda/?from=${info.startStr}&to=${info.endStr}`);
      const events = data.events.map((e) => ({
        id: e.id,
        title: e.deal?.contact?.name || e.contact?.name || e.title,
        start: e.dueAt,
        backgroundColor: eventColor[e.type] || '#8892A4',
        borderColor: 'transparent',
        textColor: eventTextColor[e.type] || '#0F1117',
        extendedProps: { type: e.type, deal: e.deal, content: e.content },
      }));
      successCallback(events);
    } catch {
      failureCallback(new Error('Erro ao carregar eventos.'));
    }
  }, []);

  const handleSave = async () => {
    if (!form.title || !form.dueAt) {
      toast.error('Preencha o título e a data/hora.');
      return;
    }
    setSaving(true);
    try {
      await axios.post('/api/agenda/events/', {
        type: form.type,
        title: form.title,
        content: form.content || null,
        dueAt: new Date(form.dueAt).toISOString(),
        dealId: form.dealId || null,
        contactId: form.contactId || null,
      });
      toast.success('Evento criado.');
      setShowModal(false);
      setForm({ type: 'MEETING', title: '', content: '', dueAt: '', dealId: '', contactId: '' });
      calendarRef.current?.getApi().refetchEvents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar evento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Fragment>
      <Seo title="Agenda" />
      <WjScreenHeader
        label="Módulo · Agenda"
        title="Agenda"
        sub="Consultas, audiências e reuniões da semana"
        right={<WjButton onClick={() => setShowModal(true)}>+ Novo evento</WjButton>}
      />

      {/* Legenda (.agenda-legend) */}
      <div style={{ display: 'flex', gap: 18, marginBottom: 18 }}>
        {LEGEND.map((l) => (
          <span key={l.label} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            fontSize: 12, color: 'var(--text-secondary)',
          }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>

      <WjCard style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 16 }}>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            locale={ptBrLocale}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
            events={fetchEvents}
            eventClick={(info) => {
              const deal = info.event.extendedProps.deal;
              if (deal) window.location.href = `/admin/deals/${deal.id}`;
            }}
            slotMinTime="07:00:00"
            slotMaxTime="20:00:00"
            height="auto"
          />
        </div>
      </WjCard>

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton><Modal.Title style={{ fontSize: 16 }}>Novo evento</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Tipo</Form.Label>
              <Form.Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {Object.entries(LABEL_TIPO).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Título <span style={{ color: 'var(--red)' }}>*</span></Form.Label>
              <Form.Control value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex.: Consulta inicial — João Ferreira" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Data e hora <span style={{ color: 'var(--red)' }}>*</span></Form.Label>
              <Form.Control type="datetime-local" value={form.dueAt}
                onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>ID do caso (deal) <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>opcional</span></Form.Label>
              <Form.Control value={form.dealId}
                onChange={(e) => setForm((f) => ({ ...f, dealId: e.target.value }))}
                placeholder="UUID do deal" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Observações</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <WjButton variant="outline" onClick={() => setShowModal(false)}>Cancelar</WjButton>
          <WjButton onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" style={{ marginRight: 6 }} /> : null}Salvar
          </WjButton>
        </Modal.Footer>
      </Modal>

      <style jsx global>{`
        .fc { background: transparent; color: var(--text); font-family: 'Inter', sans-serif; }
        .fc .fc-toolbar-title { font-size: 15px; font-weight: 600; color: var(--text); }
        .fc .fc-button { background: var(--card-alt); border: 1px solid var(--border);
          color: var(--text); font-size: 12px; }
        .fc .fc-button:hover { background: var(--border); }
        .fc .fc-button-active { background: var(--accent) !important; border-color: var(--accent) !important; }
        .fc .fc-col-header-cell { background: var(--card); border-color: var(--border); }
        .fc .fc-col-header-cell-cushion { color: var(--text); }
        .fc .fc-timegrid-slot { border-color: var(--border); }
        .fc .fc-timegrid-slot-label-cushion, .fc .fc-timegrid-axis-cushion { color: var(--text-secondary); font-size: 10.5px; font-family: var(--mono); }
        .fc .fc-scrollgrid { border-color: var(--border); }
        .fc .fc-event { border: none; font-size: 10.5px; font-weight: 600; }
        .fc td, .fc th { border-color: var(--border); }
        .fc .fc-day-today { background: rgba(79,142,247,0.06) !important; }
        .fc .fc-daygrid-day-number { color: var(--text); }
        /* modal escuro (react-bootstrap) */
        .modal-content { background: var(--card); border: 1px solid var(--border); color: var(--text); border-radius: 12px; }
        .modal-header, .modal-footer { border-color: var(--border); }
        .modal-header .btn-close { filter: invert(1); }
        .modal .form-control, .modal .form-select {
          background: var(--card-alt); border: 1px solid var(--border); color: var(--text);
          border-radius: 8px; font-size: 13px;
        }
        .modal .form-control::placeholder { color: var(--text-secondary); }
        .modal .form-label { font-size: 13px; color: var(--text); }
      `}</style>
    </Fragment>
  );
};

Agenda.layout = 'Contentlayout';
export default Agenda;
