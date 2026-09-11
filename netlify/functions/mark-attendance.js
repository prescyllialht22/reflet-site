// Enregistre si une participante était bien présente à l'événement (coché/décoché
// depuis la liste "Par événement" de l'admin) — réservé au rôle "admin".
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
    const { orderId, attended } = JSON.parse(event.body);
    if (!orderId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'orderId requis' }) };
    }

    const store = getStore({ name: 'orders', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const order = await store.get(orderId, { type: 'json' });
    if (!order) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Commande introuvable' }) };
    }

    order.attended = !!attended;
    await store.setJSON(orderId, order);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
