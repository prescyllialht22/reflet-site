// Cette fonction tourne côté serveur (jamais visible des visiteuses du site).
// Elle utilise la clé SECRÈTE Stripe (jamais la clé publique) pour créer un paiement en sécurité.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getStore } = require('@netlify/blobs');

// Limites de places par type d'événement — la vraie limite, vérifiée ici, pas seulement
// affichée sur le site (qui ne fait qu'un contrôle visuel, pas un verrou).
const CAPACITY_LIMITS = { pilates: 10, danse: 15, define: 11, mome: 13, copains: 35, puppypilates: 15 };

// Pour reconnaître aussi les anciennes commandes dont l'identifiant ne suit pas le format
// propre "famille-jour" (texte libre utilisé avant la correction de ce système).
const LEGACY_FAMILY_MATCH = [
  { key: 'puppypilates', match: /puppy/i },
  { key: 'pilates', match: /pilates.?exp[ée]rience/i },
  { key: 'danse', match: /danse/i },
  { key: 'copains', match: /run.*copains/i },
  { key: 'define', match: /define/i },
  { key: 'mome', match: /mome/i },
];
function extractDay(label){
  const m = (label || '').match(/(\d{1,2})\s*(sept|septembre|oct|octobre|nov|novembre|d[ée]c|d[ée]cembre|jan|janvier|f[ée]v|f[ée]vrier|mars|avr|avril|mai|juin|juil|juillet|ao[ûu]t)/i);
  return m ? m[1].padStart(2, '0') : null;
}

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

    // VRAI contrôle de capacité, calculé en direct à partir des VRAIES commandes existantes
    // (pas d'un compteur séparé qui peut se désynchroniser) — on refuse carrément de créer
    // le paiement si la date demandée est déjà complète.
    const eventItems = (items || []).filter(i => i.type === 'event' && i.id && i.id.includes('-'));
    if (eventItems.length) {
      const ordersStore = getStore({ name: 'orders', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
      const { blobs } = await ordersStore.list();

      // On ne calcule la vraie capacité que pour les identifiants demandés dans ce panier,
      // pour rester rapide même avec beaucoup de commandes enregistrées.
      const neededIds = new Set(eventItems.map(i => i.id));
      // Pour chaque identifiant demandé, on note sa famille + son jour, pour pouvoir aussi
      // reconnaître les anciennes commandes qui utilisaient un texte libre à la place.
      const neededFamilyDay = {};
      eventItems.forEach(i => {
        const [family, day] = i.id.split('-');
        neededFamilyDay[i.id] = { family, day };
      });
      const bookedCounts = {};

      for (const blob of blobs) {
        if (blob.key.startsWith('by-email:')) continue;
        const order = await ordersStore.get(blob.key, { type: 'json' });
        if (!order || !order.items) continue;

        const matchingItems = [];
        order.items.forEach(i => {
          if (i.type !== 'event') return;
          if (neededIds.has(i.id)) {
            matchingItems.push({ targetId: i.id, qty: i.qty || 1 });
            return;
          }
          // Repli pour les anciennes commandes : même famille + même jour, reconnus par le texte
          const legacy = LEGACY_FAMILY_MATCH.find(f => f.match.test(i.name || ''));
          if (!legacy) return;
          const day = extractDay(i.name || '');
          const targetEntry = Object.entries(neededFamilyDay).find(([, t]) => t.family === legacy.key && t.day === day);
          if (targetEntry) matchingItems.push({ targetId: targetEntry[0], qty: i.qty || 1 });
        });
        if (!matchingItems.length) continue;

        // On ne vérifie le remboursement (appel Stripe) que pour les commandes concernées
        let refunded = false;
        if (order.paymentIntentId) {
          try {
            const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId, { expand: ['latest_charge'] });
            refunded = !!(pi.latest_charge && pi.latest_charge.amount_refunded > 0);
          } catch (e) { /* paiement introuvable : on le compte quand même par précaution */ }
        }
        if (refunded) continue;

        matchingItems.forEach(i => {
          bookedCounts[i.targetId] = (bookedCounts[i.targetId] || 0) + i.qty;
        });
      }

      for (const item of eventItems) {
        const group = item.id.split('-')[0];
        const limit = CAPACITY_LIMITS[group];
        if (!limit) continue; // pas de limite pour ce type d'événement (ex: Run classique)

        const currentCount = bookedCounts[item.id] || 0;
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
