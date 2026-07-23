# Módulo 7 — Agenda

> Requer Módulo 6. Agenda semanal + integração opcional com Google Calendar.

## Objetivo
Tela de agenda com consultas/audiências/reuniões, API de eventos, e sincronização
push-only opcional com o Google Calendar (OAuth2). O Agente Agendador (mód. 9)
cria eventos via `lib/calendar/create.js`.

## Arquivos criados
- `prisma/sql/009_agenda.sql` — adiciona `HEARING` ao `ActivityType` + índice
  `idx_activities_agenda` (SEM `deleted_at` — a tabela não tem essa coluna).
- `lib/calendar/google.js` — wrapper googleapis (retorna `{skipped:true}` sem
  `GOOGLE_CLIENT_ID`).
- `lib/calendar/create.js` — `createCalendarEvent` (mesmo caminho p/ HTTP e agente).
- `pages/api/agenda/index.js`, `events.js`, `events/[id].js`.
- `pages/api/auth/google.js` e `google/callback.js` — OAuth2 (refresh_token vai
  em `organization.settings.googleRefreshToken`).
- `pages/admin/agenda/index.js` (FullCalendar) e `configuracoes/index.js`.

## Decisões travadas
- **Agenda usa `activities.due_at`, não tabela nova.** Um evento é uma Activity.
- **Google Calendar é opcional** (sem credenciais, as rotas de sync viram no-op).
- **Sincronização é push-only** (envia para o Google, não puxa).
- **Refresh token do escritório vive em `organization.settings`**, não no `.env`.

## Desvios da spec
- Índice sem `deleted_at`; FullCalendar com import estático (padrão do template);
  gate das rotas por `activityWhere`/checagem interna; `googleapis` precisa estar
  instalado mesmo sendo opcional (require no topo do módulo).

## Aceite (verificado)
- Criar/listar/editar/deletar evento; `GET /api/auth/google` sem credenciais → 501
  (rota estática vence o catch-all do NextAuth); HEARING + índice OK.
