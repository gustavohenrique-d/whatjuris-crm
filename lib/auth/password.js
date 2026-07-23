// =============================================================================
// WhatJuris CRM — Camada de Senha
// lib/auth/password.js
// =============================================================================

const bcrypt = require('bcrypt');

// Custo 12 leva ~250ms. É lento de propósito: torna força bruta offline
// inviável se o banco vazar. Não abaixar.
const BCRYPT_COST = 12;

// Hash descartável para gastar o mesmo tempo quando o e-mail não existe.
const DUMMY_HASH =
  '$2b$12$C6UzMDM.H6dfI/f/IKcEe.aZBrDW0nGQhTNMDVJKPnHRZL6M0Yq5S';

// -----------------------------------------------------------------------------
// POLÍTICA
//
// Sem regra de composição (1 maiúscula, 1 símbolo). O NIST abandonou isso em
// 2017 porque empurra todo mundo para "Senha@123". O que vale é comprimento
// e não estar em lista de senha vazada.
// -----------------------------------------------------------------------------

const MIN_LENGTH = 10;
const MAX_LENGTH = 128; // bcrypt trunca em 72 bytes de qualquer forma

const BLOCKLIST = new Set([
  'senha123456', '12345678910', 'brasil123456', 'advogado123',
  'password123', 'qwertyuiop', '1234567890', 'admin123456',
  'escritorio1', 'juridico123', 'whatjuris123',
]);

function validatePassword(password, context = {}) {
  const errors = [];

  if (typeof password !== 'string') {
    return { valid: false, errors: ['Senha inválida.'] };
  }

  if (password.length < MIN_LENGTH) {
    errors.push(`A senha precisa ter no mínimo ${MIN_LENGTH} caracteres.`);
  }
  if (password.length > MAX_LENGTH) {
    errors.push(`A senha não pode passar de ${MAX_LENGTH} caracteres.`);
  }

  const normalized = password.toLowerCase().replace(/\s+/g, '');

  if (BLOCKLIST.has(normalized)) {
    errors.push('Essa senha é muito comum. Escolha outra.');
  }

  if (context.email) {
    const localPart = context.email.split('@')[0].toLowerCase();
    if (localPart.length >= 4 && normalized.includes(localPart)) {
      errors.push('A senha não pode conter seu e-mail.');
    }
  }

  if (context.name) {
    const firstName = context.name.trim().split(/\s+/)[0].toLowerCase();
    if (firstName.length >= 4 && normalized.includes(firstName)) {
      errors.push('A senha não pode conter seu nome.');
    }
  }

  if (/^(.)\1+$/.test(password)) {
    errors.push('A senha não pode ser um caractere repetido.');
  }

  return { valid: errors.length === 0, errors };
}

// -----------------------------------------------------------------------------
// HASH
// -----------------------------------------------------------------------------

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

async function verifyPassword(password, hash) {
  if (!hash || hash === '!') {
    // Conta com convite pendente. Gasta o tempo do bcrypt mesmo assim
    // para não denunciar o estado da conta pelo tempo de resposta.
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}

// Chamado quando o e-mail não existe. Mantém o tempo de resposta constante.
async function burnTime(password) {
  await bcrypt.compare(password || 'x', DUMMY_HASH);
  return false;
}

// -----------------------------------------------------------------------------
// BLOQUEIO PROGRESSIVO
// -----------------------------------------------------------------------------

const LOCK_THRESHOLD = 5;

function computeLockUntil(failedAttempts) {
  if (failedAttempts < LOCK_THRESHOLD) return null;

  const excess = failedAttempts - LOCK_THRESHOLD;
  const minutes = Math.min(2 ** excess, 30);

  return new Date(Date.now() + minutes * 60 * 1000);
}

function isLocked(user) {
  return Boolean(user?.lockedUntil && user.lockedUntil > new Date());
}

module.exports = {
  BCRYPT_COST,
  MIN_LENGTH,
  LOCK_THRESHOLD,
  validatePassword,
  hashPassword,
  verifyPassword,
  burnTime,
  computeLockUntil,
  isLocked,
};
