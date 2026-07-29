// =============================================================================
// WhatJuris CRM — Consultar controle da conversa
// GET /api/conversations/[instance_name]/[chat_id]/control
//
// Fonte de verdade PostgreSQL. Expira bloqueio vencido (blocked_until <= agora)
// reconciliando para mode 'ai' e registrando 'takeover_expired'.
// Usado pela UI (status do atendimento) e pelo n8n (confirmar em cache miss).
// =============================================================================

import { resolveConversationActor } from '@/lib/conversations/http-auth';
import { isBlocked, sanitizeInstance, sanitizeChatId } from '@/lib/conversations/control';
import { prisma } from '@/lib/db/prisma';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });

  // Leitura: n8n (secret) ou qualquer usuário autenticado (sem permissão específica).
  const actor = await resolveConversationActor(req, res);
  if (actor.error === 401) return res.status(401).json({ error: 'Não autenticado.' });

  const { instance_name, chat_id } = req.query;

  try {
    const state = await isBlocked(instance_name, chat_id);
    const ttlRemaining = state.blockedUntil
      ? Math.max(0, Math.ceil((state.blockedUntil.getTime() - Date.now()) / 1000))
      : 0;

    // Quem assumiu (para a UI mostrar o nome e liberar o "Devolver" ao responsável).
    let takenOverBy = null;
    let takenOverByName = null;
    if (state.blocked) {
      const control = await prisma.conversationControl.findUnique({
        where: { instanceName_chatId: { instanceName: sanitizeInstance(instance_name), chatId: sanitizeChatId(chat_id) } },
        select: { takenOverBy: true },
      });
      takenOverBy = control?.takenOverBy ?? null;
      if (takenOverBy) {
        const user = await prisma.user.findUnique({ where: { id: takenOverBy }, select: { name: true } });
        takenOverByName = user?.name ?? null;
      }
    }

    return res.status(200).json({
      mode: state.blocked ? 'human' : 'ai',
      human_takeover: state.blocked,
      blocked_until: state.blockedUntil?.toISOString() ?? null,
      ttl_remaining_seconds: ttlRemaining,
      control_version: state.controlVersion,
      source: state.source ?? null,
      taken_over_by: takenOverBy,
      taken_over_by_name: takenOverByName,
      rehydrated: state.rehydrated ?? false,
      // presente só quando Redis+PG indisponíveis (falha fechada)
      flow_action: state.flowAction ?? undefined,
    });
  } catch (err) {
    console.error('[control] erro:', err.message);
    // Falha fechada: nunca liberar a IA por engano numa consulta que falhou.
    return res.status(200).json({ mode: 'human', human_takeover: true, flow_action: 'stop_and_retry' });
  }
}
