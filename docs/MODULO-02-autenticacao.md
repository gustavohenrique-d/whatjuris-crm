# Módulo 2 — Autenticação

> Ler `CLAUDE.md` antes. Requer o módulo 1 concluído.

## Objetivo

Login por e-mail e senha, convite de usuário por e-mail, reset de senha, e o
wrapper que protege todas as rotas de API.

Ao final: o sócio entra no sistema, convida a equipe, e cada convidado define
a própria senha por link. Nenhuma tela de CRM ainda — só as de autenticação.

---

## Decisões que não podem mudar

**Sessão é JWT, sem tabela de sessão.** Revogação via `User.tokenVersion`:
o token carrega a versão em que foi emitido e o callback revalida contra o
banco a cada 5 minutos. Desligar alguém é `tokenVersion++`.

**Falha de login tem mensagem única.** "E-mail ou senha incorretos" para
qualquer causa. Distinguir "e-mail não existe" de "senha errada" entrega
metade da autenticação ao atacante.

**Tempo de resposta constante.** Quando o e-mail não existe, rodar
`burnTime()` — um bcrypt contra hash descartável. Sem isso a diferença de
5ms vs 250ms permite enumerar contas por cronômetro.

**Token nunca é armazenado em claro.** `AuthToken.tokenHash` guarda SHA-256.
O token cru existe uma vez, no retorno de `createToken()`, só para montar o
link do e-mail.

**Bloqueio progressivo, não fixo.** 5ª falha → 1min, 6ª → 2min, 7ª → 4min,
teto de 30min.

---

## Tarefas

### 2.1 — Camada de senha

Criar `lib/auth/password.js` com o conteúdo fornecido.

Expõe: `hashPassword`, `verifyPassword`, `burnTime`, `validatePassword`,
`computeLockUntil`, `isLocked`.

Política: mínimo 10 caracteres, blocklist de senhas comuns, proibido conter
o próprio nome ou e-mail. **Sem regra de composição** (maiúscula, símbolo) —
o NIST abandonou isso em 2017 porque produz `Senha@123`.

### 2.2 — Camada de token

Criar `lib/auth/tokens.js` com o conteúdo fornecido.

Expõe: `createToken`, `verifyToken`, `consumeToken`, `buildLink`,
`messageFor`, `purgeExpiredTokens`.

TTL: convite 7 dias, reset de senha 1 hora.

`createToken` invalida tokens anteriores do mesmo tipo e e-mail — reenviar
convite não pode deixar dois links válidos circulando.

### 2.3 — NextAuth

Criar `pages/api/auth/[...nextauth].js` com o conteúdo fornecido.

Substitui o arquivo do template. Pontos de atenção:

- `session.strategy = 'jwt'`, `maxAge` 12h
- Callback `jwt` revalida contra o banco a cada 5min ou quando
  `trigger === 'update'`
- Callback `session` retorna `null` se o token foi revogado
- Toda tentativa de login (sucesso ou falha) gera `AuditLog`
- Auditoria falhando nunca derruba o login (try/catch silencioso)

Gerar o secret:

```bash
openssl rand -base64 32
```

### 2.4 — Guard de API

Criar `lib/auth/guard.js` com o conteúdo fornecido.

Expõe: `withAuth`, `withPublic`, `writeAudit`, e as fábricas de erro
(`BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`).

O `ctx` entregue ao handler contém:

```js
{
  userId, name, email, role, legalAreas,
  permissions,                      // Set
  can(key),                         // boolean
  scopeFor(resource, action),       // 'all' | 'own' | null
  ip, userAgent
}
```

`withAuth` também executa `SET app.actor_id` antes do handler, para os
triggers do módulo 1 saberem quem moveu o card.

Tentativa de acesso negado gera `AuditLog` com ação `access.denied`.

### 2.5 — Envio de e-mail

Criar `lib/email/send.js`.

Provedor: Resend (plano free cobre 3.000/mês). Exportar:

```js
sendInviteEmail({ to, inviteeName, inviterName, roleName, link })
sendPasswordResetEmail({ to, name, link })
```

Requisitos do template de e-mail:

- HTML simples, sem imagem externa (bloqueada por cliente de e-mail)
- Link em botão **e** em texto puro abaixo (alguns clientes quebram o botão)
- Informar validade do link ("expira em 7 dias" / "expira em 1 hora")
- Remetente do `.env`: `EMAIL_FROM`

Em desenvolvimento, se `RESEND_API_KEY` não estiver definida, logar o link
no console em vez de enviar.

### 2.6 — Rota de convite

Criar `pages/api/users/invite.js` com o conteúdo fornecido.

Protegida por `permission: 'user.invite'`.

Comportamento:

- Cria `User` com `status: INVITED` e `passwordHash: '!'` (hash que nenhuma
  senha gera — a conta não autentica até o convite ser aceito)
- Reenvio para e-mail existente reativa o usuário e faz `tokenVersion++`
- Papel `owner` não pode ser atribuído por convite (evita escalada de privilégio)
- Se o e-mail falhar, retorna `fallbackLink` para o sócio enviar por outro canal

### 2.7 — Rota de aceite

Criar `pages/api/auth/accept-invite.js` com o conteúdo fornecido.

Pública (`withPublic`), métodos `GET` e `POST`.

- `GET` valida o token e devolve e-mail e nome, para a tela renderizar
  "Definir senha de fulano@..." antes do formulário
- `POST` consome o token e grava a senha **numa transação** — se a gravação
  falhar depois do token consumido, o convidado ficaria com link queimado e
  sem acesso

### 2.8 — Reset de senha

Criar duas rotas públicas reaproveitando `tokens.js`:

**`pages/api/auth/forgot-password.js`** (POST)

Recebe e-mail, cria token `PASSWORD_RESET`, envia link.

Resposta **sempre idêntica** exista ou não a conta:

```json
{ "message": "Se este e-mail estiver cadastrado, enviamos um link." }
```

Aplicar rate limit por IP: 3 tentativas a cada 15 minutos.

**`pages/api/auth/reset-password.js`** (GET + POST)

Mesma estrutura de `accept-invite.js`. No `POST`, além de gravar a senha,
fazer `tokenVersion++` — trocar senha derruba todas as outras sessões.

### 2.9 — Middleware de rota

Criar `middleware.js` na raiz:

```js
export { default } from 'next-auth/middleware';

export const config = {
  matcher: ['/admin/:path*'],
};
```

Rotas públicas: `/login`, `/aceitar-convite`, `/redefinir-senha`,
`/esqueci-senha`.

### 2.10 — Telas de autenticação

Reaproveitar o layout de login do template
(`shared/data/authentication/`), trocando a lógica.

| Página | Rota | Função |
|---|---|---|
| `pages/login.js` | `/login` | `signIn('credentials')`, exibe erro do NextAuth |
| `pages/esqueci-senha.js` | `/esqueci-senha` | Formulário de e-mail |
| `pages/redefinir-senha.js` | `/redefinir-senha?token=` | Nova senha |
| `pages/aceitar-convite.js` | `/aceitar-convite?token=` | `GET` valida, depois `POST` |

Requisitos das telas:

- Indicador de força de senha nas telas de definição
- Botão desabilitado durante submit (evita duplo clique consumindo o token)
- Token inválido/expirado mostra a mensagem de `messageFor()` com link para
  solicitar novo
- Após sucesso no aceite, redirecionar para `/login` com aviso de sucesso

---

## Critérios de aceite

### Login

```
✓ Credencial correta → redireciona para /admin/dashboard
✓ Senha errada → "E-mail ou senha incorretos."
✓ E-mail inexistente → mesma mensagem, e tempo de resposta
  comparável ao caso de senha errada (medir com curl -w "%{time_total}")
✓ 5 falhas seguidas → conta bloqueada, mensagem informa os minutos
✓ Login com sucesso zera failedLoginAttempts e grava lastLoginAt
✓ Usuário SUSPENDED → mensagem específica, não entra
✓ Usuário INVITED → orienta a abrir o link do e-mail
✓ Toda tentativa gera linha em audit_logs
```

### Revogação

```
✓ UPDATE users SET token_version = token_version + 1 WHERE id = '<uuid>'
  → a sessão do usuário cai em até 5 minutos
✓ UPDATE users SET status = 'SUSPENDED' → mesma coisa
```

### Convite

```
✓ Sócio convida → usuário criado com status INVITED
✓ E-mail chega com link válido
✓ Link abre a tela com o e-mail correto pré-preenchido
✓ Definir senha → status vira ACTIVE, login funciona
✓ Mesmo link usado duas vezes → segunda falha com "já foi utilizado"
✓ Link após 7 dias → "expirou"
✓ Reenviar convite invalida o link anterior
✓ Usuário sem permissão user.invite → 403 e linha access.denied em audit_logs
✓ Tentar convidar com roleKey 'owner' → 400
```

### Reset de senha

```
✓ E-mail cadastrado e não cadastrado → resposta idêntica
✓ Link expira em 1 hora
✓ Trocar senha derruba as demais sessões (tokenVersion++)
✓ 4ª tentativa em 15min do mesmo IP → 429
```

### Guard

```
✓ Rota protegida sem sessão → 401
✓ Rota com permission que o papel não tem → 403 + audit
✓ Erro do Prisma não vaza nome de tabela na resposta
✓ passwordHash e tokenHash nunca aparecem em resposta de API
✓ writeAudit redige campos sensíveis automaticamente
```

---

## Fora de escopo

- Google / OAuth (decidido: só e-mail e senha no MVP)
- MFA
- Checagem de escopo `own` vs `all` nas queries — isso é o módulo 3
- Qualquer tela de CRM

---

## Arquivos fornecidos

| Arquivo | Destino |
|---|---|
| `password.js` | `lib/auth/password.js` |
| `tokens.js` | `lib/auth/tokens.js` |
| `guard.js` | `lib/auth/guard.js` |
| `[...nextauth].js` | `pages/api/auth/[...nextauth].js` |
| `invite.js` | `pages/api/users/invite.js` |
| `accept-invite.js` | `pages/api/auth/accept-invite.js` |

Os itens 2.5, 2.8, 2.9 e 2.10 não têm arquivo pronto — implementar a partir
da spec.
