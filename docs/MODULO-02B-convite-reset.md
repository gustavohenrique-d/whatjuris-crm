# Módulo 2B — Convite por E-mail e Reset de Senha

> Ler `CLAUDE.md` antes. Requer Módulo 2A concluído.
>
> **Todo o código está embutido neste arquivo.** Não há arquivo companheiro.

## Objetivo

- Sócio convida usuário por e-mail — convidado define a própria senha
- Usuário esqueceu a senha — redefine por link com validade de 1 hora
- Ambos os fluxos têm trilha de auditoria e são resistentes a condição de corrida

## Desvios do código da spec para casar com o banco (regra do 2B.0)

A tabela `auth_tokens` (criada no Módulo 1) usa:
- `used_at` (a spec assumia `consumed_at`) → `CONSUMED_FIELD = 'usedAt'`
- `user_id` existe; **não existem** `role_id` nem `created_by` → `createToken`
  grava `userId` em vez de `roleId`/`createdBy`. Quem convidou já fica
  registrado em `audit_logs` (`user.invited`, `actorId`).

Todo o resto segue a spec. Decisões travadas: token só em hash SHA-256,
reenvio invalida link anterior, aceite/reset são transações, reset faz
`tokenVersion++`, e-mail desconhecido → resposta genérica, `passwordHash: '!'`
para convite pendente.

## Tarefas

- 2B.0 — conferir schema de `auth_tokens` (feito: `used_at`/`user_id`)
- 2B.1 — `lib/auth/tokens.js`
- 2B.2 — `lib/email/send.js` (Resend; sem `RESEND_API_KEY` loga o link no console)
- 2B.3 — `pages/api/users/invite.js` (permission `user.invite`)
- 2B.4 — `pages/api/auth/accept-invite.js` (público, GET+POST)
- 2B.5 — `pages/api/auth/forgot-password.js` (rate limit 3/15min por IP) e
         `pages/api/auth/reset-password.js` (GET+POST, `tokenVersion++`)
- 2B.6 — telas `esqueci-senha.js`, `redefinir-senha.js`, `aceitar-convite.js`
         + avisos de sucesso no `login.js` via `?msg=`

Ver os critérios de aceite completos no histórico do módulo.

## Fora de escopo
- Google / OAuth / MFA
- Filtro `own` vs `all` → Módulo 3
- Qualquer tela de CRM
