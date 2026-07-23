// =============================================================================
// WhatJuris CRM — Helper de chamada à OpenAI API
// lib/ai/openai.js
//
// Centraliza as chamadas para garantir que o modelo certo seja usado por cada
// agente e que o system prompt fique no início (prompt caching do GPT-4.1).
// =============================================================================

const MODELS = {
  nano: 'gpt-4.1-nano',
  mini: 'gpt-4.1-mini',
  full: 'gpt-4.1',
};

const BASE_URL = 'https://api.openai.com/v1/chat/completions';

export async function callOpenAI({
  model = 'mini',
  systemPrompt,
  messages = [],   // array de { role, content } — histórico da conversa
  userMessage,     // última mensagem do lead
  temperature = 0.3,
  maxTokens = 500,
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY não definida.');

  // Estrutura de prompt caching: system → histórico → mensagem atual.
  // O GPT-4.1 faz cache automático de prefixos > 1024 tokens.
  const payload = {
    model: MODELS[model] || model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      // remove metadados internos (_actorLabel/_type) antes de mandar à OpenAI
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ],
  };

  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error ${response.status}: ${err?.error?.message || 'desconhecido'}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) throw new Error('OpenAI retornou resposta vazia.');

  return {
    content,
    model: data.model,
    usage: data.usage, // { prompt_tokens, completion_tokens, total_tokens }
  };
}
