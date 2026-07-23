// =============================================================================
// WhatJuris CRM — Aceitar Convite
// pages/api/auth/accept-invite.js
//
// GET  → valida token, devolve e-mail e nome (tela renderiza antes do form)
// POST → consome token + grava senha numa transação
//
// DESVIO DA SPEC: o campo de consumo no banco é `used_at` (Prisma `usedAt`),
// não `consumedAt`.
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withPublic, BadRequest, NotFound } from '@/lib/auth/guard';
import { verifyToken, messageFor, PURPOSE } from '@/lib/auth/tokens';
import { hashPassword, validatePassword } from '@/lib/auth/password';

const postSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1, 'Informe uma senha.'),
  passwordConfirm: z.string().min(1, 'Confirme a senha.'),
});

async function handler(req, res) {
  if (req.method === 'GET') {
    const { token } = req.query;
    const result = await verifyToken(token, PURPOSE.INVITE);

    if (!result.valid) {
      return res.status(400).json({ valid: false, error: messageFor(result.reason) });
    }

    const user = await prisma.user.findUnique({
      where: { email: result.token.email },
      select: { name: true, email: true, role: { select: { name: true } } },
    });

    if (!user) {
      return res.status(400).json({ valid: false, error: 'Este convite não é mais válido.' });
    }

    return res.status(200).json({
      valid: true,
      email: user.email,
      name: user.name,
      roleName: user.role.name,
    });
  }

  // POST
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

  const { token, password, passwordConfirm } = parsed.data;

  if (password !== passwordConfirm) throw BadRequest('As senhas não coincidem.');

  // Valida token ANTES de gastar tempo com bcrypt
  const check = await verifyToken(token, PURPOSE.INVITE);
  if (!check.valid) throw BadRequest(messageFor(check.reason));

  const user = await prisma.user.findUnique({
    where: { email: check.token.email },
    select: { id: true, name: true, email: true, deletedAt: true },
  });

  if (!user || user.deletedAt) throw NotFound('Este convite não é mais válido.');

  const policy = validatePassword(password, { email: user.email, name: user.name });
  if (!policy.valid) throw BadRequest(policy.errors[0]);

  const passwordHash = await hashPassword(password);

  // Consumo + ativação numa transação: se a gravação falhar depois do token
  // consumido, o convidado ficaria com link queimado e sem acesso.
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.authToken.updateMany({
      where: {
        tokenHash: check.token.tokenHash,
        type: PURPOSE.INVITE,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    if (consumed.count === 0) throw BadRequest('Este link já foi utilizado.');

    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'user.invite.accepted',
        resource: 'user',
        resourceId: user.id,
        after: { email: user.email },
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null,
        userAgent: req.headers['user-agent'] || null,
      },
    });
  });

  return res.status(200).json({
    success: true,
    email: user.email,
    message: 'Senha definida. Você já pode entrar no sistema.',
  });
}

export default withPublic(handler, { methods: ['GET', 'POST'] });
