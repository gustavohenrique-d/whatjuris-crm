// =============================================================================
// WhatJuris CRM — Restaurar (desarquivar) contato
// POST /api/contacts/[id]/restore
//
// Endpoint DEDICADO, e não um campo do PATCH, por segurança: o updateSchema do
// PATCH aceitaria `deletedAt` como qualquer outro campo, e quem quisesse
// arquivar um cliente passaria por cima da guarda financeira do DELETE. Manter
// a escrita de `deletedAt` fora do PATCH deixa arquivar e restaurar como as
// duas únicas portas — cada uma com sua regra.
//
// Restaurar é o inverso EXATO de arquivar: limpa `deletedAt`, e o contato volta
// a passar nos mesmos filtros `deletedAt: null` que o esconderam. Nada mais
// precisa ser desfeito.
// =============================================================================

import { prisma } from '@/lib/db/prisma';
import { withAuth, Forbidden, NotFound, writeAudit } from '@/lib/auth/guard';
import { assertCanWriteContact } from '@/lib/query/scope';

async function handler(req, res, ctx) {
  const { id } = req.query;

  // Sem o filtro de deletedAt: aqui o alvo é justamente o arquivado.
  const contact = await prisma.contact.findUnique({
    where: { id },
    select: { id: true, name: true, ownerId: true, deletedAt: true },
  });
  if (!contact) throw NotFound('Contato não encontrado.');

  assertCanWriteContact(ctx, contact);
  // Mesma permissão de arquivar: quem pode tirar da tela pode trazer de volta.
  // Exigir `contact.update` deixaria alguém arquivar sem poder desfazer.
  if (!ctx.can('contact.delete')) throw Forbidden();

  if (!contact.deletedAt) {
    return res.status(200).json({ message: 'Cliente já está ativo.', contact });
  }

  const restaurado = await prisma.contact.update({
    where: { id },
    data: { deletedAt: null },
    select: { id: true, name: true, email: true, phone: true, whatsapp: true, deletedAt: true },
  });

  await writeAudit({
    actorId: ctx.userId, action: 'contact.restored', resource: 'contact',
    resourceId: id, before: { deletedAt: contact.deletedAt }, after: { deletedAt: null }, ctx,
  });

  return res.status(200).json({ message: 'Cliente restaurado.', contact: restaurado });
}

export default withAuth(handler, { methods: ['POST'] });
