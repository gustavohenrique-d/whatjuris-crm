import { describe, it, expect } from 'vitest';
import { buildLawyerNotification } from '@/lib/notifications/lawyer';

describe('buildLawyerNotification — lead_qualified', () => {
  const out = buildLawyerNotification({
    event: 'lead_qualified',
    data: { name: 'João Silva', whatsapp: '5513978015937', area: 'Trabalhista', urgencia: 'Alta', resumo: 'Demissão sem justa causa.' },
  });

  it('subject inclui o nome', () => {
    expect(out.subject).toContain('João Silva');
    expect(out.subject).toContain('qualificado');
  });
  it('e-mail e whatsapp incluem os dados do lead', () => {
    for (const campo of ['João Silva', '5513978015937', 'Trabalhista', 'Alta']) {
      expect(out.emailHtml).toContain(campo);
      expect(out.whatsappText).toContain(campo);
    }
    expect(out.emailHtml).toContain('Demissão sem justa causa.'); // resumo só no e-mail
  });
});

describe('buildLawyerNotification — lead_disqualified', () => {
  const out = buildLawyerNotification({
    event: 'lead_disqualified',
    data: { name: 'Carlos Souza', whatsapp: '5511988887777', area: 'Tributário', motivo: 'Fora das áreas de atuação do escritório.' },
  });

  it('subject inclui o nome e sinaliza o descarte', () => {
    expect(out.subject).toContain('Carlos Souza');
    expect(out.subject).toContain('descartado');
  });
  it('whatsapp segue o formato "Lead descartado — Nome (Área) — Motivo"', () => {
    expect(out.whatsappText).toContain('Lead descartado — Carlos Souza (Tributário)');
    expect(out.whatsappText).toContain('Fora das áreas de atuação do escritório.');
    expect(out.whatsappText).toContain('5511988887777');
  });
  it('e-mail traz os dados e o motivo', () => {
    for (const campo of ['Carlos Souza', '5511988887777', 'Tributário', 'Fora das áreas de atuação do escritório.']) {
      expect(out.emailHtml).toContain(campo);
    }
  });
  it('sem motivo cai em placeholder seguro', () => {
    const semMotivo = buildLawyerNotification({ event: 'lead_disqualified', data: { name: 'Ana' } });
    expect(semMotivo.whatsappText).toContain('*Motivo:* —');
    expect(semMotivo.emailHtml).toContain('não informada'); // área
  });
});

describe('buildLawyerNotification — ai_failure_takeover', () => {
  const out = buildLawyerNotification({
    event: 'ai_failure_takeover',
    data: { name: 'Maria', whatsapp: '5511999999999', area: 'Cível' },
  });

  it('avisa que a IA falhou e precisa de atendimento humano', () => {
    expect(out.subject).toContain('IA falhou');
    expect(out.subject).toContain('Maria');
    expect(out.emailHtml).toContain('atendimento humano');
    expect(out.whatsappText).toContain('Maria');
    expect(out.whatsappText).toContain('5511999999999');
  });
});

describe('buildLawyerNotification — defaults e evento desconhecido', () => {
  it('campos ausentes viram placeholders seguros', () => {
    const out = buildLawyerNotification({ event: 'lead_qualified', data: {} });
    expect(out.whatsappText).toContain('Lead sem nome');
    expect(out.emailHtml).toContain('não informada'); // área
  });
  it('evento desconhecido → notificação genérica sem lançar', () => {
    const out = buildLawyerNotification({ event: 'xpto' });
    expect(out.subject).toContain('WhatJuris');
    expect(out.whatsappText).toContain('xpto');
  });
});
