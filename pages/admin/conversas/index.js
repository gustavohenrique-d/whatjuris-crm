// =============================================================================
// WhatJuris CRM — Conversas (design whatjuris.html — módulo 10B.1)
// Lista = deals abertos; painel = activities MESSAGE_IN/MESSAGE_OUT do deal.
// =============================================================================

import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';
import Seo from '../../../shared/layout-components/seo/seo';
import { AreaBadge, MiniAvatar, StatusBadge, WjScreenHeader } from '../../../shared/components/wj';
import { useDealDrawer } from '../../../shared/context/DealDrawerContext';

const STATUS_CHAT = {
  consulta_agendada: { label: 'Consulta agendada', color: 'var(--green)', variant: 'green' },
  qualificado: { label: 'Qualificado', color: 'var(--green)', variant: 'green' },
  em_triagem: { label: 'IA respondendo', color: 'var(--accent)', variant: 'green' },
  aguardando_docs: { label: 'Aguardando lead', color: 'var(--amber)', variant: 'amber' },
  novo_contato: { label: 'Novo contato', color: 'var(--amber)', variant: 'amber' },
  contratado: { label: 'Contratado', color: 'var(--green)', variant: 'green' },
  descartado: { label: 'Descartado', color: 'var(--red)', variant: 'red' },
};

const RobotIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="8" width="16" height="11" rx="2" /><path d="M9 8V6a3 3 0 0 1 6 0v2" />
    <circle cx="9" cy="13.5" r="1" /><circle cx="15" cy="13.5" r="1" />
  </svg>
);

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function relTime(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `há ${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function ChatStatus({ stageKey }) {
  const s = STATUS_CHAT[stageKey] || STATUS_CHAT.novo_contato;
  return (
    <span style={{
      fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4,
      fontWeight: 600, color: s.color, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
      {s.label}
    </span>
  );
}

const Conversas = () => {
  const { openDeal } = useDealDrawer();
  const [deals, setDeals] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  useEffect(() => {
    axios.get('/api/deals/?limit=20')
      .then(({ data }) => setDeals(data.deals))
      .catch(() => {});
  }, []);

  const openChat = async (deal) => {
    setSelected(deal);
    setLoadingMsgs(true);
    try {
      const { data } = await axios.get(`/api/deals/${deal.id}/activities/?limit=100`);
      const msgs = data.activities
        .filter((a) => a.type === 'MESSAGE_IN' || a.type === 'MESSAGE_OUT')
        .reverse(); // API devolve DESC; o chat mostra ASC
      setMessages(msgs);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  };

  return (
    <Fragment>
      <Seo title="Conversas" />
      <WjScreenHeader
        label="Módulo · Atendimento"
        title="Conversas"
        sub="Canal WhatsApp Business · atendimento automatizado pelos agentes IA"
      />

      <div style={{
        display: 'flex', height: 660, border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden', background: 'var(--card)',
      }}>
        {/* Lista de conversas */}
        <div style={{
          width: 308, flexShrink: 0, borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
        }}>
          <div style={{
            padding: '16px 16px 12px', borderBottom: '1px solid var(--border)',
            position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>
              {deals.length} {deals.length === 1 ? 'conversa ativa' : 'conversas ativas'}
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--card-alt)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '8px 10px', color: 'var(--text-secondary)', fontSize: 12.5,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
                <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
              </svg>
              Buscar conversa...
            </div>
          </div>

          {deals.length === 0 && (
            <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Nenhuma conversa ativa.
            </div>
          )}

          {deals.map((d) => {
            const active = selected?.id === d.id;
            return (
              <div key={d.id} onClick={() => openChat(d)} style={{
                display: 'flex', gap: 10, padding: '13px 16px',
                borderBottom: '1px solid var(--border)', cursor: 'pointer', position: 'relative',
                background: active
                  ? 'linear-gradient(90deg, rgba(79,142,247,0.14), rgba(124,92,252,0.05))'
                  : 'transparent',
              }}>
                <MiniAvatar name={d.contact?.name} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {d.contact?.name}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                      {relTime(d.updatedAt)}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 12, color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 7,
                  }}>
                    {d.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <AreaBadge area={d.legalArea} />
                    <ChatStatus stageKey={d.stage?.key} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Painel de conversa */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!selected ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)', fontSize: 13,
            }}>
              Selecione uma conversa
            </div>
          ) : (
            <Fragment>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 22px', borderBottom: '1px solid var(--border)', flexShrink: 0,
              }}>
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
                  <StatusBadge variant={(STATUS_CHAT[selected.stage?.key] || STATUS_CHAT.novo_contato).variant}>
                    {(STATUS_CHAT[selected.stage?.key] || STATUS_CHAT.novo_contato).label}
                  </StatusBadge>
                  <button onClick={() => openDeal(selected.id)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
                    padding: '10px 18px', borderRadius: 8, background: 'transparent',
                    border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer',
                  }}>
                    Ver ficha
                  </button>
                  <button style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
                    padding: '10px 18px', borderRadius: 8, background: 'transparent',
                    border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer',
                  }}>
                    Assumir conversa
                  </button>
                </div>
              </div>

              <div style={{
                flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column',
                background:
                  'radial-gradient(circle at 20% 20%, rgba(124,92,252,0.05), transparent 40%), radial-gradient(circle at 80% 60%, rgba(79,142,247,0.05), transparent 40%)',
              }}>
                {loadingMsgs && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>Carregando…</div>
                )}
                {!loadingMsgs && messages.length === 0 && (
                  <div style={{ margin: 'auto', color: 'var(--text-secondary)', fontSize: 12.5 }}>
                    Sem mensagens do WhatsApp nesta conversa ainda.
                  </div>
                )}
                {messages.map((m) => {
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
                        <div style={{
                          padding: '10px 14px', borderRadius: 14, fontSize: 13, lineHeight: 1.55,
                          ...(isIn
                            ? { background: 'var(--card-alt)', border: '1px solid var(--border)', borderBottomLeftRadius: 4, color: 'var(--text)' }
                            : { background: 'linear-gradient(135deg, var(--accent), var(--accent2))', color: '#fff', borderBottomRightRadius: 4 }),
                        }}>
                          {m.content}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 5, fontFamily: 'var(--mono)' }}>
                          {fmtTime(m.occurredAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 22px', borderTop: '1px solid var(--border)', flexShrink: 0,
              }}>
                <div style={{
                  flex: 1, background: 'var(--card-alt)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '11px 14px', fontSize: 13, color: 'var(--text-secondary)',
                }}>
                  Digite uma mensagem...
                </div>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: 'var(--accent)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v7l12 1-12 1z" /></svg>
                </div>
              </div>
            </Fragment>
          )}
        </div>
      </div>
    </Fragment>
  );
};

Conversas.layout = 'Contentlayout';

export default Conversas;
