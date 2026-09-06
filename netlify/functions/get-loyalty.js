// Renvoie l'historique fidélité de la personne connectée (vérifie son identité via Netlify Identity).
// Chaque événement est vérifié auprès de Stripe pour savoir s'il a été remboursé depuis :
// il reste visible dans l'historique, mais n'est pas compté dans le total pour les paliers
// de fidélité (5 et 10 événements).
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getStore } = require('@netlify/blobs');

exports.handler = async function (event, context) {
  const { user } = context.clientContext || {};

  if (!user || !user.email) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Non connectée' }) };
  }

  try {
    const store = getStore({ name: 'loyalty', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const key = user.email.trim().toLowerCase();
    const record = await store.get(key, { type: 'json' });

    if (!record) {
      return { statusCode: 200, body: JSON.stringify({ email: key, events: [], count: 0 }) };
    }

    // On vérifie chaque événement auprès de Stripe pour savoir s'il a été remboursé depuis
    const eventsWithStatus = await Promise.all(
      record.events.map(async (ev) => {
        let refunded = false;
        if (ev.paymentIntentId) {
          try {
            const pi = await stripe.paymentIntents.retrieve(ev.paymentIntentId, { expand: ['latest_charge'] });
            refunded = !!(pi.latest_charge && pi.latest_charge.refunded);
          } catch (e) {
            refunded = false; // paiement introuvable : on ne pénalise pas, il reste compté
          }
        }
        return { ...ev, refunded };
      })
    );

    const count = eventsWithStatus.filter(ev => !ev.refunded).length;

    return { statusCode: 200, body: JSON.stringify({ email: key, prenom: record.prenom, nom: record.nom, events: eventsWithStatus, count }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
