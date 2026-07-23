# Módulo 6 — Dashboard e Relatórios

> Requer Módulo 5. Métricas agregadas no banco + telas de dashboard/relatórios.

## Objetivo
Dashboard com métricas em tempo real, relatório de funil (tempo por estágio,
conversão) e relatório de performance dos agentes (pré-estruturado p/ módulo 9).

## Arquivos criados
- `pages/api/metrics/summary.js` — 4 cards do topo (leads hoje, qualificados,
  consultas, receita prevista).
- `pages/api/metrics/leads-por-semana.js` — barras (últimas N semanas).
- `pages/api/metrics/leads-por-area.js` — donut por área.
- `pages/api/metrics/tempo-por-estagio.js` — média/mediana do `duration_seconds`.
- `pages/api/metrics/agentes.js` — performance por `actorLabel` (AI_AGENT).
- `pages/api/metrics/conversao.js` — evolução da taxa (últimos N meses).
- `pages/admin/dashboard/index.js` e `relatorios/index.js`.

## Decisões travadas
- **Métricas calculadas no banco** (GROUP BY no Postgres), não na aplicação.
- **Período padrão 30 dias**; `?from=`/`?to=` em ISO 8601.
- **Dados de agente por `actorLabel`** em `activities` (actorType AI_AGENT).

## Desvios/correções da spec
- A permissão `report.read` NÃO existe (só `.own`/`.all`) — gate por OR.
- `prisma.sql` não existe → usar `Prisma.sql`/`Prisma.empty` (import `{ Prisma }`).
- `DealStageHistory` não tem relação `toStage` → resolver o id do estágio
  'qualificado' e filtrar por `toStageId`.
- **Bugs de timezone** (servidor UTC-3): `conversao` mostrava o mês anterior
  (add `timeZone:'UTC'` no `toLocaleDateString`); `leads-por-semana` zerava a
  semana atual (`DATE_TRUNC('week')` do PG é segunda-based/UTC — alinhado o fill).

## Aceite (verificado)
- Todas as 6 rotas com dados reais; telas compilam; gráficos renderizam.
