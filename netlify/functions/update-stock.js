// Permet de fixer manuellement la quantité en stock d'une référence — réservé au rôle "admin"
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
    const { sku, quantity } = JSON.parse(event.body);
    if (!sku || typeof quantity !== 'number' || quantity < 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'sku et quantity (nombre positif) requis' }) };
    }

    const store = getStore({ name: 'stock', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    let stock = await store.get('current', { type: 'json' });
    if (!stock) stock = {};
    stock[sku] = quantity;
    await store.setJSON('current', stock);

    return { statusCode: 200, body: JSON.stringify({ ok: true, stock }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
