# Módulo 08D — Human Takeover

Permite que um humano (atendente no CRM ou pelo WhatsApp do celular) **assuma**
uma conversa, bloqueando a IA de responder, e depois **devolva** o controle.

> **Notas de arquitetura**
> - Stack real: Pages Router + JS + Prisma/Supabase (o prompt já reconhece).
> - **Redis é OPCIONAL** (decisão do usuário). O PostgreSQL
>   (`conversation_controls`) é a fonte de verdade; o Redis é só cache. Sem
>   `REDIS_*` configurado, tudo opera no PG — funciona hoje sem Docker.
> - **Autorização por permissão** (`ctx.can('conversation.takeover')`), nunca por
>   nome de role (decisão travada 3). O prompt citava roles `atendente/advogado/
>   admin` que não existem aqui.
> - `deals.atendimento_humano` **não existe** e não foi criado (spec 7.3):
>   `conversation_controls` é a única fonte de verdade.
> - n8n roda **local** (Docker, `localhost:5678`), não no Render.

---

## 1. Fonte de verdade e cache

```
                 ┌──────────── isBlocked() ────────────┐
   Redis GET ───▶│ hit + válido → bloqueado            │
   (se ligado)   │ miss/erro/expirado ↓                │
                 │ PostgreSQL (conversation_controls)  │  ← verdade
                 │   human + blocked_until > agora →   │
                 │       bloqueado + REIDRATA o Redis  │
                 │   human + expirado → reconcilia ai  │
                 │   ai / sem linha → liberado         │
                 └─────────────────────────────────────┘
   Redis E PG indisponíveis → { blocked:true, flow_action:'stop_and_retry' }
                              (falha FECHADA: nunca liberar a IA sem confirmar)
```

`sender_origin` (seção 4 do prompt): `from_me=false`→`client`; `from_me=true` +
registro outbound IA→`ai`; `from_me=true` sem registro→`human_mobile` (ativa
bloqueio, fail-closed); usuário do CRM→`crm_human`.

---

## 2. Arquivos

| Arquivo | Papel |
|---|---|
| `lib/redis/client.js` | Cliente ioredis **opcional** (null se não configurado) |
| `lib/whatsapp/outbound-registry.js` | Registro Redis das saídas da IA |
| `lib/conversations/control.js` | Serviço: isBlocked/activate/refresh/release/reconcile |
| `lib/conversations/http-auth.js` | Auth combinada (sessão OU x-webhook-secret) |
| `lib/whatsapp/lead.js` | findOrCreate Contact/Deal (extraído do webhook M1) |
| `pages/api/conversations/[instance_name]/[chat_id]/takeover.js` | Ativar (UI ou n8n) |
| `pages/api/conversations/[instance_name]/[chat_id]/release.js` | Devolver p/ IA |
| `pages/api/conversations/[instance_name]/[chat_id]/control.js` | Consultar (GET) |
| `pages/api/internal/conversations/outbound-check.js` | n8n: é saída da IA? |
| `pages/api/internal/conversations/message.js` | n8n: persistir msg + origem |
| `prisma/schema.prisma` | `ConversationControl` + `ConversationControlEvent` |
| `prisma/migrations/20260728130000_add_conversation_controls/` | Migration |
| `workflows/modulo-02-human-takeover.json` | Workflow n8n (chama os endpoints) |
| `tests/human-takeover/` | 34 testes (Redis+Prisma mockados) |

---

## 3. Endpoints

### Usuário do CRM (sessão + permissão `conversation.takeover`)
```
POST /api/conversations/{instance}/{chat}/takeover   → source forçado crm_human, ator = sessão
POST /api/conversations/{instance}/{chat}/release
GET  /api/conversations/{instance}/{chat}/control
```
Papéis com a permissão: owner, senior_lawyer, lawyer, assistant (não intern).

### n8n (header `x-webhook-secret: WEBHOOK_SECRET`)
As mesmas rotas acima aceitam o secret interno (source vem do corpo, ex.:
`human_mobile`). Mais:
```
POST /api/internal/conversations/outbound-check   { instance_name, message_id } → { is_ai }
POST /api/internal/conversations/message          { ..., sender_origin }        → { persisted }
```

Exemplos:
```bash
# ativar (n8n / human_mobile)
curl -sX POST "$CRM/api/conversations/escritorio-principal/5511999999999/takeover" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" -H "content-type: application/json" \
  -d '{"source":"human_mobile","message_id":"wamid.X"}'

# consultar
curl -s "$CRM/api/conversations/escritorio-principal/5511999999999/control" \
  -H "x-webhook-secret: $WEBHOOK_SECRET"
```

---

## 4. Banco (já aplicado no Supabase)

Tabelas `conversation_controls` (uma linha por instance+chat, unique) e
`conversation_control_events` (auditoria append-only, cascade). RLS habilitado
(decisão 10). Migration baseline-ada em `_prisma_migrations`.

Reaplicar em outro ambiente:
```bash
psql "$DATABASE_URL" -f prisma/migrations/20260728130000_add_conversation_controls/migration.sql
```
(ou aplicar via SQL Editor do Supabase — o `prisma migrate deploy` TRAVA no
pooler pgbouncer; ver nota do Módulo 1.)

---

## 5. Variáveis de ambiente (.env / .env.example)

```
# Redis OPCIONAL — vazio = PG-only. Para ligar: suba o Redis e defina REDIS_HOST.
REDIS_URL=  REDIS_HOST=  REDIS_PORT=6379  REDIS_PASSWORD=  REDIS_DB=0  REDIS_TLS=false
HUMAN_TAKEOVER_KEY_PREFIX=block:v1
HUMAN_TAKEOVER_TTL_SECONDS=3600
OUTBOUND_ORIGIN_TTL_SECONDS=86400
```

Para ligar o cache Redis:
```bash
docker run -d --name whatjuris-redis -p 6379:6379 redis:7-alpine
# no .env: REDIS_HOST=localhost   → reiniciar o dev server
```

---

## 6. Workflow n8n

`workflows/modulo-02-human-takeover.json` — importar em Workflows → Import from
File. Topologia: sanitiza entrada → verifica outbound-IA → resolve origem → se
`from_me`: IA (persiste) ou humano (ativa takeover + persiste); se cliente:
consulta `/control` → bloqueado (persiste + stop) ou liberado
(`continue_to_buffer`).

Este workflow **chama os endpoints do CRM** (não manipula Redis direto) — a
lógica Redis+PG mora no backend, então o n8n só precisa de:
1. Variáveis de ambiente do n8n: `CRM_CALLBACK_URL`, `WEBHOOK_SECRET`.
2. Nenhuma credencial Redis (diferente do rascunho do prompt).

Contrato de saída: o próximo módulo só chama IA quando
`allow_ai===true && human_takeover===false && flow_action==="continue_to_buffer"`.

---

## 7. Testes

```bash
npm test -- tests/human-takeover      # 34 testes, sem Redis/Supabase reais
npm test                              # suíte completa (71)
```

Cobrem os 17 casos da seção 17: origem client/ai/human_mobile, SET EX atômico,
renovação de TTL, control_version++, release+DEL, cache miss→PG, reidratação,
expiração→reconciliação, fallback Redis→PG, falha fechada Redis+PG,
idempotência de mensagem, 403 sem permissão, e workflow válido/sem segredos.
