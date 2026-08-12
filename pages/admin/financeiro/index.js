// =============================================================================
// WhatJuris CRM — Financeiro (contas a receber, fatia 1)
//
// A tabela lista PARCELAS, não cobranças: é a parcela que vence e que se marca
// paga. Uma cobrança de 6x aparece como 6 linhas.
//
// "Atrasado" vem de estaAtrasada() — a MESMA função que o /summary usa no
// backend. Reimplementar a regra aqui faria o badge divergir do card na
// virada do dia.
// =============================================================================

import { Fragment, useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Form, Modal, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import Seo from '../../../shared/layout-components/seo/seo';
import { StatusBadge, WjButton, WjCard, WjScreenHeader } from '../../../shared/components/wj';
import { estaAtrasada } from '../../../lib/financeiro/datas';

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

// 'YYYY-MM-DD' -> '05/08/2026'. Corta a string em vez de usar new Date():
// dueDate é DATE, e passar por Date reintroduziria fuso num dado que não tem.
const dataBR = (iso) => {
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : '—';
};

const PAYMENT_STATUS = {
  pago: { variant: 'green', label: 'Pago' },
  pendente: { variant: 'amber', label: 'Pendente' },
  atrasado: { variant: 'red', label: 'Atrasado' },
};

const th = {
  textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.03em', color: 'var(--text-secondary)', padding: '10px 14px',
  borderBottom: '1px solid var(--border)',
};
const td = { padding: '13px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text)' };
const mono = { fontFamily: 'var(--mono)', fontSize: 12.5 };

const FORM_INICIAL = {
  contactId: '', dealId: '', payerName: '',
  description: '', totalAmount: '', installments: '1', firstDueDate: '',
};

function FinCard({ label, value, note, valueColor }) {
  return (
    <WjCard>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--mono)', color: valueColor || 'var(--text)' }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 8 }}>{note}</div>
    </WjCard>
  );
}

const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;

const Financeiro = () => {
  const [parcelas, setParcelas] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [quitando, setQuitando] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const [salvando, setSalvando] = useState(false);

  // Autocomplete de pagador — mesmo padrão da agenda, mesmo endpoint.
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [selecionado, setSelecionado] = useState(null);

  // ---------------------------------------------------------------- dados --
  const carregar = useCallback(async () => {
    try {
      const [rc, rs] = await Promise.all([
        axios.get('/api/charges/'),
        axios.get('/api/charges/summary/'),
      ]);
      // Achata cobranças em linhas de parcela, carregando o contexto do
      // pagador para cada uma.
      const linhas = (rc.data.charges || []).flatMap((c) =>
        (c.installments || []).map((p) => ({
          ...p,
          chargeId: c.id,
          cliente: c.contact?.name || c.payerName || '—',
          descricao: c.description,
          totalParcelas: c.installments.length,
        })));

      // Atrasadas no topo; dentro de cada grupo, por vencimento.
      linhas.sort((a, b) => {
        const aa = estaAtrasada(a) ? 0 : 1;
        const bb = estaAtrasada(b) ? 0 : 1;
        if (aa !== bb) return aa - bb;
        return String(a.dueDate).localeCompare(String(b.dueDate));
      });

      setParcelas(linhas);
      setResumo(rs.data);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível carregar o financeiro.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const termo = busca.trim();
    if (selecionado || termo.length < 2) { setResultados([]); setBuscando(false); return undefined; }
    let cancelado = false;
    setBuscando(true);
    const id = setTimeout(async () => {
      try {
        const { data } = await axios.get(`/api/deals/search/?q=${encodeURIComponent(termo)}`);
        if (!cancelado) setResultados(data.results || []);
      } catch {
        if (!cancelado) setResultados([]);
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 300);
    return () => { cancelado = true; clearTimeout(id); };
  }, [busca, selecionado]);

  // --------------------------------------------------------------- ações --
  const marcarPaga = async (parcela) => {
    setQuitando(parcela.id);
    try {
      await axios.patch(`/api/installments/${parcela.id}/`, { paid: parcela.status !== 'PAID' });
      // Recarrega lista e cards juntos: o total a receber e o atrasado mudam
      // com a mesma ação, e atualizar só a linha deixaria os cards mentindo.
      await carregar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível atualizar a parcela.');
    } finally {
      setQuitando(null);
    }
  };

  const escolher = (r) => {
    setSelecionado(r);
    setForm((f) => ({ ...f, contactId: r.contactId || '', dealId: r.id || '' }));
    setResultados([]); setBusca('');
  };

  const limparPagador = () => {
    setSelecionado(null);
    setForm((f) => ({ ...f, contactId: '', dealId: '' }));
  };

  const fecharModal = () => {
    setShowModal(false); setForm(FORM_INICIAL);
    setSelecionado(null); setBusca(''); setResultados([]);
  };

  const salvar = async () => {
    if (!form.description.trim()) return toast.error('Informe a descrição.');
    if (!form.totalAmount) return toast.error('Informe o valor total.');
    if (!form.firstDueDate) return toast.error('Informe a data do primeiro vencimento.');
    if (!form.contactId && !form.payerName.trim()) return toast.error('Informe o cliente ou o nome do pagador.');

    setSalvando(true);
    try {
      await axios.post('/api/charges/', {
        contactId: form.contactId || null,
        dealId: form.dealId || null,
        payerName: form.contactId ? null : form.payerName.trim(),
        description: form.description.trim(),
        totalAmount: form.totalAmount,
        installments: Number(form.installments) || 1,
        firstDueDate: form.firstDueDate,
      });
      toast.success('Cobrança criada.');
      fecharModal();
      await carregar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível criar a cobrança.');
    } finally {
      setSalvando(false);
    }
  };

  const statusDe = (p) => (p.status === 'PAID' ? 'pago' : (estaAtrasada(p) ? 'atrasado' : 'pendente'));

  return (
    <Fragment>
      <Seo title="Financeiro" />
      <WjScreenHeader
        label="Módulo · Financeiro"
        title="Financeiro"
        sub="Honorários a receber e vencimentos"
        right={<WjButton onClick={() => setShowModal(true)}>+ Nova cobrança</WjButton>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <FinCard
          label="Total a receber"
          value={brl(resumo?.aReceber.total)}
          note={plural(resumo?.aReceber.quantidade ?? 0, 'parcela pendente', 'parcelas pendentes')}
        />
        <FinCard
          label="Recebido no mês" valueColor="var(--green)"
          value={brl(resumo?.recebidoNoMes.total)}
          note={plural(resumo?.recebidoNoMes.quantidade ?? 0, 'pagamento confirmado', 'pagamentos confirmados')}
        />
        <FinCard
          label="Atrasado" valueColor="var(--red)"
          value={brl(resumo?.atrasado.total)}
          note={plural(resumo?.atrasado.quantidade ?? 0, 'parcela em atraso', 'parcelas em atraso')}
        />
      </div>

      <WjCard>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Cliente</th>
                <th style={th}>Descrição</th>
                <th style={th}>Valor</th>
                <th style={th}>Vencimento</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr><td style={{ ...td, borderBottom: 'none', color: 'var(--text-secondary)' }} colSpan={6}>Carregando…</td></tr>
              )}
              {!carregando && parcelas.length === 0 && (
                <tr><td style={{ ...td, borderBottom: 'none', color: 'var(--text-secondary)' }} colSpan={6}>
                  Nenhuma cobrança registrada.
                </td></tr>
              )}
              {parcelas.map((p, i) => {
                const st = PAYMENT_STATUS[statusDe(p)];
                const cel = i === parcelas.length - 1 ? { ...td, borderBottom: 'none' } : td;
                const pago = p.status === 'PAID';
                return (
                  <tr key={p.id}>
                    <td style={cel}>{p.cliente}</td>
                    <td style={cel}>
                      {p.descricao}
                      <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--mono)', fontSize: 11, marginLeft: 6 }}>
                        {p.number}/{p.totalParcelas}
                      </span>
                    </td>
                    <td style={{ ...cel, ...mono }}>{brl(p.amount)}</td>
                    <td style={{ ...cel, ...mono }}>{dataBR(p.dueDate)}</td>
                    <td style={cel}><StatusBadge variant={st.variant}>{st.label}</StatusBadge></td>
                    <td style={{ ...cel, textAlign: 'right' }}>
                      <button
                        onClick={() => marcarPaga(p)}
                        disabled={quitando === p.id}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5,
                          fontWeight: 600, color: pago ? 'var(--text-secondary)' : 'var(--green)',
                        }}
                      >
                        {quitando === p.id ? '…' : (pago ? 'Desfazer' : 'Marcar paga')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </WjCard>

      <Modal show={showModal} onHide={fecharModal}>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 16 }}>Nova cobrança</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3" style={{ position: 'relative' }}>
              <Form.Label>Cliente</Form.Label>
              {selecionado ? (
                <div className="wj-lead-chip">
                  <span style={{ fontSize: 13 }}>
                    {selecionado.contactName}
                    {selecionado.area ? <span style={{ color: 'var(--text-secondary)' }}> · {selecionado.area}</span> : null}
                  </span>
                  <button type="button" className="wj-lead-x" onClick={limparPagador}>×</button>
                </div>
              ) : (
                <Fragment>
                  <Form.Control
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar cliente pelo nome ou telefone…"
                  />
                  {buscando && <div className="wj-lead-vazio">Buscando…</div>}
                  {resultados.length > 0 && (
                    <div className="wj-lead-drop">
                      {resultados.map((r) => (
                        <button type="button" key={r.id} className="wj-lead-item" onClick={() => escolher(r)}>
                          <span style={{ fontSize: 13 }}>{r.contactName}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {[r.whatsapp, r.area, r.stage].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </Fragment>
              )}
            </Form.Group>

            {!selecionado && (
              <Form.Group className="mb-3">
                <Form.Label>…ou nome do pagador (avulso)</Form.Label>
                <Form.Control
                  value={form.payerName}
                  onChange={(e) => setForm((f) => ({ ...f, payerName: e.target.value }))}
                  placeholder="Ex.: João Ferreira"
                />
              </Form.Group>
            )}

            <Form.Group className="mb-3">
              <Form.Label>Descrição <span style={{ color: 'var(--red)' }}>*</span></Form.Label>
              <Form.Control
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ex.: Honorários — ação trabalhista"
              />
            </Form.Group>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Group className="mb-3">
                <Form.Label>Valor total (R$) <span style={{ color: 'var(--red)' }}>*</span></Form.Label>
                <Form.Control
                  value={form.totalAmount}
                  onChange={(e) => setForm((f) => ({ ...f, totalAmount: e.target.value }))}
                  placeholder="6000,00"
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Parcelas</Form.Label>
                <Form.Control
                  type="number" min={1} max={60}
                  value={form.installments}
                  onChange={(e) => setForm((f) => ({ ...f, installments: e.target.value }))}
                />
              </Form.Group>
            </div>

            <Form.Group className="mb-3">
              <Form.Label>1º vencimento <span style={{ color: 'var(--red)' }}>*</span></Form.Label>
              <Form.Control
                type="date"
                value={form.firstDueDate}
                onChange={(e) => setForm((f) => ({ ...f, firstDueDate: e.target.value }))}
              />
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                As demais vencem no mesmo dia dos meses seguintes.
              </div>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <WjButton variant="outline" onClick={fecharModal}>Cancelar</WjButton>
          <WjButton onClick={salvar} disabled={salvando}>
            {salvando ? <Spinner animation="border" size="sm" /> : 'Criar cobrança'}
          </WjButton>
        </Modal.Footer>
      </Modal>

      <style jsx global>{`
        /* Modal escuro + autocomplete. Duplicado da agenda de propósito: um
           bloco styled-jsx global só vale enquanto AQUELE componente está
           montado, então o financeiro precisa do seu. Se um terceiro consumidor
           aparecer, vale extrair para whatjuris-base.css. */
        .modal-content { background: var(--card); border: 1px solid var(--border); color: var(--text); border-radius: 12px; }
        .modal-header, .modal-footer { border-color: var(--border); }
        .modal-header .btn-close { filter: invert(1); }
        .modal .form-control, .modal .form-select {
          background: var(--card-alt); border: 1px solid var(--border); color: var(--text);
          border-radius: 8px; font-size: 13px;
        }
        .modal .form-control::placeholder { color: var(--text-secondary); }
        .modal .form-label { font-size: 13px; color: var(--text); }

        .wj-lead-chip {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          background: var(--bg); border: 1px solid var(--accent);
          border-radius: 8px; padding: 8px 10px;
        }
        .wj-lead-x {
          background: none; border: none; color: var(--text-secondary);
          font-size: 20px; line-height: 1; cursor: pointer; padding: 0 4px; flex-shrink: 0;
        }
        .wj-lead-x:hover { color: var(--red, #e5534b); }
        .wj-lead-drop {
          position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px);
          background: var(--card); border: 1px solid var(--border); border-radius: 8px;
          max-height: 240px; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,.4);
        }
        .wj-lead-item {
          display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left;
          background: none; border: none; color: var(--text);
          padding: 8px 10px; cursor: pointer;
        }
        .wj-lead-item + .wj-lead-item { border-top: 1px solid var(--border); }
        .wj-lead-item:hover { background: var(--bg); }
        .wj-lead-vazio { font-size: 11px; color: var(--text-secondary); margin-top: 6px; }
      `}</style>
    </Fragment>
  );
};

Financeiro.layout = 'Contentlayout';

export default Financeiro;
