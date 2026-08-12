// =============================================================================
// WhatJuris CRM — Clientes (design whatjuris.html — módulo 10B.2)
// Contatos com seus deals (join no cliente: a lista de contatos não traz deals).
//
// Edição reusa PATCH /api/contacts/[id] e o mesmo padrão da tela financeira:
// nome/e-mail/telefone viram inputs, WhatsApp permanece somente leitura por ser
// a chave que liga o contato às conversas e à triagem.
// =============================================================================

import { Fragment, useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Form, Modal, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import Seo from '../../../shared/layout-components/seo/seo';
import { AreaBadge, StatusBadge, WjButton, WjCard, WjScreenHeader } from '../../../shared/components/wj';
import ArquivarClienteModal from '../../../shared/components/wj/ArquivarClienteModal';

const th = {
  textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.03em', color: 'var(--text-secondary)', padding: '10px 14px',
  borderBottom: '1px solid var(--border)',
};
const td = { padding: '13px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text)' };

// Mesmo visual dos inputs da tela financeira.
const inputLinha = {
  width: '100%', background: 'var(--card-alt)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text)', fontSize: 13, padding: '5px 8px',
};
const acaoLink = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontSize: 11.5, fontWeight: 600,
};

const FORM_NOVO = { name: '', email: '', phone: '', whatsapp: '', document: '' };

function timeAgo(iso) {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d < 1) return 'hoje';
  if (d === 1) return 'há 1 dia';
  return `há ${d} dias`;
}

const Clientes = () => {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Edição inline por linha: id em edição + rascunho.
  const [editando, setEditando] = useState(null);
  const [rascunho, setRascunho] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [novo, setNovo] = useState(FORM_NOVO);
  const [criando, setCriando] = useState(false);
  const [arquivando, setArquivando] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const [cRes, dRes] = await Promise.all([
        axios.get('/api/contacts/?limit=100'),
        axios.get('/api/deals/?limit=200'),
      ]);
      const dealsByContact = {};
      dRes.data.deals.forEach((d) => {
        (dealsByContact[d.contact?.id] = dealsByContact[d.contact?.id] || []).push(d);
      });
      setRows(cRes.data.contacts.map((c) => ({ ...c, deals: dealsByContact[c.id] || [] })));
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível carregar os clientes.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirEdicao = (c) => {
    setEditando(c.id);
    setRascunho({ name: c.name || '', email: c.email || '', phone: c.phone || '' });
  };

  const cancelarEdicao = () => { setEditando(null); setRascunho(null); };

  const salvar = async (c) => {
    setSalvando(true);
    try {
      // ⚠️ Payload campo a campo, SEM whatsapp: ele identifica o contato nas
      // conversas, na triagem e no takeover. Alterá-lo aqui desvincularia a
      // pessoa do próprio histórico.
      //
      // Vazio vira null (não ''), porque o zod do backend valida .email() e
      // recusaria string vazia em vez de limpar o campo.
      const { data } = await axios.patch(`/api/contacts/${c.id}/`, {
        name: rascunho.name.trim(),
        email: rascunho.email.trim() || null,
        phone: rascunho.phone.trim() || null,
      });
      setRows((r) => r.map((x) => (x.id === c.id ? { ...x, ...data.contact } : x)));
      cancelarEdicao();
      toast.success('Cliente atualizado.');
    } catch (err) {
      // Mantém a linha em edição para corrigir (ex.: e-mail inválido).
      toast.error(err?.response?.data?.error || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const criar = async () => {
    setCriando(true);
    try {
      await axios.post('/api/contacts/', {
        name: novo.name.trim(),
        email: novo.email.trim() || null,
        phone: novo.phone.trim() || null,
        // Opcional: sem número o cliente existe, só não recebe mensagem. Com
        // número, o backend normaliza e recusa duplicado com 409.
        whatsapp: novo.whatsapp.trim() || null,
        document: novo.document.trim() || null,
      });
      toast.success('Cliente cadastrado.');
      setShowModal(false);
      setNovo(FORM_NOVO);
      await carregar();
    } catch (err) {
      // 409 (WhatsApp já usado) e 400 (validação) caem aqui: o modal fica
      // aberto com o que foi digitado, para o usuário corrigir.
      toast.error(err?.response?.data?.error || 'Não foi possível cadastrar o cliente.');
    } finally {
      setCriando(false);
    }
  };

  return (
    <Fragment>
      <Seo title="Clientes" />
      <WjScreenHeader
        label="Módulo · Relacionamento"
        title="Clientes"
        sub={loaded ? `${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'}` : 'Carregando…'}
        right={<WjButton onClick={() => setShowModal(true)}>+ Novo cliente</WjButton>}
      />

      <WjCard>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Cliente</th>
                <th style={th}>Contato</th>
                <th style={th}>Área</th>
                <th style={th}>Processo vinculado</th>
                <th style={th}>Última atividade</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {loaded && rows.length === 0 && (
                <tr><td style={{ ...td, borderBottom: 'none', color: 'var(--text-secondary)' }} colSpan={7}>Nenhum cliente cadastrado.</td></tr>
              )}
              {rows.map((c, i) => {
                const last = i === rows.length - 1;
                const cel = last ? { ...td, borderBottom: 'none' } : td;
                const ativo = c.deals.some((d) => d.status === 'OPEN');
                const emEdicao = editando === c.id;

                return (
                  <tr key={c.id}>
                    <td style={{ ...cel, fontWeight: 500 }}>
                      {emEdicao ? (
                        <input style={inputLinha} value={rascunho.name}
                          onChange={(e) => setRascunho((d) => ({ ...d, name: e.target.value }))} />
                      ) : c.name}
                    </td>
                    <td style={cel}>
                      {emEdicao ? (
                        <div style={{ display: 'grid', gap: 6 }}>
                          <input style={inputLinha} type="email" placeholder="e-mail"
                            value={rascunho.email}
                            onChange={(e) => setRascunho((d) => ({ ...d, email: e.target.value }))} />
                          <input style={inputLinha} placeholder="telefone"
                            value={rascunho.phone}
                            onChange={(e) => setRascunho((d) => ({ ...d, phone: e.target.value }))} />
                          {/* WhatsApp nunca vira input — só referência visual. */}
                          <span style={{ fontSize: 10.5, color: 'var(--text-secondary)', fontFamily: 'var(--mono)' }}>
                            WhatsApp {c.whatsapp || '—'} · não editável
                          </span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12.5 }}>
                          <div>{c.email || '—'}</div>
                          <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--mono)', fontSize: 11.5 }}>
                            {c.whatsapp || c.phone || '—'}
                          </div>
                        </div>
                      )}
                    </td>
                    <td style={cel}>{c.deals[0]?.legalArea ? <AreaBadge area={c.deals[0].legalArea} /> : '—'}</td>
                    <td style={{ ...cel, fontFamily: 'var(--mono)', fontSize: 12.5 }}>
                      {c.deals[0]?.id?.slice(0, 8) || '—'}
                    </td>
                    <td style={cel}>{timeAgo(c.createdAt)}</td>
                    <td style={cel}>
                      <StatusBadge variant={ativo ? 'green' : 'amber'}>{ativo ? 'Ativo' : 'Inativo'}</StatusBadge>
                    </td>
                    <td style={{ ...cel, textAlign: 'right' }}>
                      {emEdicao ? (
                        <span style={{ display: 'inline-flex', gap: 12 }}>
                          <button onClick={() => salvar(c)} disabled={salvando}
                            style={{ ...acaoLink, color: 'var(--green)' }}>
                            {salvando ? 'Salvando…' : 'Salvar'}
                          </button>
                          <button onClick={cancelarEdicao} disabled={salvando}
                            style={{ ...acaoLink, color: 'var(--text-secondary)', fontWeight: 400 }}>
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 12 }}>
                          <button onClick={() => abrirEdicao(c)} style={{ ...acaoLink, color: 'var(--accent)' }}>
                            Editar
                          </button>
                          <button onClick={() => setArquivando(c)} style={{ ...acaoLink, color: 'var(--text-secondary)', fontWeight: 400 }}>
                            Arquivar
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </WjCard>

      <Modal show={showModal} onHide={() => !criando && setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 16 }}>Novo cliente</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Nome <span style={{ color: 'var(--red)' }}>*</span></Form.Label>
              <Form.Control value={novo.name} placeholder="Ex.: João Ferreira"
                onChange={(e) => setNovo((f) => ({ ...f, name: e.target.value }))} />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>E-mail</Form.Label>
              <Form.Control type="email" value={novo.email} placeholder="cliente@email.com"
                onChange={(e) => setNovo((f) => ({ ...f, email: e.target.value }))} />
            </Form.Group>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Group className="mb-3">
                <Form.Label>WhatsApp</Form.Label>
                <Form.Control value={novo.whatsapp} placeholder="5513978015937"
                  onChange={(e) => setNovo((f) => ({ ...f, whatsapp: e.target.value }))} />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                  Opcional. Com número, o cliente recebe mensagens — e não pode
                  repetir o de outro cadastro.
                </div>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Telefone</Form.Label>
                <Form.Control value={novo.phone} placeholder="(13) 3333-3333"
                  onChange={(e) => setNovo((f) => ({ ...f, phone: e.target.value }))} />
              </Form.Group>
            </div>

            <Form.Group className="mb-3">
              <Form.Label>CPF / CNPJ</Form.Label>
              <Form.Control value={novo.document} placeholder="000.000.000-00"
                onChange={(e) => setNovo((f) => ({ ...f, document: e.target.value }))} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <WjButton variant="outline" onClick={() => setShowModal(false)} disabled={criando}>Cancelar</WjButton>
          <WjButton onClick={criar} disabled={criando || !novo.name.trim()}>
            {criando ? <Spinner animation="border" size="sm" /> : 'Cadastrar'}
          </WjButton>
        </Modal.Footer>
      </Modal>

      {arquivando && (
        <ArquivarClienteModal
          contato={arquivando}
          onFechar={() => setArquivando(null)}
          onArquivado={(id) => setRows((r) => r.filter((x) => x.id !== id))}
        />
      )}

      <style jsx global>{`
        /* Modal escuro — bloco styled-jsx global só vale enquanto ESTE
           componente está montado, por isso cada tela com modal tem o seu. */
        .modal-content { background: var(--card); border: 1px solid var(--border); color: var(--text); border-radius: 12px; }
        .modal-header, .modal-footer { border-color: var(--border); }
        .modal-header .btn-close { filter: invert(1); }
        .modal .form-control {
          background: var(--card-alt); border: 1px solid var(--border); color: var(--text);
          border-radius: 8px; font-size: 13px;
        }
        .modal .form-control::placeholder { color: var(--text-secondary); }
        .modal .form-label { font-size: 13px; color: var(--text); }
      `}</style>
    </Fragment>
  );
};

Clientes.layout = 'Contentlayout';

export default Clientes;
