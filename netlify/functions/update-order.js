// Met à jour le statut et/ou le numéro de suivi d'une commande — réservé au rôle "admin"
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
    const { orderId, status, trackingNumber } = JSON.parse(event.body);
    if (!orderId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'orderId requis' }) };
    }

    const store = getStore('orders');
    const order = await store.get(orderId, { type: 'json' });
    if (!order) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Commande introuvable' }) };
    }

    if (status !== undefined) order.status = status;
    if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;

    await store.setJSON(orderId, order);

    return { statusCode: 200, body: JSON.stringify({ ok: true, order }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
