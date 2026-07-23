-- =============================================================================
-- WhatJuris CRM — 008_actor_contact.sql
-- Adiciona o valor CONTACT ao enum ActorType. Uma mensagem recebida no
-- WhatsApp (MESSAGE_IN) é de autoria do lead/contato — que é uma pessoa real,
-- mas NÃO é um usuário do sistema (users). Sem este valor, o helper
-- recordWhatsappMessage (lib/activities/record.js) nasceria quebrado.
-- Consumido de fato pelo Módulo 8. Idempotente.
-- =============================================================================

ALTER TYPE "ActorType" ADD VALUE IF NOT EXISTS 'CONTACT';
