// À chaque inscription sur "Les instants Reflet" :
//  1) envoie une notification à l'équipe Reflet
//  2) pour la soirée Raclette : envoie automatiquement à la participante le mail d'acompte
async function sendMail(resendKey, payload) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prenom, email, sortie } = JSON.parse(event.body);
    const sortieLabel = sortie || 'Sortie non précisée';
    const resendKey = process.env.RESEND_API_KEY;
    const isRaclette = /raclette/i.test(sortieLabel);

    if (resendKey) {
      // 1) Notification pour l'équipe
      try {
        await sendMail(resendKey, {
          from: 'Reflet <billets@reflet.events>',
          to: 'reflet.events.pm@gmail.com',
          subject: `✨ Nouvelle inscription — ${sortieLabel} : ${prenom || email}`,
          text: `${prenom || ''} vient de s'inscrire : ${sortieLabel}.\n\nEmail : ${email}${isRaclette ? '\n\nLe mail d\'acompte lui a été envoyé automatiquement.' : ''}`,
        });
      } catch (e) { /* on continue */ }

      // 2) Mail d'acompte automatique pour la Raclette
      if (isRaclette && email) {
        const nom = (prenom || '').toString().trim().slice(0, 60);
        const text =
`Coucou ${nom || ''},

Merci pour ton inscription à la soirée Raclette REFLET du samedi 21 novembre à 21h30 (27 rue des Argentiers, Bordeaux) ♡

Pour valider définitivement ta place, un acompte de 10 € est demandé par le restaurant.

Comment faire :
• Montant : 10 €
• Mode de paiement : virement
• IBAN : FR04 1759 8000 01S0 0067 8393 090
• Bénéficiaire : Prescyllia Lahiteau
• Référence à indiquer : RACLETTE + ton prénom
• À régler avant le 14/11 - 10H

À réception de ton acompte, nous t'envoyons un mail de confirmation. Sans acompte reçu avant cette date, ta place sera libérée pour une autre participante.

Petit rappel : les places sont limitées. En cas d'empêchement, merci de nous prévenir au plus vite. Une annulation sans prévenir prive une autre fille de cette place, et REFLET se réserve le droit de ne plus accepter les prochaines réservations aux sorties des personnes concernées.

Hâte de partager cette soirée avec toi !

Prescyllia & Marie
REFLET`;
        await sendMail(resendKey, {
          from: 'Reflet <billets@reflet.events>',
          to: email,
          reply_to: 'reflet.events.pm@gmail.com',
          subject: 'Soirée Raclette REFLET — confirme ta place avec ton acompte',
          text,
        });
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
