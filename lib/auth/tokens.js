// =============================================================================
// WhatJuris CRM — Tokens de Auth (convite e reset de senha)
// lib/auth/tokens.js
//
// Regra central: o token em claro existe UMA vez, no retorno de createToken(),
// só para compor o link do e-mail. O banco guarda apenas o hash SHA-256.
// Se o banco vazar, os tokens pendentes continuam inúteis.
//
// SHA-256 puro (não bcrypt) é o correto aqui: o token tem 32 bytes de entropia
// aleatória, então não há o que forçar por dicionário. Bcrypt só tornaria a
// verificação lenta sem ganho de segurança.
//
// DESVIO DA SPEC (regra do 2B.0 — casar com o banco, não o contrário):
//   - o campo de consumo no banco é `used_at` → CONSUMED_FIELD = 'usedAt'
//   - auth_tokens tem `user_id`, e NÃO tem `role_id`/`created_by` → createToken
//     grava `userId`. Quem convidou fica em audit_logs (user.invited, actorId).
// =============================================================================

const crypto = require('crypto');
const { prisma } = require('../db/prisma');

const TOKEN_BYTES = 32; // 256 bits de entropia

// Valores batem com o enum AuthTokenType do banco (INVITE, PASSWORD_RESET).
const PURPOSE = {
  INVITE: 'INVITE',
  PASSWORD_RESET: 'PASSWORD_RESET',
};

// Campo de consumo real no banco (Módulo 1 criou `used_at` → Prisma `usedAt`).
const CONSUMED_FIELD = 'usedAt';

const TTL = {
  INVITE: 7 * 24 * 60 * 60 * 1000,      // 7 dias
  PASSWORD_RESET: 60 * 60 * 1000,        // 1 hora
};

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateRawToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

// -----------------------------------------------------------------------------
// CRIAÇÃO
//
// Invalida tokens anteriores do mesmo tipo para o mesmo e-mail ANTES de criar
// o novo. Sem isso, reenviar um convite deixa dois links válidos circulando.
// -----------------------------------------------------------------------------

async function createToken({ purpose, email, userId = null }) {
  const normalizedEmail = email.trim().toLowerCase();

  await prisma.authToken.updateMany({
    where: {
      email: normalizedEmail,
      type: purpose,
      [CONSUMED_FIELD]: null,
      expiresAt: { gt: new Date() },
    },
    data: { [CONSUMED_FIELD]: new Date() },
  });

  const rawToken = generateRawToken();

  await prisma.authToken.create({
    data: {
      type: purpose,
      email: normalizedEmail,
      tokenHash: hashToken(rawToken),
      userId: userId ?? null,
      expiresAt: new Date(Date.now() + TTL[purpose]),
    },
  });

  return rawToken;
}

// -----------------------------------------------------------------------------
// VERIFICAÇÃO — só lê, não consome. Útil para renderizar a tela antes do
// formulário aparecer ("Definindo senha de rafael@escritorio.com").
// -----------------------------------------------------------------------------

const REASONS = {
  MISSING: 'Link inválido.',
  NOT_FOUND: 'Este link não é válido. Solicite um novo.',
  WRONG_PURPOSE: 'Este link não é válido. Solicite um novo.',
  ALREADY_USED: 'Este link já foi utilizado. Solicite um novo.',
  EXPIRED: 'Este link expirou. Solicite um novo.',
  INVALID_OR_USED: 'Este link não é mais válido. Solicite um novo.',
};

async function verifyToken(rawToken, expectedPurpose) {
  if (!rawToken || typeof rawToken !== 'string') {
    return { valid: false, reason: 'MISSING' };
  }

  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });

  if (!record) return { valid: false, reason: 'NOT_FOUND' };
  if (record.type !== expectedPurpose) return { valid: false, reason: 'WRONG_PURPOSE' };
  if (record[CONSUMED_FIELD]) return { valid: false, reason: 'ALREADY_USED' };
  if (record.expiresAt < new Date()) return { valid: false, reason: 'EXPIRED' };

  return { valid: true, token: record };
}

// -----------------------------------------------------------------------------
// CONSUMO — transacional com condição de corrida resolvida.
//
// O updateMany com CONSUMED_FIELD: null no where garante que dois cliques
// simultâneos no mesmo link só consumam uma vez.
// -----------------------------------------------------------------------------

async function consumeToken(rawToken, expectedPurpose) {
  const tokenHash = hashToken(rawToken);

  const result = await prisma.authToken.updateMany({
    where: {
      tokenHash,
      type: expectedPurpose,
      [CONSUMED_FIELD]: null,
      expiresAt: { gt: new Date() },
    },
    data: { [CONSUMED_FIELD]: new Date() },
  });

  if (result.count === 0) {
    return { consumed: false, reason: 'INVALID_OR_USED' };
  }

  const record = await prisma.authToken.findUnique({ where: { tokenHash } });
  return { consumed: true, token: record };
}

function messageFor(reason) {
  return REASONS[reason] || 'Link inválido.';
}

function buildLink(purpose, rawToken) {
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'http://localhost:3000';
  const paths = {
    INVITE: '/aceitar-convite',
    PASSWORD_RESET: '/redefinir-senha',
  };
  return `${base}${paths[purpose]}?token=${encodeURIComponent(rawToken)}`;
}

async function purgeExpiredTokens() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.authToken.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  return count;
}

module.exports = {
  PURPOSE,
  TTL,
  CONSUMED_FIELD,
  createToken,
  verifyToken,
  consumeToken,
  messageFor,
  buildLink,
  purgeExpiredTokens,
  hashToken,
};
