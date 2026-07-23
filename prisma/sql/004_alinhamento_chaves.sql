-- =============================================================================
-- WhatJuris CRM — 004_alinhamento_chaves.sql
-- O teste funcional do Módulo 1B referencia pipelines.key = 'captacao' e os
-- estágios 'novo_contato' / 'em_triagem'. O Módulo 1 (construído sem os
-- arquivos de referência) não criou a coluna key em pipelines e usou outras
-- chaves de estágio. Este arquivo alinha com a nomenclatura de referência,
-- que os módulos 4+ vão consumir.
-- Idempotente: seguro rodar múltiplas vezes.
-- =============================================================================

ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS key text;

UPDATE pipelines SET key = 'captacao'
WHERE name = 'Captação de Clientes' AND (key IS NULL OR key <> 'captacao');

CREATE UNIQUE INDEX IF NOT EXISTS pipelines_key_key ON pipelines (key);

UPDATE pipeline_stages SET key = 'novo_contato' WHERE key = 'novo_lead';
UPDATE pipeline_stages SET key = 'em_triagem'   WHERE key = 'triagem';
