# Módulo 08E — Buffer e Consolidação de Mensagens

Debounce por conversa: agrupa mensagens que chegam em rajada numa janela de
~10s e as consolida numa única mensagem (`\n\n`) antes de acionar a IA. Evita
que o lead que manda 5 mensagens seguidas dispare 5 respostas.

> **Notas de arquitetura**
> - Stack real: Pages Router + JS + Prisma/Supabase + Redis (do Módulo 2).
> - **Redis na porta 6380** (container dedicado `whatjuris-redis`). O prompt cita
>   6379/rodar container — **ignorado**, já configurado. `.env` mantém 6380.
> - A **lógica atômica roda em Lua** (`redis/*.lua`) via `redis.eval`, exposta por
>   rotas internas — o nó Redis do n8n não faz EVAL.
> - O workflow n8n **chama os endpoints do CRM** (não manipula Redis direto).
> - n8n roda **local** (Docker, `localhost:5678`).

---

## 1. Fluxo (debounce)

```
msg1 chega → append (buffer Redis) → Wait 10s
msg2 chega +3s → append (renova `latest`) → Wait 10s
msg1 acorda → latest != msg1 → execução obsoleta, encerra
msg2 acorda → latest == msg2 → claim+drain → consolida → revalida takeover → IA
```

Identidade **sempre por `message_id`**, nunca por texto (duas msgs `"Ok"` são
distintas). `force_flush` quando o buffer atinge `MAX_MESSAGES` (pula o Wait).

---

## 2. Scripts Lua (fonte da atomicidade)

| Script | Faz |
|---|---|
| `redis/buffer_append.lua` | `SADD seen` (idempotência) + `RPUSH` + renova `latest`; retorna `force_flush` |
| `redis/buffer_claim_and_drain.lua` | só o `latest` reclama; move p/ `processing` (recovery), apaga `messages`/`latest` |

Executados por `lib/redis/eval-script.js` (`evalScript(redis, nome, numkeys, keys, args)`),
com cache em memória dos `.lua`.

Chaves (`lib/buffer/keys.js`), hash tag `{inst:chat}` p/ Redis Cluster:
```
buffer:v1:{inst:chat}:messages | :latest | :seen | :processing:{message_id}
```

---

## 3. Endpoints internos (x-webhook-secret)

| Rota | Faz |
|---|---|
| `POST /api/internal/buffer/append`   | roda `buffer_append.lua` → `{appended,duplicate,length,force_flush}` |
| `POST /api/internal/buffer/claim`    | roda `buffer_claim_and_drain.lua` → `{claimed,recovered,items,reason}` |
| `GET  /api/internal/buffer/latest`   | lê `latest` → `{latest_message_id}` |
| `POST /api/internal/buffer/ack`      | `DEL processing` (após checkpoint) |
| `POST /api/internal/buffer/checkpoint` | persiste em `message_batches` (idempotente por owner_message_id) |

Revalidação do takeover reusa `GET /api/conversations/{inst}/{chat}/control` (Módulo 2).

> **trailingSlash:** o projeto tem `trailingSlash: true` — chamadas de API sem
> barra final recebem 308. O nó HTTP do n8n **segue redirects por padrão** e o
> 308 preserva método+corpo, então funciona; mas se preferir evitar o hop, use a
> URL com barra final (`.../append/`).

Redis indisponível → endpoints devolvem **503** → o workflow trata como
`allow_ai=false` / `stop_and_retry` (falha fechada, não chama a IA).

---

## 4. Banco (já aplicado no Supabase)

`message_batches` (checkpoint do lote), unique `(instance_name, chat_id,
owner_message_id)`, RLS habilitado. Migration `20260729120000_add_message_batches`
baseline-ada no `_prisma_migrations`.

---

## 5. Variáveis de ambiente (.env / .env.example)

```
MESSAGE_BUFFER_WAIT_SECONDS=10
MESSAGE_BUFFER_TTL_SECONDS=300
MESSAGE_BUFFER_SEEN_TTL_SECONDS=600
MESSAGE_BUFFER_PROCESSING_TTL_SECONDS=300
MESSAGE_BUFFER_MAX_MESSAGES=50
MESSAGE_BUFFER_MAX_CHARACTERS=30000
MESSAGE_BUFFER_KEY_PREFIX=buffer:v1
```
Limites excedidos → `buffer_status=error`, `BUFFER_LIMIT_EXCEEDED`, **não trunca**.

---

## 6. Workflow n8n

`workflows/modulo-03-buffer-mensagens.json` — importar em Workflows → Import.
Topologia: precondições → prepara chaves → append → (dup? encerra) → (force_flush?
pula Wait) → Wait 10s → latest → é a última? → claim → parse/ordena → limites →
consolida → revalida takeover → checkpoint → ack → saída.

Config no n8n: variáveis `CRM_CALLBACK_URL`, `WEBHOOK_SECRET`; credencial Header
Auth `x-webhook-secret` para os nós HTTP. Sem credencial Redis (a lógica Redis
está no backend).

---

## 7. Testes

```bash
npm test -- tests/buffer     # 35 testes
npm test                     # suíte completa (109)
```

Cobrem: consolidação/ordenação por received_at, idempotência, limites, chaves
isoladas por conversa, glue dos endpoints (auth/zod/redis-down), workflow
válido/sem segredos, e **integração REAL** dos scripts Lua contra o Redis
(porta 6380, db 15 isolado): append/duplicate/force_flush, claim latest/
não-latest/recovery/not-found.

Validado end-to-end via curl contra o dev server (Redis+DB reais): append →
dedup → latest → claim (rejeita não-latest, drena o latest em ordem) →
checkpoint idempotente → ack.
