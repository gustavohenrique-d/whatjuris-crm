# Módulo 08G — Fragmentação e Envio Humanizado

Divide a resposta da IA em parágrafos (`\n\n`) e os envia como mensagens
separadas ao WhatsApp, com delay de "digitação" entre elas — imitando um
atendente. Idempotente por fragmento, com lock por conversa e revalidação de
Human Takeover a cada fragmento.

> **Notas / desvios do prompt**
> - Env Meta: o projeto usa `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN`
>   / `WHATSAPP_GRAPH_API_VERSION` (não `META_*`). Reutilizados.
> - `response_id` **não existia** na saída do Módulo 4 → adicionado: o endpoint
>   `deals/triage` agora retorna `response_id` (`crypto.randomUUID()`) e o
>   workflow 04 o propaga no "Set - Saída para WhatsApp".
> - Workflow sem `$env` (plano free), URLs literais `host.docker.internal:3100`,
>   HTTP do CRM via credencial **Custom Auth**, envio Meta via credencial Bearer.

---

## 1. Fluxo

```
resposta da IA (Módulo 4)
  → fragmenta por \n\n  → Split Out → Loop (batch 1):
      revalida takeover  → reserva (idempotente) → envia à Meta
      → confirma no CRV  → delay humanizado (só entre fragmentos) → próximo
```

Idempotência por `(instance, chat, response_id, fragment_index)` (unique). Retry
não reenvia fragmento já `sent` (reserve devolve `should_send=false`). Takeover
no meio → `cancel-remaining` marca os restantes como `cancelled` (nunca os `sent`).

---

## 2. Banco (já aplicado no Supabase)

`outbound_message_fragments` (uma linha por fragmento; status
reserved/sending/sent/failed/unknown/cancelled; FK deal_id; unique da
idempotência; RLS). Migration `20260729140000_add_outbound_message_fragments`
baseline-ada.

---

## 3. Lógica (backend, testável)

| Arquivo | Papel |
|---|---|
| `lib/whatsapp/fragment.js` | `fragmentMessage` (por \n\n, subdivide > maxChars, erro se > maxFragments) + `calculateTypingDelay` |
| `lib/whatsapp/send-lock.js` | lock por conversa (SET NX EX; renew/release compare-and-* via Lua; degrada sem Redis) |

Reutiliza `lib/whatsapp/{send,outbound-registry}.js`, `lib/activities/record.js`,
`lib/conversations/control.js`.

---

## 4. Endpoints internos (x-webhook-secret)

```
POST /api/internal/outbound-fragments/reserve
     → takeover(409) / control_version(409) / content_hash / upsert idempotente
     → { should_send, reservation_id, status, meta_message_id? }
POST /api/internal/outbound-fragments/[reservation_id]/confirm
     → status 'sent' + recordWhatsappMessage(out, remetente=ia) + registerOutboundAI
POST /api/internal/outbound-fragments/cancel-remaining
     → marca 'cancelled' de from_index em diante (exceto os já 'sent')
```

`registerOutboundAI` é o que faz o **Módulo 2** reconhecer o eco `from_me=true`
como IA (e não humano) — fecha o ciclo com o Human Takeover.

---

## 5. Variáveis de ambiente (.env / .env.example)

```
WHATSAPP_MAX_TEXT_CHARS=4000   WHATSAPP_MAX_FRAGMENTS_PER_RESPONSE=10
WHATSAPP_TYPING_DELAY_MIN_MS=2000  WHATSAPP_TYPING_DELAY_MAX_MS=4000
WHATSAPP_TYPING_MS_PER_CHARACTER=30  WHATSAPP_TYPING_INDICATOR_ENABLED=false
WHATSAPP_SEND_TIMEOUT_MS=15000  WHATSAPP_SEND_MAX_RETRIES=3  WHATSAPP_SEND_LOCK_TTL_SECONDS=120
```
Meta reutiliza `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_GRAPH_API_VERSION` (já existentes).

---

## 6. Workflow n8n

`workflows/modulo-05-envio-humanizado-whatsapp.json`. Split Out → Loop Over Items
(batch 1) → revalida → reserva → Meta → confirma → delay → próximo.

Ajustes manuais no n8n após importar:
1. Credencial **Bearer** (`Meta WhatsApp Token`) → `Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>` no nó *HTTP - Meta Enviar Texto*.
2. No mesmo nó, trocar `SEU_PHONE_NUMBER_ID` na URL pelo `WHATSAPP_PHONE_NUMBER_ID` real (o workflow não usa `$env`).
3. Credencial **Custom Auth** nos nós HTTP que chamam `host.docker.internal:3100`.
4. Conferir a religação do **Loop Over Items** (saídas done/loop) — a fiação do
   loop às vezes precisa de ajuste fino na UI do n8n após importar.

Retry da Meta: o nó usa `retryOnFail` (3 tentativas, 2s) — cobre 429/5xx. 4xx
de negócio (400/401) o nó não re-tenta de forma diferenciada; ajuste se preciso.

---

## 7. Testes

```bash
npm test -- fragment    # 31 testes
npm test                # suíte completa (168)
```

Cobrem: fragmentação (1 parágrafo, N parágrafos, CRLF, linhas vazias, espaços,
emojis, links, > maxChars subdividido, > maxFragments erro, ordem por index),
delay no intervalo, lock (adquire/nega/renova/libera/degrada, chaves por
conversa), endpoints (reserve takeover/control_version/idempotência sent vs
retry, confirm com record+registerOutboundAI, cancel-remaining ignora sent),
workflow válido/sem token. **Meta não é chamada** nos testes.

Runtime verificado: `prisma generate` + smoke do model contra o banco real
(unique bloqueia duplicata; cancel ignora `sent`).
