// =============================================================================
// WhatJuris CRM — Menu de áreas (lista interativa do WhatsApp)
// lib/whatsapp/area-menu.js
//
// Núcleo PURO (sem rede/Prisma): monta o payload da lista interativa da Cloud
// API e mapeia o id da opção escolhida para o rótulo de área usado pelo agente.
// Áreas conforme o escritório Bezerra & Nabarrete.
// =============================================================================

// Linhas da lista interativa (id, title, description) — ids batem com o mapa abaixo.
export const AREA_MENU_ROWS = [
  { id: 'trabalhista', title: '⚖️ Trabalhista', description: 'Demissão, verbas, direitos trabalhistas' },
  { id: 'empresarial', title: '🏢 Empresarial', description: 'Contratos, sociedades, fusões' },
  { id: 'civil', title: '📋 Civil e Contratual', description: 'Contratos, família, herança' },
  { id: 'meio_ambiente', title: '🌿 Meio Ambiente e ESG', description: 'Licenças, compliance ambiental' },
  { id: 'investimentos', title: '🌍 Investimentos Internacionais', description: 'Operações e investimentos no exterior' },
  { id: 'outra', title: '❓ Outra área', description: 'Não sei ou outra situação' },
];

// id da opção → rótulo de área do agente. `outra` (ou desconhecido) → null:
// o agente investiga a área normalmente durante a conversa.
export const AREA_ID_TO_LABEL = {
  trabalhista: 'Trabalhista',
  empresarial: 'Empresarial',
  civil: 'Civil e Contratual',
  meio_ambiente: 'Meio Ambiente e ESG',
  investimentos: 'Investimentos Internacionais',
  outra: null,
};

// Traduz o id da resposta da lista para o rótulo de área (ou null).
export function areaFromReplyId(id) {
  if (!id) return null;
  return AREA_ID_TO_LABEL[id] ?? null;
}

// Monta o payload de lista interativa da Cloud API para o número informado.
export function buildAreaMenuPayload(to) {
  const phone = String(to || '').replace(/\D/g, '');
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'Bezerra & Nabarrete Advogados' },
      body: {
        text: 'Olá! Sou o assistente virtual do escritório. Para agilizar seu atendimento, selecione a área do seu caso:',
      },
      footer: { text: 'Atendimento jurídico especializado' },
      action: {
        button: 'Ver áreas',
        sections: [{ title: 'Áreas de atuação', rows: AREA_MENU_ROWS }],
      },
    },
  };
}
