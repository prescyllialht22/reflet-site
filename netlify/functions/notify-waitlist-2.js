// Envoie un mail à l'équipe Reflet dès qu'une participante s'inscrit sur la liste d'attente des sorties
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prenom, email, sortie } = JSON.parse(event.body);
    const sortieLabel = sortie || 'Sortie non précisée';
    const resendKey = process.env.RESEND_API_KEY;

    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Reflet <billets@reflet.events>',
          to: 'reflet.events.pm@gmail.com',
          subject: `✨ Nouvelle inscription liste d'attente — ${sortieLabel} : ${prenom || email}`,
          text: `${prenom || ''} vient de s'inscrire sur la liste d'attente pour la sortie : ${sortieLabel}.\n\nEmail : ${email}`,
        }),
      });
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
