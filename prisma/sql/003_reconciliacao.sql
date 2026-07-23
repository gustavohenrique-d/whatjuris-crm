-- =============================================================================
-- WhatJuris CRM — 003_reconciliacao.sql
-- Alinha o schema construído com a spec do Módulo 1.
-- Idempotente: seguro rodar múltiplas vezes.
-- =============================================================================


-- PARTE 1 — ORGANIZATION ------------------------------------------------------
-- O agente Agendador consulta o expediente em runtime. Manter isso em .env
-- obrigaria deploy a cada mudança de horário do escritório.

ALTER TABLE organization ADD COLUMN IF NOT EXISTS legal_name       text;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS document         text;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS oab_number       text;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS logo_url         text;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS timezone         text   NOT NULL DEFAULT 'America/Sao_Paulo';
ALTER TABLE organization ADD COLUMN IF NOT EXISTS bot_display_name text;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS business_hours   jsonb  NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS legal_areas      text[] NOT NULL DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN organization.business_hours IS
  'Expediente por dia. Formato: {"mon":["09:00","18:00"],"sat":null}.
   Consumido pelo agente Agendador para propor horários válidos.';

COMMENT ON COLUMN organization.bot_display_name IS
  'Nome com que os agentes de IA se apresentam no WhatsApp.';

UPDATE organization SET business_hours = '{
  "mon":["09:00","18:00"],
  "tue":["09:00","18:00"],
  "wed":["09:00","18:00"],
  "thu":["09:00","18:00"],
  "fri":["09:00","18:00"],
  "sat":null,
  "sun":null}'::jsonb
WHERE business_hours = '{}'::jsonb;

UPDATE organization SET legal_areas = ARRAY['trabalhista','civel','familia','previdenciario']
WHERE cardinality(legal_areas) = 0;

UPDATE organization SET bot_display_name = 'Assistente Virtual'
WHERE bot_display_name IS NULL;


-- PARTE 2 — USER --------------------------------------------------------------
-- legal_areas alimenta o roteamento: lead trabalhista qualificado precisa
-- descobrir quais advogados atendem trabalhista.

ALTER TABLE users ADD COLUMN IF NOT EXISTS oab_number        text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oab_state         varchar(2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_areas       text[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_whatsapp   text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url        text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone             text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at        timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

COMMENT ON COLUMN users.notify_whatsapp IS
  'WhatsApp pessoal que recebe a ficha do lead qualificado (módulo 9).';

CREATE INDEX IF NOT EXISTS idx_users_legal_areas ON users USING gin (legal_areas);


-- PARTE 3 — DEAL --------------------------------------------------------------
-- entered_stage_at é o que permite ao trigger medir o tempo parado em cada
-- etapa. Sem ele o relatório de funil perde o dado mais importante.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS legal_area       text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS priority         integer     NOT NULL DEFAULT 0;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS entered_stage_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE deals ADD COLUMN IF NOT EXISTS currency         varchar(3)  NOT NULL DEFAULT 'BRL';
ALTER TABLE deals ADD COLUMN IF NOT EXISTS custom_data      jsonb       NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_priority_range') THEN
    ALTER TABLE deals ADD CONSTRAINT deals_priority_range
      CHECK (priority BETWEEN 0 AND 2);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_deals_legal_area ON deals (legal_area);


-- PARTE 4 — ACTIVITY ----------------------------------------------------------
-- Sem MESSAGE_IN / MESSAGE_OUT a timeline do WhatsApp vira lista de textos
-- sem autor. actor_label guarda "Agente Classificador" sem exigir FK —
-- agente de IA não é linha na tabela users.

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'MESSAGE_IN';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'MESSAGE_OUT';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CALL';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'EMAIL';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'FILE_UPLOAD';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'STAGE_CHANGE';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'ASSIGNMENT';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'AI_ACTION';

ALTER TABLE activities ADD COLUMN IF NOT EXISTS actor_label text;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN activities.actor_label IS
  'Nome exibido do ator quando não é usuário — ex.: "Agente Classificador".';

UPDATE activities SET occurred_at = created_at WHERE occurred_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_activities_occurred
  ON activities (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_deal_occurred
  ON activities (deal_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_pending
  ON activities (due_at) WHERE completed_at IS NULL AND due_at IS NOT NULL;


-- PARTE 5 — AUDIT LOG ---------------------------------------------------------
-- "Usuário X alterou o negócio Y" não serve em questionamento sobre sigilo
-- profissional. É preciso saber o estado antes e depois.

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "before" jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "after"  jsonb;

COMMENT ON COLUMN audit_logs."before" IS
  'Snapshot antes da alteração. Campos sensíveis (passwordHash, tokenHash)
   devem ser redigidos pela aplicação antes de gravar.';


-- PARTE 6 — TRIGGER DE HISTÓRICO ----------------------------------------------
-- Recriado para usar entered_stage_at, que agora existe.

ALTER TABLE deal_stage_history ADD COLUMN IF NOT EXISTS moved_by    uuid;
ALTER TABLE deal_stage_history ADD COLUMN IF NOT EXISTS moved_by_ai boolean NOT NULL DEFAULT false;

-- O Módulo 1 criou este trigger com outro nome (AFTER UPDATE, mesma função).
-- Precisa cair antes do novo, senão cada movimentação grava histórico em dobro.
DROP TRIGGER IF EXISTS track_deal_stage_change ON deals;

CREATE OR REPLACE FUNCTION track_deal_stage_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_duration integer;
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    v_duration := EXTRACT(EPOCH FROM (now() - OLD.entered_stage_at))::integer;

    INSERT INTO deal_stage_history (
      id, deal_id, from_stage_id, to_stage_id,
      moved_by, moved_by_ai, duration_seconds, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      NEW.id,
      OLD.stage_id,
      NEW.stage_id,
      NULLIF(current_setting('app.actor_id', true), '')::uuid,
      COALESCE(NULLIF(current_setting('app.actor_is_ai', true), '')::boolean, false),
      v_duration,
      now(),
      now()
    );

    NEW.entered_stage_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deals_track_stage ON deals;
CREATE TRIGGER deals_track_stage
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION track_deal_stage_change();


-- PARTE 7 — BUSCA TEXTUAL -----------------------------------------------------
-- "maria silva" precisa encontrar "Maria da Silva Santos".

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm
  ON contacts USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_deals_title_trgm
  ON deals USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_active
  ON contacts (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deals_active
  ON deals (stage_id, created_at DESC) WHERE deleted_at IS NULL;
