// =============================================================================
// WhatJuris CRM — Confirmação de arquivamento de cliente
// shared/components/wj/ArquivarClienteModal.js
//
// Um componente para as três telas (pipeline, clientes, financeiro). Busca o
// preview ao abrir e decide o que mostrar:
//   bloqueado  → explica o motivo, sem oferecer confirmação
//   liberado   → impacto + digitação do nome para habilitar o botão
//
// ⚠️ O texto fala em ARQUIVAR, não em excluir permanentemente: o backend faz
// soft delete (`deletedAt`), o registro continua no banco e é recuperável.
// Prometer exclusão permanente seria mentir sobre dado de cliente.
// =============================================================================

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Modal, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { WjButton } from './index';

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

const linha = { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0' };

export default function ArquivarClienteModal({ contato, onFechar, onArquivado }) {
  const [preview, setPreview] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [digitado, setDigitado] = useState('');
  const [arquivando, setArquivando] = useState(false);

  useEffect(() => {
    if (!contato?.id) return;
    setCarregando(true);
    axios.get(`/api/contacts/${contato.id}/delete-preview/`)
      .then(({ data }) => setPreview(data))
      .catch((err) => {
        toast.error(err?.response?.data?.error || 'Não foi possível calcular o impacto.');
        onFechar();
      })
      .finally(() => setCarregando(false));
  }, [contato?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const nome = contato?.name || '';
  // Fricção proposital: o botão só habilita com o nome exato.
  const podeArquivar = digitado.trim() === nome.trim() && !arquivando;

  const arquivar = async () => {
    setArquivando(true);
    try {
      const { data } = await axios.delete(`/api/contacts/${contato.id}/`);
      toast.success('Cliente arquivado.');
      if (data?.eventosNaoCancelados?.length) {
        toast.info(
          `${data.eventosNaoCancelados.length} evento(s) continuam no Google Calendar — `
          + 'cancele por lá se necessário.',
        );
      }
      onArquivado?.(contato.id);
      onFechar();
    } catch (err) {
      // 422 da guarda financeira cai aqui se a cobrança surgir entre o preview
      // e a confirmação.
      toast.error(err?.response?.data?.error || 'Não foi possível arquivar.');
      setArquivando(false);
    }
  };

  const bloqueado = preview?.bloqueado;

  return (
    <Modal show={!!contato} onHide={() => !arquivando && onFechar()}>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 16 }}>
          {bloqueado ? 'Não é possível arquivar' : `Arquivar ${nome}?`}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {carregando && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Calculando o impacto…</div>
        )}

        {!carregando && bloqueado && (
          <div>
            <div style={{
              background: 'rgba(240,78,78,.10)', border: '1px solid var(--red)',
              borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text)',
            }}>
              {preview.motivoBloqueio}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
              Cobranças ficam no financeiro mesmo depois de quitadas. Para arquivar
              este cliente, remova as cobranças dele primeiro.
            </div>
          </div>
        )}

        {!carregando && !bloqueado && preview && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 14 }}>
              O cliente sai das telas do CRM. O registro continua no banco e pode
              ser recuperado — <strong>não é exclusão permanente</strong>.
            </div>

            <div style={{
              background: 'var(--card-alt)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16,
            }}>
              <div style={linha}><span style={{ color: 'var(--text-secondary)' }}>Casos no funil</span><span>{preview.deals}</span></div>
              <div style={linha}><span style={{ color: 'var(--text-secondary)' }}>Registros na timeline</span><span>{preview.activities}</span></div>
              <div style={linha}><span style={{ color: 'var(--text-secondary)' }}>Conversas</span><span>{preview.conversas}</span></div>
              <div style={linha}><span style={{ color: 'var(--text-secondary)' }}>Memória da triagem</span><span>{preview.memoriaTriagem}</span></div>
              <div style={linha}>
                <span style={{ color: 'var(--text-secondary)' }}>Compromissos futuros</span>
                <span>{preview.eventosFuturos}</span>
              </div>
            </div>

            {preview.eventosNoGoogle > 0 && (
              <div style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 14 }}>
                {preview.eventosNoGoogle} compromisso(s) serão cancelados também no
                Google Calendar.
              </div>
            )}

            <label style={{ fontSize: 12.5, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Digite <strong style={{ color: 'var(--text)' }}>{nome}</strong> para confirmar
            </label>
            <input
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              placeholder={nome}
              autoComplete="off"
              style={{
                width: '100%', background: 'var(--card-alt)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', fontSize: 13, padding: '8px 10px',
              }}
            />
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <WjButton variant="outline" onClick={onFechar} disabled={arquivando}>
          {bloqueado ? 'Entendi' : 'Cancelar'}
        </WjButton>
        {!bloqueado && !carregando && (
          <button
            onClick={arquivar}
            disabled={!podeArquivar}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 8,
              border: '1px solid transparent', fontFamily: 'inherit',
              background: podeArquivar ? 'var(--red)' : 'var(--card-alt)',
              color: podeArquivar ? '#fff' : 'var(--text-secondary)',
              cursor: podeArquivar ? 'pointer' : 'not-allowed',
            }}
          >
            {arquivando ? <Spinner animation="border" size="sm" /> : 'Arquivar cliente'}
          </button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
