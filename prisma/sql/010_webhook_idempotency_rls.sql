-- ===========================================================================
-- WhatJuris CRM — RLS da tabela de idempotência do webhook
-- prisma/sql/010_webhook_idempotency_rls.sql
--
-- Decisão travada 10 (CLAUDE.md): RLS habilitado SEM policy em todas as tabelas.
--     A API REST do Supabase (anon/authenticated) fica bloqueada;
--     o Prisma conecta como dono das tabelas e não é afetado.
--
-- Rodar após aplicar a migration add_webhook_idempotency:
--     psql $DATABASE_URL -f prisma/sql/010_webhook_idempotency_rls.sql
-- ===========================================================================

ALTER TABLE public.webhook_idempotency ENABLE ROW LEVEL SECURITY;
