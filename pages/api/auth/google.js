// =============================================================================
// WhatJuris CRM — Iniciar OAuth2 do Google Calendar
// pages/api/auth/google.js
// =============================================================================

import { withAuth } from '@/lib/auth/guard';
import { getAuthUrl, CONFIGURED } from '@/lib/calendar/google';

async function handler(req, res, ctx) {
  if (!CONFIGURED) {
    return res.status(501).json({
      error: 'Google Calendar não configurado. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.',
    });
  }

  const url = getAuthUrl();
  return res.redirect(302, url);
}

export default withAuth(handler, { methods: ['GET'], permission: 'organization.update' });
