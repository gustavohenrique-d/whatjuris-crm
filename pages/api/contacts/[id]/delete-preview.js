// =============================================================================
// WhatJuris CRM — Prévia de arquivamento de contato
// GET /api/contacts/[id]/delete-preview
//
// Não altera nada. Devolve o que sai das telas ao arquivar e se a guarda
// financeira bloqueia. A UI usa isto para decidir se sequer oferece a
// confirmação.
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { withAuth, Forbidden, NotFound } from '@/lib/auth/guard';
import { assertCanReadContact } from '@/lib/query/scope';
import { montarImpacto } from '@/lib/contacts/impacto';

async function handler(req, res, ctx) {
  const { id } = req.query;

  const contact = await prisma.contact.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, whatsapp: true, ownerId: true },
  });
  if (!contact) throw NotFound('Contato não encontrado.');

  assertCanReadContact(ctx, contact);
  // Mesma permissão da ação que este preview antecede: quem não pode arquivar
  // não precisa saber o que o arquivamento faria.
  if (!ctx.can('contact.delete')) throw Forbidden();

  const impacto = await montarImpacto(contact);

  return res.status(200).json({
    contact: { id: contact.id, name: contact.name },
    ...impacto,
  });
}

export default withAuth(handler, { methods: ['GET'] });
