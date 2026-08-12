// =============================================================================
// WhatJuris CRM — Geração de parcelas (Financeiro, fatia 1)
// lib/financeiro/parcelamento.js
//
// Funções PURAS e testáveis: nada de Prisma nem de rede. O endpoint chama
// `gerarParcelas` e grava o resultado numa transação.
//
// ⚠️ Toda a aritmética roda em CENTAVOS INTEIROS. Fazer isso em float traria
// 0.1 + 0.2 === 0.30000000000000004 para dentro de valores de honorário — a
// soma das parcelas deixaria de bater com o total, e a diferença apareceria
// como centavos fantasma no relatório do escritório.
// =============================================================================

// "1234.56" | 1234.56 -> 123456. Rejeita o que não vira dinheiro válido.
export function paraCentavos(valor) {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return null;
    return Math.round(valor * 100);
  }
  if (typeof valor === 'string') {
    const limpo = valor.trim().replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
    return Math.round(Number(limpo) * 100);
  }
  return null;
}

// 123456 -> "1234.56" (string, para o Prisma converter em Decimal sem passar
// por float).
export function paraDecimalString(centavos) {
  const sinal = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  return `${sinal}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Divide o total em N parcelas de valor inteiro em centavos.
//
// Regra: cada parcela recebe o piso da divisão e a sobra vai TODA para a
// primeira. R$ 6.000 em 7x = 857,15 + 6× 857,14 — a soma bate exatamente com o
// total. A sobra vai na primeira (e não na última) porque a primeira costuma
// ser a entrada, onde um valor "quebrado" surpreende menos.
export function dividirCentavos(totalCentavos, numeroDeParcelas) {
  const base = Math.floor(totalCentavos / numeroDeParcelas);
  const sobra = totalCentavos - base * numeroDeParcelas;
  return Array.from({ length: numeroDeParcelas }, (_, i) => (i === 0 ? base + sobra : base));
}

// Soma meses a uma data-calendário preservando o dia quando possível.
//
// 31/01 + 1 mês não existe: o JS transborda para 03/03. Aqui a data satura no
// último dia do mês de destino (28/02), que é o que qualquer contrato entende
// por "vencimento dia 31".
export function somarMeses(dataISO, meses) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  const diaFinal = Math.min(dia, ultimoDia);
  const mm = String(alvo.getUTCMonth() + 1).padStart(2, '0');
  return `${alvo.getUTCFullYear()}-${mm}-${String(diaFinal).padStart(2, '0')}`;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Monta as N parcelas prontas para gravar.
// Devolve { ok: true, parcelas, totalCentavos } ou { ok: false, erro }.
export function gerarParcelas({ total, parcelas, primeiroVencimento }) {
  const totalCentavos = paraCentavos(total);
  if (totalCentavos === null || totalCentavos <= 0) {
    return { ok: false, erro: 'Valor total inválido.' };
  }
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 60) {
    return { ok: false, erro: 'Número de parcelas deve ser inteiro entre 1 e 60.' };
  }
  // Cada parcela precisa valer ao menos 1 centavo, senão o piso vira zero.
  if (totalCentavos < parcelas) {
    return { ok: false, erro: 'Valor total é baixo demais para esse número de parcelas.' };
  }
  if (!DATA_ISO.test(String(primeiroVencimento ?? ''))) {
    return { ok: false, erro: 'Data do primeiro vencimento inválida.' };
  }
  // Guarda contra data inexistente (2026-02-30), que o Date aceitaria rolando.
  const [a, m, d] = primeiroVencimento.split('-').map(Number);
  const teste = new Date(Date.UTC(a, m - 1, d));
  if (teste.getUTCMonth() !== m - 1 || teste.getUTCDate() !== d) {
    return { ok: false, erro: 'Data do primeiro vencimento inválida.' };
  }

  const valores = dividirCentavos(totalCentavos, parcelas);

  return {
    ok: true,
    totalCentavos,
    parcelas: valores.map((centavos, i) => ({
      number: i + 1,
      amount: paraDecimalString(centavos),
      centavos,
      dueDate: somarMeses(primeiroVencimento, i),
    })),
  };
}
