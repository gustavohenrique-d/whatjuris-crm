// =============================================================================
// WhatJuris CRM — Redefinir senha
// pages/api/auth/reset-password.js
//
// GET  → valida o token antes de mostrar o formulário
// POST → consome token + grava senha + tokenVersion++ (derruba outras sessões)
//
// DESVIO DA SPEC: o campo de consumo no banco é `used_at` (Prisma `usedAt`).
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withPublic, BadRequest, NotFound } from '@/lib/auth/guard';
import { verifyToken, messageFor, PURPOSE } from '@/lib/auth/tokens';
import { hashPassword, validatePassword } from '@/lib/auth/password';

const postSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
  passwordConfirm: z.string().min(1),
});

async function handler(req, res) {
  if (req.method === 'GET') {
    const { token } = req.query;
    const result = await verifyToken(token, PURPOSE.PASSWORD_RESET);

    if (!result.valid) {
      return res.status(400).json({ valid: false, error: messageFor(result.reason) });
    }

    return res.status(200).json({ valid: true, email: result.token.email });
  }

  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

  const { token, password, passwordConfirm } = parsed.data;

  if (password !== passwordConfirm) throw BadRequest('As senhas não coincidem.');

  const check = await verifyToken(token, PURPOSE.PASSWORD_RESET);
  if (!check.valid) throw BadRequest(messageFor(check.reason));

  const user = await prisma.user.findUnique({
    where: { email: check.token.email },
    select: { id: true, name: true, email: true, status: true, deletedAt: true },
  });

  if (!user || user.deletedAt || user.status !== 'ACTIVE') {
    throw NotFound('Conta não encontrada ou inativa.');
  }

  const policy = validatePassword(password, { email: user.email, name: user.name });
  if (!policy.valid) throw BadRequest(policy.errors[0]);

  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    const consumed = await tx.authToken.updateMany({
      where: {
        tokenHash: check.token.tokenHash,
        type: PURPOSE.PASSWORD_RESET,
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
        // tokenVersion++ derruba todas as outras sessões ativas
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'auth.password.reset',
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
    message: 'Senha redefinida. Faça login com a nova senha.',
  });
}

export default withPublic(handler, { methods: ['GET', 'POST'] });
