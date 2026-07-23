// =============================================================================
// WhatJuris CRM — Política de Privacidade (página pública, sem login)
// Rota: /privacidade  — usada na aprovação do WhatsApp Business API (Meta).
// Sem layout admin; o middleware só protege /admin/*, então esta rota é pública.
// =============================================================================

import Head from 'next/head';

const ATUALIZADO_EM = '23 de julho de 2026';

// >>> SUBSTITUA estes dois antes de enviar à Meta <<<
const NOME_ESCRITORIO = 'Bezerra & Nabarrete Sociedade de Advogados';
const EMAIL_CONTATO = 'contatobusiness2000@gmail.com';

const Privacidade = () => {
  return (
    <>
      <Head>
        <title>WhatJuris — Política de Privacidade</title>
        <meta name="robots" content="index,follow" />
        <meta
          name="description"
          content="Política de Privacidade do WhatJuris — como coletamos, usamos e protegemos seus dados."
        />
      </Head>

      <main style={styles.page}>
        <div style={styles.container}>
          <header style={styles.header}>
            <h1 style={styles.h1}>Política de Privacidade — WhatJuris</h1>
            <p style={styles.meta}>Última atualização: {ATUALIZADO_EM}</p>
          </header>

          <section style={styles.section}>
            <p style={styles.p}>
              O <strong>WhatJuris</strong> é um sistema de atendimento e triagem de
              leads utilizado por {NOME_ESCRITORIO} para receber e organizar
              contatos de pessoas interessadas em serviços jurídicos, inclusive por
              meio do WhatsApp. Esta política explica quais dados coletamos, para
              quê os usamos e quais são os seus direitos, em conformidade com a
              <strong> Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)</strong>.
            </p>
          </section>

          <section style={styles.section}>
            <h2 style={styles.h2}>1. Dados que coletamos</h2>
            <p style={styles.p}>Ao entrar em contato conosco, podemos coletar:</p>
            <ul style={styles.ul}>
              <li><strong>Nome</strong> (o nome que você informa ou o do seu perfil do WhatsApp);</li>
              <li><strong>Número de WhatsApp</strong> / telefone de contato;</li>
              <li><strong>Informações sobre o seu caso jurídico</strong> — os detalhes que você descreve na conversa (por exemplo: área do direito, o que aconteceu e documentos que você mencione).</li>
            </ul>
            <p style={styles.p}>
              Coletamos apenas os dados que você mesmo fornece na conversa. Não
              compramos listas nem coletamos dados de outras fontes.
            </p>
          </section>

          <section style={styles.section}>
            <h2 style={styles.h2}>2. Finalidade do uso</h2>
            <p style={styles.p}>Usamos os seus dados exclusivamente para:</p>
            <ul style={styles.ul}>
              <li>fazer a <strong>triagem automatizada do seu atendimento</strong> (entender do que você precisa e direcionar ao profissional adequado do escritório);</li>
              <li>responder às suas mensagens e dar andamento ao seu contato;</li>
              <li>organizar o seu cadastro internamente no escritório.</li>
            </ul>
            <p style={styles.p}>
              Parte do atendimento inicial pode ser feita por um assistente
              automatizado (inteligência artificial), sempre com o objetivo de
              agilizar o seu atendimento. As decisões sobre o seu caso são tomadas
              por profissionais do escritório.
            </p>
          </section>

          <section style={styles.section}>
            <h2 style={styles.h2}>3. Armazenamento e segurança</h2>
            <p style={styles.p}>
              Seus dados são armazenados em <strong>servidor seguro</strong>, em
              <strong> banco de dados criptografado</strong>, com acesso restrito
              apenas às pessoas autorizadas do escritório. Adotamos medidas técnicas
              e organizacionais para proteger suas informações contra acesso não
              autorizado, perda ou uso indevido.
            </p>
          </section>

          <section style={styles.section}>
            <h2 style={styles.h2}>4. Compartilhamento com terceiros</h2>
            <p style={styles.p}>
              <strong>Não vendemos nem compartilhamos os seus dados com terceiros
              para fins de marketing.</strong> Seus dados só podem ser processados
              por provedores de tecnologia estritamente necessários para o
              funcionamento do sistema (por exemplo: o provedor de mensagens do
              WhatsApp e a infraestrutura de nuvem que hospeda o sistema), sempre
              limitados a essa finalidade. Também podemos divulgar dados quando
              exigido por lei ou por ordem de autoridade competente.
            </p>
          </section>

          <section style={styles.section}>
            <h2 style={styles.h2}>5. Retenção dos dados</h2>
            <p style={styles.p}>
              Mantemos os seus dados apenas pelo tempo necessário para o
              atendimento e para cumprir obrigações legais. Você pode solicitar a
              exclusão a qualquer momento (ver seção seguinte).
            </p>
          </section>

          <section style={styles.section}>
            <h2 style={styles.h2}>6. Seus direitos (LGPD)</h2>
            <p style={styles.p}>Você tem o direito de, a qualquer momento:</p>
            <ul style={styles.ul}>
              <li><strong>Acessar</strong> os dados que temos sobre você;</li>
              <li><strong>Corrigir</strong> dados incompletos, inexatos ou desatualizados;</li>
              <li><strong>Excluir</strong> os seus dados;</li>
              <li>revogar o consentimento e se opor ao tratamento;</li>
              <li>solicitar informações sobre com quem os dados foram compartilhados.</li>
            </ul>
          </section>

          <section style={styles.section}>
            <h2 style={styles.h2}>7. Como exercer seus direitos e falar conosco</h2>
            <p style={styles.p}>
              Para exercer qualquer um dos direitos acima, ou para tirar dúvidas
              sobre esta política, entre em contato com {NOME_ESCRITORIO} pelo
              e-mail:
            </p>
            <p style={styles.contato}>
              <a href={`mailto:${EMAIL_CONTATO}`} style={styles.link}>{EMAIL_CONTATO}</a>
            </p>
            <p style={styles.p}>
              Responderemos à sua solicitação no menor prazo possível, conforme
              previsto na LGPD.
            </p>
          </section>

          <section style={styles.section}>
            <h2 style={styles.h2}>8. Alterações desta política</h2>
            <p style={styles.p}>
              Podemos atualizar esta Política de Privacidade periodicamente. A data
              da última atualização é indicada no topo desta página.
            </p>
          </section>

          <footer style={styles.footer}>
            <p style={styles.footerText}>WhatJuris — {NOME_ESCRITORIO}</p>
          </footer>
        </div>
      </main>
    </>
  );
};

const styles = {
  page: {
    minHeight: '100vh',
    background: '#ffffff',
    color: '#1a1d24',
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    padding: '40px 16px 80px',
    boxSizing: 'border-box',
  },
  container: { maxWidth: 760, margin: '0 auto' },
  header: { borderBottom: '1px solid #e5e7eb', paddingBottom: 18, marginBottom: 28 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, lineHeight: 1.25 },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 8 },
  section: { marginBottom: 26 },
  h2: { fontSize: 18, fontWeight: 600, margin: '0 0 10px' },
  p: { fontSize: 15.5, lineHeight: 1.7, margin: '0 0 12px' },
  ul: { fontSize: 15.5, lineHeight: 1.7, margin: '0 0 12px', paddingLeft: 22 },
  contato: { fontSize: 16, margin: '4px 0 12px' },
  link: { color: '#1d4ed8', textDecoration: 'none', fontWeight: 600 },
  footer: { borderTop: '1px solid #e5e7eb', paddingTop: 18, marginTop: 32 },
  footerText: { fontSize: 13, color: '#6b7280', margin: 0 },
};

export default Privacidade;
