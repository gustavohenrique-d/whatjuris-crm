# Módulo 3 — Permissões

> Ler `CLAUDE.md` antes. Requer Módulos 2A e 2B concluídos.
>
> **Todo o código está embutido neste arquivo.** Não há arquivo companheiro.

## Objetivo

Toda query de negócio filtra automaticamente pelo escopo do usuário
(`own` vs `all`) sem espalhar `if` pelos handlers. O sistema de permissões
que existe no banco desde o Módulo 1 passa a ser aplicado nas queries.

## Decisões que não podem mudar

- Filtro de escopo é responsabilidade da camada de query, não do handler.
- `null` de `scopeFor` é acesso negado (Forbidden), não acesso total nem lista vazia.
- Nunca `if (ctx.role === 'owner')` — sempre baseado em permissão.

## Tarefas

- 3.0 — conferir campo de dono (`owner_id` em deals/contacts) e catálogo de permissões
- 3.1 — `lib/query/scope.js` (dealWhere, contactWhere, activityWhere, assert*)
- 3.2 — `pages/api/users/index.js`, `pages/api/users/[id].js`
- 3.3 — `pages/api/roles/index.js`, `pages/api/roles/[id].js`
- 3.4 — `pages/api/organization/index.js`
- 3.5 — `pages/admin/equipe/index.js` (tela mínima de equipe)
- 3.6 — `pages/api/_test_scope.js` (diagnóstico — remover antes de produção)

## Desvios do código da spec para casar com o banco (chaves de permissão reais)

O catálogo criado no seed do Módulo 1 usa chaves diferentes das que o código
da spec assumia:
- `org.read` / `org.update` (spec) → **`organization.read` / `organization.update`** (banco)
- `user.remove` (spec, tela 3.5) → **`user.suspend`** / **`user.delete`** (banco)

Além disso, gating por método adicionado nas rotas de usuário (a spec gateava
tudo só com `user.read`, o que deixaria um assistente deletar usuários):
PATCH exige `user.update`, DELETE exige `user.suspend`.

Ver os critérios de aceite completos no histórico do módulo.

## Fora de escopo
- CRUD de deals e contacts → Módulo 4
- Kanban / pipeline visual → Módulo 4
- Qualquer lógica de IA
