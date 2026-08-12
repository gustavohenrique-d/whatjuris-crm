// =============================================================================
// WhatJuris CRM — Financeiro: detalhe do cliente (fatia 2)
//
// Dados: GET /api/contacts/[id] + GET /api/charges?contactId=
// Nenhum endpoint novo — os dois já existiam, e criar um terceiro jeito de ler
// a mesma coisa só daria mais superfície para divergir.
//
// Edição de parcela: PENDENTE salva direto; PAGA passa por confirmação em dois
// passos. A trava real é do backend (exige confirmarEdicaoPaga); aqui a
// confirmação só evita o clique acidental.
// =============================================================================

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { toast } from 'react-toastify';
import Seo from '../../../../shared/layout-components/seo/seo';
import { StatusBadge, WjButton, WjCard, WjScreenHeader } from '../../../../shared/components/wj';
import { estaAtrasada } from '../../../../lib/financeiro/datas';

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const dataBR = (iso) => {
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : '—';
};
const cent = (v) => Math.round((Number(v) || 0) * 100);

const PAYMENT_STATUS = {
  pago: { variant: 'green', label: 'Pago' },
  pendente: { variant: 'amber', label: 'Pendente' },
  atrasado: { variant: 'red', label: 'Atrasado' },
};
const statusDe = (p) => (p.status === 'PAID' ? 'pago' : (estaAtrasada(p) ? 'atrasado' : 'pendente'));

const rotulo = { fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 };
const valor = { fontSize: 13.5, color: 'var(--text)' };

const ClienteFinanceiro = () => {
  const router = useRouter();
  const { id } = router.query;

  const [contato, setContato] = useState(null);
  const [cobrancas, setCobrancas] = useState([]);
  const [carregando, setCarregando] = useState(true);

  // Edição de parcela: id em edição, rascunho do valor e confirmação pendente.
  const [editando, setEditando] = useState(null);
  const [rascunho, setRascunho] = useState('');
  const [confirmandoPaga, setConfirmandoPaga] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [servicoEditando, setServicoEditando] = useState(null);
  const [servicoRascunho, setServicoRascunho] = useState('');

  const carregar = useCallback(async () => {
    if (!id) return;
    try {
      const [rc, rch] = await Promise.all([
        axios.get(`/api/contacts/${id}/`),
        axios.get(`/api/charges/?contactId=${id}`),
      ]);
      setContato(rc.data.contact);
      setCobrancas(rch.data.charges || []);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível carregar o cliente.');
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirEdicao = (p) => {
    setEditando(p.id);
    setRascunho(String(p.amount).replace('.', ','));
    setConfirmandoPaga(false);
  };

  const cancelarEdicao = () => {
    setEditando(null); setRascunho(''); setConfirmandoPaga(false);
  };

  const salvarValor = async (p) => {
    // Parcela paga: primeiro clique só arma a confirmação.
    if (p.status === 'PAID' && !confirmandoPaga) { setConfirmandoPaga(true); return; }

    setSalvando(true);
    try {
      await axios.patch(`/api/installments/${p.id}/`, {
        amount: rascunho,
        ...(p.status === 'PAID' ? { confirmarEdicaoPaga: true } : {}),
      });
      toast.success('Valor atualizado.');
      cancelarEdicao();
      await carregar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível atualizar o valor.');
    } finally {
      setSalvando(false);
    }
  };

  const salvarServico = async (c) => {
    try {
      await axios.patch(`/api/charges/${c.id}/`, { serviceType: servicoRascunho });
      setServicoEditando(null);
      await carregar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível salvar o tipo de serviço.');
    }
  };

  const marcarPaga = async (p) => {
    try {
      await axios.patch(`/api/installments/${p.id}/`, { paid: p.status !== 'PAID' });
      await carregar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível atualizar a parcela.');
    }
  };

  return (
    <Fragment>
      <Seo title={contato ? `Financeiro — ${contato.name}` : 'Financeiro'} />
      <WjScreenHeader
        label="Financeiro · Cliente"
        title={contato?.name || (carregando ? 'Carregando…' : 'Cliente')}
        sub={cobrancas.length
          ? `${cobrancas.length} ${cobrancas.length === 1 ? 'cobrança' : 'cobranças'}`
          : 'Nenhuma cobrança registrada'}
        right={<WjButton variant="outline" onClick={() => router.push('/admin/financeiro/')}>← Voltar</WjButton>}
      />

      {/* Bloco 1 — dados do contato */}
      <WjCard style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
          <div><div style={rotulo}>Nome</div><div style={valor}>{contato?.name || '—'}</div></div>
          <div><div style={rotulo}>WhatsApp</div><div style={{ ...valor, fontFamily: 'var(--mono)' }}>{contato?.whatsapp || '—'}</div></div>
          <div><div style={rotulo}>E-mail</div><div style={valor}>{contato?.email || '—'}</div></div>
          <div><div style={rotulo}>Casos</div><div style={valor}>{contato?.deals?.length ?? 0}</div></div>
        </div>
      </WjCard>

      {/* Bloco 2 — cobranças */}
      {!carregando && cobrancas.length === 0 && (
        <WjCard><div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Este cliente ainda não tem cobranças.
        </div></WjCard>
      )}

      {cobrancas.map((c) => {
        const somaParcelas = (c.installments || []).reduce((s, p) => s + cent(p.amount), 0);
        const contratado = cent(c.totalAmount);
        const divergiu = somaParcelas !== contratado;

        return (
          <WjCard key={c.id} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{c.description}</div>
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  {servicoEditando === c.id ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <input
                        value={servicoRascunho}
                        onChange={(e) => setServicoRascunho(e.target.value)}
                        placeholder="Ex.: Ação trabalhista"
                        style={{
                          background: 'var(--card-alt)', border: '1px solid var(--border)',
                          borderRadius: 6, color: 'var(--text)', fontSize: 12, padding: '4px 8px',
                        }}
                      />
                      <button onClick={() => salvarServico(c)} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>salvar</button>
                      <button onClick={() => setServicoEditando(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11.5 }}>cancelar</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => { setServicoEditando(c.id); setServicoRascunho(c.serviceType || ''); }}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.serviceType ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12 }}
                    >
                      {c.serviceType || '+ tipo de serviço'}
                    </button>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={rotulo}>{divergiu ? 'Contratado' : 'Total'}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                  {brl(c.totalAmount)}
                </div>
                {/* O contratado é imutável; se as parcelas foram ajustadas, os
                    dois números aparecem em vez de um esconder o outro. */}
                {divergiu && (
                  <div style={{ marginTop: 4 }}>
                    <div style={rotulo}>Cobrado</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--amber)' }}>
                      {brl(somaParcelas / 100)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {(c.installments || []).map((p) => {
                  const st = PAYMENT_STATUS[statusDe(p)];
                  const emEdicao = editando === p.id;
                  const paga = p.status === 'PAID';
                  return (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '11px 8px 11px 0', fontSize: 12.5, color: 'var(--text-secondary)', width: 48 }}>
                        {p.number}/{c.installments.length}
                      </td>
                      <td style={{ padding: '11px 8px', fontFamily: 'var(--mono)', fontSize: 12.5 }}>
                        {emEdicao ? (
                          <input
                            value={rascunho}
                            onChange={(e) => setRascunho(e.target.value)}
                            style={{
                              width: 110, background: 'var(--card-alt)', border: '1px solid var(--accent)',
                              borderRadius: 6, color: 'var(--text)', fontFamily: 'var(--mono)',
                              fontSize: 12.5, padding: '4px 8px',
                            }}
                          />
                        ) : brl(p.amount)}
                        {/* Valor de antes da 1ª edição de uma parcela paga. */}
                        {p.originalAmount != null && !emEdicao && (
                          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                            original: {brl(p.originalAmount)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '11px 8px', fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                        {dataBR(p.dueDate)}
                      </td>
                      <td style={{ padding: '11px 8px' }}><StatusBadge variant={st.variant}>{st.label}</StatusBadge></td>
                      <td style={{ padding: '11px 0 11px 8px', textAlign: 'right', fontSize: 11.5 }}>
                        {emEdicao ? (
                          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                            {confirmandoPaga && (
                              <span style={{ color: 'var(--amber)', fontSize: 11 }}>
                                Isto altera um registro de pagamento. O valor original fica guardado.
                              </span>
                            )}
                            <button onClick={() => salvarValor(p)} disabled={salvando}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 11.5, color: confirmandoPaga ? 'var(--amber)' : 'var(--green)' }}>
                              {salvando ? '…' : (confirmandoPaga ? 'Confirmar' : 'Salvar')}
                            </button>
                            <button onClick={cancelarEdicao}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                              cancelar
                            </button>
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', gap: 12 }}>
                            <button onClick={() => abrirEdicao(p)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                              editar valor
                            </button>
                            <button onClick={() => marcarPaga(p)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: paga ? 'var(--text-secondary)' : 'var(--green)' }}>
                              {paga ? 'Desfazer' : 'Marcar paga'}
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </WjCard>
        );
      })}

      <WjButton onClick={() => router.push(`/admin/financeiro/?novaCobranca=${id}`)}>
        + Nova cobrança para este cliente
      </WjButton>
    </Fragment>
  );
};

ClienteFinanceiro.layout = 'Contentlayout';

export default ClienteFinanceiro;
