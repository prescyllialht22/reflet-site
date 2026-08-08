// Renvoie l'historique fidélité de la personne connectée (vérifie son identité via Netlify Identity)
const { getStore } = require('@netlify/blobs');

exports.handler = async function (event, context) {
  const { identity, user } = context.clientContext || {};

  if (!user || !user.email) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Non connectée' }) };
  }

  try {
    const store = getStore('loyalty');
    const key = user.email.trim().toLowerCase();
    const record = await store.get(key, { type: 'json' });

    if (!record) {
      return { statusCode: 200, body: JSON.stringify({ email: key, events: [] }) };
    }

    return { statusCode: 200, body: JSON.stringify(record) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
