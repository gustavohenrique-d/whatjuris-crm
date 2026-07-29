import { describe, it, expect } from 'vitest';
import { parseBufferItems, consolidate, checkLimits } from '@/lib/buffer/consolidate';

const item = (id, message, receivedAt, bufferedAt) =>
  JSON.stringify({ message_id: id, message, received_at: receivedAt, buffered_at: bufferedAt });

describe('parseBufferItems + consolidate', () => {
  it('uma única mensagem → consolida normalmente (caso 1)', () => {
    const parsed = parseBufferItems([item('w1', 'Olá', '2026-07-29T14:30:00.000Z', 'a')]);
    const c = consolidate(parsed);
    expect(c.message).toBe('Olá');
    expect(c.buffer_count).toBe(1);
    expect(c.buffered_message_ids).toEqual(['w1']);
  });

  it('três mensagens → consolida na ordem de received_at (caso 2)', () => {
    const parsed = parseBufferItems([
      item('w2', 'Segunda', '2026-07-29T14:30:02.000Z', 'b'),
      item('w1', 'Primeira', '2026-07-29T14:30:00.000Z', 'a'),
      item('w3', 'Terceira', '2026-07-29T14:30:05.000Z', 'c'),
    ]);
    const c = consolidate(parsed);
    expect(c.message).toBe('Primeira\n\nSegunda\n\nTerceira');
    expect(c.buffered_message_ids).toEqual(['w1', 'w2', 'w3']);
    expect(c.buffer_started_at).toBe('2026-07-29T14:30:00.000Z');
    expect(c.buffer_ended_at).toBe('2026-07-29T14:30:05.000Z');
  });

  it('mesmo texto, message_id diferentes → ambos processados (caso 4)', () => {
    const parsed = parseBufferItems([
      item('w1', 'Ok', '2026-07-29T14:30:00.000Z', 'a'),
      item('w2', 'Ok', '2026-07-29T14:30:01.000Z', 'b'),
    ]);
    const c = consolidate(parsed);
    expect(c.buffer_count).toBe(2);
    expect(c.message).toBe('Ok\n\nOk');
  });

  it('JSON inválido na lista → item filtrado, não quebra (caso 10)', () => {
    const parsed = parseBufferItems([
      item('w1', 'Boa', '2026-07-29T14:30:00.000Z', 'a'),
      '{ isso não é json',
      JSON.stringify({ message_id: 'w2', message: '   ' }), // vazio → filtrado
    ]);
    expect(parsed).toHaveLength(1);
    expect(consolidate(parsed).message).toBe('Boa');
  });

  it('áudio demorado chega fora de ordem → reordena por received_at (caso 18)', () => {
    const parsed = parseBufferItems([
      item('audio', 'transcrição', '2026-07-29T14:30:00.000Z', 'z'), // recebido antes, bufferizado depois
      item('texto', 'oi rápido', '2026-07-29T14:30:03.000Z', 'a'),
    ]);
    expect(parsed.map((i) => i.message_id)).toEqual(['audio', 'texto']);
  });
});

describe('checkLimits', () => {
  it('dentro dos limites → ok', () => {
    expect(checkLimits({ count: 3, characters: 100, message: 'x', maxMessages: 50, maxCharacters: 30000 }))
      .toEqual({ ok: true, reason: null });
  });
  it('excede máx. mensagens → BUFFER_LIMIT_EXCEEDED (caso 11)', () => {
    expect(checkLimits({ count: 51, characters: 100, message: 'x', maxMessages: 50, maxCharacters: 30000 }).reason)
      .toBe('BUFFER_LIMIT_EXCEEDED');
  });
  it('excede máx. caracteres → BUFFER_LIMIT_EXCEEDED (caso 12)', () => {
    expect(checkLimits({ count: 2, characters: 30001, message: 'x', maxMessages: 50, maxCharacters: 30000 }).reason)
      .toBe('BUFFER_LIMIT_EXCEEDED');
  });
  it('mensagem vazia → BUFFER_EMPTY_MESSAGE', () => {
    expect(checkLimits({ count: 1, characters: 0, message: '   ', maxMessages: 50, maxCharacters: 30000 }).ok)
      .toBe(false);
  });
});
