-- =============================================================================
-- WhatJuris CRM — 006_corrigir_estagios.sql
-- Garante que o funil 'captacao' tem exatamente os 7 estágios com as chaves
-- corretas para os agentes de IA (módulo 9). Idempotente.
--
-- PRÉ-REQUISITO (desvio da spec — colunas não existiam no schema do Módulo 1):
-- adiciona probability e stalled_after_hours em pipeline_stages, que o upsert
-- abaixo referencia.
-- =============================================================================

ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS probability         integer;
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS stalled_after_hours integer;

DO $$
DECLARE
  v_pipeline_id uuid;
BEGIN
  SELECT id INTO v_pipeline_id FROM pipelines WHERE key = 'captacao';

  IF v_pipeline_id IS NULL THEN
    RAISE EXCEPTION 'Funil captacao não encontrado. Verifique o seed.';
  END IF;

  -- Upsert de cada estágio pela chave. Se existir, atualiza nome e metadados.
  -- Se não existir, insere.
  INSERT INTO pipeline_stages (id, pipeline_id, key, name, type, position, probability, color, stalled_after_hours, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_pipeline_id, 'novo_contato',      'Novo contato',           'OPEN', 0, 5,   '#8892A4', 2,    now(), now()),
    (gen_random_uuid(), v_pipeline_id, 'em_triagem',        'Em triagem pela IA',     'OPEN', 1, 15,  '#4F8EF7', 6,    now(), now()),
    (gen_random_uuid(), v_pipeline_id, 'aguardando_docs',   'Aguardando documentos',  'OPEN', 2, 35,  '#F5A623', 48,   now(), now()),
    (gen_random_uuid(), v_pipeline_id, 'qualificado',       'Qualificado',            'OPEN', 3, 70,  '#7C5CFC', 24,   now(), now()),
    (gen_random_uuid(), v_pipeline_id, 'consulta_agendada', 'Consulta agendada',      'OPEN', 4, 85,  '#2DD4A0', null, now(), now()),
    (gen_random_uuid(), v_pipeline_id, 'contratado',        'Contratado',             'WON',  5, 100, '#2DD4A0', null, now(), now()),
    (gen_random_uuid(), v_pipeline_id, 'descartado',        'Descartado',             'LOST', 6, 0,   '#F04E4E', null, now(), now())
  ON CONFLICT (pipeline_id, key) DO UPDATE
    SET name                = EXCLUDED.name,
        position            = EXCLUDED.position,
        probability         = EXCLUDED.probability,
        color               = EXCLUDED.color,
        stalled_after_hours = EXCLUDED.stalled_after_hours,
        type                = EXCLUDED.type,
        updated_at          = now();

  -- Remove estágios obsoletos (chaves que não fazem parte do fluxo correto)
  -- APENAS se não tiverem deals vinculados
  DELETE FROM pipeline_stages
  WHERE pipeline_id = v_pipeline_id
    AND key NOT IN ('novo_contato','em_triagem','aguardando_docs','qualificado',
                    'consulta_agendada','contratado','descartado')
    AND NOT EXISTS (SELECT 1 FROM deals WHERE stage_id = pipeline_stages.id);
END $$;

-- Verificação
SELECT position, key, name, type, probability, stalled_after_hours
FROM pipeline_stages
ORDER BY position;
