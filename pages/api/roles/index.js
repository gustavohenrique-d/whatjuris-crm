// =============================================================================
// WhatJuris CRM — Papéis: lista
// pages/api/roles/index.js
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { withAuth } from '@/lib/auth/guard';

async function handler(req, res, ctx) {
  const roles = await prisma.role.findMany({
    select: {
      id: true, key: true, name: true, description: true, isSystem: true,
      permissions: {
        select: { permission: { select: { key: true, resource: true, action: true, scope: true } } },
      },
      _count: { select: { users: true } },
    },
    orderBy: { name: 'asc' },
  });

  return res.status(200).json({ roles });
}

export default withAuth(handler, {
  methods: ['GET'],
  permission: 'role.read',
});
