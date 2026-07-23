-- WhatJuris CRM — 002_triggers_and_indexes.sql (Módulo 1, tarefa 1.4)
-- Tudo que o Prisma não gera: extensões, triggers, índices especiais e constraints.
-- Idempotente: pode ser executado mais de uma vez sem erro.
--
-- Aplicar com:
--   npx prisma db execute --file prisma/sql/002_triggers_and_indexes.sql
--   (ou: psql $DATABASE_URL -f prisma/sql/002_triggers_and_indexes.sql)

-- ===========================================================================
-- 1. Extensões
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

-- unaccent() é STABLE e não pode ser usada em índice; wrapper IMMUTABLE
-- com dicionário fixo resolve.
CREATE OR REPLACE FUNCTION public.imm_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- ===========================================================================
-- 2. Ator da requisição (setado pelo guard: SET app.actor_id — módulo 2)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.app_actor_id()
RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v text;
BEGIN
    v := NULLIF(current_setting('app.actor_id', true), '');
    IF v IS NULL THEN
        RETURN NULL;
    END IF;
    BEGIN
        RETURN v::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN NULL;
    END;
END $$;

-- ===========================================================================
-- 3. Trigger: histórico de movimentação de estágio
--    SUBSTITUÍDO pelo Módulo 1B — ver prisma/sql/003_reconciliacao.sql
--    (trigger deals_track_stage, baseado em deals.entered_stage_at).
--    A definição antiga foi removida daqui para que rodar este arquivo
--    novamente não recrie o trigger obsoleto por cima do atual.
-- ===========================================================================

-- ===========================================================================
-- 4. Trigger: sincroniza deals.status com o tipo do estágio
--    Estágio WON → status WON + closed_at; LOST → LOST + closed_at;
--    OPEN → status OPEN e closed_at limpo (reabertura).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.sync_deal_status_from_stage()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_type "StageType";
BEGIN
    SELECT s.type INTO v_type
    FROM public.pipeline_stages s
    WHERE s.id = NEW.stage_id;

    IF v_type = 'WON' THEN
        NEW.status := 'WON'::"DealStatus";
        NEW.closed_at := COALESCE(NEW.closed_at, now());
    ELSIF v_type = 'LOST' THEN
        NEW.status := 'LOST'::"DealStatus";
        NEW.closed_at := COALESCE(NEW.closed_at, now());
    ELSE
        NEW.status := 'OPEN'::"DealStatus";
        NEW.closed_at := NULL;
    END IF;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_deal_status_from_stage ON public.deals;
CREATE TRIGGER sync_deal_status_from_stage
    BEFORE INSERT OR UPDATE OF stage_id ON public.deals
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_deal_status_from_stage();

-- ===========================================================================
-- 5. Imutabilidade de audit_logs (append-only)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.audit_logs_immutable()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs é append-only: operação % não permitida', TG_OP;
END $$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update
    BEFORE UPDATE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_no_delete
    BEFORE DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();

DROP TRIGGER IF EXISTS audit_logs_no_truncate ON public.audit_logs;
CREATE TRIGGER audit_logs_no_truncate
    BEFORE TRUNCATE ON public.audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_immutable();

-- ===========================================================================
-- 6. Organização é singleton — índice único sobre expressão constante
-- ===========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS organization_singleton
    ON public.organization ((true));

-- ===========================================================================
-- 7. Índices GIN — busca textual (trigram, insensível a acento) e JSONB
-- ===========================================================================

CREATE INDEX IF NOT EXISTS contacts_name_trgm_idx
    ON public.contacts USING gin (public.imm_unaccent(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS contacts_email_trgm_idx
    ON public.contacts USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS deals_title_trgm_idx
    ON public.deals USING gin (public.imm_unaccent(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS contacts_custom_fields_gin_idx
    ON public.contacts USING gin (custom_fields jsonb_path_ops);

CREATE INDEX IF NOT EXISTS deals_custom_fields_gin_idx
    ON public.deals USING gin (custom_fields jsonb_path_ops);

CREATE INDEX IF NOT EXISTS audit_logs_metadata_gin_idx
    ON public.audit_logs USING gin (metadata jsonb_path_ops);

-- ===========================================================================
-- 8. Índices parciais — toda listagem filtra deleted_at IS NULL
-- ===========================================================================

CREATE INDEX IF NOT EXISTS contacts_active_idx
    ON public.contacts (created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS deals_active_by_stage_idx
    ON public.deals (pipeline_id, stage_id, position)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS deals_active_owner_idx
    ON public.deals (owner_id)
    WHERE deleted_at IS NULL;

-- ===========================================================================
-- 9. FK composta — o estágio do deal precisa pertencer ao funil do deal
--    (apoiada pelo UNIQUE (id, pipeline_id) em pipeline_stages)
-- ===========================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'deals_stage_in_pipeline_fkey'
    ) THEN
        ALTER TABLE public.deals
            ADD CONSTRAINT deals_stage_in_pipeline_fkey
            FOREIGN KEY (stage_id, pipeline_id)
            REFERENCES public.pipeline_stages (id, pipeline_id);
    END IF;
END $$;

-- ===========================================================================
-- 10. CHECK constraints de sanidade
-- ===========================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_value_nonnegative') THEN
        ALTER TABLE public.deals
            ADD CONSTRAINT deals_value_nonnegative
            CHECK (value IS NULL OR value >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_probability_range') THEN
        ALTER TABLE public.deals
            ADD CONSTRAINT deals_probability_range
            CHECK (probability IS NULL OR (probability >= 0 AND probability <= 100));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_failed_attempts_nonneg') THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_failed_attempts_nonneg
            CHECK (failed_login_attempts >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_token_version_nonneg') THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_token_version_nonneg
            CHECK (token_version >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_stages_position_nonneg') THEN
        ALTER TABLE public.pipeline_stages
            ADD CONSTRAINT pipeline_stages_position_nonneg
            CHECK (position >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deal_stage_history_duration_nonneg') THEN
        ALTER TABLE public.deal_stage_history
            ADD CONSTRAINT deal_stage_history_duration_nonneg
            CHECK (duration_seconds IS NULL OR duration_seconds >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_tokens_expiry_after_creation') THEN
        ALTER TABLE public.auth_tokens
            ADD CONSTRAINT auth_tokens_expiry_after_creation
            CHECK (expires_at > created_at);
    END IF;
END $$;

-- ===========================================================================
-- 11. RLS (Supabase): habilitado sem policy em todas as tabelas.
--     A API REST do Supabase (anon/authenticated) fica bloqueada;
--     o Prisma conecta como dono das tabelas e não é afetado.
-- ===========================================================================

ALTER TABLE public.organization       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_tokens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         ENABLE ROW LEVEL SECURITY;
