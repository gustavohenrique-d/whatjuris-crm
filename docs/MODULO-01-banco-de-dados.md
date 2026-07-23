# Módulo 1 — Banco de Dados

> Ler `CLAUDE.md` antes. As decisões travadas de lá valem aqui.

## Objetivo

Substituir o schema de e-commerce do template por um schema de CRM jurídico
single-tenant, com RBAC, funil configurável e trilha de auditoria.

Ao final deste módulo o banco existe, está populado com permissões e funil
padrão, e um usuário sócio consegue ser criado. Nenhuma tela ainda.

---

## Tarefas

### 1.1 — Migrar o provider para PostgreSQL

O template usa MySQL. Trocar em `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Atualizar `.env` e `.env.example` com a nova `DATABASE_URL`.

Apagar `prisma/migrations/` inteiro — as migrations antigas são de MySQL e
de um domínio descartado.

### 1.2 — Substituir o schema

Substituir o conteúdo de `prisma/schema.prisma` pelo arquivo `schema.prisma`
fornecido junto com esta spec.

Os models antigos (`Product`, `Category`, `Payment`, `Coupon`, `AccessLog`,
`User` do template) desaparecem por completo. Não tentar migrar dado.

Modelos que devem existir ao final:

```
Organization      configuração do escritório (registro único)
User              identidade + contexto jurídico (OAB, áreas)
AuthToken         convite e reset de senha
Role              papéis (owner, lawyer, assistant, intern)
Permission        catálogo de permissões
RolePermission    junção
Contact           lead / cliente
Pipeline          funil
PipelineStage     estágio do funil
Deal              negócio / caso
DealStageHistory  movimentação entre estágios
Activity          timeline de negócio
CustomField       campos definidos pelo escritório
AuditLog          trilha de compliance (append-only)
```

### 1.3 — Criar a migration inicial

```bash
npx prisma migrate dev --name init
```

### 1.4 — Aplicar triggers, índices e constraints

Criar `prisma/sql/002_triggers_and_indexes.sql` com o conteúdo do arquivo
fornecido, e aplicar:

```bash
psql $DATABASE_URL -f prisma/sql/002_triggers_and_indexes.sql
```

O Prisma não gera nada disso. O arquivo contém:

- Extensões `pgcrypto`, `pg_trgm`, `unaccent`
- Trigger `track_deal_stage_change` — grava histórico ao mover card
- Trigger `sync_deal_status_from_stage` — sincroniza `status` com o tipo do estágio
- Triggers de imutabilidade em `audit_logs`
- Índice único que garante registro único em `organization`
- Índices GIN de busca textual e JSONB
- Índices parciais para `deletedAt IS NULL`
- FK composta garantindo que o estágio do deal pertence ao funil dele
- CHECK constraints de sanidade

### 1.5 — Ajustar o cliente Prisma

Mover `pages/api/server/db/prisma.js` para `lib/db/prisma.js`.

Ajustar para não logar `query` em produção:

```js
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}
```

Atualizar todos os imports que apontavam para o caminho antigo.

### 1.6 — Seed

Criar `prisma/seed.js` com o conteúdo do arquivo fornecido.

Registrar no `package.json`:

```json
"prisma": {
  "seed": "node prisma/seed.js"
}
```

Executar:

```bash
OWNER_EMAIL=socio@escritorio.com.br \
OWNER_PASSWORD='senha-forte-aqui' \
OWNER_NAME='Nome do Sócio' \
ORG_NAME='Nome do Escritório' \
npx prisma db seed
```

O seed cria:

- 36 permissões
- 5 papéis (owner, senior_lawyer, lawyer, assistant, intern)
- 1 registro de `Organization`
- 1 funil "Captação de Clientes" com 7 estágios
- 1 usuário com papel `owner`

### 1.7 — Instalar dependências novas

```bash
npm i zod
npm i -D prisma-dbml-generator
```

`bcrypt` já está no template.

---

## Critérios de aceite

Todos devem passar antes de fechar o módulo.

```bash
# 1. Schema válido
npx prisma validate

# 2. Migration aplicada sem drift
npx prisma migrate status

# 3. Seed idempotente — rodar duas vezes não duplica nada
npx prisma db seed && npx prisma db seed
```

```sql
-- 4. Permissões e papéis criados
SELECT COUNT(*) FROM permissions;              -- 36
SELECT key, name FROM roles ORDER BY key;      -- 5 linhas

-- 5. Funil com 7 estágios na ordem certa
SELECT position, key, name, type FROM pipeline_stages ORDER BY position;

-- 6. Organização é singleton — este INSERT deve FALHAR
INSERT INTO organization (id, name, created_at, updated_at)
VALUES (gen_random_uuid(), 'Segundo Escritório', now(), now());

-- 7. Auditoria é imutável — ambos devem FALHAR
UPDATE audit_logs SET action = 'x';
DELETE FROM audit_logs;

-- 8. Trigger de histórico funciona
--    Criar um contato, um deal, mover de estágio e conferir:
SELECT from_stage_id, to_stage_id, duration_seconds
FROM deal_stage_history;                        -- 1 linha

-- 9. Trigger de status funciona
--    Mover um deal para o estágio 'contratado' (type = WON) e conferir:
SELECT status, closed_at FROM deals WHERE id = '<uuid>';
                                                -- status = WON, closed_at preenchido

-- 10. FK composta impede estágio de outro funil
--     Tentar gravar um deal com stage_id de funil diferente deve FALHAR
```

---

## Fora de escopo

Não implementar neste módulo:

- Qualquer rota de API
- Qualquer tela
- Autenticação (módulo 2)
- Lógica de permissão em runtime (módulo 3)

---

## Arquivos fornecidos

| Arquivo | Destino |
|---|---|
| `schema.prisma` | `prisma/schema.prisma` |
| `002_triggers_and_indexes.sql` | `prisma/sql/002_triggers_and_indexes.sql` |
| `seed.js` | `prisma/seed.js` |
