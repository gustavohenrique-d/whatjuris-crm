// =============================================================================
// WhatJuris CRM — Notificações ao advogado (e-mail + WhatsApp best-effort)
// lib/notifications/lawyer.js
//
// Eventos event-driven: 'lead_qualified' (1ª qualificação na triagem) e
// 'ai_failure_takeover' (IA falhou → takeover automático). Destinatário fixo
// por env (LAWYER_EMAIL / LAWYER_WHATSAPP_NUMBER), adequado a single-tenant.
//
// `buildLawyerNotification` é PURO (testável). `notifyLawyer` usa import
// dinâmico dos senders para não puxar Prisma/Resend no load (mantém o helper
// puro isolável nos testes) e NUNCA lança (best-effort, loga falhas).
//
// ⚠️ WhatsApp proativo fora da janela de 24h exige template aprovado na Meta —
// por isso o WhatsApp é best-effort; o e-mail é o canal confiável.
// =============================================================================

const td = 'padding:6px 10px;border-bottom:1px solid #eee;';

function linha(rotulo, valor) {
  return `<tr><td style="${td}color:#888;">${rotulo}</td><td style="${td}font-weight:bold;">${valor}</td></tr>`;
}

// Monta { subject, emailHtml, whatsappText } por evento. PURA.
export function buildLawyerNotification({ event, data = {} }) {
  const nome = data.name || 'Lead sem nome';
  const whatsapp = data.whatsapp || '—';
  const area = data.area || 'não informada';
  const urgencia = data.urgencia || '—';
  const resumo = data.resumo || '—';

  if (event === 'lead_qualified') {
    return {
      subject: `🎯 Novo lead qualificado — ${nome}`,
      emailHtml: `
        <p>Um lead foi <strong>qualificado</strong> pela triagem e está pronto para atendimento.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${linha('Nome', nome)}${linha('WhatsApp', whatsapp)}${linha('Área', area)}
          ${linha('Urgência', urgencia)}${linha('Resumo do caso', resumo)}
        </table>
        <p>Acesse o CRM para ver a ficha completa.</p>`,
      whatsappText: [
        '*🎯 Novo lead qualificado — WhatJuris*', '',
        `*Nome:* ${nome}`, `*WhatsApp:* ${whatsapp}`, `*Área:* ${area}`, `*Urgência:* ${urgencia}`,
        '', 'Acesse o CRM para ver a ficha.',
      ].join('\n'),
    };
  }

  if (event === 'ai_failure_takeover') {
    return {
      subject: `⚠️ IA falhou — atenção manual necessária (${nome})`,
      emailHtml: `
        <p>A IA teve uma <strong>instabilidade</strong> e a conversa foi transferida para
        <strong>atendimento humano</strong>. Assuma manualmente pelo CRM.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${linha('Nome', nome)}${linha('WhatsApp', whatsapp)}${linha('Área', area)}
        </table>
        <p>O cliente recebeu uma mensagem de espera — responda o quanto antes.</p>`,
      whatsappText: [
        '*⚠️ IA falhou — WhatJuris*', '',
        `A conversa com *${nome}* (${whatsapp}) precisa de atendimento humano.`,
        `*Área:* ${area}`, '',
        'O cliente recebeu uma mensagem de espera. Assuma no CRM.',
      ].join('\n'),
    };
  }

  return {
    subject: 'Notificação — WhatJuris',
    emailHtml: `<p>Evento: ${event}</p>`,
    whatsappText: `Notificação WhatJuris: ${event}`,
  };
}

// Envia a notificação pelos canais com env preenchida. Best-effort, não lança.
export async function notifyLawyer({ event, data = {} }) {
  const emailTo = process.env.LAWYER_EMAIL;
  const waTo = process.env.LAWYER_WHATSAPP_NUMBER;

  if (!emailTo && !waTo) {
    console.log(`[notify:lawyer] sem destinatário configurado (evento ${event}) — ignorado.`);
    return { skipped: true };
  }

  const { subject, emailHtml, whatsappText } = buildLawyerNotification({ event, data });
  const tasks = [];

  if (emailTo) {
    const p = import('@/lib/email/send')
      .then((m) => m.sendLawyerNotificationEmail({ to: emailTo, subject, html: emailHtml }))
      .catch((err) => console.error('[notify:lawyer] e-mail falhou:', err.message));
    tasks.push(p);
  }
  if (waTo) {
    const p = import('@/lib/whatsapp/send')
      .then((m) => m.sendWhatsappMessage({ to: waTo, text: whatsappText }))
      .catch((err) => console.error('[notify:lawyer] whatsapp falhou:', err.message));
    tasks.push(p);
  }

  await Promise.allSettled(tasks);
  return { email: !!emailTo, whatsapp: !!waTo };
}
