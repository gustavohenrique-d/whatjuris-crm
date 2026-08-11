// =============================================================================
// WhatJuris CRM — Kanban do funil (design whatjuris.html — módulo 10)
// Drag & drop (dragula) preservado do módulo 4.
// =============================================================================

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import Seo from '../../../shared/layout-components/seo/seo';
import { AreaBadge, MiniAvatar, WjScreenHeader } from '../../../shared/components/wj';
import { useDealDrawer } from '../../../shared/context/DealDrawerContext';

const URG_COLOR = { 2: 'var(--red)', 1: 'var(--amber)', 0: 'var(--gray-low)' };

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'agora há pouco';
  if (h < 24) return `${h}h no estágio`;
  return `${Math.floor(h / 24)}d no estágio`;
}

const RobotIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="8" width="16" height="11" rx="2" /><path d="M9 8V6a3 3 0 0 1 6 0v2" />
    <circle cx="9" cy="13.5" r="1" /><circle cx="15" cy="13.5" r="1" />
  </svg>
);

const Pipeline = () => {
  const { openDeal } = useDealDrawer();
  const [stages, setStages] = useState([]);
  const [dealsByStage, setDealsByStage] = useState({});
  const [total, setTotal] = useState(0);
  const columnRefs = useRef({});

  // Scroll horizontal do board. `noFim` desliga o fade da borda direita quando
  // não há mais coluna a revelar — o degradê é dica de continuidade, e mantê-lo
  // no fim do scroll sugeriria conteúdo que não existe.
  const boardRef = useRef(null);
  const [noFim, setNoFim] = useState(true);

  const medirFim = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    // margem de 2px absorve o arredondamento de subpixel em zoom não inteiro.
    setNoFim(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }, []);

  const load = async () => {
    try {
      const [pipeRes, dealsRes] = await Promise.all([
        axios.get('/api/pipelines/'),
        axios.get('/api/deals/?limit=200'),
      ]);
      const pipeline = pipeRes.data.pipelines.find((p) => p.isDefault) || pipeRes.data.pipelines[0];
      const st = pipeline ? pipeline.stages : [];
      setStages(st);
      const grouped = {};
      st.forEach((s) => { grouped[s.id] = []; });
      dealsRes.data.deals.forEach((d) => {
        (grouped[d.stage.id] = grouped[d.stage.id] || []).push(d);
      });
      setDealsByStage(grouped);
      setTotal(dealsRes.data.total);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível carregar o funil.');
    }
  };

  useEffect(() => { load(); }, []);

  // Recarrega o funil quando o drawer move um lead (evento global — módulo 10C).
  useEffect(() => {
    const onMoved = () => load();
    window.addEventListener('whatjuris:deal-moved', onMoved);
    return () => window.removeEventListener('whatjuris:deal-moved', onMoved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveCardState = (dealId, fromStageId, toStageId) => {
    setDealsByStage((prev) => {
      const next = { ...prev };
      const card = (next[fromStageId] || []).find((d) => d.id === dealId);
      if (!card) return prev;
      next[fromStageId] = next[fromStageId].filter((d) => d.id !== dealId);
      const ts = stages.find((s) => s.id === toStageId);
      next[toStageId] = [...(next[toStageId] || []), { ...card, stage: { ...card.stage, id: toStageId, key: ts?.key, name: ts?.name } }];
      return next;
    });
  };

  const persistMove = async (dealId, toStageId) => {
    try {
      await axios.post(`/api/deals/${dealId}/move/`, { stageId: toStageId });
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível mover o card.');
      load();
    }
  };

  useEffect(() => {
    if (stages.length === 0) return;
    let dragula;
    try { dragula = require('dragula'); } catch { return; }
    const containers = stages.map((s) => columnRefs.current[s.id]).filter(Boolean);
    const drake = dragula(containers, { moves: (el) => el?.classList?.contains('wj-lead-card') });
    drake.on('drop', (el, target, source) => {
      const dealId = el?.dataset?.dealId;
      const toStageId = target?.dataset?.stageId;
      const fromStageId = source?.dataset?.stageId;
      drake.cancel(true);
      if (!dealId || !toStageId || fromStageId === toStageId) return;
      moveCardState(dealId, fromStageId, toStageId);
      persistMove(dealId, toStageId);
    });
    return () => drake.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages]);

  // Remede depois de renderizar as colunas e a cada resize: se a janela crescer
  // até caber tudo, o fade tem de sumir sem depender de um scroll do usuário.
  useEffect(() => {
    medirFim();
    window.addEventListener('resize', medirFim);
    return () => window.removeEventListener('resize', medirFim);
  }, [stages, dealsByStage, medirFim]);

  return (
    <Fragment>
      <Seo title="Pipeline de Leads" />
      <WjScreenHeader
        label="Módulo · Captação"
        title="Pipeline de Leads"
        sub={`${total} ${total === 1 ? 'lead' : 'leads'} no funil · triagem automatizada pelos agentes IA`}
      />

      <div
        ref={boardRef}
        onScroll={medirFim}
        className={`wj-board${noFim ? ' wj-board-fim' : ''}`}
        style={{ display: 'flex', gap: 16, overflowX: 'auto', overscrollBehaviorX: 'contain', paddingBottom: 10, alignItems: 'flex-start' }}
      >
        {stages.map((stage) => {
          const cards = dealsByStage[stage.id] || [];
          return (
            <div key={stage.id} style={{ flex: '0 0 258px', background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '0 2px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-secondary)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: stage.color || 'var(--gray-low)', display: 'inline-block' }} />
                  {stage.name}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 8px', color: 'var(--text)' }}>{cards.length}</span>
              </div>

              <div ref={(el) => { columnRefs.current[stage.id] = el; }} data-stage-id={stage.id} style={{ minHeight: 60 }}>
                {cards.map((deal) => (
                  <div key={deal.id} className="wj-lead-card" data-deal-id={deal.id} style={{
                    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
                    padding: '12px 12px 12px 15px', marginBottom: 12, position: 'relative', cursor: 'grab',
                  }}>
                    <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, background: URG_COLOR[deal.priority] || URG_COLOR[0] }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                      <MiniAvatar name={deal.contact?.name} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{deal.contact?.name}</span>
                    </div>
                    {deal.legalArea && <div style={{ marginBottom: 9 }}><AreaBadge area={deal.legalArea} /></div>}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-secondary)', marginBottom: 8 }}>
                      <span>{timeAgo(deal.enteredStageAt)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <RobotIcon /> {deal.owner?.name || 'Agente IA'}
                      </span>
                      <button onClick={() => openDeal(deal.id)}
                        style={{ fontSize: 10.5, color: 'var(--accent)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                        Ver detalhes →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <style jsx global>{`
        .gu-mirror { position: fixed !important; margin: 0 !important; z-index: 9999 !important; opacity: .9; list-style: none; }
        .gu-transit { opacity: .3; }

        /* -------------------------------------------------------------------
           Board: 7 colunas de 258px + gaps = 1902px contra ~1480px úteis, então
           o scroll é inevitável. O que se ajusta aqui é só onde ele corta e se
           o usuário percebe que há mais.

           Sangria: anula o padding lateral de 40px do <main> (contentlayout) com
           margem negativa e o devolve como padding interno. As colunas passam a
           ser cortadas na borda da área de conteúdo, e não a 40px dela — que era
           o que parecia elemento quebrado.

           SEM transform/filter/perspective/will-change aqui ou em ancestrais: o
           .gu-mirror acima é position:fixed, e qualquer um deles criaria bloco
           de contenção e deslocaria o card arrastado. A sangria é margem
           negativa por isso. Sem scroll-snap, que brigaria com o auto-scroll do
           arraste.
           ------------------------------------------------------------------- */
        .wj-board {
          margin-left: -40px;
          margin-right: -40px;
          padding-left: 40px;
          padding-right: 40px;
          /* Firefox */
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
          /* Dica de continuidade à direita; sem transform. */
          -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent 100%);
          mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent 100%);
        }
        /* Fim do scroll (ou tudo coube): sem degradê. */
        .wj-board.wj-board-fim {
          -webkit-mask-image: none;
          mask-image: none;
        }

        /* O styles.css do template zera toda scrollbar com um seletor coringa
           *::-webkit-scrollbar de height 0rem !important. Só !important vence
           !important — daí o uso aqui, escopado ao board. */
        .wj-board::-webkit-scrollbar { height: 10px !important; }
        .wj-board::-webkit-scrollbar-track { background: transparent !important; }
        .wj-board::-webkit-scrollbar-thumb {
          background: var(--border) !important;
          border-radius: 6px !important;
        }
        .wj-board::-webkit-scrollbar-thumb:hover {
          background: var(--text-secondary) !important;
        }
      `}</style>
    </Fragment>
  );
};

Pipeline.layout = 'Contentlayout';

export default Pipeline;
