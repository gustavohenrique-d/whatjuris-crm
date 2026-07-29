// =============================================================================
// WhatJuris CRM — Deals: lista e cria
// pages/api/deals/index.js
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAuth, BadRequest, Forbidden } from '@/lib/auth/guard';
import { dealWhere } from '@/lib/query/scope';
import { applyListFilters } from '@/lib/query/deal-filters';

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
    const { page = '1', limit = '100' } = req.query;
    const take = Math.min(parseInt(limit, 10) || 100, 200);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    // Filtros síncronos (status/urgência/busca) via helper testável.
    const { where, contactAnd, needsHumanFilter } = applyListFilters(dealWhere(ctx), req.query);

    // "atendimento humano": deals cujo contato tem controle humano ativo.
    if (needsHumanFilter) {
      const humanControls = await prisma.conversationControl.findMany({
        where: { mode: 'human', blockedUntil: { gt: new Date() } },
        select: { chatId: true },
      });
      const chatIds = humanControls.map((c) => c.chatId);
      contactAnd.push({ whatsapp: { in: chatIds.length ? chatIds : ['__none__'] } });
    }
    if (contactAnd.length) where.contact = { ...(where.contact || {}), AND: contactAnd };

    const [rows, total] = await Promise.all([
      prisma.deal.findMany({
        where,
        select: {
          id: true, title: true, status: true, legalArea: true,
          priority: true, value: true, position: true, enteredStageAt: true,
          urgencia: true, faseTriage: true, qualifiedAt: true, instanceName: true,
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

    // instance_name default (deals antigos têm instanceName null) — o frontend
    // usa isto na URL dos endpoints de takeover/control/envio.
    const fallbackInstance = process.env.WHATSAPP_INSTANCE_NAME || 'escritorio-principal';
    const deals = rows.map((d) => ({ ...d, instanceName: d.instanceName || fallbackInstance }));

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
