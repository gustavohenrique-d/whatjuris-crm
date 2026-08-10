// =============================================================================
// WhatJuris CRM — Agenda (design whatjuris.html — módulo 10B.4)
// Lógica do módulo 7 preservada (FullCalendar + criação de evento).
// =============================================================================

import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
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

// TASK é compromisso interno — o backend não notifica o cliente nesses casos.
const TIPOS_QUE_NOTIFICAM = ['MEETING', 'CALL', 'HEARING'];
const ESTADO_INICIAL = {
  type: 'MEETING', title: '', content: '', dueAt: '', dealId: '', contactId: '',
};

// ISO (UTC) -> valor de <input type="datetime-local">, que espera hora LOCAL.
// toISOString() cru colocaria o horário de UTC no campo; ao salvar, isso viraria
// uma remarcação silenciosa e o cliente receberia aviso de um horário que
// ninguém mexeu.
function paraDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const LEGEND = [
  { label: 'Consulta inicial', color: 'var(--accent)' },
  { label: 'Audiência', color: 'var(--accent2)' },
  { label: 'Reunião interna', color: 'var(--amber)' },
];

const Agenda = () => {
  const calendarRef = useRef(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(ESTADO_INICIAL);

  // Autocomplete de lead. `leadSelecionado` guarda o objeto para exibir nome
  // legível; o UUID vive só em form.dealId e nunca aparece na tela.
  const [buscaLead, setBuscaLead] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [leadSelecionado, setLeadSelecionado] = useState(null);

  // Edição: guarda o evento original para comparar o horário e habilitar o
  // "Cancelar evento". null = modal em modo criação.
  const [eventoEditando, setEventoEditando] = useState(null);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const modoEdicao = eventoEditando !== null;

  const limparBusca = useCallback(() => {
    setBuscaLead(''); setResultados([]); setBuscando(false); setLeadSelecionado(null);
  }, []);

  const fecharModal = useCallback(() => {
    setShowModal(false); setForm(ESTADO_INICIAL); limparBusca();
    setEventoEditando(null); setConfirmarCancelar(false); setExcluindo(false);
  }, [limparBusca]);

  // Debounce de 300ms; ignora respostas fora de ordem via flag de cancelamento.
  useEffect(() => {
    const termo = buscaLead.trim();
    if (leadSelecionado || termo.length < 2) { setResultados([]); setBuscando(false); return undefined; }

    let cancelado = false;
    setBuscando(true);
    const id = setTimeout(async () => {
      try {
        const { data } = await axios.get(`/api/deals/search/?q=${encodeURIComponent(termo)}`);
        if (!cancelado) setResultados(data.results || []);
      } catch {
        if (!cancelado) setResultados([]);
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 300);

    return () => { cancelado = true; clearTimeout(id); };
  }, [buscaLead, leadSelecionado]);

  const selecionarLead = (lead) => {
    setLeadSelecionado(lead);
    setForm((f) => ({ ...f, dealId: lead.id }));
    setResultados([]);
    setBuscaLead('');
  };

  const removerLead = () => {
    setLeadSelecionado(null);
    setForm((f) => ({ ...f, dealId: '' }));
  };

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
        // `title` acima mostra o nome do cliente no calendário; o título real
        // do evento vai aqui, senão a edição gravaria o nome no lugar dele.
        extendedProps: {
          type: e.type, deal: e.deal, content: e.content,
          tituloReal: e.title, dueAt: e.dueAt,
        },
      }));
      successCallback(events);
    } catch {
      failureCallback(new Error('Erro ao carregar eventos.'));
    }
  }, []);

  const abrirEdicao = (evento) => {
    const p = evento.extendedProps;
    setEventoEditando({
      id: evento.id,
      dueAtOriginal: p.dueAt,
      deal: p.deal || null,
      type: p.type,
    });
    setForm({
      type: p.type,
      title: p.tituloReal || '',
      content: p.content || '',
      dueAt: paraDatetimeLocal(p.dueAt),
      dealId: p.deal?.id || '',
      contactId: '',
    });
    limparBusca();
    setConfirmarCancelar(false);
    setShowModal(true);
  };

  // O horário mudou em relação ao que foi carregado? Espelha a comparação que o
  // backend faz para decidir se notifica a remarcação.
  const horarioMudou = modoEdicao
    && !!form.dueAt
    && paraDatetimeLocal(eventoEditando.dueAtOriginal) !== form.dueAt;

  const avisaRemarcacao = horarioMudou
    && !!eventoEditando?.deal
    && TIPOS_QUE_NOTIFICAM.includes(form.type);

  const handleSave = async () => {
    if (!form.title || !form.dueAt) {
      toast.error('Preencha o título e a data/hora.');
      return;
    }
    setSaving(true);
    try {
      if (modoEdicao) {
        // dueAt vai sempre: é o backend que compara com o valor antigo e decide
        // se o cliente é notificado.
        await axios.patch(`/api/agenda/events/${eventoEditando.id}/`, {
          title: form.title,
          content: form.content || null,
          dueAt: new Date(form.dueAt).toISOString(),
        });
        toast.success(horarioMudou ? 'Evento remarcado.' : 'Evento atualizado.');
      } else {
        await axios.post('/api/agenda/events/', {
          type: form.type,
          title: form.title,
          content: form.content || null,
          dueAt: new Date(form.dueAt).toISOString(),
          dealId: form.dealId || null,
          contactId: form.contactId || null,
        });
        toast.success('Evento criado.');
      }
      fecharModal();
      calendarRef.current?.getApi().refetchEvents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar o evento.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelarEvento = async () => {
    if (!eventoEditando) return;
    setExcluindo(true);
    try {
      await axios.delete(`/api/agenda/events/${eventoEditando.id}/`);
      toast.success('Evento cancelado.');
      fecharModal();
      calendarRef.current?.getApi().refetchEvents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cancelar o evento.');
      setExcluindo(false);
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
              // Sem navegação padrão: o clique abre a edição no próprio modal.
              info.jsEvent?.preventDefault();
              abrirEdicao(info.event);
            }}
            slotMinTime="07:00:00"
            slotMaxTime="20:00:00"
            height="auto"
          />
        </div>
      </WjCard>

      <Modal show={showModal} onHide={fecharModal}>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 16 }}>{modoEdicao ? 'Editar evento' : 'Novo evento'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Tipo</Form.Label>
              <Form.Select
                value={form.type}
                disabled={modoEdicao}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                {Object.entries(LABEL_TIPO).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </Form.Select>
              {modoEdicao ? (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                  O tipo não pode ser alterado depois de criado.
                </div>
              ) : null}
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
              <Form.Label>Cliente <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                {modoEdicao ? 'não editável' : 'opcional'}
              </span></Form.Label>

              {/* Em edição o vínculo é só leitura: remarcar não troca o cliente. */}
              {modoEdicao ? (
                eventoEditando.deal ? (
                  <div className="wj-lead-chip" style={{ borderColor: 'var(--border)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {eventoEditando.deal.contact?.name || 'Sem nome'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {eventoEditando.deal.title || 'Caso vinculado'}
                      </div>
                    </div>
                    <a href={`/admin/deals/${eventoEditando.deal.id}`}
                      style={{ fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>
                      Ver ficha
                    </a>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Sem cliente vinculado — nenhuma notificação será enviada.
                  </div>
                )
              ) : leadSelecionado ? (
                <div className="wj-lead-chip">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{leadSelecionado.contactName || 'Sem nome'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {[leadSelecionado.whatsapp, leadSelecionado.area, leadSelecionado.stage].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button type="button" className="wj-lead-x" onClick={removerLead} aria-label="Remover cliente">×</button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <Form.Control
                    value={buscaLead}
                    onChange={(e) => setBuscaLead(e.target.value)}
                    placeholder="Busque por nome ou telefone…"
                    autoComplete="off"
                  />
                  {buscando ? (
                    <Spinner size="sm" style={{ position: 'absolute', right: 10, top: 11, color: 'var(--text-secondary)' }} />
                  ) : null}

                  {resultados.length > 0 ? (
                    <div className="wj-lead-drop">
                      {resultados.map((lead) => (
                        <button type="button" key={lead.id} className="wj-lead-item" onClick={() => selecionarLead(lead)}>
                          <span style={{ fontSize: 13 }}>{lead.contactName || 'Sem nome'}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {[lead.whatsapp, lead.area, lead.stage].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {!buscando && buscaLead.trim().length >= 2 && resultados.length === 0 ? (
                    <div className="wj-lead-vazio">Nenhum caso aberto encontrado para “{buscaLead.trim()}”.</div>
                  ) : null}
                </div>
              )}

              {!modoEdicao && !leadSelecionado && TIPOS_QUE_NOTIFICAM.includes(form.type) ? (
                <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 6 }}>
                  Sem cliente vinculado, o evento é criado normalmente — mas ninguém recebe confirmação no WhatsApp.
                </div>
              ) : null}
              {!modoEdicao && leadSelecionado && !TIPOS_QUE_NOTIFICAM.includes(form.type) ? (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                  Tarefa é compromisso interno: o cliente não será notificado.
                </div>
              ) : null}
              {avisaRemarcacao ? (
                <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 6 }}>
                  O horário mudou — ao salvar, o cliente recebe aviso da remarcação no WhatsApp.
                </div>
              ) : null}
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Observações</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ justifyContent: 'space-between' }}>
          <div>
            {modoEdicao && !confirmarCancelar ? (
              <button type="button" className="wj-btn-perigo" onClick={() => setConfirmarCancelar(true)}>
                Cancelar evento
              </button>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <WjButton variant="outline" onClick={fecharModal}>Fechar</WjButton>
            <WjButton onClick={handleSave} disabled={saving || excluindo}>
              {saving ? <Spinner size="sm" style={{ marginRight: 6 }} /> : null}
              {modoEdicao ? 'Salvar alterações' : 'Salvar'}
            </WjButton>
          </div>
        </Modal.Footer>

        {/* Confirmação do cancelamento — inline, para não usar window.confirm */}
        {confirmarCancelar ? (
          <div className="wj-confirma-cancelar">
            <div style={{ fontSize: 13, marginBottom: 4 }}>Cancelar este evento?</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
              {eventoEditando?.deal && TIPOS_QUE_NOTIFICAM.includes(eventoEditando.type)
                ? 'O evento sai do calendário e o cliente recebe aviso do cancelamento no WhatsApp. Não dá para desfazer.'
                : 'O evento sai do calendário. Não dá para desfazer.'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="wj-btn-perigo wj-btn-perigo-solido"
                onClick={handleCancelarEvento} disabled={excluindo}>
                {excluindo ? 'Cancelando…' : 'Sim, cancelar evento'}
              </button>
              <WjButton variant="outline" onClick={() => setConfirmarCancelar(false)}>Voltar</WjButton>
            </div>
          </div>
        ) : null}
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

        /* autocomplete de cliente */
        .wj-lead-chip {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          background: var(--bg); border: 1px solid var(--accent);
          border-radius: 8px; padding: 8px 10px;
        }
        .wj-lead-x {
          background: none; border: none; color: var(--text-secondary);
          font-size: 20px; line-height: 1; cursor: pointer; padding: 0 4px; flex-shrink: 0;
        }
        .wj-lead-x:hover { color: var(--red, #e5534b); }
        .wj-lead-drop {
          position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px);
          background: var(--card); border: 1px solid var(--border); border-radius: 8px;
          max-height: 240px; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,.4);
        }
        .wj-lead-item {
          display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left;
          background: none; border: none; color: var(--text);
          padding: 8px 10px; cursor: pointer;
        }
        .wj-lead-item + .wj-lead-item { border-top: 1px solid var(--border); }
        .wj-lead-item:hover { background: var(--bg); }
        .wj-lead-vazio { font-size: 11px; color: var(--text-secondary); margin-top: 6px; }

        /* ação destrutiva do modal de edição */
        .wj-btn-perigo {
          background: none; border: 1px solid var(--red, #e5534b); color: var(--red, #e5534b);
          border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer;
        }
        .wj-btn-perigo:hover { background: rgba(229, 83, 75, .12); }
        .wj-btn-perigo-solido {
          background: var(--red, #e5534b); color: #fff; border-color: transparent;
        }
        .wj-btn-perigo-solido:hover { filter: brightness(1.08); }
        .wj-btn-perigo:disabled { opacity: .6; cursor: default; }
        .wj-confirma-cancelar {
          border-top: 1px solid var(--border); padding: 14px 16px;
          background: rgba(229, 83, 75, .06);
        }
      `}</style>
    </Fragment>
  );
};

Agenda.layout = 'Contentlayout';
export default Agenda;
