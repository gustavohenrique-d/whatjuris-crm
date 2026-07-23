// =============================================================================
// WhatJuris CRM — Workflow completo dos agentes no n8n
// scripts/setup-n8n-agents.js
//
// Cria o workflow de triagem com os 8 agentes. Rodar após setup-n8n.js.
// Uso: npm run setup:n8n-agents
// =============================================================================

require('dotenv').config();

const N8N_BASE = process.env.N8N_BASE_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;
// URL do CRM como o n8n a alcança. Com n8n em Docker, o container não enxerga o
// host por 'localhost' — usar CRM_CALLBACK_URL=http://host.docker.internal:3100.
const CRM = process.env.CRM_CALLBACK_URL || process.env.NEXTAUTH_URL || 'http://localhost:3100';
const SECRET = process.env.WEBHOOK_SECRET;

if (!N8N_API_KEY || !SECRET) {
  console.error('Defina N8N_API_KEY e WEBHOOK_SECRET no .env');
  process.exit(1);
}

const headers = () => ({
  parameters: [
    { name: 'x-webhook-secret', value: SECRET },
    { name: 'Content-Type', value: 'application/json' },
  ],
});

// Nó que chama um agente de IA (run-agent)
function agentNode(id, name, agentKey, position) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4,
    position,
    parameters: {
      method: 'POST',
      url: `${CRM}/api/internal/run-agent`,
      sendHeaders: true,
      headerParameters: headers(),
      sendBody: true,
      // Modo 'keypair': cada valor é avaliado como expressão (o modo 'json' com
      // jsonBody envia os ={{ }} literais, sem interpolar).
      specifyBody: 'keypair',
      bodyParameters: {
        parameters: [
          { name: 'agent', value: agentKey },
          { name: 'dealId', value: '={{ $("Webhook Trigger").item.json.body.dealId }}' },
          { name: 'message', value: '={{ $("Webhook Trigger").item.json.body.message }}' },
          { name: 'history', value: '={{ $("Buscar histórico").item.json.messages }}' },
        ],
      },
    },
  };
}

// Nó que chama uma ação no CRM (agent-action)
function actionNode(id, name, position, bodyObj) {
  return {
    id,
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4,
    position,
    parameters: {
      method: 'POST',
      url: `${CRM}/api/internal/agent-action`,
      sendHeaders: true,
      headerParameters: headers(),
      sendBody: true,
      // Modo 'keypair': ver nota em agentNode.
      specifyBody: 'keypair',
      bodyParameters: {
        // Em keypair todo valor vira string. Números precisam ir como expressão
        // (={{ n }}) para o n8n enviá-los como número no JSON (o CRM valida tipo).
        parameters: Object.entries(bodyObj).map(([name, value]) => ({
          name,
          value: typeof value === 'number' ? `={{ ${value} }}` : String(value),
        })),
      },
    },
  };
}

const dealIdExpr = '={{ $("Webhook Trigger").item.json.body.dealId }}';
const phoneExpr = '={{ $("Webhook Trigger").item.json.body.phone }}';

const workflow = {
  name: 'WhatJuris — Triagem com Agentes IA',
  nodes: [
    {
      id: 'trigger',
      name: 'Webhook Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [100, 400],
      parameters: {
        path: 'whatjuris-agents',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        responseCode: 200,
        responseData: '{"status":"processing"}',
      },
      webhookId: 'whatjuris-agents',
    },
    actionNode('get-history', 'Buscar histórico', [320, 400], {
      action: 'get_history', dealId: '={{ $json.body.dealId }}', limit: 20,
    }),

    agentNode('recepcionista', 'Agente Recepcionista', 'recepcionista', [540, 400]),
    actionNode('enviar-recepcao', 'Enviar resposta recepcionista', [760, 400], {
      action: 'send_message', dealId: dealIdExpr, agentName: 'Agente Recepcionista',
      message: '={{ $("Agente Recepcionista").item.json.response }}', phone: phoneExpr,
    }),

    agentNode('classificador', 'Agente Classificador', 'classificador', [980, 400]),
    actionNode('salvar-area', 'Salvar área jurídica', [1200, 400], {
      action: 'set_legal_area', dealId: dealIdExpr, agentName: 'Agente Classificador',
      title: 'Área identificada',
      legalArea: '={{ JSON.parse($("Agente Classificador").item.json.response).area }}',
    }),

    agentNode('coletor', 'Agente Coletor', 'coletor', [1420, 400]),
    actionNode('enviar-coleta', 'Enviar pergunta do coletor', [1640, 400], {
      action: 'send_message', dealId: dealIdExpr, agentName: 'Agente Coletor',
      message: '={{ $("Agente Coletor").item.json.response }}', phone: phoneExpr,
    }),

    agentNode('qualificador', 'Agente Qualificador', 'qualificador', [1860, 400]),
    {
      id: 'checar-qualificacao',
      name: 'Qualificado?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [2080, 400],
      parameters: {
        conditions: {
          options: { caseSensitive: false, typeValidation: 'loose' },
          conditions: [{
            leftValue: '={{ JSON.parse($("Agente Qualificador").item.json.response).qualificado }}',
            rightValue: true,
            operator: { type: 'boolean', operation: 'equals' },
          }],
          combinator: 'and',
        },
      },
    },

    // Ramo SIM (qualificado): grava a prioridade a partir da urgência do qualificador
    actionNode('salvar-prioridade', 'Salvar prioridade', [2080, 130], {
      action: 'set_priority', dealId: dealIdExpr, agentName: 'Agente Qualificador',
      priority: '={{ ({ alta: 2, "média": 1, media: 1, baixa: 0 })[(JSON.parse($("Agente Qualificador").item.json.response)["urgência"] || "").toString().toLowerCase()] ?? 0 }}',
    }),
    agentNode('nutritor', 'Agente Nutritor', 'nutritor', [2300, 250]),
    actionNode('enviar-nutricao', 'Enviar mensagem nutritor', [2520, 250], {
      action: 'send_message', dealId: dealIdExpr, agentName: 'Agente Nutritor',
      message: '={{ $("Agente Nutritor").item.json.response }}', phone: phoneExpr,
    }),
    agentNode('agendador', 'Agente Agendador', 'agendador', [2740, 250]),
    actionNode('enviar-agendamento', 'Enviar proposta de agendamento', [2960, 250], {
      action: 'send_message', dealId: dealIdExpr, agentName: 'Agente Agendador',
      message: '={{ $("Agente Agendador").item.json.response }}', phone: phoneExpr,
    }),
    agentNode('resumidor', 'Agente Resumidor', 'resumidor', [3180, 250]),
    actionNode('qualify-action', 'Qualificar lead e notificar advogado', [3400, 250], {
      action: 'qualify_lead', dealId: dealIdExpr, agentName: 'Agente Resumidor',
    }),

    // Ramo NÃO (não qualificado)
    agentNode('encerrador', 'Agente Encerrador', 'encerrador', [2300, 550]),
    actionNode('enviar-encerramento', 'Enviar encerramento', [2520, 550], {
      action: 'send_message', dealId: dealIdExpr, agentName: 'Agente Encerrador',
      message: '={{ $("Agente Encerrador").item.json.response }}', phone: phoneExpr,
    }),
    actionNode('mover-descartado', 'Mover para Descartado', [2740, 550], {
      action: 'move_stage', dealId: dealIdExpr, agentName: 'Agente Qualificador',
      stageKey: 'descartado',
    }),
  ],
  connections: {
    'Webhook Trigger': { main: [[{ node: 'Buscar histórico', type: 'main', index: 0 }]] },
    'Buscar histórico': { main: [[{ node: 'Agente Recepcionista', type: 'main', index: 0 }]] },
    'Agente Recepcionista': { main: [[{ node: 'Enviar resposta recepcionista', type: 'main', index: 0 }]] },
    'Enviar resposta recepcionista': { main: [[{ node: 'Agente Classificador', type: 'main', index: 0 }]] },
    'Agente Classificador': { main: [[{ node: 'Salvar área jurídica', type: 'main', index: 0 }]] },
    'Salvar área jurídica': { main: [[{ node: 'Agente Coletor', type: 'main', index: 0 }]] },
    'Agente Coletor': { main: [[{ node: 'Enviar pergunta do coletor', type: 'main', index: 0 }]] },
    'Enviar pergunta do coletor': { main: [[{ node: 'Agente Qualificador', type: 'main', index: 0 }]] },
    'Agente Qualificador': { main: [[{ node: 'Qualificado?', type: 'main', index: 0 }]] },
    'Qualificado?': {
      main: [
        [{ node: 'Salvar prioridade', type: 'main', index: 0 }],  // true
        [{ node: 'Agente Encerrador', type: 'main', index: 0 }],  // false
      ],
    },
    'Salvar prioridade': { main: [[{ node: 'Agente Nutritor', type: 'main', index: 0 }]] },
    'Agente Nutritor': { main: [[{ node: 'Enviar mensagem nutritor', type: 'main', index: 0 }]] },
    'Enviar mensagem nutritor': { main: [[{ node: 'Agente Agendador', type: 'main', index: 0 }]] },
    'Agente Agendador': { main: [[{ node: 'Enviar proposta de agendamento', type: 'main', index: 0 }]] },
    'Enviar proposta de agendamento': { main: [[{ node: 'Agente Resumidor', type: 'main', index: 0 }]] },
    'Agente Resumidor': { main: [[{ node: 'Qualificar lead e notificar advogado', type: 'main', index: 0 }]] },
    'Agente Encerrador': { main: [[{ node: 'Enviar encerramento', type: 'main', index: 0 }]] },
    'Enviar encerramento': { main: [[{ node: 'Mover para Descartado', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};

async function main() {
  console.log('Criando workflow de agentes no n8n...');

  const res = await fetch(`${N8N_BASE}/api/v1/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-N8N-API-KEY': N8N_API_KEY },
    body: JSON.stringify(workflow),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Erro:', data);
    process.exit(1);
  }

  console.log(`Workflow criado: ${data.id}`);

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

  console.log(`Webhook: ${N8N_BASE}/webhook/whatjuris-agents`);
  console.log('');
  console.log('lib/n8n/notify.js já aponta para /webhook/whatjuris-agents.');
}

main().catch(console.error);
