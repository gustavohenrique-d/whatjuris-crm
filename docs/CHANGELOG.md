# CHANGELOG — WhatJuris CRM

Registro por módulo do que foi entregue e das **decisões e desvios** tomados
durante a implementação. O "porquê" fica aqui; o "o quê" detalhado está em cada
`docs/MODULO-XX.md`. Ordem cronológica de construção.

O projeto partiu de um template comercial de admin de e-commerce (`CMS-ECOMMERCE`).
O **shell de UI foi reaproveitado**; o **domínio de e-commerce foi descartado** e
substituído por um CRM jurídico single-tenant (Next.js Pages Router, JavaScript,
Prisma, PostgreSQL/Supabase, NextAuth JWT).

---

## Módulo 1 + 1B — Banco de dados
- Provider MySQL → **PostgreSQL**; schema de e-commerce substituído por 14 models
  (Organization, User, AuthToken, Role, Permission, RolePermission, Contact,
  Pipeline, PipelineStage, Deal, DealStageHistory, Activity, CustomField, AuditLog).
- **UUID em todas as PKs** (evita enumeração de `/deals/1`).
- **RBAC em tabela** (Role + Permission + RolePermission), nunca `if role==='x'`.
- **Escopo `own` vs `all` é permissão**, não código.
- Triggers PL/pgSQL como fonte da verdade: histórico de estágio e sync de status.
- `audit_logs` **append-only** (imutável por trigger).
- Seed: 36 permissões, 5 papéis, funil "Captação", usuário owner.
- **1B (reconciliação):** o Módulo 1 foi feito sem os arquivos de referência e
  divergiu; 1B alinhou o schema (campos de organization/user/deal/activity,
  enum values, trigger `deals_track_stage` baseado em `entered_stage_at`) e
  renomeou estágios/chaves. **Achado:** trigger duplicado (AFTER + BEFORE UPDATE)
  gravaria histórico em dobro — corrigido com DROP do antigo.
- **Decisão 10 (RLS):** RLS habilitado sem policy em todas as tabelas — bloqueia a
  API REST pública do Supabase; o Prisma conecta como dono e não é afetado.

## Módulo 2A/2B — Autenticação, convite, reset
- Login e-mail/senha (NextAuth JWT, sem tabela de sessão; revogação via
  `tokenVersion`). Mensagem de falha única; `burnTime()` p/ tempo constante;
  bloqueio progressivo (5ª falha→1min … teto 30min).
- Convite e reset por token SHA-256 (o token cru só existe no link; reenvio
  invalida o anterior; aceite/reset em transação; reset faz `tokenVersion++`).
- **Desvio:** `auth_tokens` usa `used_at` (não `consumed_at`) e `user_id` (não
  `role_id`/`created_by`) — código ajustado ao banco.
- **Nuance:** sem `RESEND_API_KEY`, o e-mail é logado no console e `emailSent:true`
  (o `fallbackLink` só aparece se o envio lançar erro real).
- **Risco anotado (resolvido no mód. 4):** `app.actor_id` via pool de conexões.

## Módulo 3 — Permissões
- `lib/query/scope.js` traduz `ctx.scopeFor()` em `WHERE` do Prisma (dealWhere,
  contactWhere, activityWhere, assert*). `null` de scopeFor = Forbidden.
- Rotas de usuários, papéis e organização + tela de equipe.
- **Correções de segurança:** chaves reais são `organization.read/.update` e
  `user.suspend/.delete` (spec usava `org.*`/`user.remove`). Gate por método
  adicionado (a spec deixava um assistente deletar usuários): PATCH users→
  `user.update`, DELETE→`user.suspend`, PATCH roles→`role.manage`.
- **Política em aberto:** intern com `deal.read.own` (mantido, mais conservador)
  vs `.all` que a spec assumia.

## Módulo 4 — Pipeline (deals/contacts + Kanban)
- Ver `MODULO-04-pipeline.md`. **Risco do pool RESOLVIDO E TESTADO:** move.js usa
  `$transaction` + `set_config(app.actor_id, …, true)` → trigger grava `moved_by`
  correto. Colunas `probability`/`stalled_after_hours` e `whatsapp`/`consent_at`
  adicionadas (não existiam).
- **Armadilha aprendida:** ao mudar schema, reiniciar o dev server (o cliente
  Prisma fica em memória; hot-reload não recarrega node_modules).

## Módulo 5 — Timeline de atividades
- Ver `MODULO-05-atividades.md`. `occurredAt` ordena a timeline; `actorLabel` sem
  FK; STAGE_CHANGE (negócio) coexiste com deal_stage_history (técnico). Enum
  `CONTACT` adicionado. Gate de atividade corrigido (own OU all).

## Módulo 6 — Dashboard e Relatórios
- Ver `MODULO-06-dashboard-relatorios.md`. Correções: `report.read` não existe
  (gate por OR); `prisma.sql`→`Prisma.sql`; `toStage` inexistente (resolver id);
  **dois bugs de timezone** (servidor UTC-3) no mês e na semana.

## Módulo 7 — Agenda
- Ver `MODULO-07-agenda.md`. Agenda = `activities.due_at`; Google opcional;
  `HEARING` adicionado; rota estática OAuth vence o catch-all do NextAuth.

## Módulo 8 — n8n + WhatsApp
- Ver `MODULO-08-n8n-whatsapp.md`. **Bugs corrigidos:** HMAC deve usar o App
  Secret (não o access token); `move_stage`/`qualify_lead` gravavam/vazavam
  `app.actor_id` — limpo na transação (`moved_by=NULL`, `moved_by_ai=true`).

## Módulo 9 — Agentes de IA
- Ver `MODULO-09-agentes-ia.md`. OpenAI GPT-4.1 (nano/mini/full por agente);
  contexto reconstruído do banco (`get_history`). Sem `OPENAI_API_KEY`, run-agent
  → 502 (pipeline provada até o callOpenAI).

## Módulo 10 + 10B — Migração de design
- Ver `MODULO-10-design.md` e `MODULO-10B-design-restante.md`.
- **Bug crítico:** `<Head>` com filhos no `_document.js` quebrava a hidratação
  (setState não atualizava o DOM). Fix: `<Head />` + fonte via `@import`.
- Acessórios: `Cache-Control: no-store` no guard (evita 304 com corpo vazio);
  `reactStrictMode:false`; `NEXTAUTH_URL` :3000→:3100; `DATABASE_URL` → pooler
  Supabase (o host direto parou de resolver por DNS).

## Módulo 10C — Drawer de detalhe do lead
- Ver `MODULO-10C-drawer.md`. Painel deslizante global (Context + `<DealDrawer/>`
  no `contentlayout`) aberto por `openDeal(id)` no Kanban e em Conversas. Ficha +
  timeline, mover estágio, nova nota. Move dispara `whatjuris:deal-moved` e o
  Kanban recarrega.
- **Decisão UX:** em Conversas o clique da lista continua abrindo o chat; o drawer
  vem por um botão "Ver ficha" no cabeçalho (não sequestra o clique).
- **Correção da spec:** faltava a tag `<a>` de abertura no botão "Abrir no
  WhatsApp" — corrigida.
- Verificado com dados reais: deal/activities/pipelines retornam 200; página
  autenticada 200 (o `useDealDrawer()` resolve → provider cobre a árvore).

---

## Débitos e pendências
Ver `docs/BACKLOG.md`. Destaques: remover rotas de diagnóstico (`pages/api/me.js`,
`pages/api/_test_scope.js`) antes de produção; preencher `OPENAI_API_KEY`,
credenciais Meta e `N8N_API_KEY` para ativar IA/WhatsApp; conectividade Supabase
intermitente nesta rede; decidir escopo de leitura do intern.
