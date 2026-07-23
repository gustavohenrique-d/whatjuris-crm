// =============================================================================
// WhatJuris CRM — E-mail transacional
// lib/email/send.js
// =============================================================================

const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM || 'WhatJuris <nao-responda@dominio.com.br>';

// Fallback de desenvolvimento: imprime o link e resolve sem erro
async function devFallback(label, link) {
  console.log(`\n[email:DEV] ${label}`);
  console.log(`Link: ${link}\n`);
}

// -----------------------------------------------------------------------------
// HTML mínimo: sem imagem externa, botão + link em texto
// (muitos clientes de e-mail bloqueiam imagens e alguns quebram botões)
// -----------------------------------------------------------------------------

function wrapHtml(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; background:#f5f5f5; margin:0; padding:0; }
  .box { max-width:520px; margin:40px auto; background:#fff; border-radius:8px;
         padding:32px; border:1px solid #e0e0e0; }
  h2 { color:#1a1a2e; margin-top:0; }
  p { color:#444; line-height:1.6; }
  .btn { display:inline-block; background:#4F8EF7; color:#fff; padding:12px 24px;
         border-radius:6px; text-decoration:none; font-weight:bold; margin:16px 0; }
  .link-alt { font-size:12px; color:#888; word-break:break-all; }
  .footer { margin-top:24px; font-size:12px; color:#aaa; text-align:center; }
</style></head>
<body><div class="box">
  <h2>${title}</h2>
  ${bodyHtml}
  <div class="footer">WhatJuris · Sistema de Gestão do Escritório</div>
</div></body></html>`;
}

// -----------------------------------------------------------------------------
// CONVITE
// -----------------------------------------------------------------------------

async function sendInviteEmail({ to, inviteeName, inviterName, roleName, link }) {
  const subject = `${inviterName} convidou você para o WhatJuris`;

  const html = wrapHtml('Você foi convidado', `
    <p>Olá, <strong>${inviteeName}</strong>!</p>
    <p><strong>${inviterName}</strong> convidou você para acessar o WhatJuris
       como <strong>${roleName}</strong>.</p>
    <p>Clique no botão abaixo para definir sua senha e entrar:</p>
    <a href="${link}" class="btn">Aceitar convite e criar senha</a>
    <p class="link-alt">Ou copie este link no navegador:<br>${link}</p>
    <p style="color:#888;font-size:13px;">Este link expira em <strong>7 dias</strong>.
       Se você não reconhece este convite, ignore este e-mail.</p>
  `);

  if (!resend) return devFallback('Convite', link);

  await resend.emails.send({ from: FROM, to, subject, html });
}

// -----------------------------------------------------------------------------
// RESET DE SENHA
// -----------------------------------------------------------------------------

async function sendPasswordResetEmail({ to, name, link }) {
  const subject = 'Redefinição de senha — WhatJuris';

  const html = wrapHtml('Redefinir sua senha', `
    <p>Olá, <strong>${name}</strong>!</p>
    <p>Recebemos uma solicitação para redefinir a senha da sua conta no WhatJuris.</p>
    <a href="${link}" class="btn">Redefinir senha</a>
    <p class="link-alt">Ou copie este link no navegador:<br>${link}</p>
    <p style="color:#888;font-size:13px;">Este link expira em <strong>1 hora</strong>.
       Se você não solicitou isso, ignore este e-mail — sua senha não foi alterada.</p>
  `);

  if (!resend) return devFallback('Reset de senha', link);

  await resend.emails.send({ from: FROM, to, subject, html });
}

module.exports = { sendInviteEmail, sendPasswordResetEmail };
