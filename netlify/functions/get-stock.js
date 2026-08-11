// Renvoie le stock actuel de chaque référence — accessible publiquement (lecture seule),
// pour que le site puisse afficher "Épuisé" le cas échéant.
const { getStore } = require('@netlify/blobs');

// Stock de départ — utilisé uniquement si aucun stock n'a encore été enregistré.
const INITIAL_STOCK = {
  'tshirt-XS': 2,
  'tshirt-S': 9,
  'tshirt-M': 9,
  'tshirt-L': 4,
  'tshirt-XL': 1,
  'totebag': 25,
  'bandeau': 30,
};

exports.handler = async function () {
  try {
    const store = getStore('stock');
    let stock = await store.get('current', { type: 'json' });

    if (!stock) {
      stock = { ...INITIAL_STOCK };
      await store.setJSON('current', stock);
    }

    return { statusCode: 200, body: JSON.stringify({ stock }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
