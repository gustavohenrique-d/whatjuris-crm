# Módulo 10C — Drawer de Detalhe do Lead

> Requer Módulos 4, 5 e 10. Fonte da verdade visual: o `.drawer` do `whatjuris.html`.

Painel deslizante (pela direita) que abre ao clicar em **"Ver detalhes →"** no
Kanban (e em **"Ver ficha"** no cabeçalho de uma conversa). Mostra a ficha do
lead à esquerda e a timeline de atividades à direita, sem sair da tela atual.

## Arquivos

- **`shared/context/DealDrawerContext.js`** — Context global. Expõe
  `openDeal(id)` / `closeDeal()` e o `dealId` aberto. `useDealDrawer()` lança se
  usado fora do provider.
- **`shared/components/wj/DealDrawer.js`** — O componente do drawer:
  - Overlay `rgba(5,6,10,0.65)` (z-index 100) + painel `width 960 / maxWidth 92vw`
    animado por `right .32s cubic-bezier(.4,0,.2,1)` (z-index 101), cabeçalho
    sticky, corpo em grid `360px 1fr`.
  - **`LeadFicha`** (coluna esquerda): avatar, contato, campos (área, estágio,
    status, valor, prioridade, responsável, entrada), botões "Mover para estágio"
    (busca os estágios em `/api/pipelines/`), link "Abrir no WhatsApp" e
    "Ver ficha completa →" (`/admin/deals/:id`).
  - **`Timeline`** (coluna direita): textarea para nota nova (POST NOTE) +
    linha do tempo das atividades com badge por tipo.
  - Fecha com ESC ou clique no overlay; trava o scroll do `body` enquanto aberto.
- **`shared/layout-components/layout/contentlayout.js`** — Envolve o shell com
  `<DealDrawerProvider>` e monta `<DealDrawer />` uma única vez (global). Como o
  `_app.js` importa o `Contentlayout` estaticamente, o provider cobre toda a área
  autenticada.
- **`pages/admin/pipeline/index.js`** — "Ver detalhes →" agora chama
  `openDeal(deal.id)` (antes era `router.push`). Escuta o evento global
  `whatjuris:deal-moved` para recarregar o funil quando o drawer move um lead.
- **`pages/admin/conversas/index.js`** — Botão **"Ver ficha"** no cabeçalho do
  chat abre o drawer (`openDeal(selected.id)`).

## Dados

Ao abrir, o drawer busca em paralelo `GET /api/deals/:id/` e
`GET /api/deals/:id/activities/?limit=50`. Mover estágio: `POST /api/deals/:id/move/`
com `{ stageId }` e então dispara `whatjuris:deal-moved` (o Kanban recarrega).
Nota: `POST /api/deals/:id/activities/` com `{ type:'NOTE', content }`.

## Decisão de UX (conversas)

Na tela de Conversas, o clique no item da lista **continua** carregando o chat
(MESSAGE_IN/OUT) — é a função central da tela. Em vez de sequestrar esse clique,
adicionamos um botão "Ver ficha" no cabeçalho do chat para abrir o drawer. Assim
chat e ficha coexistem.

## Correção sobre a spec

O bloco do link "Abrir no WhatsApp" na spec vinha sem a tag `<a>` de abertura
(linha em branco antes do `href`). Corrigido ao escrever o componente.

## Estado

Todos os arquivos compilam (login 200; `/admin/pipeline/` autenticado 200 — o
`useDealDrawer()` resolve, provando que o provider cobre a árvore). Os três
endpoints consumidos pelo drawer foram verificados com dados reais
(deal, activities, pipelines retornam 200 com o shape esperado).
