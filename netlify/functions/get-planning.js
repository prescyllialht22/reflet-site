// Renvoie le planning actuel — stocké dans Netlify Blobs pour pouvoir être modifié
// depuis l'admin, sans jamais avoir besoin de toucher au code du site.
const { getStore } = require('@netlify/blobs');

// Planning de départ, utilisé uniquement la toute première fois (avant la première sauvegarde admin)
const DEFAULT_PLANNING = {
  "month": "Septembre",
  "events": [
    { "day": "06", "month_short": "Sept.", "title": "Run × Copains", "tag": "Run", "summary": "10h · Cité du Vin", "time": "10h · Dimanche · Cité du Vin", "description": "Une session de running suivie d'une pause chez Copains. Départ à 10h à la Cité du Vin. Réservation directement en ligne — 4€, places limitées à 35 personnes.", "special": false, "price": "4" },
    { "day": "09", "month_short": "Sept.", "title": "Rooftop", "tag": "Sortie", "summary": "Sortie · voir Instagram", "time": "Mercredi · voir @reflet.events sur Instagram", "description": "On s'occupe de réserver une table pour 20 personnes maximum à Bordeaux. Informez-nous simplement de votre présence ! Vous n'aurez qu'à financer votre consommation sur place — l'idée, c'est avant tout de rencontrer de nouvelles Bordelaises. Le lieu est communiqué individuellement après inscription. ✨", "special": false, "price": "" },
    { "day": "12", "month_short": "Sept.", "title": "Déjeuner REFLET × MOME", "tag": "Collab", "summary": "15 places · sur réservation", "time": "11h · Samedi · MOME", "description": "Un déjeuner convivial entre filles chez MOME, café-pâtisserie au cœur de Bordeaux. 15 femmes autour d'une même table pour partager un bon moment, échanger et profiter d'un déjeuner dans une ambiance chaleureuse et décontractée. Réservation directement dans la partie « Collaborations du mois » du site.", "special": true, "price": "20", "display_tag": "Sortie" },
    { "day": "13", "month_short": "Sept.", "title": "Pilates'expérience", "tag": "Pilates", "summary": "9h-10h30 · Place du Palais", "time": "9h-10h30 · Dimanche · Place du Palais", "description": "40 min de Pilates sur tapis, matériel fourni, tous niveaux. Gaufres et thé glacé inclus après la séance. 20€.", "special": false, "price": "20" },
    { "day": "16", "month_short": "Sept.", "title": "Run Reflet", "tag": "Run", "summary": "Voir Instagram pour l'horaire", "time": "Mercredi · voir @reflet.events sur Instagram", "description": "4 km maximum, allure libre, tous niveaux. Gratuit, il suffit de vous inscrire pour qu'on sache compter sur vous. Horaire précisé dans le lien en bio Instagram @reflet.events.", "special": false, "price": "" },
    { "day": "19", "month_short": "Sept.", "title": "Pilates Reformer × DEFINE", "tag": "Collab", "summary": "Studio DEFINE · tarif préférentiel", "time": "10h · Samedi · Studio DEFINE", "description": "Une séance de Pilates Reformer au studio DEFINE, à tarif préférentiel réservé aux membres Reflet. Places limitées. Réservation directement dans la partie « Collaborations du mois » du site.", "special": false, "price": "35", "display_tag": "Pilates" },
    { "day": "25", "month_short": "Sept.", "title": "Run × Copains", "tag": "Run", "summary": "19h · Cité du Vin", "time": "19h · Vendredi · Cité du Vin", "description": "Une session de running suivie d'une pause chez Copains. Départ à 19h à la Cité du Vin. Réservation directement en ligne — 4€, places limitées à 35 personnes.", "special": false, "price": "4" },
    { "day": "27", "month_short": "Sept.", "title": "Pilates'expérience", "tag": "Pilates", "summary": "9h-10h30 · Place du Palais", "time": "9h-10h30 · Dimanche · Place du Palais", "description": "40 min de Pilates sur tapis, matériel fourni, tous niveaux. Gaufres et thé glacé inclus après la séance. 20€.", "special": false, "price": "20" },
    { "day": "29", "month_short": "Sept.", "title": "Run Reflet", "tag": "Run", "summary": "Voir Instagram pour l'horaire", "time": "Mardi · voir @reflet.events sur Instagram", "description": "4 km maximum, allure libre, tous niveaux. Gratuit, il suffit de vous inscrire pour qu'on sache compter sur vous. Horaire précisé dans le lien en bio Instagram @reflet.events.", "special": false, "price": "" }
  ]
};

exports.handler = async function () {
  try {
    const store = getStore('planning');
    let planning = await store.get('current', { type: 'json' });
    if (!planning) {
      planning = DEFAULT_PLANNING;
      await store.setJSON('current', planning);
    }
    return { statusCode: 200, body: JSON.stringify(planning) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
