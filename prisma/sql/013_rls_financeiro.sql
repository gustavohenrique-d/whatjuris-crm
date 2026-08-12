-- ===========================================================================
-- WhatJuris CRM — RLS das tabelas do Financeiro
-- prisma/sql/013_rls_financeiro.sql
--
-- Decisão travada 10 (CLAUDE.md): RLS habilitado SEM policy em todas as tabelas.
--     A API REST do Supabase (anon/authenticated) fica bloqueada;
--     o Prisma conecta como dono das tabelas e não é afetado.
--
-- Tabela nova nasce SEM RLS. Sem este arquivo, `charges` e `installments`
-- ficariam expostas à chave anon e o advisor voltaria a acusar
-- rls_disabled_in_public — agora sobre dados financeiros de clientes, bem mais
-- graves que os metadados do 012.
--
-- Rodar logo após a migration 20260812000000_add_financeiro:
--     psql $DATABASE_URL -f prisma/sql/013_rls_financeiro.sql
--
-- Idempotente: ENABLE em tabela que já tem RLS é no-op.
-- ===========================================================================

ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.charges FROM anon, authenticated;
REVOKE ALL ON public.installments FROM anon, authenticated;
