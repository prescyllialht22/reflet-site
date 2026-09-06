// Outil de RATTRAPAGE PONCTUEL (à usage unique, réservé à l'admin) : relit tout
// l'historique des paiements réussis directement sur Stripe, et reconstruit à partir
// de là les commandes manquantes + l'historique fidélité, pour les paiements passés
// pendant que le stockage des données ne fonctionnait pas correctement.
//
// Ne touche volontairement PAS au stock ni aux places limitées (capacité), pour ne pas
// interférer avec une correction manuelle en cours de ces valeurs.
//
// Peut être relancé sans risque de doublon : vérifie systématiquement si une commande
// ou un événement fidélité existe déjà pour chaque paiement avant de l'ajouter.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getStore } = require('@netlify/blobs');

function generateOrderId(createdUnix) {
  const d = new Date(createdUnix * 1000);
  const y = d.getFullYear().toString().slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RFL-${y}${m}-${rand}`;
}

exports.handler = async function (event, context) {
  const { user } = context.clientContext || {};
  const roles = (user && user.app_metadata && user.app_metadata.roles) || [];

  if (!user || !roles.includes('admin')) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Accès réservé' }) };
  }

  try {
    const ordersStore = getStore({ name: 'orders', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const loyaltyStore = getStore({ name: 'loyalty', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

    // Index des paymentIntentId déjà présents dans les commandes, pour éviter les doublons
    const { blobs: existingOrderBlobs } = await ordersStore.list();
    const existingPaymentIntentIds = new Set();
    for (const blob of existingOrderBlobs) {
      if (blob.key.startsWith('by-email:')) continue;
      const order = await ordersStore.get(blob.key, { type: 'json' });
      if (order && order.paymentIntentId) existingPaymentIntentIds.add(order.paymentIntentId);
    }

    let ordersCreated = 0;
    let loyaltyEventsAdded = 0;
    let skippedNoItems = 0;
    let totalScanned = 0;

    let startingAfter;
    let hasMore = true;

    while (hasMore) {
      const page = await stripe.paymentIntents.list({
        limit: 100,
        starting_after: startingAfter,
        expand: ['data.latest_charge'],
      });

      for (const pi of page.data) {
        if (pi.status !== 'succeeded') continue;
        totalScanned++;

        let items = [];
        try {
          items = JSON.parse(pi.metadata.panier || '[]');
        } catch (e) {
          items = [];
        }
        if (!items.length) { skippedNoItems++; continue; }

        const charge = pi.latest_charge;
        const billing = (charge && charge.billing_details) || {};
        const email = (billing.email || pi.receipt_email || '').trim().toLowerCase();
        const fullName = (billing.name || '').trim();
        const [prenom, ...rest] = fullName.split(' ');
        const nom = rest.join(' ');

        if (!email) { skippedNoItems++; continue; }

        // --- Commande ---
        if (!existingPaymentIntentIds.has(pi.id)) {
          const hasProducts = items.some(i => i.type !== 'event');
          const hasEvents = items.some(i => i.type === 'event');
          const order = {
            orderId: generateOrderId(pi.created),
            date: new Date(pi.created * 1000).toISOString(),
            email,
            prenom: prenom || '',
            nom: nom || '',
            telephone: '',
            insta: '',
            items,
            hasProducts,
            hasEvents,
            amount: pi.amount / 100,
            deliveryMode: null,
            deliveryInfo: {},
            deliveryFee: 0,
            status: hasProducts ? 'Nouvelle commande' : 'Payée',
            trackingNumber: '',
            paymentIntentId: pi.id,
            backfilled: true, // pour repérer facilement les commandes reconstituées après coup
          };
          await ordersStore.setJSON(order.orderId, order);

          const emailKey = 'by-email:' + email;
          let emailIndex = await ordersStore.get(emailKey, { type: 'json' });
          if (!emailIndex) emailIndex = { orderIds: [] };
          emailIndex.orderIds.push(order.orderId);
          await ordersStore.setJSON(emailKey, emailIndex);

          existingPaymentIntentIds.add(pi.id);
          ordersCreated++;
        }

        // --- Fidélité (uniquement les billets d'événements, pas les produits boutique) ---
        const eventItems = items.filter(i => i.type === 'event');
        if (eventItems.length) {
          let record = await loyaltyStore.get(email, { type: 'json' });
          if (!record) record = { email, prenom: prenom || '', nom: nom || '', events: [] };

          const alreadyRecorded = record.events.some(e => e.paymentIntentId === pi.id);
          if (!alreadyRecorded) {
            eventItems.forEach(i => {
              for (let n = 0; n < (i.qty || 1); n++) {
                record.events.push({
                  eventName: i.name,
                  date: new Date(pi.created * 1000).toISOString(),
                  paymentIntentId: pi.id,
                });
                loyaltyEventsAdded++;
              }
            });
            await loyaltyStore.setJSON(email, record);
          }
        }
      }

      hasMore = page.has_more;
      if (hasMore) startingAfter = page.data[page.data.length - 1].id;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        totalScanned,
        ordersCreated,
        loyaltyEventsAdded,
        skippedNoItems,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
