// Cette fonction tourne côté serveur (jamais visible des visiteuses du site).
// Elle utilise la clé SECRÈTE Stripe (jamais la clé publique) pour créer un paiement en sécurité.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
