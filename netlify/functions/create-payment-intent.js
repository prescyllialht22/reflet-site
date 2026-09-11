
// Cette fonction tourne côté serveur (jamais visible des visiteuses du site).
// Elle utilise la clé SECRÈTE Stripe (jamais la clé publique) pour créer un paiement en sécurité.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getStore } = require('@netlify/blobs');

// Limites de places par type d'événement — la vraie limite, vérifiée ici, pas seulement
// affichée sur le site (qui ne fait qu'un contrôle visuel, pas un verrou).
const CAPACITY_LIMITS = { pilates: 10, danse: 15, define: 11, mome: 15, copains: 35 };

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { amount, items } = JSON.parse(event.body);

    // Sécurité de base : on vérifie que le montant est un nombre raisonnable
    if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 100000) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Montant invalide' }) };
    }

    // VRAI contrôle de capacité, ici et pas seulement dans le navigateur : on refuse
    // carrément de créer le paiement si la date demandée est déjà complète.
    const eventItems = (items || []).filter(i => i.type === 'event' && i.id && i.id.includes('-'));
    if (eventItems.length) {
      const capacityStore = getStore({ name: 'event-capacity', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
      const counts = (await capacityStore.get('counts', { type: 'json' })) || {};

      for (const item of eventItems) {
        const group = item.id.split('-')[0];
        const limit = CAPACITY_LIMITS[group];
        if (!limit) continue; // pas de limite pour ce type d'événement (ex: Run classique)

        const currentCount = counts[item.id] || 0;
        if (currentCount + (item.qty || 1) > limit) {
          return {
            statusCode: 409,
            body: JSON.stringify({ error: `Cette date est complète (${item.name}). Merci de choisir une autre date.` }),
          };
        }
      }
    }

    // Description lisible affichée directement dans la liste des paiements Stripe
    // (ex: "Pilates'expérience — 13 sept x1, Bandeau Reflet x1")
    const description = (items || [])
      .map(i => `${i.name} x${i.qty || 1}`)
      .join(', ')
      .slice(0, 250) || 'Commande Reflet';

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // en centimes (ex: 2000 = 20,00 €)
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      description: description,
      metadata: {
        panier: JSON.stringify(items || []).slice(0, 500),
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
