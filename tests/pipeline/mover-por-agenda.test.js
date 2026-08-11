import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, recordMock, txMock } = vi.hoisted(() => {
  const txMock = { deal: { update: vi.fn() }, $executeRaw: vi.fn() };
  return {
    txMock,
    prismaMock: {
      deal: { findFirst: vi.fn() },
      pipelineStage: { findFirst: vi.fn() },
      activity: { findFirst: vi.fn() },
      dealStageHistory: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn) => fn(txMock)),
    },
    recordMock: { recordActivity: vi.fn() },
  };
});

vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/activities/record', () => ({ recordActivity: recordMock.recordActivity }));

import { moverParaConsultaAgendada, voltarDeConsultaAgendada } from '@/lib/pipeline/mover-por-agenda';

const DEAL = 'f63bafc3-c9be-4172-b305-d8a371cd19a4';
const PIPE = '5a98ac9a-4779-406e-89ff-3bc0377b904a';
const USER = 'f5c7e479-48a8-43ea-ba06-1e5b687e1c6e';

const dealEm = (key, name, type = 'OPEN') => ({
  id: DEAL, pipelineId: PIPE, stageId: `stage-${key}`, stage: { key, name, type },
});
const etapa = (id, name) => ({ id, name });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.deal.findFirst.mockResolvedValue(dealEm('qualificado', 'Qualificado'));
  prismaMock.pipelineStage.findFirst.mockResolvedValue(etapa('stage-consulta', 'Consulta agendada'));
  prismaMock.activity.findFirst.mockResolvedValue(null); // sem outro compromisso futuro
  prismaMock.dealStageHistory.findFirst.mockResolvedValue(null);
  txMock.deal.update.mockResolvedValue({ id: DEAL });
  txMock.$executeRaw.mockResolvedValue(1);
  recordMock.recordActivity.mockResolvedValue({ id: 'act' });
});

describe('moverParaConsultaAgendada', () => {
  it('lead qualificado + evento MEETING → move para consulta_agendada', async () => {
    const r = await moverParaConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(r).toMatchObject({ moved: true, de: 'qualificado', para: 'consulta_agendada' });
    expect(txMock.deal.update).toHaveBeenCalledWith({
      where: { id: DEAL }, data: { stageId: 'stage-consulta' },
    });
  });

  it('escreve SÓ stageId — nunca status (a etapa é a fonte da verdade)', async () => {
    await moverParaConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    const data = txMock.deal.update.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(['stageId']);
    expect(data.status).toBeUndefined();
  });

  it('busca a etapa por KEY, não por UUID', async () => {
    await moverParaConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(prismaMock.pipelineStage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pipelineId: PIPE, key: 'consulta_agendada' } }),
    );
  });

  it('CALL e HEARING também movem', async () => {
    for (const tipo of ['CALL', 'HEARING']) {
      vi.clearAllMocks();
      prismaMock.deal.findFirst.mockResolvedValue(dealEm('qualificado', 'Qualificado'));
      prismaMock.pipelineStage.findFirst.mockResolvedValue(etapa('stage-consulta', 'Consulta agendada'));
      const r = await moverParaConsultaAgendada({ dealId: DEAL, tipo, userId: USER });
      expect(r.moved).toBe(true);
    }
  });

  it('move de QUALQUER etapa aberta, não só de Qualificado', async () => {
    for (const [key, nome] of [
      ['novo_contato', 'Novo contato'],
      ['em_triagem', 'Em triagem pela IA'],
      ['aguardando_docs', 'Aguardando documentos'],
    ]) {
      vi.clearAllMocks();
      prismaMock.deal.findFirst.mockResolvedValue(dealEm(key, nome));
      prismaMock.pipelineStage.findFirst.mockResolvedValue(etapa('stage-consulta', 'Consulta agendada'));
      const r = await moverParaConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
      expect(r).toMatchObject({ moved: true, de: key, para: 'consulta_agendada' });
    }
  });

  it('já em consulta_agendada → nada a fazer', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(dealEm('consulta_agendada', 'Consulta agendada'));
    const r = await moverParaConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(r).toMatchObject({ skipped: true, motivo: 'ja_no_destino' });
    expect(txMock.deal.update).not.toHaveBeenCalled();
  });

  it('estado final (Descartado/Contratado) → NÃO move', async () => {
    for (const [key, nome, type] of [
      ['descartado', 'Descartado', 'LOST'],
      ['contratado', 'Contratado', 'WON'],
    ]) {
      vi.clearAllMocks();
      prismaMock.deal.findFirst.mockResolvedValue(dealEm(key, nome, type));
      const r = await moverParaConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
      expect(r).toMatchObject({ skipped: true, motivo: 'etapa_final' });
      expect(txMock.deal.update).not.toHaveBeenCalled();
    }
  });

  it('TASK (interno) → NÃO move e nem consulta o deal', async () => {
    const r = await moverParaConsultaAgendada({ dealId: DEAL, tipo: 'TASK', userId: USER });
    expect(r).toMatchObject({ skipped: true, motivo: 'tipo_interno' });
    expect(prismaMock.deal.findFirst).not.toHaveBeenCalled();
  });

  it('sem dealId → NÃO move', async () => {
    const r = await moverParaConsultaAgendada({ dealId: null, tipo: 'MEETING', userId: USER });
    expect(r).toMatchObject({ skipped: true, motivo: 'sem_deal' });
    expect(prismaMock.deal.findFirst).not.toHaveBeenCalled();
  });

  it('etapa destino inexistente no funil → skip sem quebrar', async () => {
    prismaMock.pipelineStage.findFirst.mockResolvedValue(null);
    const r = await moverParaConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(r).toMatchObject({ skipped: true, motivo: 'etapa_inexistente' });
  });

  it('erro do banco NÃO propaga (não derruba a criação do evento)', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error('banco fora'));
    const r = await moverParaConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(r).toMatchObject({ skipped: true, motivo: 'erro', erro: 'banco fora' });
  });
});

describe('ator do movimento', () => {
  it('grava o advogado como ator e marca actor_is_ai = false', async () => {
    await moverParaConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    const sql = txMock.$executeRaw.mock.calls.map((c) => c.flat().join('|')).join('\n');
    expect(sql).toContain('app.actor_id');
    expect(sql).toContain(USER);
    expect(sql).toContain('app.actor_is_ai');
    expect(sql).toContain('false');
    expect(sql).not.toContain("'true'");
  });

  it('set_config e UPDATE rodam na MESMA transação', async () => {
    await moverParaConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    // ambos foram chamados no cliente `tx`, não no prisma global
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.$executeRaw).toHaveBeenCalled();
    expect(txMock.deal.update).toHaveBeenCalled();
    // e a Activity entra na mesma transação
    expect(recordMock.recordActivity.mock.calls[0][0].tx).toBe(txMock);
  });

  it('registra o movimento na timeline como origem agenda', async () => {
    await moverParaConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    const arg = recordMock.recordActivity.mock.calls[0][0];
    expect(arg.type).toBe('STAGE_CHANGE');
    expect(arg.metadata).toMatchObject({ fromStageKey: 'qualificado', toStageKey: 'consulta_agendada', origem: 'agenda' });
    expect(arg.userId).toBe(USER);
  });
});

describe('voltarDeConsultaAgendada', () => {
  // Devolve a etapa de origem que o histórico registrou.
  const veioDe = (id, key, name, type = 'OPEN') => {
    prismaMock.dealStageHistory.findFirst.mockResolvedValue({
      fromStageId: id, createdAt: new Date('2026-08-11T16:58:36Z'),
    });
    prismaMock.pipelineStage.findFirst.mockResolvedValue({ id, key, name, type });
  };

  beforeEach(() => {
    prismaMock.deal.findFirst.mockResolvedValue(dealEm('consulta_agendada', 'Consulta agendada'));
    veioDe('stage-qualificado', 'qualificado', 'Qualificado');
  });

  it('volta para a etapa de ORIGEM registrada no histórico', async () => {
    veioDe('stage-novo', 'novo_contato', 'Novo contato');
    const r = await voltarDeConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(r).toMatchObject({ moved: true, de: 'consulta_agendada', para: 'novo_contato' });
    expect(txMock.deal.update).toHaveBeenCalledWith({
      where: { id: DEAL }, data: { stageId: 'stage-novo' },
    });
  });

  it('consulta a entrada MAIS RECENTE em consulta_agendada', async () => {
    await voltarDeConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    const arg = prismaMock.dealStageHistory.findFirst.mock.calls[0][0];
    expect(arg.where).toEqual({ dealId: DEAL, toStageId: 'stage-consulta_agendada' });
    expect(arg.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('após várias idas e vindas, usa a origem da última entrada', async () => {
    // histórico: ... → qualificado → consulta → qualificado → aguardando_docs
    //            → consulta (mais recente, veio de aguardando_docs)
    veioDe('stage-docs', 'aguardando_docs', 'Aguardando documentos');
    const r = await voltarDeConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(r.para).toBe('aguardando_docs');
  });

  it('sem histórico de entrada → NÃO volta (não chuta etapa)', async () => {
    prismaMock.dealStageHistory.findFirst.mockResolvedValue(null);
    const r = await voltarDeConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(r).toMatchObject({ skipped: true, motivo: 'origem_desconhecida' });
    expect(txMock.deal.update).not.toHaveBeenCalled();
  });

  it('histórico com fromStageId nulo → NÃO volta', async () => {
    prismaMock.dealStageHistory.findFirst.mockResolvedValue({ fromStageId: null, createdAt: new Date() });
    const r = await voltarDeConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(r).toMatchObject({ skipped: true, motivo: 'origem_desconhecida' });
  });

  it('origem é estado final → NÃO devolve (automação não fecha caso)', async () => {
    veioDe('stage-descartado', 'descartado', 'Descartado', 'LOST');
    const r = await voltarDeConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(r).toMatchObject({ skipped: true, motivo: 'origem_final' });
    expect(txMock.deal.update).not.toHaveBeenCalled();
  });

  it('lead movido manualmente para outra etapa → NÃO volta', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(dealEm('contratado', 'Contratado'));
    const r = await voltarDeConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(r).toMatchObject({ skipped: true, motivo: 'etapa_ja_alterada' });
    expect(txMock.deal.update).not.toHaveBeenCalled();
  });

  it('ainda há outro compromisso futuro → NÃO volta', async () => {
    prismaMock.activity.findFirst.mockResolvedValue({ id: 'outro-evento' });
    const r = await voltarDeConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(r).toMatchObject({ skipped: true, motivo: 'outro_evento_futuro' });
    expect(txMock.deal.update).not.toHaveBeenCalled();
  });

  it('a busca por evento futuro cobre os 3 tipos e só o que ainda vai acontecer', async () => {
    await voltarDeConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    const where = prismaMock.activity.findFirst.mock.calls[0][0].where;
    expect(where.type.in).toEqual(['MEETING', 'CALL', 'HEARING']);
    expect(where.dueAt.gt).toBeInstanceOf(Date);
    expect(where.dealId).toBe(DEAL);
  });

  it('TASK e sem dealId → NÃO voltam', async () => {
    expect(await voltarDeConsultaAgendada({ dealId: DEAL, tipo: 'TASK' }))
      .toMatchObject({ skipped: true, motivo: 'tipo_interno' });
    expect(await voltarDeConsultaAgendada({ dealId: null, tipo: 'MEETING' }))
      .toMatchObject({ skipped: true, motivo: 'sem_deal' });
    expect(txMock.deal.update).not.toHaveBeenCalled();
  });

  it('erro do banco NÃO propaga (não derruba o cancelamento)', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error('timeout'));
    const r = await voltarDeConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(r).toMatchObject({ skipped: true, motivo: 'erro' });
  });
});
