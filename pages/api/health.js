// =============================================================================
// WhatJuris CRM — Health / diagnóstico de configuração
// GET /api/health   (gated por x-webhook-secret)
//
// Reporta APENAS presença (boolean) das env vars — nunca valores de segredo.
// EMAIL_FROM é exposto (não é segredo) para ajudar a diagnosticar entrega de
// e-mail (domínio verificado no Resend etc.).
// =============================================================================

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });

  const secret = req.headers['x-webhook-secret'];
  if (!secret || !process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  const has = (v) => Boolean(process.env[v] && String(process.env[v]).trim());

  return res.status(200).json({
    ok: true,
    now: new Date().toISOString(),
    email_from: process.env.EMAIL_FROM || null, // não é segredo; ajuda a diagnosticar entrega
    env: {
      DATABASE_URL: has('DATABASE_URL'),
      WEBHOOK_SECRET: has('WEBHOOK_SECRET'),
      N8N_BASE_URL: has('N8N_BASE_URL'),
      RESEND_API_KEY: has('RESEND_API_KEY'),
      EMAIL_FROM: has('EMAIL_FROM'),
      REPORT_EMAIL: has('REPORT_EMAIL'),
      LAWYER_EMAIL: has('LAWYER_EMAIL'),
      LAWYER_WHATSAPP_NUMBER: has('LAWYER_WHATSAPP_NUMBER'),
      WHATSAPP_ACCESS_TOKEN: has('WHATSAPP_ACCESS_TOKEN'),
      WHATSAPP_PHONE_NUMBER_ID: has('WHATSAPP_PHONE_NUMBER_ID'),
      OPENAI_API_KEY: has('OPENAI_API_KEY'),
      GOOGLE_CLIENT_ID: has('GOOGLE_CLIENT_ID'),
      GOOGLE_CLIENT_SECRET: has('GOOGLE_CLIENT_SECRET'),
      GOOGLE_REDIRECT_URI: has('GOOGLE_REDIRECT_URI'),
    },
  });
}
