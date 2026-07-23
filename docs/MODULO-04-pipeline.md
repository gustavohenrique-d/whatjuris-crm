# Módulo 4 — Pipeline de Leads (Deals e Contacts)

> Requer Módulo 3. CRUD de contatos e negócios + Kanban do funil.

## Objetivo
CRUD completo de contatos e negócios, movimentação de card no funil com
histórico de tempo gravado por trigger, e estágios corretos para os agentes.

## Arquivos criados
- `prisma/sql/006_corrigir_estagios.sql` — adiciona `probability`/`stalled_after_hours`
  a `pipeline_stages` e refaz os 7 estágios: `novo_contato → em_triagem →
  aguardando_docs → qualificado → consulta_agendada → contratado → descartado`.
- `prisma/sql/007_campos_contato.sql` — adiciona `whatsapp` e `consent_at` a `contacts`.
- `pages/api/contacts/index.js` e `[id].js` — lista/cria e lê/edita/soft-delete.
- `pages/api/deals/index.js` e `[id].js` — idem para negócios.
- `pages/api/deals/[id]/move.js` — mover card no kanban (rota mais sensível).
- `pages/api/pipelines/index.js` — funis + estágios + contagem por escopo.
- `pages/admin/pipeline/index.js` — kanban com dragula.
- `pages/admin/leads/novo.js` — criar lead (cria Contact + Deal).

## Decisões travadas
- **Mover card usa `$transaction` com `set_config('app.actor_id', …, true)`**
  (transaction-local). Sem isso o valor vazaria entre conexões do pool e o
  trigger gravaria `moved_by` errado.
- **FK composta `(stage_id, pipeline_id)`** garante no banco que um deal nunca
  vai para estágio de outro funil — a aplicação não precisa checar.
- **Soft delete** em deals e contacts (`deletedAt`), preservando o histórico.
- **`ownerId` default = usuário logado** ao criar deal (para `deal.read.own`).

## Desvios da spec (schema real)
- A spec assumia colunas `probability`/`stalled_after_hours` (stages) e
  `whatsapp`/`consent_at` (contacts) que não existiam — foram adicionadas.

## Aceite (verificado)
- 7 estágios com as chaves corretas; criar contato/deal; busca; mover card →
  trigger grava `moved_by`+`duration_seconds`; mover p/ estágio de outro funil → 400;
  soft-delete some da listagem; `_count` por escopo do usuário.
