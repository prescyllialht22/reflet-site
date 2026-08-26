// Renvoie les commandes de la personne connectée (vérifie son identité via Netlify Identity)
const { getStore } = require('@netlify/blobs');

exports.handler = async function (event, context) {
  const { user } = context.clientContext || {};

  if (!user || !user.email) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Non connectée' }) };
  }

  try {
    const store = getStore({ name: 'orders', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const emailKey = 'by-email:' + user.email.trim().toLowerCase();
    const emailIndex = await store.get(emailKey, { type: 'json' });

    if (!emailIndex || !emailIndex.orderIds || !emailIndex.orderIds.length) {
      return { statusCode: 200, body: JSON.stringify({ orders: [] }) };
    }

    const orders = [];
    for (const orderId of emailIndex.orderIds) {
      const order = await store.get(orderId, { type: 'json' });
      if (order) orders.push(order);
    }
    orders.sort((a, b) => new Date(b.date) - new Date(a.date));

    return { statusCode: 200, body: JSON.stringify({ orders }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
