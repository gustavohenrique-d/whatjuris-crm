// =============================================================================
// WhatJuris CRM — Convite de Usuário
// pages/api/users/invite.js
//
// Fluxo:
//  1. Sócio informa e-mail, nome e papel
//  2. Cria User com status INVITED e passwordHash '!'
//  3. Gera AuthToken INVITE, válido 7 dias
//  4. Envia e-mail com o link
//  5. Se e-mail falhar, devolve fallbackLink para o sócio enviar por outro canal
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAuth, writeAudit, BadRequest, Conflict, NotFound } from '@/lib/auth/guard';
import { createToken, buildLink, PURPOSE } from '@/lib/auth/tokens';
import { sendInviteEmail } from '@/lib/email/send';

const schema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  name: z.string().trim().min(2, 'Informe o nome completo.').max(120),
  roleKey: z.string().trim().min(1, 'Selecione um papel.'),
  oabNumber: z.string().trim().max(20).optional().nullable(),
  oabState: z.string().trim().length(2).toUpperCase().optional().nullable(),
  legalAreas: z.array(z.string()).default([]),
  notifyWhatsapp: z.string().trim().max(20).optional().nullable(),
});

async function handler(req, res, ctx) {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

  const { email, name, roleKey, oabNumber, oabState, legalAreas, notifyWhatsapp } =
    parsed.data;

  // Papel 'owner' não pode ser atribuído por convite: evita escalada de privilégio
  if (roleKey === 'owner') {
    throw BadRequest('O papel de Sócio Proprietário não pode ser atribuído por convite.');
  }

  const role = await prisma.role.findUnique({
    where: { key: roleKey },
    select: { id: true, key: true, name: true },
  });
  if (!role) throw NotFound('Papel não encontrado.');

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, status: true, deletedAt: true },
  });

  if (existing && !existing.deletedAt && existing.status === 'ACTIVE') {
    throw Conflict('Este e-mail já pertence a um usuário ativo.');
  }

  let user;

  if (existing) {
    // Reenvio ou reativação: tokenVersion++ derruba sessões anteriores
    user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name,
        roleId: role.id,
        status: 'INVITED',
        deletedAt: null,
        oabNumber: oabNumber || null,
        oabState: oabState || null,
        legalAreas,
        notifyWhatsapp: notifyWhatsapp || null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
      select: { id: true, email: true, name: true },
    });
  } else {
    user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: '!', // hash impossível de casar — conta não autentica até aceitar
        roleId: role.id,
        status: 'INVITED',
        oabNumber: oabNumber || null,
        oabState: oabState || null,
        legalAreas,
        notifyWhatsapp: notifyWhatsapp || null,
      },
      select: { id: true, email: true, name: true },
    });
  }

  const rawToken = await createToken({
    purpose: PURPOSE.INVITE,
    email,
    userId: user.id,
  });

  const link = buildLink(PURPOSE.INVITE, rawToken);

  try {
    await sendInviteEmail({
      to: email,
      inviteeName: name,
      inviterName: ctx.name,
      roleName: role.name,
      link,
    });
  } catch (err) {
    console.error('[invite] falha ao enviar e-mail:', err);

    await writeAudit({
      actorId: ctx.userId, action: 'user.invited', resource: 'user',
      resourceId: user.id, after: { email, roleKey, emailSent: false }, ctx,
    });

    // Devolve o link para o sócio enviar manualmente — usuário não fica preso
    return res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name },
      emailSent: false,
      fallbackLink: link,
      message: 'Convite criado, mas o e-mail não pôde ser enviado. Copie o link.',
    });
  }

  await writeAudit({
    actorId: ctx.userId, action: 'user.invited', resource: 'user',
    resourceId: user.id, after: { email, roleKey, emailSent: true }, ctx,
  });

  return res.status(201).json({
    user: { id: user.id, email: user.email, name: user.name },
    emailSent: true,
    message: `Convite enviado para ${email}.`,
  });
}

export default withAuth(handler, {
  methods: ['POST'],
  permission: 'user.invite',
});
