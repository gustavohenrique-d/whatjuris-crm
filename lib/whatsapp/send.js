// =============================================================================
// WhatJuris CRM — Enviar mensagem via WhatsApp Business API
// lib/whatsapp/send.js
//
// Usado pelos agentes (módulo 9) e por qualquer código que precise enviar uma
// mensagem ao lead. Após enviar, grava MESSAGE_OUT na timeline.
// Sem credenciais → retorna { skipped: true } (não quebra).
// =============================================================================

import { recordWhatsappMessage } from '@/lib/activities/record';

// Versão da Graph API configurável via WHATSAPP_GRAPH_API_VERSION (fallback
// v21.0). Antes era 'v19.0' hardcoded.
const graphVersion = () => process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0';

export async function sendWhatsappMessage({
  to,
  text,
  dealId = null,
  contactId = null,
  tx = null,
}) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsapp] credenciais não configuradas — mensagem não enviada.');
    return { skipped: true };
  }

  const phone = String(to).replace(/\D/g, '');

  const response = await fetch(`https://graph.facebook.com/${graphVersion()}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { body: text },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('[whatsapp] erro ao enviar:', data);
    throw new Error(data?.error?.message || 'Erro ao enviar mensagem WhatsApp.');
  }

  const whatsappMessageId = data?.messages?.[0]?.id;

  // Gravar na timeline (MESSAGE_OUT)
  if (dealId || contactId) {
    await recordWhatsappMessage({
      dealId,
      contactId,
      direction: 'out',
      content: text,
      whatsappMessageId,
      tx,
    });
  }

  return { sent: true, whatsappMessageId };
}
