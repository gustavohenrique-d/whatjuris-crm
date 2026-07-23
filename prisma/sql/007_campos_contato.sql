-- =============================================================================
-- WhatJuris CRM — 007_campos_contato.sql
-- Campos que o Módulo 4 usa em contacts e que não existiam no schema do
-- Módulo 1. Idempotente.
--   whatsapp   — canal principal de entrada dos leads (módulos 8/9)
--   consent_at — consentimento LGPD para contato
-- =============================================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp   text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_at timestamptz;

-- Índice de busca por whatsapp (lookup do webhook do módulo 8)
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp ON contacts (whatsapp) WHERE whatsapp IS NOT NULL;
