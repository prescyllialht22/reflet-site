// Renvoie le décompte actuel des places prises, pour chaque date-clé (ex: "pilates-13"),
// calculé en direct à partir des VRAIES commandes enregistrées — pas d'un compteur
// séparé qui peut se désynchroniser. Sert à afficher "Complet" sur le site public.
//
// Par rapport à la vérification faite au moment du paiement (create-payment-intent.js),
// celle-ci ne revérifie pas chaque paiement individuellement auprès de Stripe (pour rester
// rapide à afficher) — elle reste donc une indication fiable mais pas la protection finale :
// le vrai verrou anti-dépassement se fait toujours au moment du paiement.
const { getStore } = require('@netlify/blobs');

const LEGACY_FAMILY_MATCH = [
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

exports.handler = async function () {
  try {
    const ordersStore = getStore({ name: 'orders', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const { blobs } = await ordersStore.list();

    const counts = {};

    for (const blob of blobs) {
      if (blob.key.startsWith('by-email:')) continue;
      const order = await ordersStore.get(blob.key, { type: 'json' });
      if (!order || !order.items) continue;

      order.items.forEach(item => {
        if (item.type !== 'event') return;

        if (item.id && item.id.includes('-')) {
          counts[item.id] = (counts[item.id] || 0) + (item.qty || 1);
          return;
        }

        // Anciennes commandes sans identifiant propre : on retrouve la famille et le jour
        // par le texte, pour ne pas les oublier dans le décompte.
        const legacy = LEGACY_FAMILY_MATCH.find(f => f.match.test(item.name || ''));
        if (!legacy) return;
        const day = extractDay(item.name || '');
        if (!day) return;
        const key = `${legacy.key}-${day}`;
        counts[key] = (counts[key] || 0) + (item.qty || 1);
      });
    }

    return { statusCode: 200, body: JSON.stringify({ counts }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
