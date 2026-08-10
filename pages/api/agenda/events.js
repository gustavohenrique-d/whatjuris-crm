// =============================================================================
// WhatJuris CRM — Agenda: criar evento
// pages/api/agenda/events.js
// =============================================================================

import { z } from 'zod';
import { withAuth, BadRequest, Forbidden } from '@/lib/auth/guard';
import { createCalendarEvent } from '@/lib/calendar/create';
import { notificarAgendamento } from '@/lib/whatsapp/notificar-agenda';

const TIPOS_VALIDOS = ['MEETING', 'CALL', 'TASK', 'HEARING'];

const schema = z.object({
  type: z.enum(TIPOS_VALIDOS),
  title: z.string().trim().min(1, 'Título obrigatório.').max(200),
  content: z.string().trim().max(1000).optional().nullable(),
  dueAt: z.string().datetime('Data inválida.'),
  dealId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
}).refine((d) => d.dealId || d.contactId, {
  message: 'Informe dealId ou contactId.',
});

async function handler(req, res, ctx) {
  if (!ctx.can('activity.create')) throw Forbidden();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

  const activity = await createCalendarEvent({
    ...parsed.data,
    actorType: 'USER',
    userId: ctx.userId,
    dueAt: new Date(parsed.data.dueAt),
  });

  // Avisa o cliente. Fire-and-forget: o evento já está no banco e no Google,
  // então falha de WhatsApp não pode derrubar a criação.
  notificarAgendamento({ activity, dealId: parsed.data.dealId })
    .catch((err) => console.error('[agenda] notificação falhou:', err.message));

  return res.status(201).json({ event: activity });
}

export default withAuth(handler, { methods: ['POST'] });
