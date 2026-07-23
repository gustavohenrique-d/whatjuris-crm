# Módulo 10B — Design: Telas Restantes

> Requer Módulo 10. Fonte da verdade visual: `whatjuris.html`.

## Telas reestilizadas
- `pages/admin/conversas/index.js` — `chat-layout` (lista 308px + painel), bolhas
  MESSAGE_IN (card-alt) e MESSAGE_OUT (gradiente accent→accent2), status com dot.
- `pages/admin/clientes/index.js` e `processos/index.js` — `data-table`.
- `pages/admin/agenda/index.js` — FullCalendar com CSS dark + cores por tipo.
- `pages/admin/financeiro/index.js` — `fin-summary` (3 cards) + tabela.
- `pages/admin/relatorios/index.js` — donut e linha em **SVG puro** (sem ApexCharts).
- `pages/admin/configuracoes/index.js` — `settings-section`/`row` + toggle.
- `pages/login.js` — dois painéis dark (formulário + gradiente).

## Bugs de configuração corrigidos
- `NEXTAUTH_URL` de `:3000` → `:3100` (o dev roda em 3100; o valor errado fazia o
  `callbackUrl` do login apontar para a porta errada).
- `DATABASE_URL` trocado para o **pooler do Supabase**
  (`aws-1-sa-east-1.pooler.supabase.com:6543`, user `postgres.<ref>`,
  `?pgbouncer=true`) — o host DIRETO `db.<ref>.supabase.co` parou de resolver por
  DNS nesta rede.

## Estado
Todas as 8 telas compilam (200) e o design renderiza (Conversas e Login
verificados no navegador). A verificação com dados ponta-a-ponta ficou bloqueada
por instabilidade de rede da máquina com o Supabase (ver `docs/BACKLOG.md`) — não
é defeito de código; as telas usam o mesmo padrão de fetch do Dashboard/Pipeline.

## Fora de escopo (possível "10C")
- Drawer de detalhe do lead qualificado (timeline lateral do `whatjuris.html`).
