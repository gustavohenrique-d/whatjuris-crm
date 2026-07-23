# Backlog — WhatJuris CRM

Itens pendentes que não pertencem a um módulo específico ou que precisam ser
resolvidos antes de produção.

## Produção — obrigatório antes de ir ao ar

- [ ] **`WHATSAPP_APP_SECRET`** precisa ser preenchido em produção. O webhook
  do WhatsApp só valida a assinatura HMAC (`x-hub-signature-256`) quando
  `NODE_ENV=production`, e a chave é o **App Secret** da Meta (não o access
  token). Sem ele, em produção o webhook rejeita toda mensagem (401).
- [ ] **`WEBHOOK_SECRET`** e **`WHATSAPP_VERIFY_TOKEN`** já gerados no `.env`
  local; gerar valores próprios no ambiente de produção.

## Remover antes de produção

Rotas de diagnóstico criadas durante o desenvolvimento. Não devem ir para
produção — expõem contexto de sessão/escopo sem finalidade de negócio.

- [ ] `pages/api/me.js` — dump do contexto do usuário (Módulo 2A)
- [ ] `pages/api/_test_scope.js` — diagnóstico de escopo `own`/`all` (Módulo 3)

## Decisões de política em aberto

- [ ] **Escopo de leitura do estagiário (intern).** O seed do Módulo 1 dá
  `deal.read.own` (vê só os próprios casos). A spec do Módulo 3 assumia
  `deal.read.all` (vê todos, somente leitura). Mantido `own` por sigilo
  profissional. Decidir e, se for o caso, trocar no seed + reatribuir a
  permissão ao papel.

## Débitos técnicos conhecidos

- [ ] **`_count.users` nas rotas de papéis inclui soft-deleted.** As rotas de
  `/api/roles` contam usuários com `deleted_at` preenchido. Filtrar quando o
  Prisma permitir `_count` com `where` na relação de forma limpa.
- [ ] **`tempo-por-estagio` conta histórico de deals soft-deletados.** A query
  faz JOIN em `deal_stage_history` sem filtrar deals com `deleted_at`. Avaliar
  filtrar, ou aceitar (o evento de movimentação de fato ocorreu).
- [ ] **Rate limit de `forgot-password` é in-memory.** Reinício do servidor
  zera o contador. Trocar por Redis/tabela se o deploy reiniciar com
  frequência (Módulo 2B).
- [x] **Conexão do banco trocada para o pooler do Supabase.** O host direto
  `db.<ref>.supabase.co` PAROU de resolver por DNS nesta rede (`ping` não acha
  o host). `DATABASE_URL` agora usa o pooler Supavisor:
  `aws-1-sa-east-1.pooler.supabase.com:6543` (atenção: é `aws-1`, não `aws-0`)
  com usuário `postgres.<ref>` e `?pgbouncer=true`. Para migrations, use
  `DIRECT_URL` (comentado no .env) quando o host direto voltar a resolver.
- [ ] **Conectividade Supabase intermitente nesta rede/máquina.** Tanto direto
  quanto pooler oscilam (Can't reach database server). Quando cai, o login e as
  telas com dados falham (as APIs retornam 500/empty). É rede/infra, não código.
  Rodar de outra rede ou aguardar estabilizar.
- [x] **`NEXTAUTH_URL` corrigido de :3000 para :3100** (o dev roda em 3100). O
  valor errado fazia o callbackUrl do login apontar para a porta errada.

## Lembretes operacionais

- Ao mudar `schema.prisma`, **reiniciar o dev server** — o cliente Prisma fica
  em memória e o hot-reload não recarrega `node_modules`.
- `next.config.js` tem `trailingSlash: true` — rotas de API exigem barra final.
