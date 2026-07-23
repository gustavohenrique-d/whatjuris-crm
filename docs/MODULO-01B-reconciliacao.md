# Módulo 1B — Reconciliação do Banco

> Ler `CLAUDE.md` antes. Requer o Módulo 1 concluído.
>
> **Todo o SQL está embutido neste arquivo.** Não há arquivo companheiro —
> foi a ausência deles que gerou o drift corrigido aqui.

## Contexto

O Módulo 1 foi implementado a partir da spec, sem os arquivos de referência.
O resultado ficou funcional, mas divergiu em pontos que quebram os módulos
4, 5, 7 e 9. Esta tarefa alinha o schema sem desfazer o que ficou bom.

### Preservar (ficou melhor que a spec original)

- `Deal.position` — ordenação do card dentro do estágio no Kanban
- `CustomFieldEntity` como enum em vez de string
- RLS habilitado sem policy nas tabelas do Supabase

### Corrigir

| Item | Situação | Impacto |
|---|---|---|
| `Organization` sem `business_hours` / `legal_areas` | só `name` + `settings` | Agente Agendador (mód. 9) não sabe o expediente |
| `ActivityType` com 5 valores | falta `MESSAGE_IN` / `MESSAGE_OUT` | Timeline do WhatsApp sem direção de mensagem |
| `Activity.actor_label` ausente | — | Impossível exibir "Agente Classificador" na timeline |
| `AuditLog` sem `before` / `after` | só `metadata` | Trilha registra *que* mudou, não *o que* mudou |
| `Deal.legal_area` ausente | — | Roteamento por área jurídica (mód. 4) |
| `Deal.entered_stage_at` ausente | — | Trigger não calcula tempo parado por estágio |
| `User.legal_areas` / `notify_whatsapp` | — | Não há como descobrir qual advogado recebe o lead |

---

## Tarefa 1B.1 — Aplicar a reconciliação

Criar `prisma/sql/003_reconciliacao.sql` com o conteúdo SQL da spec
(ver o próprio arquivo `prisma/sql/003_reconciliacao.sql` no repositório).

Aplicar:

```bash
npx prisma db execute --file prisma/sql/003_reconciliacao.sql
```

---

## Tarefa 1B.2 — Sincronizar o Prisma

```bash
npx prisma db pull
npx prisma generate
```

Depois do `db pull`, revisar `prisma/schema.prisma` e ajustar o que o
introspect não acerta sozinho:

- Nomes de relação (`@relation("ContactOwner")`, `@relation("DealOwner")`)
- Campos `@map` que o introspect pode ter renomeado
- Manter os comentários de decisão que já existiam no arquivo

Confirmar que não há drift:

```bash
npx prisma migrate status
```

---

## Tarefa 1B.3 — Atualizar o seed

O seed atual popula `Organization` só com `name`. Ajustar para incluir
`botDisplayName`, `timezone`, `legalAreas` e `businessHours` (expediente
padrão seg–sex 09:00–18:00). Manter a idempotência: se já existir registro
em `organization`, não criar outro (há índice único garantindo isso).

---

## Tarefa 1B.4 — Registrar a decisão do RLS no CLAUDE.md

Adicionar na seção "Decisões travadas":

```
10. RLS habilitado sem policy em todas as tabelas (Supabase).
    Bloqueia a API REST pública (anon / authenticated). O Prisma conecta
    como dono das tabelas e não é afetado. Consequência: se a aplicação
    algum dia passar a conectar com um role que não seja o owner, todas as
    queries retornam vazio silenciosamente. Ao trocar credencial de banco,
    verificar isso primeiro.
```

---

## Critérios de aceite

1. Query de verificação de colunas/enums/trigger/índice — todas as linhas `OK`
   (ver spec original; executada em 2026-07-21, 15/15 OK).
2. Teste funcional do trigger: mover deal de `novo_contato` para `em_triagem`
   grava 1 linha em `deal_stage_history` com `duration_seconds >= 2`.
3. Idempotência: `003_reconciliacao.sql` roda duas vezes sem erro.

---

## Fora de escopo

- Alterar `ContactType` (`LEAD | CLIENT`). Fica como está; a distinção é
  defensável e mudar agora custa mais do que rende.
- Qualquer rota de API ou tela.
- Lógica de escopo `own` vs `all` — isso é o Módulo 3.
