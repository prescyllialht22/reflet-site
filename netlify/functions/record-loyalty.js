// Enregistre un événement payé dans l'historique fidélité de la cliente (par email),
// et envoie un mail à l'équipe dès qu'elle atteint 5 ou 10 événements.
const { getStore } = require('@netlify/blobs');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { email, prenom, nom, eventName, paymentIntentId } = JSON.parse(event.body);

    if (!email || !eventName) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Email et événement requis' }) };
    }

    const store = getStore('loyalty');
    const key = email.trim().toLowerCase();

    let record = await store.get(key, { type: 'json' });
    if (!record) {
      record = { email: key, prenom: prenom || '', nom: nom || '', events: [] };
    }

    record.events.push({
      eventName,
      date: new Date().toISOString(),
      paymentIntentId: paymentIntentId || '',
    });

    await store.setJSON(key, record);

    const count = record.events.length;
    let notified = false;

    if (count === 5 || count === 10) {
      const reward = count === 5 ? 'un petit cadeau' : 'un événement offert';
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Reflet Fidélité <onboarding@resend.dev>',
            to: 'reflet.events.pm@gmail.com',
            subject: `🎉 ${record.prenom || key} vient d'atteindre ${count} événements !`,
            text: `${record.prenom || ''} ${record.nom || ''} (${key}) vient d'atteindre ${count} événements payés — ${reward} à prévoir !\n\nDernier événement : ${eventName}`,
          }),
        });
        notified = true;
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ count, notified }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
