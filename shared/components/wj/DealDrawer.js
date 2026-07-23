// =============================================================================
// WhatJuris CRM — Drawer de detalhe do lead (módulo 10C)
// Visual: exatamente igual ao .drawer do whatjuris.html
// Dados: GET /api/deals/:id + GET /api/deals/:id/activities
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useDealDrawer } from '../../context/DealDrawerContext';
import { AreaBadge, StatusBadge, WjButton } from './index';

// ─── helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)} dias`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo',
  });
}

const brl = (v) => v != null
  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  : '—';

// ─── Badge de tipo de atividade ──────────────────────────────────────────────

const ACT_STYLE = {
  NOTE: { bg: 'rgba(136,146,164,0.15)', color: '#8892A4', label: 'Nota' },
  STAGE_CHANGE: { bg: 'rgba(79,142,247,0.15)', color: '#4F8EF7', label: 'Estágio' },
  MESSAGE_IN: { bg: 'rgba(45,212,160,0.15)', color: '#2DD4A0', label: 'Mensagem' },
  MESSAGE_OUT: { bg: 'rgba(124,92,252,0.15)', color: '#7C5CFC', label: 'Resposta' },
  AI_ACTION: { bg: 'rgba(245,166,35,0.15)', color: '#F5A623', label: 'Agente IA' },
  CALL: { bg: 'rgba(240,78,78,0.15)', color: '#F04E4E', label: 'Ligação' },
  MEETING: { bg: 'rgba(79,142,247,0.15)', color: '#4F8EF7', label: 'Reunião' },
  SYSTEM: { bg: 'rgba(74,81,100,0.20)', color: '#4A5164', label: 'Sistema' },
};

function ActBadge({ type }) {
  const s = ACT_STYLE[type] || ACT_STYLE.SYSTEM;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: s.bg, color: s.color, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// ─── Ficha do lead (coluna esquerda) ─────────────────────────────────────────

function LeadFicha({ deal, onMove, onClose }) {
  const router = useRouter();
  const [movingTo, setMovingTo] = useState(null);
  const [stages, setStages] = useState([]);

  useEffect(() => {
    axios.get('/api/pipelines/')
      .then(({ data }) => {
        const p = data.pipelines?.find((x) => x.id === deal.pipeline?.id) || data.pipelines?.[0];
        setStages(p?.stages || []);
      })
      .catch(() => {});
  }, [deal.pipeline?.id]);

  const handleMove = async (stageId) => {
    if (stageId === deal.stage?.id) return;
    setMovingTo(stageId);
    try {
      await axios.post(`/api/deals/${deal.id}/move/`, { stageId });
      onMove();
    } catch { /* silencioso */ } finally {
      setMovingTo(null);
    }
  };

  const campos = [
    { label: 'Área jurídica', value: deal.legalArea ? <AreaBadge area={deal.legalArea} /> : '—' },
    { label: 'Estágio atual', value: deal.stage?.name || '—' },
    {
      label: 'Status', value:
        <StatusBadge variant={deal.status === 'WON' ? 'green' : deal.status === 'LOST' ? 'red' : 'green'}>
          {deal.status === 'WON' ? 'Contratado' : deal.status === 'LOST' ? 'Descartado' : 'Em aberto'}
        </StatusBadge>,
    },
    { label: 'Valor', value: brl(deal.value != null ? Number(deal.value) : null) },
    { label: 'Prioridade', value: ['Normal', 'Média', 'Urgente'][deal.priority] || '—' },
    { label: 'Responsável', value: deal.owner?.name || '—' },
    { label: 'Entrada no funil', value: fmtDate(deal.createdAt) },
  ];

  return (
    <>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--accent2), var(--accent))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 14,
      }}>
        {(deal.contact?.name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
      </div>

      <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 2, color: 'var(--text)' }}>{deal.contact?.name}</div>
      {deal.contact?.whatsapp && (
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 2, fontFamily: 'var(--mono)' }}>{deal.contact.whatsapp}</div>
      )}
      {deal.contact?.email && (
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontFamily: 'var(--mono)' }}>{deal.contact.email}</div>
      )}

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        {campos.map(({ label, value }) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: 5 }}>{label}</div>
            <div style={{ fontSize: 13.5, color: 'var(--text)' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>Mover para estágio:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {stages.filter((s) => s.id !== deal.stage?.id).map((s) => (
              <button key={s.id} onClick={() => handleMove(s.id)} disabled={!!movingTo}
                style={{
                  fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20,
                  border: '1px solid var(--border)', background: 'var(--card-alt)',
                  color: 'var(--text)', cursor: 'pointer', opacity: movingTo ? 0.6 : 1,
                }}>
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {deal.contact?.whatsapp && (
          <a
            href={`https://wa.me/${deal.contact.whatsapp.replace(/\D/g, '')}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 8,
              background: 'rgba(45,212,160,0.12)', color: 'var(--green)',
              border: '1px solid rgba(45,212,160,0.3)', textDecoration: 'none',
            }}>
            <WhatsAppIcon />
            Abrir no WhatsApp
          </a>
        )}

        <WjButton variant="outline"
          onClick={() => { router.push(`/admin/deals/${deal.id}`); onClose(); }}
          style={{ justifyContent: 'center' }}>
          Ver ficha completa →
        </WjButton>
      </div>
    </>
  );
}

// ─── Timeline (coluna direita) ───────────────────────────────────────────────

function Timeline({ activities, deal, onNewNote }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await axios.post(`/api/deals/${deal.id}/activities/`, { type: 'NOTE', content: note.trim() });
      setNote('');
      onNewNote();
    } catch { /* silencioso */ } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 18 }}>Timeline</div>

      <div style={{ marginBottom: 24 }}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Adicionar nota..."
          rows={3}
          style={{
            width: '100%', background: 'var(--card-alt)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '11px 14px', fontSize: 13, color: 'var(--text)',
            fontFamily: 'inherit', resize: 'vertical', outline: 'none', marginBottom: 8,
          }}
        />
        <WjButton onClick={handleNote} disabled={saving || !note.trim()}>
          {saving ? 'Salvando…' : 'Salvar nota'}
        </WjButton>
      </div>

      <div style={{ position: 'relative', paddingLeft: 26 }}>
        <div style={{ position: 'absolute', left: 6, top: 4, bottom: 4, width: 2, background: 'var(--border)' }} />

        {activities.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', padding: '8px 0' }}>Nenhuma atividade registrada.</div>
        )}

        {activities.map((a) => (
          <div key={a.id} style={{ position: 'relative', paddingBottom: 22 }}>
            <div style={{
              position: 'absolute', left: -26, top: 2, width: 14, height: 14, borderRadius: '50%',
              background: 'var(--card)',
              border: `2px solid ${a.type === 'STAGE_CHANGE' ? 'var(--green)' : 'var(--accent)'}`,
            }} />
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-secondary)', marginBottom: 3 }}>{timeAgo(a.occurredAt)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: a.actorType === 'AI_AGENT' ? 'var(--amber)' : 'var(--accent)' }}>
                {a.actorLabel || a.user?.name || 'Sistema'}
              </span>
              <ActBadge type={a.type} />
            </div>
            {a.title && <div style={{ fontSize: 12.5, color: 'var(--text)', marginBottom: 2, fontWeight: 500 }}>{a.title}</div>}
            {a.content && <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{a.content}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Drawer principal ────────────────────────────────────────────────────────

export default function DealDrawer() {
  const { dealId, closeDeal } = useDealDrawer();
  const [deal, setDeal] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const [dealRes, actRes] = await Promise.all([
        axios.get(`/api/deals/${id}/`),
        axios.get(`/api/deals/${id}/activities/?limit=50`),
      ]);
      setDeal(dealRes.data.deal);
      setActivities(actRes.data.activities || []);
    } catch { /* silencioso */ } finally {
      setLoading(false);
    }
  };

  const reloadActivities = async () => {
    if (!dealId) return;
    try {
      const { data } = await axios.get(`/api/deals/${dealId}/activities/?limit=50`);
      setActivities(data.activities || []);
    } catch { /* silencioso */ }
  };

  const handleMove = () => {
    window.dispatchEvent(new CustomEvent('whatjuris:deal-moved'));
    load(dealId);
  };

  useEffect(() => {
    if (dealId) load(dealId);
    else { setDeal(null); setActivities([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeDeal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeDeal]);

  useEffect(() => {
    document.body.style.overflow = dealId ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [dealId]);

  const isOpen = Boolean(dealId);

  return (
    <>
      <div onClick={closeDeal} style={{
        position: 'fixed', inset: 0, background: 'rgba(5,6,10,0.65)',
        display: isOpen ? 'block' : 'none', zIndex: 100,
      }} />

      <div style={{
        position: 'fixed', top: 0, right: isOpen ? 0 : -960,
        width: 960, maxWidth: '92vw', height: '100%',
        background: 'var(--bg)', borderLeft: '1px solid var(--border)',
        transition: 'right .32s cubic-bezier(.4,0,.2,1)', zIndex: 101, overflowY: 'auto',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 32px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{deal?.title || 'Carregando…'}</div>
            {deal?.stage && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                {deal.pipeline?.name} → {deal.stage.name}
              </div>
            )}
          </div>
          <button onClick={closeDeal} style={{
            width: 32, height: 32, borderRadius: 8, background: 'var(--card)',
            border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--text-secondary)', cursor: 'pointer',
          }}>
            <CloseIcon />
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-secondary)', fontSize: 13 }}>Carregando…</div>
        ) : deal ? (
          <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 0 }}>
            <div style={{ padding: '28px 32px', borderRight: '1px solid var(--border)' }}>
              <LeadFicha deal={deal} onMove={handleMove} onClose={closeDeal} />
            </div>
            <div style={{ padding: '28px 32px' }}>
              <Timeline activities={activities} deal={deal} onNewNote={reloadActivities} />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
