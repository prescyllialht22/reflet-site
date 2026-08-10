// Renvoie la liste de toutes les commandes — réservé aux comptes ayant le rôle "admin"
const { getStore } = require('@netlify/blobs');

exports.handler = async function (event, context) {
  const { user } = context.clientContext || {};
  const roles = (user && user.app_metadata && user.app_metadata.roles) || [];

  if (!user || !roles.includes('admin')) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Accès réservé' }) };
  }

  try {
    const store = getStore('orders');
    const { blobs } = await store.list();

    const orders = [];
    for (const blob of blobs) {
      if (blob.key.startsWith('by-email:')) continue; // on saute les index par email
      const order = await store.get(blob.key, { type: 'json' });
      if (order) orders.push(order);
    }

    orders.sort((a, b) => new Date(b.date) - new Date(a.date));

    return { statusCode: 200, body: JSON.stringify({ orders }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
