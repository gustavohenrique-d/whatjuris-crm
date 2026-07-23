# Módulo 5 — Histórico de Atividades

> Requer Módulo 4. Timeline de cada deal e tela de detalhe.

## Objetivo
Timeline cronológica de cada deal (notas, mensagens, mudanças de estágio,
ações de IA), tela de detalhe do deal, e API para registrar/listar atividades.

## Arquivos criados
- `prisma/sql/008_actor_contact.sql` — adiciona `CONTACT` ao enum `ActorType`.
- `lib/activities/record.js` — `recordActivity`, `recordAiAction`,
  `recordWhatsappMessage` (aceitam `tx` para uso em transação).
- `pages/api/deals/[id]/activities.js` e `contacts/[id]/activities.js` — GET/POST.
- `pages/api/activities/[id].js` — editar/deletar (só NOTE).
- `pages/admin/deals/[id].js` — ficha do lead + timeline + modal mover + wa.me.
- `pages/api/deals/[id]/move.js` — atualizado para gravar `STAGE_CHANGE` na
  timeline via `recordActivity` dentro da transação.

## Decisões travadas
- **`occurredAt` ≠ `createdAt`.** A timeline ordena por `occurredAt` (quando o
  fato aconteceu), não `createdAt` (quando foi gravado).
- **Atividades de IA usam `actorLabel`, não FK.** O agente não é linha em `users`.
- **STAGE_CHANGE é evento de negócio na timeline**; o trigger grava o histórico
  técnico em `deal_stage_history`. Os dois coexistem sem duplicar.
- **Só `NOTE` é editável/removível**; MESSAGE/STAGE_CHANGE/AI_ACTION são imutáveis.

## Desvios da spec
- Campo do ator é `userId` (não `actorId`); `content` (não `body`).
- Enum `ActorType` não tinha `CONTACT` (autor de mensagem recebida no WhatsApp) —
  adicionado, senão o helper `recordWhatsappMessage` nasceria quebrado.
- **Gate corrigido**: a spec gateava com `activity.read.own`, o que barraria o
  assistente (tem `activity.read.all`, não `.own`). Passou a aceitar own OU all.

## Aceite (verificado)
- Nota no deal/contato; ordenação por occurredAt; STAGE_CHANGE automático no
  move; PATCH nota; DELETE de STAGE_CHANGE → 403; DELETE nota → 200 + audit.
