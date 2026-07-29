// =============================================================================
// WhatJuris CRM — Webhook do WhatsApp Business API (Meta)
// pages/api/webhooks/whatsapp.js
//
// GET  → verificação do webhook (challenge da Meta).
// POST → recepção + normalização das mensagens (texto/áudio/imagem), com
//        idempotência, e encaminhamento do contrato normalizado ao n8n.
//
// Fluxo por mensagem:
//   1. Normaliza (lib/webhooks/whatsapp-normalizer) — expande entry/changes/messages.
//   2. Idempotência (lib/webhooks/idempotency) — pula reentrega da Meta.
//   3. Finaliza por tipo (lib/webhooks/process-message) — mídia + IA para
//      áudio/imagem; texto já vem pronto.
//   4. Persiste Contact/Deal + MESSAGE_IN e notifica o n8n com o contrato.
//
// A assinatura x-hub-signature-256 é HMAC-SHA256 com o APP SECRET
// (WHATSAPP_APP_SECRET). A verificação só roda em produção.
// =============================================================================

import { recordWhatsappMessage } from '@/lib/activities/record';
import { notifyN8n } from '@/lib/n8n/notify';
import { verifyMetaSignature, verifyVerifyToken } from '@/lib/webhooks/signature';
import { parseMetaPayload } from '@/lib/webhooks/whatsapp-normalizer';
import { isDuplicate, register } from '@/lib/webhooks/idempotency';
import { finalizeEnvelope, isForwardable } from '@/lib/webhooks/process-message';
import { findOrCreateContact, findOrCreateDeal } from '@/lib/whatsapp/lead';

// Body parser desligado para validar a assinatura no raw body.
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// chat_id mascarado para log seguro: 5 primeiros dígitos + ***
function maskChatId(chatId) {
  const digits = String(chatId || '').replace(/\D/g, '');
  return digits ? `${digits.slice(0, 5)}***` : '***';
}

// Persiste a mensagem e notifica o n8n com o contrato. Chamada só para
// envelopes encaminháveis (status ok, from_me false, message não vazia).
async function persistAndForward(env, profileName) {
  const contact = await findOrCreateContact(env.chat_id, profileName);
  const deal = await findOrCreateDeal(contact);

  await recordWhatsappMessage({
    dealId: deal.id,
    contactId: contact.id,
    direction: 'in',
    content: env.message,
    whatsappMessageId: env.message_id,
  });

  // Encaminha o contrato normalizado + dados do CRM que o fluxo de triagem usa.
  notifyN8n({
    event: 'message.received',
    dealId: deal.id,
    contactId: contact.id,
    contactName: contact.name,
    phone: env.chat_id,
    message: env.message,
    stageKey: deal.stage?.key,
    whatsappMessageId: env.message_id,
    contract: env,
  }).catch((err) => console.error('[webhook] n8n notify falhou:', err.message));
}

export default async function handler(req, res) {
  // GET — verificação do webhook pela Meta
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && verifyVerifyToken(token)) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verificação falhou.' });
  }

  // POST — mensagens e eventos
  if (req.method === 'POST') {
    const rawBody = await getRawBody(req);
    const signature = req.headers['x-hub-signature-256'];

    if (process.env.NODE_ENV === 'production' && !verifyMetaSignature(rawBody, signature)) {
      // log sem corpo, sem retry
      console.warn('[webhook:whatsapp] assinatura inválida.');
      return res.status(401).json({ error: 'Assinatura inválida.' });
    }

    let body;
    try {
      body = JSON.parse(rawBody.toString());
    } catch {
      return res.status(400).json({ error: 'INVALID_MESSAGE_PAYLOAD' });
    }

    // A Meta exige 200 em < 20s — responder já e processar em seguida.
    res.status(200).json({ status: 'ok' });

    try {
      const { envelopes, statusesOnly } = parseMetaPayload(body);

      if (statusesOnly) {
        console.log('[webhook:whatsapp] evento apenas de statuses — ignorado (sem IA).');
        return;
      }
      if (!envelopes.length) return;

      const profileName = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;

      for (const env of envelopes) {
        const started = Date.now();

        // from_me: nunca processar mensagem enviada pelo próprio sistema.
        if (env.from_me) continue;

        // Idempotência: reentrega da Meta.
        if (await isDuplicate(env.message_id)) {
          env.processing_status = 'ignored';
          console.log(
            `[webhook:whatsapp] duplicata ignorada msg=${env.message_id} chat=${maskChatId(env.chat_id)}`
          );
          continue;
        }

        // Registra antes de acionar IA (evita corrida em reentrega rápida).
        await register(env.message_id, env.chat_id);

        // Finaliza (mídia + IA para áudio/imagem).
        await finalizeEnvelope(env);

        if (!isForwardable(env)) {
          console.log(
            `[webhook:whatsapp] não encaminhado type=${env.message_type} ` +
              `status=${env.processing_status} err=${env.processing_error || '-'} ` +
              `msg=${env.message_id} chat=${maskChatId(env.chat_id)} dur=${Date.now() - started}ms`
          );
          continue;
        }

        await persistAndForward(env, profileName);
        console.log(
          `[webhook:whatsapp] ok type=${env.message_type} msg=${env.message_id} ` +
            `chat=${maskChatId(env.chat_id)} dur=${Date.now() - started}ms`
        );
      }
    } catch (err) {
      console.error('[webhook:whatsapp] erro ao processar:', err.message);
    }

    return;
  }

  return res.status(405).json({ error: 'Método não permitido.' });
}
