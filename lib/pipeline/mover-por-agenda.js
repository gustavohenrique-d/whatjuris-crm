// =============================================================================
// WhatJuris CRM — Automação de etapa a partir da agenda (Fase 1)
// lib/pipeline/mover-por-agenda.js
//
// Marcar consulta com um lead qualificado avança o card para "Consulta
// agendada"; cancelar traz de volta para "Qualificado".
//
// ⚠️ Como o 011_sync_stage_from_status.sql documenta, a ETAPA é a fonte da
// verdade: aqui só se escreve `stageId`, nunca `status` — o trigger
// sync_deal_status_from_stage deriva o resto. As duas etapas são do tipo OPEN,
// então o status não muda em nenhum dos sentidos.
//
// Assim como as notificações, os disparos moram nos handlers HTTP e estas
// funções NUNCA lançam: quando rodam, o evento já está gravado no banco e no
// Google. Diferença importante em relação a uma notificação perdida — um
// movimento perdido é dado errado no CRM e ninguém percebe, por isso todo
// caminho registra log e o sucesso vira Activity na timeline.
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { recordActivity } from '@/lib/activities/record';

// TASK é compromisso interno do escritório — não representa consulta e não
// mexe no funil.
const TIPOS_DE_CONSULTA = ['MEETING', 'CALL', 'HEARING'];

const ETAPA_ORIGEM = 'qualificado';
const ETAPA_DESTINO = 'consulta_agendada';

// Busca por KEY, não por UUID: as chaves são estáveis e garantidas pelo
// 006_corrigir_estagios.sql; os ids mudam a cada recriação do banco.
async function etapaPorChave(pipelineId, key) {
  return prisma.pipelineStage.findFirst({
    where: { pipelineId, key },
    select: { id: true, name: true },
  });
}

// Guardas comuns aos dois sentidos. Devolve o deal com a etapa atual.
async function carregarDeal({ dealId, tipo, rotulo }) {
  if (!dealId) {
    console.log(`[funil:${rotulo}] evento sem dealId — nada a mover.`);
    return { ok: false, motivo: 'sem_deal' };
  }
  if (!TIPOS_DE_CONSULTA.includes(tipo)) {
    console.log(`[funil:${rotulo}] tipo ${tipo} é interno — não mexe no funil.`);
    return { ok: false, motivo: 'tipo_interno' };
  }

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, deletedAt: null },
    select: { id: true, pipelineId: true, stageId: true, stage: { select: { key: true, name: true } } },
  });

  if (!deal) {
    console.log(`[funil:${rotulo}] deal ${dealId} não encontrado — ignorado.`);
    return { ok: false, motivo: 'deal_inexistente' };
  }
  return { ok: true, deal };
}

// Executa o UPDATE dentro de uma transação junto do set_config do ator.
//
// O trigger track_deal_stage_change lê `app.actor_id` e `app.actor_is_ai` para
// preencher moved_by/moved_by_ai em deal_stage_history. O terceiro parâmetro
// `true` do set_config torna o valor LOCAL à transação — e é justamente por
// isso que o UPDATE precisa rodar na MESMA transação: fora dela o trigger não
// enxergaria o ator e o histórico sairia anônimo.
async function moverEtapa({ deal, destino, userId, rotulo, titulo, descricao }) {
  await prisma.$transaction(async (tx) => {
    // Movimento disparado pela agenda do CRM: o ator é o advogado logado, não a
    // IA. String vazia quando não há usuário — o trigger usa NULLIF e grava null.
    await tx.$executeRaw`SELECT set_config('app.actor_id', ${userId ?? ''}::text, true)`;
    await tx.$executeRaw`SELECT set_config('app.actor_is_ai', 'false', true)`;

    await tx.deal.update({
      where: { id: deal.id },
      data: { stageId: destino.id },
    });

    await recordActivity({
      dealId: deal.id,
      type: 'STAGE_CHANGE',
      actorType: 'SYSTEM',
      actorLabel: 'Agenda do CRM',
      userId: userId ?? null,
      title: titulo,
      content: descricao,
      metadata: { fromStageKey: deal.stage.key, toStageKey: destino.key ?? null, origem: 'agenda' },
      tx,
    });
  });

  console.log(`[funil:${rotulo}] deal ${deal.id}: "${deal.stage.name}" → "${destino.name}".`);
  return { moved: true, de: deal.stage.key, para: destino.key };
}

// -----------------------------------------------------------------------------
// Criar evento → avança para "Consulta agendada"
// -----------------------------------------------------------------------------
export async function moverParaConsultaAgendada({ dealId, tipo, userId = null }) {
  try {
    const base = await carregarDeal({ dealId, tipo, rotulo: 'agendar' });
    if (!base.ok) return { skipped: true, motivo: base.motivo };
    const { deal } = base;

    // Regra de entrada: só avança quem está em "Qualificado". Isso é o que
    // permite o cancelamento voltar para um destino fixo mais tarde.
    if (deal.stage.key !== ETAPA_ORIGEM) {
      console.log(`[funil:agendar] deal ${deal.id} está em "${deal.stage.name}" — só move a partir de Qualificado.`);
      return { skipped: true, motivo: 'etapa_nao_elegivel' };
    }

    const destino = await etapaPorChave(deal.pipelineId, ETAPA_DESTINO);
    if (!destino) {
      console.log(`[funil:agendar] etapa "${ETAPA_DESTINO}" não existe no funil ${deal.pipelineId}.`);
      return { skipped: true, motivo: 'etapa_inexistente' };
    }

    return await moverEtapa({
      deal,
      destino: { ...destino, key: ETAPA_DESTINO },
      userId,
      rotulo: 'agendar',
      titulo: `Movido para "${destino.name}"`,
      descricao: 'Consulta marcada pela agenda do CRM.',
    });
  } catch (err) {
    console.error('[funil:agendar] falhou:', err.message);
    return { skipped: true, motivo: 'erro', erro: err.message };
  }
}

// -----------------------------------------------------------------------------
// Cancelar evento → volta para "Qualificado"
// -----------------------------------------------------------------------------
export async function voltarDeConsultaAgendada({ dealId, tipo, userId = null }) {
  try {
    const base = await carregarDeal({ dealId, tipo, rotulo: 'cancelar' });
    if (!base.ok) return { skipped: true, motivo: base.motivo };
    const { deal } = base;

    // Respeita movimentação manual: se o advogado já levou o lead para outra
    // etapa (Contratado, Descartado...), puxá-lo de volta desfaria uma decisão
    // humana. A automação só desfaz o que ela mesma fez.
    if (deal.stage.key !== ETAPA_DESTINO) {
      console.log(`[funil:cancelar] deal ${deal.id} está em "${deal.stage.name}", não em Consulta agendada — preservado.`);
      return { skipped: true, motivo: 'etapa_ja_alterada' };
    }

    // Outro compromisso futuro em pé = o lead segue com consulta marcada. Roda
    // DEPOIS do delete, então o evento cancelado já não conta.
    const outroFuturo = await prisma.activity.findFirst({
      where: { dealId: deal.id, type: { in: TIPOS_DE_CONSULTA }, dueAt: { gt: new Date() } },
      select: { id: true },
    });
    if (outroFuturo) {
      console.log(`[funil:cancelar] deal ${deal.id} ainda tem compromisso futuro — mantido em Consulta agendada.`);
      return { skipped: true, motivo: 'outro_evento_futuro' };
    }

    const destino = await etapaPorChave(deal.pipelineId, ETAPA_ORIGEM);
    if (!destino) {
      console.log(`[funil:cancelar] etapa "${ETAPA_ORIGEM}" não existe no funil ${deal.pipelineId}.`);
      return { skipped: true, motivo: 'etapa_inexistente' };
    }

    return await moverEtapa({
      deal,
      destino: { ...destino, key: ETAPA_ORIGEM },
      userId,
      rotulo: 'cancelar',
      titulo: `Movido para "${destino.name}"`,
      descricao: 'Consulta cancelada pela agenda do CRM.',
    });
  } catch (err) {
    console.error('[funil:cancelar] falhou:', err.message);
    return { skipped: true, motivo: 'erro', erro: err.message };
  }
}
