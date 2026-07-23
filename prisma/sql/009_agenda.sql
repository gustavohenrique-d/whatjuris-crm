-- =============================================================================
-- WhatJuris CRM — 009_agenda.sql
-- Adiciona HEARING ao ActivityType (audiência judicial — distinto de MEETING).
-- Idempotente.
--
-- NOTA (conferido 7.0): a tabela activities NÃO tem coluna deleted_at, então o
-- índice de agenda filtra apenas por due_at IS NOT NULL.
-- =============================================================================

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'HEARING';

CREATE INDEX IF NOT EXISTS idx_activities_agenda
  ON activities (due_at, type)
  WHERE due_at IS NOT NULL;
