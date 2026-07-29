# Módulo 08H — Completar CRM de Atendimento (Grupo A)

Liga a tela de conversas ao backend já existente: takeover/devolver, envio manual
pelo atendente, filtros na lista, badges de triagem e polling. **Sem** WebSocket,
outbox ou worker (sprints futuras, conforme o prompt).

---

## 1. O que passou de "casca visual" para funcional

| Antes | Agora |
|---|---|
| Botão "Assumir conversa" sem ação | Chama `POST /takeover` (sessão), atualiza UI, habilita a caixa |
| "Devolver para IA" inexistente | Botão criado, aparece só p/ o responsável, chama `POST /release` |
| Caixa de mensagem estática (`<div>`) | `<textarea>` real: Enter envia, Shift+Enter quebra linha, contador 4000, otimista, preserva rascunho em falha |
| Urgência/fase não exibidas | Badges de urgência (cor), fase da triagem e "qualificado em" |
| Filtros não funcionavam | Status, urgência e busca — persistidos na URL |
| Polling só no dashboard | Mensagens a cada 5s, lista a cada 15s, pausa com aba oculta |

---

## 2. Backend

- **`POST /api/conversations/[instance_name]/[chat_id]/send-message`** — user-facing
  (withAuth + permissão `conversation.takeover`). Lógica em
  `lib/conversations/send-manual.js`: exige `mode=human`, valida responsável (ou
  override `deal.update.all`/`deal.reassign`), idempotente por `client_request_id`
  (namespace `manual:`), envia pela Meta, grava atividade como **humano/crm_human**
  (não AI), e **renova o TTL** do takeover (`refreshTakeover`).
- **`GET .../control`** enriquecido: agora retorna `taken_over_by` +
  `taken_over_by_name` (para a UI mostrar o atendente e liberar o "Devolver").
- **`GET /api/deals`** ganhou filtros `status` / `urgencia` / `search` (helper puro
  `lib/query/deal-filters.js`) e passou a serializar `urgencia`, `faseTriage`,
  `qualifiedAt`, `instanceName` (com default `WHATSAPP_INSTANCE_NAME`).

Reutiliza `lib/whatsapp/send.js`, `lib/conversations/control.js` (isBlocked/
refreshTakeover), `lib/activities/record.js`, `lib/webhooks/idempotency.js`.

---

## 3. Frontend (`pages/admin/conversas/index.js`)

- Sessão via `useSession()` → `user.id` + `permissions` (decide botões/caixa).
- `instance_name`/`chat_id` vêm de `deal.instanceName` + `deal.contact.whatsapp`.
- Envio otimista: mostra a mensagem como "enviando…", confirma via reload ou
  marca "falha ao enviar" e devolve o rascunho.
- Polling pausado quando `document.visibilityState !== 'visible'`.
- Nenhum token/segredo no cliente (as chamadas usam o cookie de sessão).

---

## 4. Testes

```bash
npm test -- conversations   # 14 testes
npm test                    # suíte completa (182)
```

Cobrem: `send-manual` (mode≠human→409, não-responsável→403, override, sucesso
grava humano + renova TTL, idempotência, skipped sem credencial) e os filtros
(`applyListFilters`: status→fase, urgência, busca nome/telefone, atendimento
humano, sem filtros). Meta/Prisma/Redis mockados.

> Verificação: sintaxe (esbuild JSX) + 182 testes. O **render ao vivo** da tela
> reescrita depende de sessão autenticada no navegador — recomendável abrir
> `/admin/conversas` logado e conferir botões, caixa e filtros.

---

## 5. Fora do escopo (sprints futuras, por decisão do prompt)

WebSocket/Socket.IO · outbox transacional · worker de envio dedicado · E2E.
