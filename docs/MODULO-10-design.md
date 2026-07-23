# Módulo 10 — Migração de Design

> Requer todos os anteriores. Fonte da verdade visual: `whatjuris.html`.
> Regra única: **copiar, não recriar** — todo valor (cor, medida) vem do arquivo.

## O que foi entregue (Módulo 10)
- `styles/whatjuris-tokens.css` (`:root` + `@import` da fonte Inter) e
  `whatjuris-base.css` (reset, scrollbar, pulse) — importados no `_app.js`.
- Shell escuro: `shared/layout-components/sidebar/sidebar.js` (logo balança, pulse
  dot verde, 9 itens de menu com SVGs exatos, footer com avatar) e
  `contentlayout.js` reescrito (sidebar fixa 220px + main, Redux Provider).
- `shared/components/wj/index.js` — WjCard, AreaBadge, StatusBadge, MiniAvatar,
  WjButton, WjScreenHeader.
- Dashboard (barras em CSS puro) e Pipeline/Kanban (colunas 258px, cards com barra
  de urgência) reestilizados.

## BUG CRÍTICO encontrado e corrigido
Ao aplicar o design, **toda a área admin parou de atualizar o DOM** (o `setState`
não refletia, embora os efeitos rodassem e o estado mudasse). Causa: no
`_document.js`, colocar `<Head>` **com filhos** (font links) junto a um `<link>`
que já era filho **direto de `<Html>`** quebrava a hidratação e descolava o root
do React. Correção: `_document.js` voltou a `<Head />`; a fonte Inter entra via
`@import` no CSS. Lição: nunca pôr `<link>` como filho direto de `<Html>` nem
misturá-lo com `<Head>` com filhos.

Correções acessórias:
- `Cache-Control: no-store` no guard (withAuth/withPublic) — sem isso o navegador
  recebia `304` com corpo vazio em XHR e a app recebia dados vazios.
- `reactStrictMode: false` — o duplo-invoke em dev, com SSR de conteúdo dinâmico,
  agravava o mismatch (não afeta o build de produção).
