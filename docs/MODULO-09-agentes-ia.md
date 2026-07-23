# Módulo 9 — Agentes de Inteligência Artificial

> Requer Módulo 8. Módulo final. 8 agentes rodam no n8n e chamam a OpenAI.

## Objetivo
8 agentes de IA, cada um com prompt e modelo próprios, formando o fluxo de
triagem: lead manda mensagem → agentes fazem triagem → advogado recebe a ficha.

## Arquivos criados
- `lib/ai/openai.js` — `callOpenAI` (system → histórico → mensagem, p/ prompt caching).
- `lib/ai/prompts.js` — os 8 prompts (parametrizados pela organização).
- `pages/api/internal/run-agent.js` — seleciona prompt+modelo por agente, chama a
  OpenAI, grava `AI_ACTION` na timeline.
- `pages/api/internal/agent-action.js` — ação `get_history` adicionada.
- `scripts/setup-n8n-agents.js` — workflow completo dos 8 agentes (`npm run setup:n8n-agents`).
- `lib/n8n/notify.js` — agora aponta p/ o webhook `whatjuris-agents`.

## Modelos por agente (OpenAI GPT-4.1)
| Agente | Modelo |
|---|---|
| Recepcionista, Classificador, Encerrador, Nutritor | `gpt-4.1-nano` |
| Coletor, Agendador | `gpt-4.1-mini` |
| Qualificador, Resumidor | `gpt-4.1` (full) |

## Decisões travadas
- **Contexto de conversa vem do banco** (`get_history`), não de variável do n8n.
- **Modelos por complexidade da tarefa** (nano p/ classificação, full p/ julgamento).
- **Agentes não se chamam direto** — o n8n orquestra a sequência (nós HTTP separados).
- **O CRM é a fonte da verdade** — toda decisão vai para o banco via `agent-action`.

## Aceite (verificado sem OpenAI, pois sem chave)
- `run-agent` sem secret → 401; sem `OPENAI_API_KEY` → 502 (prova que a pipeline
  compila e roda até o `callOpenAI`); `get_history` retorna MESSAGE_IN como role
  user; `setup-n8n-agents` valida. As respostas reais dos agentes exigem
  `OPENAI_API_KEY` no `.env`.
