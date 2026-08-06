// =============================================================================
// WhatJuris CRM — Conversas (Módulo 6 · Grupo A)
// Lista = deals; painel = mensagens WhatsApp. Takeover/Devolver, envio manual,
// filtros (status/urgência/busca com URL), badges de triagem e polling.
// =============================================================================

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Seo from '../../../shared/layout-components/seo/seo';
import { AreaBadge, MiniAvatar, StatusBadge, WjScreenHeader } from '../../../shared/components/wj';
import { useDealDrawer } from '../../../shared/context/DealDrawerContext';

const STATUS_CHAT = {
  consulta_agendada: { label: 'Consulta agendada', variant: 'green' },
  qualificado: { label: 'Qualificado', variant: 'green' },
  em_triagem: { label: 'IA respondendo', variant: 'green' },
  aguardando_docs: { label: 'Aguardando lead', variant: 'amber' },
  novo_contato: { label: 'Novo contato', variant: 'amber' },
  contratado: { label: 'Contratado', variant: 'green' },
  descartado: { label: 'Descartado', variant: 'red' },
};

const URGENCIA_COR = {
  Alta: { bg: 'rgba(230,83,60,0.14)', fg: 'var(--red)' },
  'Média': { bg: 'rgba(245,184,73,0.16)', fg: 'var(--amber)' },
  Baixa: { bg: 'rgba(33,206,158,0.14)', fg: 'var(--green)' },
};
const FASE_LABEL = { coletando_dados: 'Coletando dados', qualificado: 'Qualificado', desqualificado: 'Desqualificado' };

function newRequestId() {
  try { return crypto.randomUUID(); } catch { return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
function fmtTime(iso) { return iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''; }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; }
function relTime(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `há ${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const RobotIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="8" width="16" height="11" rx="2" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /><circle cx="9" cy="13.5" r="1" /><circle cx="15" cy="13.5" r="1" />
  </svg>
);

function UrgenciaBadge({ urgencia }) {
  const c = URGENCIA_COR[urgencia] || { bg: 'var(--card-alt)', fg: 'var(--text-secondary)' };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.fg }}>
      {urgencia ? `Urgência: ${urgencia}` : 'Urgência: —'}
    </span>
  );
}

const selectStyle = {
  fontSize: 12, padding: '7px 9px', borderRadius: 8, background: 'var(--card-alt)',
  border: '1px solid var(--border)', color: 'var(--text)', width: '100%',
};

const Conversas = () => {
  const { openDeal } = useDealDrawer();
  const { data: session } = useSession();
  const router = useRouter();
  const userId = session?.user?.id;
  const perms = session?.permissions || [];
  const canTakeover = perms.includes('conversation.takeover');
  const canOverride = perms.includes('deal.update.all') || perms.includes('deal.reassign');

  const [deals, setDeals] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState([]); // mensagens otimistas (enviando/falha)
  const [control, setControl] = useState(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  // Filtros (inicializados a partir da URL)
  const [statusF, setStatusF] = useState('');
  const [urgenciaF, setUrgenciaF] = useState('');
  const [search, setSearch] = useState('');

  const selectedRef = useRef(null);
  selectedRef.current = selected;

  // ---- inicializa filtros da URL ----
  useEffect(() => {
    if (!router.isReady) return;
    setStatusF(router.query.status || '');
    setUrgenciaF(router.query.urgencia || '');
    setSearch(router.query.search || '');
  }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildParams = useCallback(() => {
    const p = { limit: 30 };
    if (statusF) p.status = statusF;
    if (urgenciaF) p.urgencia = urgenciaF;
    if (search.trim()) p.search = search.trim();
    return p;
  }, [statusF, urgenciaF, search]);

  const loadDeals = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const { data } = await axios.get('/api/deals/', { params: buildParams() });
      setDeals(data.deals || []);
    } catch { /* ignora */ } finally { setRefreshing(false); }
  }, [buildParams]);

  const loadControl = useCallback(async (deal) => {
    if (!deal?.contact?.whatsapp) { setControl(null); return; }
    try {
      const { data } = await axios.get(`/api/conversations/${deal.instanceName}/${deal.contact.whatsapp}/control`);
      setControl(data);
    } catch { setControl(null); }
  }, []);

  const loadMessages = useCallback(async (deal, silent = false) => {
    if (!deal) return;
    if (!silent) setLoadingMsgs(true);
    try {
      const { data } = await axios.get(`/api/deals/${deal.id}/activities/`, { params: { limit: 100 } });
      const msgs = (data.activities || []).filter((a) => a.type === 'MESSAGE_IN' || a.type === 'MESSAGE_OUT').reverse();
      setMessages(msgs);
    } catch { if (!silent) setMessages([]); } finally { if (!silent) setLoadingMsgs(false); }
  }, []);

  // ---- debounce: filtros → recarrega lista + persiste na URL ----
  useEffect(() => {
    if (!router.isReady) return;
    const t = setTimeout(() => {
      const q = {};
      if (statusF) q.status = statusF;
      if (urgenciaF) q.urgencia = urgenciaF;
      if (search.trim()) q.search = search.trim();
      router.replace({ pathname: router.pathname, query: q }, undefined, { shallow: true });
      loadDeals();
    }, 350);
    return () => clearTimeout(t);
  }, [statusF, urgenciaF, search, router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const openChat = async (deal) => {
    setSelected(deal);
    setPending([]);
    setDraft('');
    await Promise.all([loadMessages(deal), loadControl(deal)]);
  };

  // ---- polling: 5s mensagens+controle, 15s lista; pausa quando aba oculta ----
  useEffect(() => {
    const msgTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const d = selectedRef.current;
      if (d) { loadMessages(d, true); loadControl(d); }
    }, 5000);
    const listTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      loadDeals(true);
    }, 15000);
    return () => { clearInterval(msgTimer); clearInterval(listTimer); };
  }, [loadMessages, loadControl, loadDeals]);

  const mode = control?.mode || 'ai';
  const isResponsible = control?.taken_over_by && control.taken_over_by === userId;
  const canSend = mode === 'human' && canTakeover && (isResponsible || canOverride);
  const showRelease = mode === 'human' && canTakeover && (isResponsible || canOverride);

  // ---- ações ----
  const doTakeover = async () => {
    if (!selected || !canTakeover) return;
    if (!window.confirm('Assumir esta conversa? A IA deixará de responder automaticamente.')) return;
    setActionBusy(true);
    try {
      await axios.post(`/api/conversations/${selected.instanceName}/${selected.contact.whatsapp}/takeover`, { source: 'crm_human' });
      await loadControl(selected);
    } catch (err) {
      if (err?.response?.status === 409) window.alert('Outra pessoa já assumiu esta conversa.');
      else if (err?.response?.status === 403) window.alert('Você não tem permissão para assumir conversas.');
      else window.alert('Não foi possível assumir a conversa.');
    } finally { setActionBusy(false); }
  };

  const doRelease = async () => {
    if (!selected) return;
    if (!window.confirm('Devolver para a IA? A IA voltará a responder automaticamente.')) return;
    setActionBusy(true);
    try {
      await axios.post(`/api/conversations/${selected.instanceName}/${selected.contact.whatsapp}/release`, { reason: 'Atendimento concluído pelo atendente.' });
      await loadControl(selected);
    } catch { window.alert('Não foi possível devolver para a IA.'); } finally { setActionBusy(false); }
  };

  const doSend = async () => {
    const content = draft.trim();
    if (!content || sending || !canSend || !selected) return;
    const clientRequestId = newRequestId();
    const optimistic = { id: `tmp-${clientRequestId}`, type: 'MESSAGE_OUT', content, occurredAt: new Date().toISOString(), _status: 'sending', actorLabel: session?.user?.name };
    setPending((p) => [...p, optimistic]);
    setSending(true);
    setDraft('');
    try {
      await axios.post(`/api/conversations/${selected.instanceName}/${selected.contact.whatsapp}/send-message`, { content, client_request_id: clientRequestId });
      setPending((p) => p.filter((m) => m.id !== optimistic.id));
      await Promise.all([loadMessages(selected, true), loadControl(selected)]);
    } catch (err) {
      setPending((p) => p.map((m) => (m.id === optimistic.id ? { ...m, _status: 'failed' } : m)));
      setDraft(content); // preserva o rascunho
      if (err?.response?.status === 409) window.alert('A conversa não está em atendimento humano.');
    } finally { setSending(false); }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  };

  const allMessages = [...messages, ...pending];

  return (
    <Fragment>
      <Seo title="Conversas" />
      <WjScreenHeader label="Módulo · Atendimento" title="Conversas"
        sub="Canal WhatsApp Business · triagem por IA e atendimento humano" />

      <div style={{ display: 'flex', height: 680, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card)' }}>
        {/* Lista */}
        <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                {deals.length} {deals.length === 1 ? 'conversa' : 'conversas'}
              </span>
              {refreshing && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>atualizando…</span>}
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone…"
              style={{ ...selectStyle, marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={selectStyle}>
                <option value="">Todos os status</option>
                <option value="em_triagem">Em triagem</option>
                <option value="qualificado">Qualificado</option>
                <option value="atendimento_humano">Atendimento humano</option>
              </select>
              <select value={urgenciaF} onChange={(e) => setUrgenciaF(e.target.value)} style={selectStyle}>
                <option value="">Toda urgência</option>
                <option value="Alta">Alta</option>
                <option value="Média">Média</option>
                <option value="Baixa">Baixa</option>
              </select>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {deals.length === 0 && <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-secondary)' }}>Nenhuma conversa.</div>}
            {deals.map((d) => {
              const active = selected?.id === d.id;
              return (
                <div key={d.id} onClick={() => openChat(d)} style={{
                  display: 'flex', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  background: active ? 'linear-gradient(90deg, rgba(79,142,247,0.14), rgba(124,92,252,0.05))' : 'transparent',
                }}>
                  <MiniAvatar name={d.contact?.name} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.contact?.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--mono)', flexShrink: 0 }}>{relTime(d.updatedAt)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 7 }}>{d.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <AreaBadge area={d.legalArea} />
                      {d.urgencia && <UrgenciaBadge urgencia={d.urgencia} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Painel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Selecione uma conversa</div>
          ) : (
            <Fragment>
              {/* Header da conversa */}
              <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <MiniAvatar name={selected.contact?.name} size={40} />
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>{selected.contact?.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                        {selected.contact?.whatsapp || 'sem WhatsApp'}{selected.legalArea ? ` · ${selected.legalArea}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {mode === 'human' && control?.source === 'automatic_timeout' ? (
                      <StatusBadge variant="red">⚠️ IA falhou — atender agora</StatusBadge>
                    ) : mode === 'human' ? (
                      <StatusBadge variant="amber">
                        👤 Humano{control?.taken_over_by_name ? ` · ${control.taken_over_by_name}` : ''}
                        {control?.ttl_remaining_seconds ? ` · ${Math.ceil(control.ttl_remaining_seconds / 60)}min` : ''}
                      </StatusBadge>
                    ) : (
                      <StatusBadge variant={(STATUS_CHAT[selected.stage?.key] || STATUS_CHAT.novo_contato).variant}>
                        {(STATUS_CHAT[selected.stage?.key] || STATUS_CHAT.novo_contato).label}
                      </StatusBadge>
                    )}
                    <button onClick={() => openDeal(selected.id)} style={btnGhost}>Ver ficha</button>
                    {mode !== 'human' && canTakeover && (
                      <button onClick={doTakeover} disabled={actionBusy} style={{ ...btnGhost, opacity: actionBusy ? 0.6 : 1 }}>
                        {actionBusy ? 'Assumindo…' : 'Assumir conversa'}
                      </button>
                    )}
                    {showRelease && (
                      <button onClick={doRelease} disabled={actionBusy} style={{ ...btnPrimary, opacity: actionBusy ? 0.6 : 1 }}>
                        {actionBusy ? '…' : 'Devolver para IA'}
                      </button>
                    )}
                  </div>
                </div>
                {/* Badges de triagem */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <UrgenciaBadge urgencia={selected.urgencia} />
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--card-alt)', color: 'var(--text-secondary)' }}>
                    Fase: {FASE_LABEL[selected.faseTriage] || selected.faseTriage || '—'}
                  </span>
                  {selected.qualifiedAt && (
                    <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>Qualificado em {fmtDate(selected.qualifiedAt)}</span>
                  )}
                </div>
              </div>

              {/* Mensagens */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column' }}>
                {loadingMsgs && <div style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>Carregando…</div>}
                {!loadingMsgs && allMessages.length === 0 && <div style={{ margin: 'auto', color: 'var(--text-secondary)', fontSize: 12.5 }}>Sem mensagens ainda.</div>}
                {allMessages.map((m) => {
                  const isIn = m.type === 'MESSAGE_IN';
                  return (
                    <div key={m.id} style={{ display: 'flex', marginBottom: 16, justifyContent: isIn ? 'flex-start' : 'flex-end' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '66%', alignItems: isIn ? 'flex-start' : 'flex-end' }}>
                        {!isIn && (
                          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--accent)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ opacity: 0.8, display: 'inline-flex' }}><RobotIcon /></span>
                            {m.actorLabel || 'Agente IA'}
                          </div>
                        )}
                        <div style={{ padding: '10px 14px', borderRadius: 14, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                          ...(isIn
                            ? { background: 'var(--card-alt)', border: '1px solid var(--border)', borderBottomLeftRadius: 4, color: 'var(--text)' }
                            : { background: 'linear-gradient(135deg, var(--accent), var(--accent2))', color: '#fff', borderBottomRightRadius: 4, opacity: m._status === 'sending' ? 0.6 : 1 }) }}>
                          {m.content}
                        </div>
                        <div style={{ fontSize: 10, color: m._status === 'failed' ? 'var(--red)' : 'var(--text-secondary)', marginTop: 5, fontFamily: 'var(--mono)' }}>
                          {m._status === 'sending' ? 'enviando…' : m._status === 'failed' ? 'falha ao enviar' : fmtTime(m.occurredAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Caixa de envio */}
              <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                {!canSend ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 0' }}>
                    {mode !== 'human'
                      ? 'A IA está atendendo. Clique em "Assumir conversa" para responder manualmente.'
                      : 'Somente o atendente responsável pode enviar mensagens nesta conversa.'}
                  </div>
                ) : (
                  <Fragment>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                      <textarea value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 4000))} onKeyDown={onKeyDown}
                        placeholder="Digite uma mensagem…  (Enter envia · Shift+Enter quebra linha)" rows={2} maxLength={4000}
                        style={{ flex: 1, resize: 'none', background: 'var(--card-alt)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: 'var(--text)', fontFamily: 'inherit' }} />
                      <button onClick={doSend} disabled={sending || !draft.trim()} style={{ ...btnPrimary, height: 40, opacity: sending || !draft.trim() ? 0.5 : 1 }}>
                        {sending ? '…' : 'Enviar'}
                      </button>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 5, textAlign: 'right', fontFamily: 'var(--mono)' }}>{draft.length}/4000</div>
                  </Fragment>
                )}
              </div>
            </Fragment>
          )}
        </div>
      </div>
    </Fragment>
  );
};

const btnGhost = { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' };
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 8, background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', cursor: 'pointer' };

Conversas.layout = 'Contentlayout';

export default Conversas;
