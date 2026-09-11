// Renvoie la liste de toutes les commandes — réservé aux comptes ayant le rôle "admin"
// Chaque commande est marquée "refunded" si le paiement a été remboursé depuis sur Stripe
// (reste visible dans la liste, mais permet de l'exclure des compteurs de participantes).
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getStore } = require('@netlify/blobs');

exports.handler = async function (event, context) {
  const { user } = context.clientContext || {};
  const roles = (user && user.app_metadata && user.app_metadata.roles) || [];

  if (!user || !roles.includes('admin')) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Accès réservé' }) };
  }

  try {
    const store = getStore({ name: 'orders', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const { blobs } = await store.list();

    const orders = [];
    for (const blob of blobs) {
      if (blob.key.startsWith('by-email:')) continue; // on saute les index par email
      const order = await store.get(blob.key, { type: 'json' });
      if (order) orders.push(order);
    }

    orders.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Vérification du statut de remboursement auprès de Stripe (en parallèle pour rester rapide)
    await Promise.all(orders.map(async (order) => {
      order.refunded = false;
      if (!order.paymentIntentId) return;
      try {
        const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId, { expand: ['latest_charge'] });
        order.refunded = !!(pi.latest_charge && pi.latest_charge.refunded);
      } catch (e) {
        // paiement introuvable sur Stripe : on ne le marque pas comme remboursé
      }
    }));

    // On ne renvoie que les paiements réellement validés — les remboursés n'apparaissent
    // nulle part dans l'admin (ni la liste, ni "Par événement").
    const validOrders = orders.filter(o => !o.refunded);

    return { statusCode: 200, body: JSON.stringify({ orders: validOrders }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
