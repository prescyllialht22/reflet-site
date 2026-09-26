// Outil de RÉPARATION PONCTUELLE (à usage unique, réservé à l'admin) : recalcule le
// compteur de places prises (utilisé par le site public pour afficher "Complet") à
// partir des VRAIES commandes enregistrées, plutôt que du compteur incrémenté au fil
// de l'eau qui a pu rater des réservations pendant la panne du stockage.
//
// Utilise la même logique de reconnaissance par mots-clés que la vue "Par événement"
// de l'admin, pour rester cohérent avec ce qui y est affiché.
const { getStore } = require('@netlify/blobs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const EVENT_FAMILIES = [
  { key: 'puppypilates', match: /puppy/i, max: 15 },
  { key: 'pilates', match: /pilates.?exp[ée]rience/i, max: 10 },
  { key: 'danse', match: /danse/i, max: 15 },
  { key: 'copains', match: /run.*copains/i, max: 35 },
  { key: 'define', match: /define/i, max: 11 },
  { key: 'mome', match: /mome/i, max: 13 },
  // "Run Reflet" classique volontairement absent : pas de limite de places
];

function detectFamily(label) {
  return EVENT_FAMILIES.find(f => f.match.test(label)) || null;
}

function extractDay(label) {
  const m = label.match(/(\d{1,2})\s*(sept|septembre|oct|octobre|nov|novembre|d[ée]c|d[ée]cembre|jan|janvier|f[ée]v|f[ée]vrier|mars|avr|avril|mai|juin|juil|juillet|ao[ûu]t)/i);
  return m ? m[1].padStart(2, '0') : null;
}

exports.handler = async function (event, context) {
  const { user } = context.clientContext || {};
  const roles = (user && user.app_metadata && user.app_metadata.roles) || [];

  if (!user || !roles.includes('admin')) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Accès réservé' }) };
  }

  try {
    const ordersStore = getStore({ name: 'orders', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const capacityStore = getStore({ name: 'event-capacity', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

    // Récupère le planning actuel, pour retrouver la bonne date des familles qui n'ont
    // qu'un seul rendez-vous ce mois-ci et dont le texte ne précise jamais explicitement
    // le jour (ex : "DEFINE — Pilates Reformer").
    let planningDayByFamily = {};
    try {
      const res = await fetch('https://reflet.events/data/planning.json');
      const planning = await res.json();
      (planning.events || []).forEach(ev => {
        const fam = detectFamily(ev.title || '');
        if (fam) {
          planningDayByFamily[fam.key] = planningDayByFamily[fam.key] || [];
          if (!planningDayByFamily[fam.key].includes(ev.day)) planningDayByFamily[fam.key].push(ev.day);
        }
      });
    } catch (e) {
      planningDayByFamily = {};
    }

    const { blobs } = await ordersStore.list();
    const byFamily = {}; // { pilates: { '13': n, '27': n, dateless: n }, ... }

    for (const blob of blobs) {
      if (blob.key.startsWith('by-email:')) continue;
      const order = await ordersStore.get(blob.key, { type: 'json' });
      if (!order) continue;

      if (order.paymentIntentId) {
        try {
          const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId, { expand: ['latest_charge'] });
          const refunded = !!(pi.latest_charge && pi.latest_charge.amount_refunded > 0);
          if (refunded) continue; // on ignore ce paiement, remboursé (même partiellement)
        } catch (e) {
          // paiement introuvable sur Stripe : on continue quand même, sans le considérer remboursé
        }
      }

      (order.items || []).forEach(item => {
        if (item.type !== 'event') return;

        // Priorité à l'identifiant technique propre (ex: "pilates-13"), fiable pour toute
        // réservation faite depuis la correction de ce système — le texte n'est utilisé
        // qu'en dernier recours, pour les anciennes commandes mal formées.
        const cleanMatch = item.id && item.id.match(/^([a-z]+)-(\d{1,2})$/);
        if (cleanMatch) {
          const famKey = cleanMatch[1];
          const day = cleanMatch[2].padStart(2, '0');
          if (!byFamily[famKey]) byFamily[famKey] = { dateless: 0 };
          byFamily[famKey][day] = (byFamily[famKey][day] || 0) + (item.qty || 1);
          return;
        }

        const fam = detectFamily(item.name || '');
        if (!fam) return; // "Run Reflet" classique ou autre : pas de limite, on ignore

        if (!byFamily[fam.key]) byFamily[fam.key] = { dateless: 0 };
        const day = extractDay(item.name || '');
        if (day) {
          byFamily[fam.key][day] = (byFamily[fam.key][day] || 0) + (item.qty || 1);
        } else {
          byFamily[fam.key].dateless += (item.qty || 1);
        }
      });
    }

    const counts = {};
    const notes = [];

    Object.keys(byFamily).forEach(famKey => {
      const data = byFamily[famKey];
      const dayKeys = Object.keys(data).filter(k => k !== 'dateless');

      if (data.dateless > 0) {
        if (dayKeys.length === 1) {
          data[dayKeys[0]] += data.dateless;
        } else if (dayKeys.length === 0 && planningDayByFamily[famKey] && planningDayByFamily[famKey].length === 1) {
          const day = planningDayByFamily[famKey][0];
          data[day] = (data[day] || 0) + data.dateless;
        } else if (dayKeys.length > 1) {
          // Ambigu entre plusieurs dates connues : par sécurité, on compte cette réservation
          // sur CHAQUE date possible plutôt que de risquer un sous-comptage qui permettrait
          // un nouveau dépassement (mieux vaut bloquer une date un peu trop tôt que pas assez).
          dayKeys.forEach(day => { data[day] += data.dateless; });
          notes.push(`${famKey} : ${data.dateless} réservation(s) sans date claire ont été comptées par précaution sur chacune des ${dayKeys.length} dates possibles.`);
        } else {
          notes.push(`${famKey} : ${data.dateless} réservation(s) sans date claire et sans aucune date connue ce mois-ci — non comptabilisées.`);
        }
      }

      Object.keys(data).filter(k => k !== 'dateless').forEach(day => {
        counts[`${famKey}-${day}`] = data[day];
      });
    });

    await capacityStore.setJSON('counts', counts);

    return { statusCode: 200, body: JSON.stringify({ ok: true, counts, notes }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
