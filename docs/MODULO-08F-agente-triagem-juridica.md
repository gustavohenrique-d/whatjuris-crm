# Módulo 08F — Agente de Triagem Jurídica

Agente unificado de IA que conduz a triagem inicial: conversa com o lead, extrai
`nome / área / resumo / urgência`, classifica a fase e devolve a próxima mensagem
ao cliente. O **backend recalcula a qualificação** — nunca confia na LLM.

> **Notas de arquitetura / desvios do prompt**
> - Stack real: Pages Router + JS + Prisma/Supabase + Redis 6380 + n8n local.
> - Nomenclatura real: **`deals`/`contacts`** (não "leads"). Endpoint em
>   `/api/internal/deals/*`. `legalArea` já existia.
> - **Não duplica** os agentes antigos de `lib/ai/` (recepcionista, classificador,
>   qualificador, resumidor) — este é um agente novo e unificado.
> - **System Prompt e JSON Schema foram AUTORADOS** por esta implementação: o
>   prompt do módulo referenciava "seção 12/13 do prompt original" que não veio.
>   Revise `prompts/legal-triage-system-prompt.txt` e
>   `schemas/legal-triage-output.schema.json`.
> - Índice do prompt usava subquery em `CREATE INDEX` (SQL inválido) → troquei por
>   índice simples em `deals(instance_name)`.
> - Workflow HTTP **sem header `x-webhook-secret`** — autenticação via credencial
>   **Custom Auth** do n8n (mesma convenção adotada nos módulos 02/03).

---

## 1. Banco (já aplicado no Supabase)

`deals` ganhou: `urgencia` (Baixa/Média/Alta, CHECK), `fase_triagem`
(coletando_dados/qualificado/desqualificado, default+CHECK), `qualified_at`,
`instance_name` + índice. Migration `20260729130000_add_deal_triage_fields`
baseline-ada.

Memória do agente: schema **`ai_memory`** + tabela `triage_chat_history`
(id serial, session_id, message jsonb, created_at) + RLS. Usada pelo nó
Postgres Chat Memory do n8n.

---

## 2. Lógica (backend, testável)

| Arquivo | Papel |
|---|---|
| `prompts/legal-triage-system-prompt.txt` | System Prompt (só `{{LAW_FIRM_NAME}}` é substituído) |
| `schemas/legal-triage-output.schema.json` | Contrato estrito da saída do agente |
| `lib/triage/qualify.js` | `isQualified` / `computeQualification` (critério fixo) |
| `lib/triage/validate-output.js` | parse (tira cercas ```json), normaliza (''→null, remove extras), valida, recalcula |
| `lib/triage/session.js` | `sessionKey` = `chat:v1:{inst}:{chat}` |

**Qualificação** (recalculada no backend, nunca confia na LLM): `nome≥3` +
`area` válida (≠ "Não identificado") + `resumo≥10` + `urgencia ∈ {Baixa,Média,Alta}`.

---

## 3. Endpoints internos (x-webhook-secret)

```
GET  /api/internal/deals/by-chat?instance_name=X&chat_id=Y
     → { deal_id, contact_id, contact_name, legal_area, fase_triagem, urgencia, control_version }

POST /api/internal/deals/triage
     body: { instance_name, chat_id, source_message_id, buffered_message_ids,
             expected_control_version, fase_triagem, dados_extraidos, lead_qualificado }
```

O `triage` faz, em ordem: acha o deal aberto pelo whatsapp → **isBlocked** (Módulo 2,
409 se takeover) → checa **control_version** (409 STALE se divergente) →
**idempotência** por `source_message_id` (namespace `triage:` no `webhook_idempotency`
— **não colide** com os message_id dos módulos 1/2) → revalida schema + recalcula
qualificação → atualiza `deal.legalArea/urgencia/faseTriage/instanceName`
(**null nunca apaga** dado válido) → `qualified_at` só na 1ª qualificação →
atualiza `contact.name` se ainda for placeholder → grava `AI_ACTION`.

---

## 4. Variáveis de ambiente (.env / .env.example)

```
TRIAGE_LLM_PROVIDER=openai   OPENAI_TRIAGE_MODEL=gpt-4o-mini
TRIAGE_TEMPERATURE=0.2   TRIAGE_MAX_OUTPUT_TOKENS=700
TRIAGE_TIMEOUT_MS=30000  TRIAGE_MAX_RETRIES=2
TRIAGE_MEMORY_WINDOW_MESSAGES=20  TRIAGE_MEMORY_RETENTION_DAYS=90
TRIAGE_MEMORY_TABLE=triage_chat_history
LAW_FIRM_NAME=            # usado no System Prompt
```
`OPENAI_API_KEY` reutilizado (já existia).

---

## 5. Workflow n8n

`workflows/modulo-04-agente-triagem-juridica.json`. Topologia: precondições →
sessão → carrega deal → revalida takeover → **AI Agent** (OpenAI Chat Model +
Postgres Chat Memory, sem ferramentas) → Code valida/recalcula → atualiza no CRM
→ trata 409 → revalida takeover de novo → saída para WhatsApp.

Configuração manual no n8n após importar:
1. Credencial **OpenAI** (`OpenAI - Triagem Jurídica`) → API Key do `OPENAI_API_KEY`.
2. Credencial **Postgres** (`Supabase - AI Memory`) → host do Supabase, db `postgres`,
   SSL true, schema `ai_memory`. **Não** usar localhost/host.docker.internal (banco é remoto).
3. Credencial **Custom Auth** (a mesma dos outros módulos) nos nós HTTP.
4. **Colar o System Prompt** (`prompts/legal-triage-system-prompt.txt`, com
   `LAW_FIRM_NAME` preenchido) no campo *System Message* do nó AI Agent — não foi
   inlinado no JSON para evitar duplicação/escapes.

---

## 6. Testes

```bash
npm test -- tests/triage    # 28 testes
npm test                    # suíte completa (137)
```

Cobrem: qualificação (todos os dados / sem nome / área não identificada /
recalculada), parse (JSON válido/ inválido / cercas), normalização ('' → null,
propriedade extra removida), endpoint (401, qualificado atualiza deal+contato,
takeover→409, control_version→409, idempotência, null não apaga), session_key
isolada, workflow válido/sem segredos. **OpenAI não é chamado** nos testes.

Runtime verificado: `prisma generate` OK e os novos campos do `Deal` consultados
contra o banco real.
