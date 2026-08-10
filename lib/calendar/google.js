// =============================================================================
// WhatJuris CRM — Integração com Google Calendar
// lib/calendar/google.js
//
// Wrapper sobre googleapis. Se GOOGLE_CLIENT_ID não estiver definido,
// todas as funções retornam { skipped: true } silenciosamente.
// =============================================================================

const { google } = require('googleapis');

const CONFIGURED =
  !!process.env.GOOGLE_CLIENT_ID &&
  !!process.env.GOOGLE_CLIENT_SECRET;

function getClient(refreshToken) {
  if (!CONFIGURED) return null;

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

// Monta o evento no formato do Google Calendar
function toGoogleEvent(activity) {
  const start = activity.dueAt;
  // endAt é opcional (consulta de 30min, 2h...). Sem ele, mantém o padrão de 1h.
  const end = activity.endAt
    ? new Date(activity.endAt)
    : new Date(new Date(start).getTime() + 60 * 60 * 1000);

  const TIPOS = {
    MEETING: 'Reunião',
    CALL: 'Ligação',
    HEARING: 'Audiência',
    TASK: 'Tarefa',
  };

  return {
    summary: `[${TIPOS[activity.type] || activity.type}] ${activity.title || activity.content?.slice(0, 60)}`,
    description: activity.content || '',
    start: { dateTime: new Date(start).toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo' },
    extendedProperties: {
      private: {
        whatjurisActivityId: activity.id,
        whatjurisDealId: activity.dealId || '',
      },
    },
  };
}

// Cria ou atualiza um evento no Google Calendar
async function syncToGoogle(activity, refreshToken) {
  if (!CONFIGURED || !refreshToken) return { skipped: true };

  try {
    const auth = getClient(refreshToken);
    const calendar = google.calendar({ version: 'v3', auth });

    const googleEventId = activity.metadata?.googleEventId;

    if (googleEventId) {
      await calendar.events.update({
        calendarId: 'primary',
        eventId: googleEventId,
        requestBody: toGoogleEvent(activity),
      });
      return { updated: true, googleEventId };
    }

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: toGoogleEvent(activity),
    });

    return { created: true, googleEventId: res.data.id };
  } catch (err) {
    // Falha de sincronização não quebra o sistema — o evento existe localmente
    console.error('[google-calendar] sync falhou:', err.message);
    return { skipped: true, error: err.message };
  }
}

async function deleteFromGoogle(googleEventId, refreshToken) {
  if (!CONFIGURED || !refreshToken || !googleEventId) return { skipped: true };

  try {
    const auth = getClient(refreshToken);
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({ calendarId: 'primary', eventId: googleEventId });
    return { deleted: true };
  } catch (err) {
    console.error('[google-calendar] delete falhou:', err.message);
    return { skipped: true };
  }
}

// Gera a URL de autorização OAuth2 (usada pelo sócio uma vez para conectar)
function getAuthUrl() {
  if (!CONFIGURED) return null;

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
  });
}

// Troca o code OAuth2 pelo refresh_token
async function exchangeCode(code) {
  if (!CONFIGURED) return null;

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  const { tokens } = await client.getToken(code);
  return tokens.refresh_token;
}

module.exports = { syncToGoogle, deleteFromGoogle, getAuthUrl, exchangeCode, CONFIGURED };
