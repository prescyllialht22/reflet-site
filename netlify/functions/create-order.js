// Crée une commande dans Netlify Blobs — mais SEULEMENT après avoir vérifié
// directement auprès de Stripe que le paiement a bien réussi (jamais sur simple confiance du client).
// Décompte aussi automatiquement le stock des produits achetés, et les places pour les
// événements à capacité limitée (Pilates, Danse, DEFINE, MOME).
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getStore } = require('@netlify/blobs');

const INITIAL_STOCK = {
  'tshirt-XS': 2, 'tshirt-S': 9, 'tshirt-M': 9, 'tshirt-L': 4, 'tshirt-XL': 1,
  'totebag': 25, 'bandeau': 30,
};

const CAPACITY_GROUPS = ['pilates', 'danse', 'define', 'mome', 'copains']; // groupes d'événements à capacité limitée, décomptés ici

function generateOrderId() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RFL-${y}${m}-${rand}`;
}

async function decrementStock(items) {
  const store = getStore('stock');
  let stock = await store.get('current', { type: 'json' });
  if (!stock) stock = { ...INITIAL_STOCK };

  items.forEach(item => {
    if (item.type === 'event') return; // seuls les produits boutique ont un stock
    if (stock[item.id] !== undefined) {
      stock[item.id] = Math.max(0, stock[item.id] - item.qty);
    }
  });

  await store.setJSON('current', stock);
}

async function recordEventCapacity(items) {
  const store = getStore('event-capacity');
  let counts = await store.get('counts', { type: 'json' });
  if (!counts) counts = {};

  items.forEach(item => {
    if (item.type !== 'event') return;
    const group = (item.id || '').split('-')[0];
    if (!CAPACITY_GROUPS.includes(group)) return; // pas de limite configurée pour ce type
    counts[item.id] = (counts[item.id] || 0) + item.qty;
  });

  await store.setJSON('counts', counts);
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const { paymentIntentId, email, prenom, nom, telephone, insta, items, deliveryMode, deliveryInfo, deliveryFee } = body;

    if (!paymentIntentId || !email || !items || !items.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Données de commande incomplètes' }) };
    }

    // Vérification réelle et directe auprès de Stripe — étape indispensable.
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      return { statusCode: 402, body: JSON.stringify({ error: 'Paiement non confirmé, commande refusée' }) };
    }

    // Le stock et les places d'événements ne se décomptent qu'une fois le paiement réellement confirmé.
    await decrementStock(items);
    await recordEventCapacity(items);

    const hasProducts = items.some(i => i.type !== 'event');
    const hasEvents = items.some(i => i.type === 'event');

    let status;
    if (!hasProducts) {
      status = 'Payée'; // billet(s) d'événement uniquement — pas de logistique de livraison
    } else if (deliveryMode === 'retrait') {
      status = 'Nouvelle commande';
    } else {
      status = 'Nouvelle commande';
    }

    const order = {
      orderId: generateOrderId(),
      date: new Date().toISOString(),
      email: email.trim().toLowerCase(),
      prenom: prenom || '',
      nom: nom || '',
      telephone: telephone || '',
      insta: insta || '',
      items: items, // [{id, name, price, qty, type}]
      hasProducts,
      hasEvents,
      amount: paymentIntent.amount / 100,
      deliveryMode: hasProducts ? (deliveryMode || null) : null,
      deliveryInfo: hasProducts ? (deliveryInfo || {}) : {},
      deliveryFee: hasProducts ? (deliveryFee || 0) : 0,
      status,
      trackingNumber: '',
      paymentIntentId,
    };

    const store = getStore('orders');
    await store.setJSON(order.orderId, order);

    // On maintient aussi un index simple des commandes par email, pour l'espace client
    const emailKey = 'by-email:' + order.email;
    let emailIndex = await store.get(emailKey, { type: 'json' });
    if (!emailIndex) emailIndex = { orderIds: [] };
    emailIndex.orderIds.push(order.orderId);
    await store.setJSON(emailKey, emailIndex);

    return { statusCode: 200, body: JSON.stringify({ ok: true, orderId: order.orderId }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
