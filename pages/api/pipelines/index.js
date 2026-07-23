// =============================================================================
// WhatJuris CRM — Pipelines: lista com estágios e contagem de deals
// pages/api/pipelines/index.js
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { withAuth } from '@/lib/auth/guard';
import { dealWhere } from '@/lib/query/scope';

async function handler(req, res, ctx) {
  const dealFilter = dealWhere(ctx);

  const pipelines = await prisma.pipeline.findMany({
    orderBy: { position: 'asc' },
    select: {
      id: true, key: true, name: true, isDefault: true,
      stages: {
        orderBy: { position: 'asc' },
        select: {
          id: true, key: true, name: true, color: true, type: true,
          position: true, probability: true, stalledAfterHours: true,
          _count: {
            select: {
              deals: { where: { ...dealFilter, deletedAt: null } },
            },
          },
        },
      },
    },
  });

  return res.status(200).json({ pipelines });
}

export default withAuth(handler, {
  methods: ['GET'],
  permission: 'pipeline.read',
});
