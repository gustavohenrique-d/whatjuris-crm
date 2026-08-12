-- ===========================================================================
-- WhatJuris CRM — RLS da tabela de controle de migrations do Prisma
-- prisma/sql/012_rls_prisma_migrations.sql
--
-- Decisão travada 10 (CLAUDE.md): RLS habilitado SEM policy em todas as tabelas.
--     A API REST do Supabase (anon/authenticated) fica bloqueada;
--     o Prisma conecta como dono das tabelas e não é afetado.
--
-- `_prisma_migrations` era a ÚNICA tabela do schema public fora dessa regra —
-- o Prisma a cria por conta própria, fora do nosso controle, e ela nasce sem
-- RLS. O advisor do Supabase acusava rls_disabled_in_public (nível ERROR).
--
-- Não guarda dado de cliente (só nome da migration, timestamp e contagem de
-- passos), mas anon/authenticated tinham DML completo sobre ela — inclusive
-- TRUNCATE. Apagar essas linhas faria o Prisma considerar as migrations não
-- aplicadas, e um `migrate deploy` seguinte tentaria recriar tabelas
-- existentes.
--
-- O REVOKE é defesa em profundidade: o RLS já basta para bloquear, mas não há
-- razão para esses roles terem qualquer grant numa tabela de sistema.
--
-- Idempotente: ENABLE em tabela que já tem RLS é no-op; REVOKE de privilégio
-- inexistente também.
--
-- Rodar: psql $DATABASE_URL -f prisma/sql/012_rls_prisma_migrations.sql
-- ===========================================================================

ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public._prisma_migrations FROM anon, authenticated;
