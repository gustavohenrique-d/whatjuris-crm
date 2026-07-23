// =============================================================================
// WhatJuris CRM — Mover card no Kanban
// pages/api/deals/[id]/move.js
//
// POST { stageId, position? }
//
// CRÍTICO: usa $transaction com SET LOCAL para que o trigger de histórico
// receba o actor_id correto sem vazar entre conexões do pool.
//
// O trigger deals_track_stage (BEFORE UPDATE) registra automaticamente:
//   - from_stage_id, to_stage_id
//   - duration_seconds (tempo que ficou no estágio anterior)
//   - moved_by (actor_id desta transação)
//   - moved_by_ai (actor_is_ai desta transação)
//
// A aplicação não precisa escrever nada em deal_stage_history.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import {
  withAuth, BadRequest, NotFound, writeAudit,
} from '@/lib/auth/guard';
import { assertCanWriteDeal } from '@/lib/query/scope';
import { recordActivity } from '@/lib/activities/record';

const moveSchema = z.object({
  stageId: z.string().uuid('stageId inválido.'),
  position: z.number().int().nonnegative().optional(),
});

async function handler(req, res, ctx) {
  const { id } = req.query;

  const deal = await prisma.deal.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, stageId: true, pipelineId: true, ownerId: true, title: true,
      stage: { select: { key: true, name: true } },
    },
  });

  if (!deal) throw NotFound('Negócio não encontrado.');

  assertCanWriteDeal(ctx, deal);

  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

  const { stageId, position } = parsed.data;

  if (stageId === deal.stageId) {
    // Só reordenação dentro do mesmo estágio
    if (position === undefined) {
      return res.status(200).json({ message: 'Nenhuma alteração.' });
    }

    await prisma.deal.update({ where: { id }, data: { position } });
    return res.status(200).json({ message: 'Posição atualizada.' });
  }

  // Validar que o estágio destino pertence ao mesmo funil do deal
  const targetStage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, pipelineId: deal.pipelineId },
    select: { id: true, key: true, name: true, type: true },
  });

  if (!targetStage) {
    throw BadRequest('Estágio não pertence ao funil deste negócio.');
  }

  // Posição no estágio destino: último + 1, a menos que seja informada
  let targetPosition = position;
  if (targetPosition === undefined) {
    const maxPos = await prisma.deal.aggregate({
      where: { stageId, deletedAt: null },
      _max: { position: true },
    });
    targetPosition = (maxPos._max.position ?? -1) + 1;
  }

  // $transaction com SET LOCAL: o valor de actor_id é descartado quando
  // a transação termina — sem vazamento para o próximo request no pool.
  const updatedDeal = await prisma.$transaction(async (tx) => {
    // is_local = true amarra o valor à transação corrente
    await tx.$executeRaw`
      SELECT set_config('app.actor_id', ${ctx.userId}::text, true)
    `;
    await tx.$executeRaw`
      SELECT set_config('app.actor_is_ai', 'false', true)
    `;

    const updated = await tx.deal.update({
      where: { id },
      data: { stageId, position: targetPosition },
      select: {
        id: true, title: true, stageId: true, status: true, closedAt: true,
        stage: { select: { id: true, key: true, name: true, type: true } },
      },
    });

    // Evento de negócio visível na timeline (o trigger já gravou o histórico
    // técnico em deal_stage_history; isto é a Activity que o usuário vê).
    // Dentro da mesma transação para ser atômico com o move.
    await recordActivity({
      tx,
      dealId: id,
      type: 'STAGE_CHANGE',
      actorType: 'USER',
      userId: ctx.userId,
      title: `Movido de "${deal.stage.name}" para "${targetStage.name}"`,
      content: `Card movido de "${deal.stage.name}" para "${targetStage.name}".`,
      metadata: { fromStageId: deal.stageId, toStageId: stageId },
    });

    return updated;
  });

  await writeAudit({
    actorId: ctx.userId,
    action: 'deal.moved',
    resource: 'deal',
    resourceId: id,
    before: { stageId: deal.stageId, stageName: deal.stage.name },
    after: { stageId, stageName: targetStage.name },
    ctx,
  });

  return res.status(200).json({ deal: updatedDeal });
}

export default withAuth(handler, {
  methods: ['POST'],
  permission: 'deal.update.own',
});
