# WhatJuris CRM

CRM jurídico para escritório de advocacia, com triagem automatizada de leads por
agentes de IA integrados ao WhatsApp. Single-tenant (um escritório).

Construído sobre um template comercial de admin (`CMS-ECOMMERCE`): o **shell de
UI foi reaproveitado** e o **domínio de e-commerce foi descartado**.

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 14 — **Pages Router** (não migrar para App Router) |
| Linguagem | JavaScript (alias `@/*` em `jsconfig.json`) |
| ORM | Prisma 5 |
| Banco | PostgreSQL (Supabase) |
| Auth | NextAuth v4, JWT, CredentialsProvider |
| Validação | Zod |
| UI | React Bootstrap 5 (shell) + design dark próprio (`styles/whatjuris-*`) |
| Automação | n8n (self-hosted) — módulo 8 |
| IA | OpenAI GPT-4.1 nano/mini/full — módulo 9 |
| E-mail | Resend |
| Calendário | FullCalendar + Google Calendar (opcional) |

## Como rodar

```bash
npm install
cp .env.example .env      # preencher as variáveis (ver abaixo)
npx prisma generate
npx prisma db seed        # popula permissões, papéis, funil e usuário owner
npm run dev               # dev server + sass watch (porta padrão do template: 3000)
```

> **Nota:** durante o desenvolvimento o servidor foi rodado em `-p 3100`. Se usar
> outra porta, ajuste `NEXTAUTH_URL` no `.env` para a mesma porta (senão o
> `callbackUrl` do login aponta para a porta errada).

Migrations manuais (triggers, índices, ajustes) ficam em `prisma/sql/` e são
aplicadas com `npx prisma db execute --file prisma/sql/00X_*.sql` (idempotentes).

## Variáveis de ambiente

Ver `.env.example`. Principais:

```bash
DATABASE_URL=            # Postgres/Supabase — usar o POOLER (porta 6543, ?pgbouncer=true)
NEXTAUTH_URL=            # deve casar com a porta do dev server
NEXTAUTH_SECRET=         # openssl rand -base64 32
RESEND_API_KEY=          # e-mail (opcional em dev — link vai ao console)
EMAIL_FROM=

# Google Calendar (opcional)
GOOGLE_CLIENT_ID=  GOOGLE_CLIENT_SECRET=  GOOGLE_REDIRECT_URI=

# WhatsApp (Meta) — módulo 8/9
WHATSAPP_PHONE_NUMBER_ID=  WHATSAPP_ACCESS_TOKEN=  WHATSAPP_APP_SECRET=  WHATSAPP_VERIFY_TOKEN=

# n8n e webhook interno
N8N_BASE_URL=  N8N_API_KEY=  WEBHOOK_SECRET=

# IA — módulo 9
OPENAI_API_KEY=

# Seed (consumidos só pelo prisma db seed)
OWNER_EMAIL=  OWNER_PASSWORD=  OWNER_NAME=  ORG_NAME=
```

## Comandos

```bash
npm run dev              # servidor de desenvolvimento
npm run build            # prisma generate + next build
npm run setup:n8n        # cria o workflow de recepção no n8n
npm run setup:n8n-agents # cria o workflow dos 8 agentes de IA
npx prisma db seed       # popular/atualizar permissões, papéis e funil (idempotente)
npx prisma studio        # inspecionar o banco
```

## Estrutura

```
prisma/            schema.prisma, seed.js, sql/ (migrations manuais)
lib/               db/, auth/, email/, query/scope.js, activities/, calendar/,
                   whatsapp/, n8n/, ai/
pages/api/         auth/, users/, contacts/, deals/, pipelines/, activities/,
                   agenda/, metrics/, webhooks/, internal/
pages/admin/       telas autenticadas (dashboard, pipeline, conversas, clientes,
                   processos, agenda, financeiro, relatorios, configuracoes, ...)
shared/            layout-components/ (sidebar, layout), components/wj/ (design),
                   redux/, data/
styles/            globals.scss (template), whatjuris-tokens.css, whatjuris-base.css
docs/              specs por módulo, CHANGELOG.md, BACKLOG.md
```

## Documentação

- **`CLAUDE.md`** — decisões travadas e convenções (ler antes de mexer).
- **`docs/CHANGELOG.md`** — o que cada módulo entregou e por quê (decisões/desvios).
- **`docs/MODULO-XX.md`** — spec de cada módulo (1 a 10B).
- **`docs/BACKLOG.md`** — pendências, débitos técnicos e itens de produção.

## Roadmap (todos implementados)

1. Banco de dados · 2. Autenticação · 3. Permissões · 4. Pipeline/Kanban ·
5. Timeline de atividades · 6. Dashboard e relatórios · 7. Agenda ·
8. Workflows n8n + WhatsApp · 9. Agentes de IA · 10/10B. Migração de design.

## Antes de ir a produção

- Remover as rotas de diagnóstico: `pages/api/me.js` e `pages/api/_test_scope.js`.
- Preencher `OPENAI_API_KEY`, credenciais da Meta (incl. `WHATSAPP_APP_SECRET`) e
  `N8N_API_KEY`; rodar `setup:n8n` e `setup:n8n-agents`.
- Trocar a senha placeholder do usuário owner.
- Ver `docs/BACKLOG.md` para a lista completa.
