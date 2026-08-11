import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, recordMock, txMock } = vi.hoisted(() => {
  const txMock = { deal: { update: vi.fn() }, $executeRaw: vi.fn() };
  return {
    txMock,
    prismaMock: {
      deal: { findFirst: vi.fn() },
      pipelineStage: { findFirst: vi.fn() },
      activity: { findFirst: vi.fn() },
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

const dealEm = (key, name) => ({
  id: DEAL, pipelineId: PIPE, stageId: 'atual', stage: { key, name },
});
const etapa = (id, name) => ({ id, name });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.deal.findFirst.mockResolvedValue(dealEm('qualificado', 'Qualificado'));
  prismaMock.pipelineStage.findFirst.mockResolvedValue(etapa('stage-consulta', 'Consulta agendada'));
  prismaMock.activity.findFirst.mockResolvedValue(null); // sem outro compromisso futuro
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

  it('lead em outra etapa → NÃO move', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(dealEm('novo_contato', 'Novo contato'));
    const r = await moverParaConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(r).toMatchObject({ skipped: true, motivo: 'etapa_nao_elegivel' });
    expect(txMock.deal.update).not.toHaveBeenCalled();
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
  beforeEach(() => {
    prismaMock.deal.findFirst.mockResolvedValue(dealEm('consulta_agendada', 'Consulta agendada'));
    prismaMock.pipelineStage.findFirst.mockResolvedValue(etapa('stage-qualificado', 'Qualificado'));
  });

  it('em consulta_agendada e sem outro evento → volta para qualificado', async () => {
    const r = await voltarDeConsultaAgendada({ dealId: DEAL, tipo: 'MEETING', userId: USER });
    expect(r).toMatchObject({ moved: true, de: 'consulta_agendada', para: 'qualificado' });
    expect(txMock.deal.update).toHaveBeenCalledWith({
      where: { id: DEAL }, data: { stageId: 'stage-qualificado' },
    });
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
