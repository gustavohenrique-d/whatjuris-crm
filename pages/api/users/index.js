// =============================================================================
// WhatJuris CRM — Usuários: lista e convite
// pages/api/users/index.js
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { withAuth } from '@/lib/auth/guard';

// Seleção segura: nunca retornar passwordHash
const safeSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  status: true,
  oabNumber: true,
  oabState: true,
  legalAreas: true,
  notifyWhatsapp: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, key: true, name: true } },
};

async function handler(req, res, ctx) {
  if (req.method === 'GET') {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: safeSelect,
      orderBy: { name: 'asc' },
    });

    return res.status(200).json({ users });
  }

  // POST → redireciona para a rota de convite existente (mantém a API
  // consistente: POST /api/users = convidar). Barra final por trailingSlash.
  if (req.method === 'POST') {
    return res.redirect(307, '/api/users/invite/');
  }
}

export default withAuth(handler, {
  methods: ['GET', 'POST'],
  permission: 'user.read',
});
