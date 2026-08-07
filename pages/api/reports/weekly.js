// =============================================================================
// WhatJuris CRM — Relatório semanal de leads (gerar + enviar por e-mail)
// POST /api/reports/weekly
//
// Chamado por DOIS atores (auth combinada, como as rotas de conversa):
//   - n8n (Schedule segunda 8h) via header x-webhook-secret
//   - usuário do CRM (botão em Relatórios) via sessão + permissão report.read.all
//
// Cobre os leads OPEN criados na semana-calendário anterior (seg-dom).
// Destinatário: REPORT_EMAIL (fallback OWNER_EMAIL). Chamadas internas podem
// passar { to } para teste.
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { resolveConversationActor } from '@/lib/conversations/http-auth';
import {
  getPreviousWeekRange,
  computeWeeklyStats,
  renderWeeklyReportHtml,
  reportSubject,
} from '@/lib/reports/weekly';
import { sendWeeklyReportEmail } from '@/lib/email/send';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const actor = await resolveConversationActor(req, res, { permission: 'report.read.all' });
  if (actor.error === 401) return res.status(401).json({ error: 'Não autenticado.' });
  if (actor.error === 403) return res.status(403).json({ error: 'Sem permissão para esta ação.' });

  // Só chamada interna (n8n/secret) pode sobrescrever o destinatário (teste).
  const to =
    (actor.internal && req.body?.to ? String(req.body.to) : null) ||
    process.env.REPORT_EMAIL ||
    process.env.OWNER_EMAIL;
  if (!to) {
    return res.status(400).json({ error: 'Destinatário não configurado (defina REPORT_EMAIL).' });
  }

  try {
    const range = getPreviousWeekRange(new Date());
    const stats = await computeWeeklyStats(prisma, range);
    const html = renderWeeklyReportHtml({ range, ...stats });
    const subject = reportSubject(range);
    const email = await sendWeeklyReportEmail({ to, subject, html });

    return res.status(200).json({
      ok: true,
      to,
      periodo: { start: range.start.toISOString(), end: range.end.toISOString() },
      total: stats.total,
      email, // { sent:true } ou { skipped:true } (sem RESEND_API_KEY)
    });
  } catch (err) {
    console.error('[reports:weekly] erro:', err.message);
    return res.status(500).json({ error: 'Erro ao gerar/enviar o relatório.' });
  }
}
