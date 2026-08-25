// Enregistre le planning modifié depuis l'admin — réservé au rôle "admin"
const { getStore } = require('@netlify/blobs');

exports.handler = async function (event, context) {
  const { user } = context.clientContext || {};
  const roles = (user && user.app_metadata && user.app_metadata.roles) || [];

  if (!user || !roles.includes('admin')) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Accès réservé' }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { month, events } = JSON.parse(event.body);

    if (!month || !Array.isArray(events)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'month et events (tableau) requis' }) };
    }

    // Vérification de base sur chaque événement pour éviter d'enregistrer des données incomplètes
    for (const ev of events) {
      if (!ev.day || !ev.title || !ev.tag) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Chaque événement doit avoir au minimum un jour, un titre et un type.' }) };
      }
    }

    const planning = { month, events };
    const store = getStore('planning');
    await store.setJSON('current', planning);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
