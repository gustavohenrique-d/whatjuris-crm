// =============================================================================
// WhatJuris CRM — Deals: lista e cria
// pages/api/deals/index.js
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAuth, BadRequest, Forbidden } from '@/lib/auth/guard';
import { dealWhere } from '@/lib/query/scope';

const createSchema = z.object({
  title: z.string().trim().min(1, 'Título obrigatório.').max(200),
  contactId: z.string().uuid('Contato inválido.'),
  pipelineId: z.string().uuid().optional(),
  stageKey: z.string().optional(), // aceita key OU stageId
  stageId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional().nullable(),
  value: z.number().nonnegative().optional().nullable(),
  legalArea: z.string().trim().max(60).optional().nullable(),
  priority: z.number().int().min(0).max(2).default(0),
  customData: z.record(z.unknown()).optional(),
}).refine(
  (d) => d.stageId || d.stageKey,
  { message: 'Informe stageId ou stageKey.' }
);

async function handler(req, res, ctx) {
  if (req.method === 'GET') {
    const { stageId, stageKey, legalArea, ownerId, page = '1', limit = '100' } = req.query;
    const take = Math.min(parseInt(limit, 10) || 100, 200);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const where = dealWhere(ctx);

    if (stageId) where.stageId = stageId;
    if (stageKey) where.stage = { key: stageKey };
    if (legalArea) where.legalArea = legalArea;
    if (ownerId) where.ownerId = ownerId;

    const [deals, total] = await Promise.all([
      prisma.deal.findMany({
        where,
        select: {
          id: true, title: true, status: true, legalArea: true,
          priority: true, value: true, position: true, enteredStageAt: true,
          createdAt: true, updatedAt: true,
          contact: { select: { id: true, name: true, whatsapp: true } },
          stage: { select: { id: true, key: true, name: true, color: true } },
          owner: { select: { id: true, name: true } },
        },
        orderBy: [{ stage: { position: 'asc' } }, { position: 'asc' }],
        take,
        skip,
      }),
      prisma.deal.count({ where }),
    ]);

    return res.status(200).json({ deals, total });
  }

  if (req.method === 'POST') {
    if (!ctx.can('deal.create')) throw Forbidden();

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

    const { stageKey, stageId: rawStageId, pipelineId: rawPipelineId, ...rest } = parsed.data;

    // Resolver pipeline padrão se não informado
    const pipeline = rawPipelineId
      ? await prisma.pipeline.findUnique({ where: { id: rawPipelineId } })
      : await prisma.pipeline.findFirst({ where: { isDefault: true } });

    if (!pipeline) throw BadRequest('Funil não encontrado.');

    // Resolver estágio por key ou id
    const stage = rawStageId
      ? await prisma.pipelineStage.findFirst({
          where: { id: rawStageId, pipelineId: pipeline.id },
        })
      : await prisma.pipelineStage.findFirst({
          where: { key: stageKey ?? 'novo_contato', pipelineId: pipeline.id },
        });

    if (!stage) throw BadRequest('Estágio não encontrado no funil informado.');

    // Posição no kanban: último + 1 neste estágio
    const maxPos = await prisma.deal.aggregate({
      where: { stageId: stage.id, deletedAt: null },
      _max: { position: true },
    });
    const position = (maxPos._max.position ?? -1) + 1;

    const deal = await prisma.deal.create({
      data: {
        ...rest,
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: rest.ownerId ?? ctx.userId,
        position,
      },
      select: {
        id: true, title: true, status: true, legalArea: true,
        priority: true, value: true, position: true, createdAt: true,
        contact: { select: { id: true, name: true } },
        stage: { select: { id: true, key: true, name: true, color: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    return res.status(201).json({ deal });
  }
}

export default withAuth(handler, {
  methods: ['GET', 'POST'],
  permission: 'deal.read.own',
});
