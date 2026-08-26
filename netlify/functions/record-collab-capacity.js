// Décompte une place pour une réservation gratuite à capacité limitée (ex: DEFINE Pilates Reformer)
// Vérifie qu'il reste de la place AVANT de décompter, pour éviter le sur-booking autant que possible.
const { getStore } = require('@netlify/blobs');

const CAPACITY_LIMITS = {
  pilates: 10,
  danse: 15,
  define: 11,
};

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { capacityKey } = JSON.parse(event.body);
    if (!capacityKey) {
      return { statusCode: 400, body: JSON.stringify({ error: 'capacityKey requis' }) };
    }

    const group = capacityKey.split('-')[0];
    const limit = CAPACITY_LIMITS[group];
    if (!limit) {
      // Pas de limite configurée pour ce type d'événement — on accepte sans compter.
      return { statusCode: 200, body: JSON.stringify({ ok: true, full: false }) };
    }

    const store = getStore({ name: 'event-capacity', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    let counts = await store.get('counts', { type: 'json' });
    if (!counts) counts = {};

    const current = counts[capacityKey] || 0;
    if (current >= limit) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, full: true, remaining: 0 }) };
    }

    counts[capacityKey] = current + 1;
    await store.setJSON('counts', counts);

    return { statusCode: 200, body: JSON.stringify({ ok: true, full: false, remaining: limit - counts[capacityKey] }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
