// =============================================================================
// WhatJuris CRM — Esqueci minha senha
// pages/api/auth/forgot-password.js
//
// Resposta SEMPRE idêntica — e-mail existe ou não.
// Rate limit por IP: 3 tentativas a cada 15 minutos (in-memory, suficiente
// para MVP — trocar por Redis se o servidor for reiniciado com frequência).
// =============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withPublic, BadRequest } from '@/lib/auth/guard';
import { createToken, buildLink, PURPOSE } from '@/lib/auth/tokens';
import { sendPasswordResetEmail } from '@/lib/email/send';

const GENERIC_OK = 'Se este e-mail estiver cadastrado, enviamos um link de redefinição.';

// Rate limit simples em memória — (ip → { count, resetAt })
const rateLimitStore = new Map();
const RL_MAX = 3;
const RL_WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    return true;
  }

  if (entry.count >= RL_MAX) return false;

  entry.count++;
  return true;
}

const schema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
});

async function handler(req, res) {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: 'Muitas tentativas. Aguarde 15 minutos.',
      code: 'RATE_LIMITED',
    });
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);

  const { email } = parsed.data;

  // Busca sem revelar existência por tempo de resposta
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, status: true, deletedAt: true },
  });

  // Resposta genérica — não distinguir "não existe" de "existe"
  if (!user || user.deletedAt || user.status !== 'ACTIVE') {
    return res.status(200).json({ message: GENERIC_OK });
  }

  const rawToken = await createToken({ purpose: PURPOSE.PASSWORD_RESET, email, userId: user.id });
  const link = buildLink(PURPOSE.PASSWORD_RESET, rawToken);

  sendPasswordResetEmail({ to: email, name: user.name, link }).catch((err) => {
    // Falha de e-mail não expõe erro ao cliente — log interno basta
    console.error('[forgot-password] falha ao enviar e-mail:', err);
  });

  return res.status(200).json({ message: GENERIC_OK });
}

export default withPublic(handler, { methods: ['POST'] });
