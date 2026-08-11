// =============================================================================
// WhatJuris CRM — Automação de etapa a partir da agenda (Fase 1)
// lib/pipeline/mover-por-agenda.js
//
// Marcar consulta avança o card de qualquer etapa aberta para "Consulta
// agendada"; cancelar devolve o lead à etapa exata de onde ele veio, lida do
// deal_stage_history. Estados finais (Descartado/Contratado) ficam de fora nos
// dois sentidos — a automação nunca reabre nem fecha um caso.
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
    select: {
      id: true, pipelineId: true, stageId: true,
      stage: { select: { key: true, name: true, type: true } },
    },
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

    if (deal.stage.key === ETAPA_DESTINO) {
      console.log(`[funil:agendar] deal ${deal.id} já está em Consulta agendada — nada a fazer.`);
      return { skipped: true, motivo: 'ja_no_destino' };
    }

    // Estados finais (Descartado/Contratado) não se movem por efeito colateral:
    // marcar uma consulta não pode reabrir um caso encerrado, e o trigger
    // sync_deal_status_from_stage transformaria a mudança de etapa em mudança
    // de status. Reabrir é decisão manual.
    if (deal.stage.type !== 'OPEN') {
      console.log(`[funil:agendar] deal ${deal.id} está em "${deal.stage.name}" (${deal.stage.type}) — estado final, preservado.`);
      return { skipped: true, motivo: 'etapa_final' };
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

    // De onde ele veio. `orderBy createdAt desc` pega a entrada MAIS RECENTE em
    // consulta_agendada — importa quando o lead entrou e saiu várias vezes, e é
    // por isso que não serve olhar a primeira. `id` desempata para o resultado
    // ser determinístico se duas transições caírem no mesmo milissegundo.
    const entrada = await prisma.dealStageHistory.findFirst({
      where: { dealId: deal.id, toStageId: deal.stageId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { fromStageId: true, createdAt: true },
    });

    // Fallback: sem registro de entrada (deal anterior ao histórico, ou
    // fromStageId nulo) NÃO se chuta uma etapa. Deixar onde está é o erro
    // barato — o advogado vê o card em Consulta agendada sem consulta e
    // corrige; mandá-lo para um palpite errado seria silencioso e pior.
    if (!entrada?.fromStageId) {
      console.log(`[funil:cancelar] deal ${deal.id} sem origem no histórico — mantido onde está.`);
      return { skipped: true, motivo: 'origem_desconhecida' };
    }

    const destino = await prisma.pipelineStage.findFirst({
      where: { id: entrada.fromStageId },
      select: { id: true, key: true, name: true, type: true },
    });
    if (!destino) {
      console.log(`[funil:cancelar] etapa de origem ${entrada.fromStageId} não existe mais — mantido onde está.`);
      return { skipped: true, motivo: 'origem_inexistente' };
    }

    // Simétrico à guarda de entrada: se a origem registrada for um estado final
    // (alguém arrastou de Descartado para Consulta agendada à mão), devolver o
    // lead para lá faria a automação FECHAR o deal via trigger. Não fecha caso
    // nenhum sozinha.
    if (destino.type !== 'OPEN') {
      console.log(`[funil:cancelar] origem "${destino.name}" é ${destino.type} — não devolvo a estado final.`);
      return { skipped: true, motivo: 'origem_final' };
    }

    return await moverEtapa({
      deal,
      destino,
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
