// =============================================================================
// WhatJuris CRM — Setup do workflow principal no n8n
// scripts/setup-n8n.js
//
// Cria o workflow "WhatJuris — Recepção de mensagens" no n8n via API REST.
// Rodar uma vez após o n8n estar acessível.  Uso: npm run setup:n8n
// =============================================================================

require('dotenv').config();

const N8N_BASE = process.env.N8N_BASE_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;
// URL do CRM como o n8n a alcança. Com n8n em Docker, o container não enxerga o
// host por 'localhost' — usar CRM_CALLBACK_URL=http://host.docker.internal:3100.
const CRM_BASE = process.env.CRM_CALLBACK_URL || process.env.NEXTAUTH_URL || 'http://localhost:3100';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (!N8N_API_KEY) {
  console.error('Defina N8N_API_KEY no .env');
  process.exit(1);
}

if (!WEBHOOK_SECRET) {
  console.error('Defina WEBHOOK_SECRET no .env');
  process.exit(1);
}

const secretHeader = { name: 'x-webhook-secret', value: WEBHOOK_SECRET };
const jsonHeader = { name: 'Content-Type', value: 'application/json' };
const agentUrl = `${CRM_BASE}/api/internal/agent-action`;

const workflow = {
  name: 'WhatJuris — Recepção de mensagens',
  nodes: [
    {
      id: 'webhook-trigger',
      name: 'Webhook Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [200, 300],
      parameters: {
        path: 'whatjuris-message',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        responseCode: 200,
        responseData: '{"status":"received"}',
      },
      webhookId: 'whatjuris-message',
    },
    {
      id: 'get-deal-context',
      name: 'Buscar contexto do deal',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [450, 300],
      parameters: {
        method: 'POST',
        url: agentUrl,
        sendHeaders: true,
        headerParameters: { parameters: [secretHeader, jsonHeader] },
        sendBody: true,
        bodyParameters: {
          parameters: [
            { name: 'action', value: 'get_deal' },
            { name: 'dealId', value: '={{ $json.body.dealId }}' },
            { name: 'agentName', value: 'Sistema' },
          ],
        },
      },
    },
    {
      id: 'record-received',
      name: 'Registrar recepção no CRM',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [700, 300],
      parameters: {
        method: 'POST',
        url: agentUrl,
        sendHeaders: true,
        headerParameters: { parameters: [secretHeader, jsonHeader] },
        sendBody: true,
        bodyParameters: {
          parameters: [
            { name: 'action', value: 'record_action' },
            { name: 'dealId', value: '={{ $("Webhook Trigger").item.json.body.dealId }}' },
            { name: 'agentName', value: 'Agente Recepcionista' },
            { name: 'title', value: 'Mensagem recebida' },
            { name: 'content', value: '={{ $("Webhook Trigger").item.json.body.message }}' },
          ],
        },
      },
    },
    {
      id: 'move-to-triagem',
      name: 'Mover para Em triagem',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [950, 300],
      parameters: {
        method: 'POST',
        url: agentUrl,
        sendHeaders: true,
        headerParameters: { parameters: [secretHeader, jsonHeader] },
        sendBody: true,
        bodyParameters: {
          parameters: [
            { name: 'action', value: 'move_stage' },
            { name: 'dealId', value: '={{ $("Webhook Trigger").item.json.body.dealId }}' },
            { name: 'agentName', value: 'Agente Recepcionista' },
            { name: 'stageKey', value: 'em_triagem' },
          ],
        },
      },
    },
  ],
  connections: {
    'Webhook Trigger': {
      main: [[{ node: 'Buscar contexto do deal', type: 'main', index: 0 }]],
    },
    'Buscar contexto do deal': {
      main: [[{ node: 'Registrar recepção no CRM', type: 'main', index: 0 }]],
    },
    'Registrar recepção no CRM': {
      main: [[{ node: 'Mover para Em triagem', type: 'main', index: 0 }]],
    },
  },
  settings: { executionOrder: 'v1' },
};

async function main() {
  console.log('Conectando ao n8n em', N8N_BASE);

  const res = await fetch(`${N8N_BASE}/api/v1/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-N8N-API-KEY': N8N_API_KEY },
    body: JSON.stringify(workflow),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Erro ao criar workflow:', data);
    process.exit(1);
  }

  console.log(`Workflow criado com ID: ${data.id}`);

  // n8n atual: 'active' é read-only na criação — ativar por endpoint separado.
  const act = await fetch(`${N8N_BASE}/api/v1/workflows/${data.id}/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': N8N_API_KEY },
  });
  if (!act.ok) {
    console.error('Workflow criado, mas falhou ao ativar:', await act.json());
  } else {
    console.log('Workflow ativado.');
  }

  console.log(`Webhook URL: ${N8N_BASE}/webhook/whatjuris-message`);
  console.log('');
  console.log('Próximos passos:');
  console.log('1. Abra o n8n e adicione os nós de agente de IA (Módulo 9)');
  console.log(`2. Configure o webhook da Meta para: ${CRM_BASE}/api/webhooks/whatsapp`);
  console.log(`3. Use o verify token: ${process.env.WHATSAPP_VERIFY_TOKEN || '<não definido>'}`);
}

main().catch(console.error);
