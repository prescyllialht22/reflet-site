// Envoie un mail à l'équipe Reflet dès qu'une participante s'inscrit sur la liste d'attente des sorties
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prenom, email } = JSON.parse(event.body);
    const resendKey = process.env.RESEND_API_KEY;

    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Reflet Sorties <onboarding@resend.dev>',
          to: 'reflet.events.pm@gmail.com',
          subject: `✨ Nouvelle inscription liste d'attente sorties : ${prenom || email}`,
          text: `${prenom || ''} vient de s'inscrire sur la liste d'attente d'une sortie (Rooftop/Brunch).\n\nEmail : ${email}`,
        }),
      });
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
