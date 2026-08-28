// Envoie un e-mail de confirmation à la cliente une fois son paiement confirmé,
// avec le récapitulatif de sa commande et, pour les billets d'événements, un QR code.
// Appelée uniquement après que create-order.js a vérifié le paiement auprès de Stripe.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { paymentIntentId, email, prenom, items, orderId } = JSON.parse(event.body);

    if (!paymentIntentId || !email || !items || !items.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Données incomplètes' }) };
    }

    // Vérification réelle auprès de Stripe — on n'envoie jamais de confirmation
    // pour un paiement qui n'a pas été confirmé côté serveur, et on utilise le
    // montant réellement débité (jamais celui envoyé par le navigateur).
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      return { statusCode: 402, body: JSON.stringify({ error: 'Paiement non confirmé' }) };
    }
    const amount = paymentIntent.amount / 100;

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'Resend non configuré' }) };
    }

    const hasEvents = items.some(i => i.type === 'event');
    const hasProducts = items.some(i => i.type !== 'event');
    const itemsListHtml = items.map(i => `<li>${i.name} × ${i.qty} — ${(i.price * i.qty).toFixed(2)} €</li>`).join('');
    const reference = (orderId || paymentIntentId).slice(-8).toUpperCase();

    // QR code du billet, généré via une API publique (aucune dépendance à installer)
    const ticketPayload = `REFLET-BILLET | ${prenom || ''} | ${items.map(i => i.name).join(', ')} | Réf: ${reference}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(ticketPayload)}`;

    const html = `
      <div style="font-family:Arial,sans-serif; color:#2A1F19; max-width:480px; margin:0 auto;">
        <h2 style="font-family:Georgia,serif; font-weight:normal;">Merci ${prenom || ''} !</h2>
        <p>Votre paiement de <strong>${amount.toFixed(2)} €</strong> a bien été confirmé.</p>
        <p><strong>Référence de commande :</strong> ${reference}</p>
        <ul style="padding-left:18px;">${itemsListHtml}</ul>
        ${hasEvents ? `
          <p style="margin-top:24px;">Voici votre billet — présentez ce QR code à l'entrée de l'événement :</p>
          <img src="${qrUrl}" alt="QR code billet" style="display:block; margin:12px 0;">
        ` : ''}
        ${hasProducts ? `<p style="margin-top:16px; font-size:14px; color:#6b5c50;">Votre commande boutique sera traitée selon le mode de livraison choisi.</p>` : ''}
        <p style="margin-top:24px; font-size:13px; color:#6b5c50;">Les billets ne sont ni échangeables ni remboursables.</p>
        <p style="margin-top:24px;">À très vite,<br>L'équipe Reflet</p>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Reflet Events <billets@reflet.events>',
        to: email,
        subject: `✅ Confirmation de votre commande Reflet — ${reference}`,
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: errBody }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
