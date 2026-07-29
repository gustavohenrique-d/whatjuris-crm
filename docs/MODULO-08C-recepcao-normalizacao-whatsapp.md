# Módulo 08C — Recepção e Normalização de Mensagens do WhatsApp

Extensão do Módulo 08 (n8n/WhatsApp). Expande o webhook da Meta para receber e
**normalizar** texto, **áudio** (transcrição) e **imagem** (descrição), com
idempotência, produzindo um **contrato de saída unificado** consumido pelo
fluxo de triagem (agentes, módulo 09).

> **Nota de arquitetura (importante).** Este projeto é **Next.js Pages Router +
> JavaScript** (não App Router/TypeScript). O prompt original foi escrito para
> outra stack; aqui a intenção foi portada para as convenções do repositório
> (`withAuth`/secret por header, Zod, `@/lib`, nomes `WHATSAPP_*`).
>
> **A normalização + mídia + IA roda no BACKEND** (`lib/webhooks/*`), que já é
> onde o Contact/Deal é criado e o n8n é notificado. O workflow n8n em
> `workflows/modulo-01-whatsapp-normalizacao.json` implementa a **mesma
> topologia da seção 7 do prompt como alternativa n8n-side**. Habilite **um**
> dos lados — não os dois — para não duplicar lógica (CLAUDE.md proíbe duplicar
> lógica já existente). O caminho testado e recomendado é o **backend**.

---

## 1. Fluxo (backend)

```
Meta WhatsApp Cloud API
   │  POST  (X-Hub-Signature-256 sobre o corpo RAW)
   ▼
pages/api/webhooks/whatsapp.js
   │  1. verifyMetaSignature (HMAC-SHA256, WHATSAPP_APP_SECRET) — só em produção
   │  2. responde 200 imediatamente (sem await da IA)
   │  3. parseMetaPayload → expande entry[]/changes[]/messages[]
   │       └─ statuses[] apenas → ignora (não chama IA)
   ▼  para cada mensagem:
   │  4. isDuplicate(message_id)  → 'ignored' e pula
   │  5. register(message_id, chat_id)   (antes da IA)
   │  6. finalizeEnvelope:
   │       texto  → message = content.trim()
   │       áudio  → Graph API (metadados→binário) → valida → transcreve
   │       imagem → Graph API (metadados→binário) → valida → descreve
   │       outro  → unsupported
   │  7. isForwardable? (ok + from_me=false + message≠"")
   ▼
Contact/Deal + MESSAGE_IN (timeline) + notifyN8n({ ..., contract })
```

### Contrato de saída (`env`)

```json
{
  "instance_name": "escritorio-principal",
  "chat_id": "5511999999999",
  "content": "legenda ou texto original",
  "from_me": false,
  "message_id": "wamid...",
  "message_type": "conversation | audio message | image message | unsupported",
  "raw_message_type": "text | audio | image | ...",
  "message": "conteúdo consumível pelo próximo módulo",
  "media_id": null,
  "media_mime_type": null,
  "received_at": "ISO 8601",
  "processing_status": "ok | ignored | unsupported | error",
  "processing_error": null
}
```

---

## 2. Arquivos

| Arquivo | Papel |
|---|---|
| `lib/webhooks/signature.js` | HMAC do corpo raw + token do desafio GET |
| `lib/webhooks/whatsapp-normalizer.js` | Parse/expansão do payload → envelopes (puro) |
| `lib/webhooks/media.js` | Download (Graph API) + validação de MIME/tamanho |
| `lib/webhooks/transcription.js` | Áudio → texto (OpenAI Whisper / Gemini) |
| `lib/webhooks/vision.js` | Imagem → descrição (OpenAI / Gemini) |
| `lib/webhooks/process-message.js` | Finaliza áudio/imagem; `isForwardable` |
| `lib/webhooks/idempotency.js` | `isDuplicate` / `register` (Prisma) |
| `pages/api/webhooks/whatsapp.js` | Handler GET/POST |
| `pages/api/internal/idempotency/check.js` | Checagem para o n8n (x-webhook-secret) |
| `pages/api/internal/idempotency/register.js` | Registro para o n8n |
| `prisma/schema.prisma` | model `WebhookIdempotency` |
| `prisma/migrations/20260728120000_add_webhook_idempotency/` | Migration |
| `prisma/sql/010_webhook_idempotency_rls.sql` | RLS (decisão travada 10) |
| `workflows/modulo-01-whatsapp-normalizacao.json` | Workflow n8n (alternativa) |
| `tests/webhooks/` | 37 testes (Vitest), sem APIs pagas |

---

## 3. Banco de dados

```bash
# aplicar a migration (produção: use deploy, não migrate dev, que reseta)
npx prisma migrate deploy
# habilitar RLS na nova tabela (decisão 10 — bloqueia a API REST do Supabase)
psql "$DATABASE_URL" -f prisma/sql/010_webhook_idempotency_rls.sql
```

> Em dev com banco descartável: `npx prisma migrate dev`. **Nunca** rode
> `migrate dev` apontando para o Supabase de produção.

Limpeza de retenção (opcional, `WEBHOOK_IDEMPOTENCY_TTL_SECONDS`, default 7 dias)
pode ser um cron futuro: `DELETE FROM webhook_idempotency WHERE processed_at < now() - interval '7 days'`.

---

## 4. Variáveis de ambiente

Reutiliza os nomes já existentes (`WHATSAPP_*`, `WEBHOOK_SECRET`, `N8N_BASE_URL`,
`OPENAI_API_KEY`). Novas em `.env.example`:

```
WHATSAPP_INSTANCE_NAME=escritorio-principal
WHATSAPP_GRAPH_API_VERSION=v21.0
AUDIO_TRANSCRIPTION_PROVIDER=openai      # openai | gemini
VISION_PROVIDER=openai                    # openai | gemini
OPENAI_TRANSCRIPTION_MODEL=whisper-1
OPENAI_VISION_MODEL=gpt-4o
GEMINI_API_KEY= / GEMINI_AUDIO_MODEL= / GEMINI_VISION_MODEL=
MAX_AUDIO_BYTES=26214400   MAX_IMAGE_BYTES=10485760
WEBHOOK_IDEMPOTENCY_TTL_SECONDS=604800
```

Segredos ficam no painel do Render/Vercel — nunca no `.env.example` nem no
workflow exportado.

---

## 5. Rotas internas de idempotência (consumo pelo n8n)

Autenticadas por `WEBHOOK_SECRET` no header **`x-webhook-secret`** (mesma
convenção de `pages/api/internal/agent-action.js` — **desvio** consciente do
`X-Internal-Secret` da spec).

```bash
curl -sX POST "$CRM/api/internal/idempotency/check" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" -H "content-type: application/json" \
  -d '{"messageId":"wamid.TESTE"}'
# → {"isDuplicate":false}

curl -sX POST "$CRM/api/internal/idempotency/register" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" -H "content-type: application/json" \
  -d '{"messageId":"wamid.TESTE","chatId":"5511999999999"}'
# → {"registered":true,"created":true}
```

---

## 6. Webhook da Meta

**Verificação (GET).** Configure na Meta a URL do webhook apontando para o
backend (`$CRM/api/webhooks/whatsapp`) e o *Verify Token* = `WHATSAPP_VERIFY_TOKEN`.
A Meta faz:

```
GET /api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<TOKEN>&hub.challenge=<C>
→ 200 <C>   (token correto)   |   403 (token errado)
```

Teste local:

```bash
curl -s "$CRM/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=42"
# → 42
```

**Recepção (POST).** Em produção o HMAC é obrigatório; assinatura inválida → 401
(log sem corpo). Em dev (`NODE_ENV≠production`) a verificação é pulada para
facilitar testes com curl.

```bash
BODY=$(cat tests/webhooks/fixtures/text-message.json)
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WHATSAPP_APP_SECRET" -r | cut -d' ' -f1)"
curl -sX POST "$CRM/api/webhooks/whatsapp" \
  -H "content-type: application/json" -H "x-hub-signature-256: $SIG" -d "$BODY"
# → {"status":"ok"}
```

---

## 7. Workflow n8n (alternativa n8n-side)

`workflows/modulo-01-whatsapp-normalizacao.json`. Importar pela UI em
`https://<n8n>/` → **Workflows → Import from File**. Ajustes manuais após importar:

1. **Credenciais** (não vêm no JSON): criar `OpenAI Account` (API Key) e
   religar nos nós *Transcrever Áudio* e *Descrever Imagem*.
2. **Variáveis de ambiente do n8n** (painel do Render, serviço n8n):
   `N8N_INTERNAL_WEBHOOK_SECRET`, `INTERNAL_API_BASE_URL`, `INTERNAL_API_SECRET`,
   `META_GRAPH_API_VERSION`, `META_WHATSAPP_TOKEN`, `WHATSAPP_INSTANCE_NAME`,
   `OPENAI_VISION_MODEL`, `MAX_AUDIO_BYTES`, `MAX_IMAGE_BYTES`.
3. Recomenda-se **fixar a versão** da imagem (ex.: `n8nio/n8n:1.94.1`) no Render
   para evitar breaking changes automáticos.

O JSON **não contém** segredos — todas as credenciais são referências por nome
e todos os tokens vêm de `$env`.

---

## 8. Tratamento de erros (resumo)

| Situação | `processing_status` / `processing_error` |
|---|---|
| Assinatura inválida | HTTP 401, sem corpo no log, sem retry |
| JSON inválido | HTTP 400 `INVALID_MESSAGE_PAYLOAD` |
| Só statuses | 200, log resumo, sem IA |
| Duplicata | `ignored` |
| Tipo não suportado | `unsupported` / `UNSUPPORTED_MESSAGE_TYPE` |
| media_id ausente | `error` / `MISSING_MEDIA_ID` |
| Token Meta inválido | `error` / `META_AUTH_FAILED` (sem retry) |
| 429 / 5xx no download | retry 3× com backoff + jitter |
| MIME inválido | `error` / `INVALID_MIME_TYPE` |
| Arquivo vazio / grande | `EMPTY_MEDIA_FILE` / `MEDIA_TOO_LARGE` |
| Falha transcrição/visão | `AUDIO_TRANSCRIPTION_FAILED` / `IMAGE_DESCRIPTION_FAILED` |

**Log seguro:** `message_id`, `chat_id` mascarado (5 dígitos + `***`), tipo,
código de erro e duração. Nunca tokens, binários, base64, URL temporária ou
corpo completo. No Render/Vercel, os logs do serviço já respeitam esse formato.

---

## 9. Testes

```bash
npm test                 # vitest run — 37 testes, sem APIs pagas
npm run test:watch
```

Cobrem: HMAC válido/inválido/ausente, desafio GET, extração de texto/áudio/
imagem (com/sem legenda), aliases de tipo, expansão em lote, só-statuses, tipo
não suportado, contrato completo, texto vazio, validação de mídia (MIME/tamanho/
vazio), e roteamento por tipo com IA mockada (texto não chama IA; áudio só
transcrição; imagem só visão; falhas mapeadas).

> Casos que dependem de rede real (download da Graph API, chamadas OpenAI/Gemini
> ponta a ponta) **não** são exercitados — os provedores são mockados.
