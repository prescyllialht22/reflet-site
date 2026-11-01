// RAPPEL AUTOMATIQUE : chaque soir, envoie un e-mail de rappel (infos de l'événement) à toutes les
// participantes ayant un billet pour un événement qui a lieu LE LENDEMAIN. S'exécute tout seul
// (planification définie dans netlify.toml). Ne renvoie jamais deux fois le même rappel,
// et ignore les paiements remboursés.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getStore } = require('@netlify/blobs');

const SITE_URL = process.env.URL || 'https://reflet.events';
const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Même logique que sur le site pour retrouver l'identifiant "famille-jour" d'un événement
function capacityKeyFor(ev) {
  if (ev.capacity_key) return ev.capacity_key;
  const t = (ev.title || '').toLowerCase();
  if (t.includes('puppy')) return `puppypilates-${ev.day}`;
  if (['Pilates', 'Danse'].includes(ev.tag)) return `${ev.tag.toLowerCase()}-${ev.day}`;
  if (t.includes('copains')) return `copains-${ev.day}`;
  if (t.includes('mome')) return `mome-${ev.day}`;
  if (t.includes('define')) return `define-${ev.day}`;
  return null;
}

function parisTomorrow() {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'numeric', year: 'numeric' }).formatToParts(d);
  const get = t => parts.find(p => p.type === t).value;
  return { day: get('day'), month: parseInt(get('month'), 10), year: parseInt(get('year'), 10) };
}

async function loadTomorrowEvents(tomorrow) {
  const found = [];
  for (const file of ['planning.json', 'planning-novembre.json']) {
    try {
      const res = await fetch(`${SITE_URL}/data/${file}`);
      if (!res.ok) continue;
      const data = await res.json();
      const monthIdx = MONTHS.indexOf((data.month || '').toLowerCase()) + 1;
      if (monthIdx !== tomorrow.month) continue;
      (data.events || []).forEach(ev => {
        if (String(ev.day).padStart(2, '0') === tomorrow.day) found.push({ ev, month: data.month });
      });
    } catch (e) { /* planning introuvable : on passe */ }
  }
  return found;
}

// Consignes pratiques selon le type d'événement (famille = début de l'identifiant, ex. "pilates-08")
const NOTES = {
  pilates: "Il n'y a pas de vestiaire sur place : pense à venir directement en tenue.",
  danse: "Pense à prévoir une paire de chaussures propre ou des chaussettes, ce sera nécessaire.",
  define: "Des chaussettes antidérapantes sont obligatoires pour la séance (vente possible sur place).",
  copains: "Le point de rendez-vous est à la Cité du vin, juste derrière l'arrêt de tram.",
};

// Adresses exactes à afficher dans le rappel (quand le planning n'en donne pas assez)
const ADRESSES = {
  define: 'Studio DEFINE, 9 Rue du Temple, 33000 Bordeaux',
};

function buildMail(prenom, ev, month, qty, family) {
  const dateLabel = `${parseInt(ev.day, 10)} ${month.toLowerCase()}`;
  const quand = ev.time || '';
  const lieuBrut = (ev.summary || '').replace(/^\s*\d{1,2}\s*[hH]\s*\d{0,2}\s*-\s*/, '');
  const lieu = ADRESSES[family] || lieuBrut;
  const desc = (ev.description || '').split('\n').map(l => `<p style="margin:0 0 8px;">${esc(l)}</p>`).join('');
  const subject = "N'oublie pas, ton événement REFLET c'est demain !";
  const note = NOTES[family] || '';
  const html = `
    <div style="font-family:Arial,sans-serif; color:#2A1F19; max-width:480px; margin:0 auto;">
      <h2 style="font-family:Georgia,serif; font-weight:normal; font-size:21px; line-height:1.3; margin-bottom:14px;">Coucou ${esc(prenom) || ''},<br>N'oublie pas, ton événement REFLET c'est demain !</h2>
      <div style="border:1px solid #d9cfbd; border-radius:14px; padding:14px 16px; margin:16px 0;">
        <p style="margin:0 0 6px; font-size:18px; font-family:Georgia,serif;">${esc(ev.title)}</p>
        <p style="margin:0 0 4px;">📅 ${esc(dateLabel)}${quand ? ' — ' + esc(quand) : ''}</p>
        ${lieu ? `<p style="margin:0;">📍 ${esc(lieu)}</p>` : ''}
        ${qty > 1 ? `<p style="margin:6px 0 0;">🎟️ ${qty} places réservées</p>` : ''}
      </div>
      ${note ? `<div style="background:#F3ECDF; border-radius:14px; padding:12px 16px; margin:0 0 16px; font-size:14px;"><strong>À savoir :</strong> ${esc(note)}</div>` : ''}
      <div style="font-size:14px; color:#5A4636;">${desc}</div>
      <p style="margin-top:18px; font-size:14px;">Ton billet (QR code) se trouve dans ton e-mail de confirmation.</p>
      <p style="font-size:14px;">Un empêchement ou un retard ? Préviens-nous au plus vite en DM sur le compte Instagram de REFLET (<strong>@reflet.events</strong>). On te remercie !</p>
      <p style="margin-top:22px;">À demain,<br>Prescyllia &amp; Marie — REFLET</p>
    </div>`;
  return { subject, html };
}

exports.handler = async function (event, context) {
  // Appel planifié (automatique) OU appel manuel réservé à l'admin
  let scheduled = false;
  try { scheduled = !!JSON.parse(event.body || '{}').next_run; } catch (e) { /* pas planifié */ }
  if (!scheduled) {
    const { user } = (context && context.clientContext) || {};
    const roles = (user && user.app_metadata && user.app_metadata.roles) || [];
    if (!user || !roles.includes('admin')) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Accès réservé' }) };
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'Resend non configuré' }) };

  try {
    const tomorrow = parisTomorrow();
    const events = await loadTomorrowEvents(tomorrow);
    if (!events.length) return { statusCode: 200, body: JSON.stringify({ ok: true, sent: 0, note: 'Aucun événement demain' }) };

    const wanted = {}; // identifiant d'événement -> {ev, month}
    events.forEach(({ ev, month }) => { const k = capacityKeyFor(ev); if (k) wanted[k] = { ev, month }; });
    if (!Object.keys(wanted).length) return { statusCode: 200, body: JSON.stringify({ ok: true, sent: 0 }) };

    const ordersStore = getStore({ name: 'orders', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const remindersStore = getStore({ name: 'reminders', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const { blobs } = await ordersStore.list();
    const cutoff = Date.now() - 100 * 24 * 3600 * 1000; // on ignore les commandes de plus de ~3 mois

    let sent = 0, skipped = 0;
    for (const blob of blobs) {
      if (blob.key.startsWith('by-email:')) continue;
      const order = await ordersStore.get(blob.key, { type: 'json' });
      if (!order || !order.email || !order.items) continue;
      if (order.date && new Date(order.date).getTime() < cutoff) continue;

      const matches = order.items.filter(i => i.type === 'event' && wanted[i.id]);
      if (!matches.length) continue;

      // Paiement remboursé : pas de rappel
      let refunded = false;
      if (order.paymentIntentId) {
        try {
          const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId, { expand: ['latest_charge'] });
          refunded = !!(pi.latest_charge && pi.latest_charge.amount_refunded > 0);
        } catch (e) { /* paiement introuvable : on envoie quand même */ }
      }
      if (refunded) { skipped++; continue; }

      for (const item of matches) {
        const key = `${order.orderId}|${item.id}`;
        const already = await remindersStore.get(key);
        if (already) { skipped++; continue; }
        const { ev, month } = wanted[item.id];
        const { subject, html } = buildMail(order.prenom, ev, month, item.qty || 1, String(item.id).split('-')[0]);
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'Reflet <billets@reflet.events>', to: order.email, reply_to: 'reflet.events.pm@gmail.com', subject, html }),
        });
        if (res.ok) { await remindersStore.set(key, new Date().toISOString()); sent++; }
      }
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, sent, skipped }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
