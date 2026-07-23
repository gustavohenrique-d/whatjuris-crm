# Módulo 8 — Workflows n8n e WhatsApp Business API

> Requer Módulo 7. Recepção de mensagens e ponte com o n8n.

## Objetivo
WhatsApp Cloud API recebendo mensagens, webhook do CRM criando Contact/Deal
automaticamente, mensagens na timeline (MESSAGE_IN/OUT) e rota interna para o
n8n operar o CRM.

## Arquivos criados
- `lib/whatsapp/send.js` — `sendWhatsappMessage` (skipped sem credenciais).
- `lib/n8n/notify.js` — chama o webhook do n8n (fire-and-forget).
- `pages/api/webhooks/whatsapp.js` — GET (verificação) + POST (cria Contact/Deal,
  grava MESSAGE_IN, notifica o n8n).
- `pages/api/internal/agent-action.js` — autenticada por `WEBHOOK_SECRET`; ações
  `get_deal`, `move_stage`, `record_action`, `send_message`, `qualify_lead`.
- `scripts/setup-n8n.js` — cria o workflow no n8n (`npm run setup:n8n`).

## Decisões travadas
- **n8n é o orquestrador; o CRM é a fonte de dados** (n8n chama o CRM por HTTP,
  nunca acessa o banco direto — RBAC/auditoria valem para qualquer ator).
- **Contact/Deal criados no primeiro contato** (estágio `novo_contato`).
- **Mensagens gravadas ANTES de processar** (histórico sobrevive a falha do agente).
- **Um único número de WhatsApp**; o roteamento por área é do Qualificador (mód. 9).

## Bugs da spec corrigidos
- HMAC do webhook usava o access token — o correto é o **App Secret** da Meta
  (`WHATSAPP_APP_SECRET`; verificação só em produção).
- `move_stage` fazia `set_config('app.actor_id', dealId)` → gravava o id do deal
  em `moved_by`. E `qualify_lead` não limpava o valor (vazamento do pool). Ambos
  corrigidos com `set_config('app.actor_id', '', true)` → `moved_by=NULL`,
  `moved_by_ai=true`.

## Aceite (verificado)
- Webhook GET challenge/403; POST cria Ana Beatriz + deal + MESSAGE_IN (CONTACT);
  agent-action 401/get_deal/move_stage/record_action/qualify_lead; setup-n8n valida.

## Env necessário em produção
`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`,
`WHATSAPP_VERIFY_TOKEN`, `N8N_BASE_URL`, `N8N_API_KEY`, `WEBHOOK_SECRET`.
