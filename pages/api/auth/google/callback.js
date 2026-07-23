// =============================================================================
// WhatJuris CRM — Callback OAuth2 do Google Calendar
// pages/api/auth/google/callback.js
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { withAuth, BadRequest } from '@/lib/auth/guard';
import { exchangeCode, CONFIGURED } from '@/lib/calendar/google';

async function handler(req, res, ctx) {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(302, '/admin/configuracoes?googleError=acesso_negado');
  }

  if (!code) throw BadRequest('Code OAuth2 ausente.');

  if (!CONFIGURED) {
    return res.status(501).json({ error: 'Google Calendar não configurado.' });
  }

  const refreshToken = await exchangeCode(code);

  if (!refreshToken) {
    return res.redirect(302, '/admin/configuracoes?googleError=sem_refresh_token');
  }

  // Gravar o refresh_token nas settings da organização
  const org = await prisma.organization.findFirst({ select: { id: true, settings: true } });
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      settings: { ...org.settings, googleRefreshToken: refreshToken },
    },
  });

  return res.redirect(302, '/admin/configuracoes?googleConnected=true');
}

export default withAuth(handler, { methods: ['GET'], permission: 'organization.update' });
