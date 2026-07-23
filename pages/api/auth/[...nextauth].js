// =============================================================================
// WhatJuris CRM — NextAuth
// pages/api/auth/[...nextauth].js
//
// Estratégia JWT, sem tabela de sessão.
//
// O problema clássico do JWT é revogação: token emitido continua válido até
// expirar, mesmo se o usuário for desligado. Solução: tokenVersion no User.
// O JWT carrega a versão em que nasceu; a cada 5 minutos o callback confere
// contra o banco. Desligar alguém é tokenVersion++.
// =============================================================================

import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import { prisma } from '@/lib/db/prisma';
import {
  verifyPassword,
  burnTime,
  computeLockUntil,
  isLocked,
} from '@/lib/auth/password';

const REVALIDATE_AFTER_MS = 5 * 60 * 1000;

const GENERIC_ERROR = 'E-mail ou senha incorretos.';

// -----------------------------------------------------------------------------
// AJUSTAR AQUI se audit_logs usar nomes diferentes (ver seção de conferência)
// -----------------------------------------------------------------------------

async function logAttempt({ actorId, email, success, reason, req }) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action: success ? 'auth.login.success' : 'auth.login.failure',
        resource: 'auth',
        resourceId: actorId ?? null,
        after: { email, reason: reason ?? null },
        ip:
          req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
          req?.socket?.remoteAddress ||
          null,
        userAgent: req?.headers?.['user-agent'] ?? null,
      },
    });
  } catch {
    // Auditoria nunca derruba o login. Falha silenciosa aqui é preferível a
    // bloquear o usuário por indisponibilidade de log.
  }
}

function selectUserWithPermissions() {
  return {
    id: true,
    email: true,
    name: true,
    avatarUrl: true,
    passwordHash: true,
    status: true,
    tokenVersion: true,
    failedLoginAttempts: true,
    lockedUntil: true,
    legalAreas: true,
    deletedAt: true,
    role: {
      select: {
        id: true,
        key: true,
        name: true,
        permissions: {
          select: { permission: { select: { key: true } } },
        },
      },
    },
  };
}

function flattenPermissions(user) {
  return user.role.permissions.map((rp) => rp.permission.key);
}

export const authOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 12 * 60 * 60, // 12h cobre um dia de trabalho
  },

  jwt: { maxAge: 12 * 60 * 60 },

  pages: { signIn: '/login', error: '/login' },

  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },

      async authorize(credentials, req) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;

        if (!email || !password) throw new Error(GENERIC_ERROR);

        const user = await prisma.user.findUnique({
          where: { email },
          select: selectUserWithPermissions(),
        });

        // E-mail inexistente: gasta o mesmo tempo de um bcrypt real
        if (!user || user.deletedAt) {
          await burnTime(password);
          await logAttempt({ email, success: false, reason: 'NOT_FOUND', req });
          throw new Error(GENERIC_ERROR);
        }

        if (isLocked(user)) {
          await logAttempt({
            actorId: user.id, email, success: false, reason: 'LOCKED', req,
          });
          const minutes = Math.ceil((user.lockedUntil - Date.now()) / 60000);
          throw new Error(
            `Conta temporariamente bloqueada. Tente novamente em ${minutes} min.`
          );
        }

        if (user.status === 'SUSPENDED') {
          await logAttempt({
            actorId: user.id, email, success: false, reason: 'SUSPENDED', req,
          });
          throw new Error('Esta conta está suspensa. Fale com o administrador.');
        }

        if (user.status === 'INVITED') {
          await logAttempt({
            actorId: user.id, email, success: false, reason: 'PENDING_INVITE', req,
          });
          throw new Error(
            'Convite pendente. Abra o link enviado por e-mail para definir sua senha.'
          );
        }

        const ok = await verifyPassword(password, user.passwordHash);

        if (!ok) {
          const attempts = user.failedLoginAttempts + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: attempts,
              lockedUntil: computeLockUntil(attempts),
            },
          });
          await logAttempt({
            actorId: user.id, email, success: false, reason: 'BAD_PASSWORD', req,
          });
          throw new Error(GENERIC_ERROR);
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        });

        await logAttempt({ actorId: user.id, email, success: true, req });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
          roleKey: user.role.key,
          roleName: user.role.name,
          permissions: flattenPermissions(user),
          legalAreas: user.legalAreas,
          tokenVersion: user.tokenVersion,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.uid = user.id;
        token.roleKey = user.roleKey;
        token.roleName = user.roleName;
        token.permissions = user.permissions;
        token.legalAreas = user.legalAreas;
        token.tokenVersion = user.tokenVersion;
        token.validatedAt = Date.now();
        return token;
      }

      const stale = Date.now() - (token.validatedAt ?? 0) > REVALIDATE_AFTER_MS;
      if (!stale && trigger !== 'update') return token;

      const fresh = await prisma.user.findUnique({
        where: { id: token.uid },
        select: selectUserWithPermissions(),
      });

      // Usuário removido, suspenso ou com sessões revogadas
      if (
        !fresh ||
        fresh.deletedAt ||
        fresh.status !== 'ACTIVE' ||
        fresh.tokenVersion !== token.tokenVersion
      ) {
        return { ...token, uid: null, revoked: true };
      }

      // Permissão pode ter mudado — sócio alterou o papel do associado
      token.name = fresh.name;
      token.email = fresh.email;
      token.picture = fresh.avatarUrl;
      token.roleKey = fresh.role.key;
      token.roleName = fresh.role.name;
      token.permissions = flattenPermissions(fresh);
      token.legalAreas = fresh.legalAreas;
      token.validatedAt = Date.now();

      return token;
    },

    async session({ session, token }) {
      if (!token?.uid || token.revoked) return null;

      session.user = {
        id: token.uid,
        name: token.name,
        email: token.email,
        image: token.picture ?? null,
        role: token.roleKey,
        roleName: token.roleName,
        legalAreas: token.legalAreas ?? [],
      };

      session.permissions = token.permissions ?? [];

      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

export default NextAuth(authOptions);
