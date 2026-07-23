-- =============================================================================
-- WhatJuris CRM — 005_limpeza_duplicatas.sql
-- Remove colunas duplicadas geradas durante o drift do Módulo 1.
-- Rodar ANTES de qualquer código de aplicação escrever nessas tabelas.
-- Idempotente.
-- =============================================================================

-- deal_stage_history: moved_by_id é legado; o trigger atual grava em moved_by
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='deal_stage_history' AND column_name='moved_by_id')
  THEN
    UPDATE deal_stage_history SET moved_by = moved_by_id
    WHERE moved_by IS NULL AND moved_by_id IS NOT NULL;

    ALTER TABLE deal_stage_history DROP COLUMN moved_by_id;
  END IF;
END $$;

-- deals: custom_fields e custom_data fazem a mesma coisa
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='deals' AND column_name='custom_fields')
     AND EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='deals' AND column_name='custom_data')
  THEN
    UPDATE deals SET custom_data = custom_fields
    WHERE custom_data = '{}'::jsonb AND custom_fields <> '{}'::jsonb;

    ALTER TABLE deals DROP COLUMN custom_fields;
  END IF;
END $$;

-- contacts: mesma situação
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='contacts' AND column_name='custom_fields')
     AND EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='contacts' AND column_name='custom_data')
  THEN
    UPDATE contacts SET custom_data = custom_fields
    WHERE custom_data = '{}'::jsonb AND custom_fields <> '{}'::jsonb;

    ALTER TABLE contacts DROP COLUMN custom_fields;
  END IF;
END $$;

-- Se contacts só tem custom_fields, renomeia para custom_data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='contacts' AND column_name='custom_fields')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='contacts' AND column_name='custom_data')
  THEN
    ALTER TABLE contacts RENAME COLUMN custom_fields TO custom_data;
  END IF;
END $$;

-- users: oab e oab_number fazem a mesma coisa
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='users' AND column_name='oab')
  THEN
    UPDATE users SET oab_number = oab
    WHERE oab_number IS NULL AND oab IS NOT NULL;

    ALTER TABLE users DROP COLUMN oab;
  END IF;
END $$;

-- pipelines.key precisa ser obrigatório: workflows do módulo 8 referenciam
-- o funil por key, não por id
UPDATE pipelines SET key = 'captacao'
WHERE key IS NULL AND is_default = true;

UPDATE pipelines SET key = 'funil_' || substr(id::text, 1, 8)
WHERE key IS NULL;

ALTER TABLE pipelines ALTER COLUMN key SET NOT NULL;

-- Verificação
SELECT 'deal_stage_history.moved_by_id removido' AS item,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='deal_stage_history' AND column_name='moved_by_id')
  THEN 'OK' ELSE 'AINDA EXISTE' END AS status
UNION ALL SELECT 'deals.custom_fields removido',
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='deals' AND column_name='custom_fields')
  THEN 'OK' ELSE 'AINDA EXISTE' END
UNION ALL SELECT 'users.oab removido',
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='oab')
  THEN 'OK' ELSE 'AINDA EXISTE' END
UNION ALL SELECT 'pipelines.key NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='pipelines' AND column_name='key' AND is_nullable='NO')
  THEN 'OK' ELSE 'AINDA NULLABLE' END;
