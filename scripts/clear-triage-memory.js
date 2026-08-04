// =============================================================================
// WhatJuris CRM — Limpar memória de triagem do agente
// scripts/clear-triage-memory.js
//
// A memória conversacional do agente (nó "Postgres Chat Memory" do n8n) fica em
// public.triage_chat_history, chaveada por session_id = chat:v1:{instance}:{chat_id}.
// Entre conversas de teste, o histórico de uma sessão contamina o contexto da
// próxima com o MESMO chat_id. Este utilitário limpa essa memória.
//
// Uso:
//   node scripts/clear-triage-memory.js --list          lista sessões e contagem
//   node scripts/clear-triage-memory.js 5513978015937   apaga só o chat_id informado
//   node scripts/clear-triage-memory.js --all           apaga TODAS as sessões
//
// (via npm:  npm run clear:triage-memory -- <chat_id|--all|--list>)
//
// Observação: conecta pelo DATABASE_URL do .env (mesmo pooler do app). DELETE é
// DML e funciona no pooler; o dono (postgres) bypassa o RLS da tabela.
// =============================================================================

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const TABELA = 'public.triage_chat_history';

function uso() {
  console.log(
    'Uso:\n' +
      '  node scripts/clear-triage-memory.js --list           lista sessões e contagem\n' +
      '  node scripts/clear-triage-memory.js <chat_id>        apaga só o chat_id (ex.: 5513978015937)\n' +
      '  node scripts/clear-triage-memory.js --all            apaga TODAS as sessões'
  );
}

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    uso();
    return;
  }

  if (arg === '--list') {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT session_id, COUNT(*)::int AS mensagens
         FROM ${TABELA}
        GROUP BY session_id
        ORDER BY session_id`
    );
    if (!rows.length) {
      console.log(`Nenhuma sessão em ${TABELA}.`);
      return;
    }
    console.log(`Sessões (${rows.length}):`);
    for (const r of rows) console.log(`  ${r.session_id}  ->  ${r.mensagens} msg`);
    return;
  }

  if (arg === '--all') {
    const n = await prisma.$executeRawUnsafe(`DELETE FROM ${TABELA}`);
    console.log(`Apagadas ${n} mensagem(ns) — TODAS as sessões de triagem foram limpas.`);
    return;
  }

  // caso restante: um chat_id (só dígitos). session_id termina em ':<chat_id>'.
  const chatId = String(arg).replace(/\D/g, '');
  if (!chatId) {
    console.error(`Argumento inválido: "${arg}".`);
    uso();
    process.exitCode = 1;
    return;
  }
  const n = await prisma.$executeRawUnsafe(
    `DELETE FROM ${TABELA} WHERE session_id LIKE $1`,
    `%:${chatId}`
  );
  console.log(`Apagadas ${n} mensagem(ns) das sessões do chat_id ${chatId}.`);
}

main()
  .catch((e) => {
    console.error('Erro ao limpar memória de triagem:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
