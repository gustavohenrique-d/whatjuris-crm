# WhatJuris CRM

CRM jurídico para escritório de advocacia, com triagem automatizada de leads
por agentes de IA integrados ao WhatsApp.

**Cliente:** um escritório (single-tenant). Não construir multi-tenancy.

---

## Stack

| Camada | Tecnologia | Observação |
|---|---|---|
| Framework | Next.js 14 — **Pages Router** | Não migrar para App Router |
| Linguagem | JavaScript (não TypeScript) | `jsconfig.json` com alias `@/*` |
| ORM | Prisma 5.21 | |
| Banco | PostgreSQL 16 | Era MySQL no template — já migrado |
| Auth | NextAuth v4, estratégia JWT | CredentialsProvider apenas |
| Validação | Zod | Todo body de API validado |
| Estado | Redux Toolkit | Já configurado em `shared/redux/` |
| UI | React Bootstrap 5 + SCSS | Do template, reaproveitado |
| Gráficos | ApexCharts / ECharts | Do template |
| Calendário | FullCalendar | Do template |
| Kanban | dragula | Do template |
| Automação | n8n self-hosted | Módulo 8 |
| IA | OpenAI API (GPT-4.1 nano/mini/full) | Módulo 9 |

---

## Base de código

O projeto parte de um template comercial de admin (`CMS-ECOMMERCE`).
O **shell de UI é reaproveitado**; o **domínio de e-commerce foi descartado**.

### Reaproveitar sem reescrever

```
shared/layout-components/     sidebar, header, footer, switcher, pageheader
shared/redux/                 store, action, reducer
styles/                       globals.scss
public/assets/scss/           tema completo
```

### Descartado (não referenciar)

```
models Product, Category, Payment, Coupon, AccessLog
pages/admin/products|coupon|categories|finance
shared/firebase/
shared/services/ProductService.js
```

### Padrão de CRUD a seguir

`pages/admin/products/index.js` do template é o molde de tela de listagem
(tabela + filtro + modal de edição). Copiar a estrutura, trocar o domínio.

---

## Estrutura de diretórios

```
prisma/
  schema.prisma
  migrations/
  seed.js

lib/
  db/prisma.js              cliente Prisma singleton
  auth/password.js          hash, política, backoff
  auth/tokens.js            convite e reset
  auth/guard.js             withAuth, withPublic, writeAudit
  email/send.js             Resend
  validation/               schemas Zod por recurso

pages/
  api/
    auth/[...nextauth].js
    auth/accept-invite.js
    users/
    contacts/
    deals/
    pipelines/
    activities/
  admin/                    telas autenticadas
  login.js
  aceitar-convite.js

shared/
  layout-components/        do template
  redux/                    do template
```

---

## Decisões travadas

Não alterar sem discussão explícita.

1. **PostgreSQL, não MySQL.** Dependemos de `String[]`, JSONB, `gin_trgm_ops`
   e triggers PL/pgSQL.

2. **UUID em todas as PKs.** `Int autoincrement` permite enumerar
   `/deals/1`, `/deals/2` e vaza volume de negócio.

3. **RBAC em tabela, não enum.** `Role` + `Permission` + `RolePermission`.
   Nunca escrever `if (user.role === 'admin')`. Sempre `ctx.can('deal.delete')`.

4. **Escopo `own` vs `all` é permissão, não código.** `deal.read.own` e
   `deal.read.all` são chaves distintas. Usar `ctx.scopeFor('deal', 'read')`
   para montar o filtro da query.

5. **Sessão JWT sem tabela de sessão.** Revogação via `User.tokenVersion`.

6. **Triggers de banco são fonte da verdade** para histórico de estágio e
   sincronização de status. Não duplicar essa lógica na aplicação.

7. **`audit_logs` é append-only.** Garantido por trigger. Nunca tentar
   `UPDATE` ou `DELETE` nessa tabela.

8. **Nomenclatura genérica de CRM no dado, rótulo jurídico na UI.**
   O model é `Deal`; a tela exibe "Caso". O rótulo vem de
   `organization.settings`.

9. **IA vem por último.** `Activity` já aceita `actorType: AI_AGENT`, mas
   nenhum código de agente antes do módulo 9.

10. **RLS habilitado sem policy em todas as tabelas (Supabase).**
    Bloqueia a API REST pública (anon / authenticated). O Prisma conecta
    como dono das tabelas e não é afetado. Consequência: se a aplicação
    algum dia passar a conectar com um role que não seja o owner, todas as
    queries retornam vazio silenciosamente. Ao trocar credencial de banco,
    verificar isso primeiro.

---

## Convenções de código

### API

Todo handler usa o wrapper do guard. Nunca exportar handler cru.

```js
import { withAuth, BadRequest } from '@/lib/auth/guard';

async function handler(req, res, ctx) {
  // ctx = { userId, role, permissions, can(), scopeFor(), ip, userAgent }
}

export default withAuth(handler, {
  methods: ['GET', 'POST'],
  permission: 'deal.read.own',
});
```

Rota pública (login, aceitar convite, reset): `withPublic`.

### Validação

Todo body passa por Zod antes de tocar o Prisma.

```js
const schema = z.object({ title: z.string().trim().min(1).max(200) });
const parsed = schema.safeParse(req.body);
if (!parsed.success) throw BadRequest(parsed.error.issues[0].message);
```

### Erros

Usar as fábricas do guard: `BadRequest`, `Unauthorized`, `Forbidden`,
`NotFound`, `Conflict`. Nunca `res.status(500).json({ error: err.message })` —
mensagem de erro do Prisma expõe nome de tabela e coluna.

### Nomes

- Tabela: `snake_case` plural via `@@map` (`deal_stage_history`)
- Coluna: `snake_case` via `@map` (`created_at`)
- Model e campo Prisma: `camelCase` (`DealStageHistory`, `createdAt`)
- Arquivo: `kebab-case.js`
- Permissão: `recurso.acao[.escopo]`

### Soft delete

`Contact` e `Deal` usam `deletedAt`. Toda query de listagem filtra
`deletedAt: null`. Existe índice parcial para isso.

### Auditoria

Ação que altera dado de negócio chama `writeAudit()`. Campos sensíveis
(`passwordHash`, `tokenHash`) são redigidos automaticamente pelo helper.

---

## Idioma

- Código, nomes de variável e comentário técnico: **português**
- Mensagem para o usuário final: **português**
- Chave de permissão e nome de model: **inglês** (`deal.read.all`, `Contact`)

---

## Comandos

```bash
npm run dev                                    # dev server + sass watch
npx prisma migrate dev --name <descricao>      # criar migration
npx prisma db seed                             # popular permissões e funil
npx prisma studio                              # inspecionar banco
psql $DATABASE_URL -f prisma/sql/<arquivo>.sql # ver "Migrations SQL manuais"
```

---

## Migrations SQL manuais

`prisma/sql/*.sql` guarda tudo que o Prisma não gera: extensões, triggers,
índices parciais, RLS e correções de enum.

**Nenhum deploy executa esses arquivos.** O build do Render é
`prisma generate && next build` — `prisma generate` só regenera o cliente. Nem
os SQL numerados nem `prisma/migrations/` são aplicados automaticamente: todo
schema em produção foi aplicado à mão.

```bash
psql $DATABASE_URL -f prisma/sql/002_triggers_and_indexes.sql
```

**Recriar o banco do zero** exige, nesta ordem: `prisma migrate deploy`, depois
os SQL de 002 a 011 em ordem numérica, depois `npx prisma db seed`. Não existe
`001` — a base é a migration `20260721131411_init`. Todos são idempotentes.

| # | Arquivo | O que faz |
|---|---|---|
| 002 | `triggers_and_indexes` | extensões, triggers, índices especiais, constraints |
| 003 | `reconciliacao` | alinha o schema construído com a spec do Módulo 1 |
| 004 | `alinhamento_chaves` | chaves de `pipelines`/`pipeline_stages` (`captacao`, `novo_contato`) |
| 005 | `limpeza_duplicatas` | remove colunas duplicadas geradas no drift do Módulo 1 |
| 006 | `corrigir_estagios` | garante os 7 estágios do funil `captacao` |
| 007 | `campos_contato` | `whatsapp` e `consent_at` em `contacts` |
| 008 | `actor_contact` | valor `CONTACT` no enum `ActorType` |
| 009 | `agenda` | `HEARING` no `ActivityType` + índice da agenda |
| 010 | `webhook_idempotency_rls` | RLS da tabela de idempotência (decisão 10) |
| 011 | `sync_stage_from_status` | trigger `deals_sync_stage_from_status` (ver abaixo) |

### Triggers de sincronização de deals

São simétricos, e juntos sustentam a decisão 6:

- **002** — `sync_deal_status_from_stage`: mover a etapa deriva o `status`
  (`WON`/`LOST` fecham com `closed_at`; `OPEN` reabre).
- **011** — `deals_sync_stage_from_status`: escrever `status` `LOST`/`WON` sem
  informar etapa move o `stage_id` para a etapa daquele tipo. Sem ele, o deal
  ficava `LOST` numa etapa `OPEN` e aparecia na coluna errada do funil, que
  agrupa por etapa e ignora o status.

A **ordem importa**. Postgres dispara triggers `BEFORE ... FOR EACH ROW` em
ordem alfabética, e o prefixo `deals_` do 011 o coloca antes do
`deals_track_stage` — senão a mudança de etapa que ele faz não entraria em
`deal_stage_history`. Não há recursão: os três são `BEFORE` e só alteram `NEW`,
sem `UPDATE` aninhado. Se `status` e `stage_id` vierem juntos e discordantes, a
etapa vence.

---

## Variáveis de ambiente

```bash
DATABASE_URL=postgresql://user:senha@host:5432/whatjuris
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=            # openssl rand -base64 32
RESEND_API_KEY=
EMAIL_FROM="WhatJuris <nao-responda@dominio.com.br>"

# consumidos apenas pelo seed
OWNER_EMAIL=
OWNER_PASSWORD=
OWNER_NAME=
ORG_NAME=
```

---

## Erros comuns a evitar

- Criar `if (user.role === 'X')` em vez de checar permissão
- Esquecer `deletedAt: null` em query de listagem
- Duplicar na aplicação a lógica que já está em trigger
- Retornar `passwordHash` ou `tokenHash` em resposta de API
- Distinguir "e-mail não existe" de "senha errada" na mensagem de login
- Usar `localStorage` (o ambiente de artifact não suporta; no app real, usar cookie httpOnly)
- Criar tabela nova sem `created_at` / `updated_at`

---

## Roadmap dos módulos

| # | Módulo | Estado |
|---|---|---|
| 1 | Banco de dados | Especificado |
| 2 | Autenticação | Especificado |
| 3 | Permissões | A especificar |
| 4 | Pipeline de vendas | A especificar |
| 5 | Histórico de atividades | A especificar |
| 6 | API | A especificar |
| 7 | Frontend | A especificar |
| 8 | Workflows (n8n) | A especificar |
| 9 | Agentes de IA | A especificar |

Implementar na ordem. Não antecipar módulo posterior.
