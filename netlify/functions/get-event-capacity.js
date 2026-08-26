// Renvoie le décompte actuel des places prises, pour chaque date-clé (ex: "pilates-13")
const { getStore } = require('@netlify/blobs');

exports.handler = async function () {
  try {
    const store = getStore({ name: 'event-capacity', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const counts = await store.get('counts', { type: 'json' });
    return { statusCode: 200, body: JSON.stringify({ counts: counts || {} }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
