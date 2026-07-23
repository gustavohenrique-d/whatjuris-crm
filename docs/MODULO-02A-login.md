# Módulo 2A — Login e Guard de API

> Ler `CLAUDE.md` antes. Requer Módulos 1 e 1B concluídos.
>
> **Todo o código está embutido neste arquivo.** Não há arquivo companheiro.

## Objetivo

Ao final deste módulo: o sócio faz login com e-mail e senha, a sessão
carrega as permissões do papel, e toda rota de API está protegida.

O convite por e-mail, reset de senha e as demais telas são o Módulo 2B.

---

## Antes de começar — conferir nomes de campo

O Módulo 1 foi construído sem os arquivos de referência, então alguns campos
ficaram com nome diferente do que o código abaixo assume. Rode a query de
`information_schema.columns` e ajuste o código se divergir.

Mapeamentos que o código usa:

| Tabela | Campo esperado no código |
|---|---|
| `users` | `password_hash`, `status`, `token_version`, `failed_login_attempts`, `locked_until`, `last_login_at`, `role_id`, `deleted_at` |
| `audit_logs` | `actor_id`, `action`, `resource`, `resource_id`, `before`, `after`, `ip`, `user_agent` |
| `permissions` | `key` |
| `role_permissions` | `role_id`, `permission_id` |

Se `audit_logs` usa `actor_id` (sem FK) em vez de `user_id`, mantenha
`actor_id` e ajuste o código — **não altere o schema para caber no código.**

---

## Tarefa 2A.0 — Limpar duplicatas do drift

Criar `prisma/sql/005_limpeza_duplicatas.sql` (ver o arquivo no repositório).
Remove `deal_stage_history.moved_by_id`, `deals.custom_fields`,
`contacts.custom_fields`, `users.oab`, e torna `pipelines.key` NOT NULL.

Aplicar e sincronizar:

```bash
npx prisma db execute --file prisma/sql/005_limpeza_duplicatas.sql
npx prisma db pull
npx prisma generate
```

Ajustar `schema.prisma` à mão depois do pull: remover `movedById`,
`customFields`, `oab`, e trocar `key String?` por `key String` em `Pipeline`.

---

## Decisões que não podem mudar

- **Sessão é JWT, sem tabela de sessão.** Revogação via `User.tokenVersion`;
  callback revalida contra o banco a cada 5 minutos.
- **Falha de login tem mensagem única.** "E-mail ou senha incorretos."
- **Tempo de resposta constante.** E-mail inexistente roda `burnTime()`.
- **Bloqueio progressivo:** 5ª falha → 1min, 6ª → 2min, 7ª → 4min, teto 30min.
- **Nunca `if (user.role === 'admin')`.** Sempre `ctx.can('chave')`.

---

## Tarefas

- 2A.1 — `lib/auth/password.js` (hash, verify, burnTime, validatePassword, computeLockUntil, isLocked)
- 2A.2 — `pages/api/auth/[...nextauth].js` (Credentials, JWT, revalidação, auditoria)
- 2A.3 — `lib/auth/guard.js` (withAuth, withPublic, writeAudit, fábricas de erro)
- 2A.4 — `middleware.js` (matcher `/admin/:path*`)
- 2A.5 — `pages/login.js` + SessionProvider em `_app.js`
- 2A.6 — `pages/api/me.js` (rota de teste do guard; remover antes de produção)

O código completo de cada tarefa está na conversa/histórico do módulo e
reproduzido nos próprios arquivos criados.

---

## Critérios de aceite

### Limpeza (2A.0)
- Query de verificação retorna OK nos 4 itens
- `npx prisma migrate status` sem drift
- Rodar o SQL duas vezes não gera erro

### Login
- Credencial correta → redireciona para `/admin/dashboard`
- Senha errada / e-mail inexistente → "E-mail ou senha incorretos." (mesma msg)
- Tempo de resposta dos dois casos comparável (diferença < 100ms)
- 5 falhas seguidas → bloqueia, mensagem informa os minutos
- Sucesso zera `failed_login_attempts` e grava `last_login_at`
- Toda tentativa gera linha em `audit_logs`

### Revogação
- `UPDATE users SET token_version = token_version + 1` → sessão cai em até 5 min
- `UPDATE users SET status = 'SUSPENDED'` → idem

### Guard
- `GET /api/me` sem sessão → 401; com sessão → contexto com `permissionCount > 0`
- `permission` que o papel não tem → 403 + `access.denied` em `audit_logs`
- Erro do Prisma não vaza nome de tabela
- `passwordHash` nunca aparece em resposta de API

### Actor nos triggers
- Mover card via API preenche `deal_stage_history.moved_by` com o uuid logado

---

## Fora de escopo

- Convite, reset de senha e telas correspondentes → **Módulo 2B**
- Google / OAuth / MFA
- Filtro `own` vs `all` → **Módulo 3**
