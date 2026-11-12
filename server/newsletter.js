/* ===========================================================
   server/newsletter.js — Newsletter des initiatives (2026-11-11), étape N1 : abonnés, double confirmation, désabonnement
   ===========================================================
   Règles (validées par l'utilisateur le 2026-11-11) :
   - Un abonné n'existe que s'il a donné son consentement ET confirmé par e-mail (double confirmation). Tant qu'il n'a pas confirmé,
     il est « en_attente » et ne recevra jamais rien.
   - Chaque boutique a ses propres abonnés ; se désabonner d'une boutique n'affecte pas les autres.
   - Le lien de confirmation et le lien de désabonnement utilisent un jeton aléatoire propre à la ligne (jamais déductible de l'adresse).
   - La réponse du formulaire public est toujours la même, que l'adresse soit connue ou non : on ne révèle pas qui est inscrit.
   - Une initiative ne voit que ses propres abonnés ; l'administration ne reçoit pas la liste.
   Les campagnes et l'envoi (étape N2) sont dans server/newsletter-campagnes.js, branchées en bas de enregistrer(). Aucun paiement dans ce module.
   Lancer les tests : node --test tests/newsletter.test.js
   =========================================================== */
'use strict';

const crypto = require('node:crypto');
const mailer = require('./mailer');

const VALIDITE_CONFIRMATION_MS = 7 * 24 * 3600 * 1000; // un lien de confirmation vaut 7 jours
const DELAI_RENVOI_MS = 10 * 60 * 1000;                // pas de second e-mail de confirmation en moins de 10 minutes

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sqlDate = (t) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
const maintenant = () => sqlDate(Date.now());
/* Les dates SQLite (« AAAA-MM-JJ hh:mm:ss », UTC) comme les dates Postgres (objet Date) deviennent des millisecondes. */
function ms(v) {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(String(v).includes('T') ? String(v) : String(v).replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? t : 0;
}
function creerJeton() { return crypto.randomBytes(24).toString('base64url'); }

const MESSAGE_GENERIQUE = "Merci ! Si cette adresse est valide, un e-mail de confirmation vient de vous être envoyé. Cliquez sur le lien qu'il contient pour finaliser votre inscription.";

/* Page simple affichée après un clic sur un lien d'e-mail (aucune connexion requise). */
function pageMessage(titre, texte) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titre)}</title></head>` +
    `<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1424;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#ede9df;padding:24px;box-sizing:border-box">` +
    `<main style="max-width:480px;width:100%;background:#12213a;border:1px solid #d8b36a;border-radius:14px;padding:28px;text-align:center">` +
    `<h1 style="font-size:20px;margin:0 0 12px;color:#d8b36a">${esc(titre)}</h1><p style="margin:0 0 18px;line-height:1.6;font-size:15px">${esc(texte)}</p>` +
    `<a href="/" style="display:inline-block;padding:10px 18px;border-radius:10px;background:#d8b36a;color:#111;font-weight:700;text-decoration:none">Retour à Diaspo'Actif</a></main></body></html>`;
}

function htmlConfirmation({ nomBoutique, lien }) {
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#14213a">` +
    `<h2 style="margin:0 0 12px">Confirmez votre inscription</h2>` +
    `<p style="line-height:1.6">Vous avez demandé à recevoir la newsletter de <strong>${esc(nomBoutique)}</strong> sur Diaspo'Actif. Pour finaliser votre inscription, cliquez sur le bouton ci-dessous.</p>` +
    `<p style="margin:22px 0"><a href="${esc(lien)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#d8b36a;color:#111;font-weight:700;text-decoration:none">Confirmer mon inscription</a></p>` +
    `<p style="font-size:13px;color:#55607a;line-height:1.6">Ce lien est valable 7 jours. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message : vous ne recevrez rien.</p></div>`;
}

function enregistrer({ route, db, getCurrentUser, sendJSON, SEC, getOrigin, envoyerEmail = mailer.sendEmail, envoiReel }) {

  /* Réponse HTML (pages de confirmation et de désabonnement). */
  function repondrePage(res, status, titre, texte) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    res.end(pageMessage(titre, texte));
  }

  /* ── Public : s'inscrire à la newsletter d'une boutique (double confirmation) ── */
  route('POST', '/api/newsletter/:id/abonner', async (req, res, params, body) => {
    body = body || {};
    const ip = SEC.clientIp(req);
    if (body.site_perso) { SEC.logSecurity('newsletter_honeypot', { ip }); return sendJSON(res, 400, { error: 'Requête invalide.' }); }
    const rendu = Number(body._form_ts) || 0;
    if (rendu && Date.now() - rendu < 2000) return sendJSON(res, 400, { error: 'Veuillez réessayer dans quelques secondes.' });
    const limIp = SEC.rateLimit(`nl:ip:${ip}`, 10, 3600000);
    if (!limIp.allowed) return sendJSON(res, 429, { error: `Trop de demandes depuis cette connexion. Réessayez dans ${limIp.retryAfter}s.` });

    const email = SEC.normalizeEmail(body.email);
    if (!SEC.isValidEmail(email)) return sendJSON(res, 400, { error: 'Adresse e-mail invalide.' });
    if (body.consentement !== true) return sendJSON(res, 400, { error: "Cochez la case pour accepter de recevoir la newsletter." });

    const initId = Number(params.id);
    if (!Number.isInteger(initId) || initId <= 0) return sendJSON(res, 404, { error: 'Boutique introuvable.' });
    const init = await db.prepare('SELECT id, nom FROM initiatives WHERE id=?').get(initId);
    if (!init) return sendJSON(res, 404, { error: 'Boutique introuvable.' });
    const limMail = SEC.rateLimit(`nl:mail:${initId}:${email}`, 3, 3600000);
    if (!limMail.allowed) return sendJSON(res, 429, { error: `Trop de demandes pour cette adresse. Réessayez dans ${limMail.retryAfter}s.` });

    const nom = String(body.nom || '').trim().slice(0, 80) || null;
    const existant = await db.prepare('SELECT * FROM nl_abonnes WHERE initiative_id=? AND email=?').get(initId, email);
    if (existant && existant.statut === 'actif') return sendJSON(res, 200, { ok: true, message: MESSAGE_GENERIQUE });
    if (existant && existant.statut === 'en_attente' && Date.now() - ms(existant.derniere_confirmation_le) < DELAI_RENVOI_MS) {
      return sendJSON(res, 200, { ok: true, message: MESSAGE_GENERIQUE });
    }

    const jeton = creerJeton();
    const maint = maintenant();
    if (existant) {
      /* Réinscription après désabonnement, ou renvoi du lien : nouveau consentement, nouveau jeton (l'ancien lien cesse de valoir). */
      await db.prepare(`UPDATE nl_abonnes SET statut='en_attente', jeton=?, nom=COALESCE(?, nom), consentement_le=?, derniere_confirmation_le=?, desabonne_le=NULL WHERE id=?`)
        .run(jeton, nom, maint, maint, existant.id);
    } else {
      await db.prepare(`INSERT INTO nl_abonnes (initiative_id, email, nom, source, statut, jeton, consentement_le, derniere_confirmation_le) VALUES (?,?,?,?,?,?,?,?)`)
        .run(initId, email, nom, 'formulaire', 'en_attente', jeton, maint, maint);
    }
    const lien = `${getOrigin(req)}/api/newsletter/confirmer?t=${encodeURIComponent(jeton)}`;
    try {
      await envoyerEmail({ to: email, subject: `Confirmez votre inscription à la newsletter de ${init.nom}`, html: htmlConfirmation({ nomBoutique: init.nom, lien }) });
    } catch (e) { console.error('[newsletter] envoi de la confirmation :', e && e.message); }
    sendJSON(res, 200, { ok: true, message: MESSAGE_GENERIQUE });
  });

  /* ── Public : lien de confirmation reçu par e-mail ── */
  route('GET', '/api/newsletter/confirmer', async (req, res, params, body, query) => {
    const jeton = String((query && query.t) || '');
    const ab = jeton.length >= 20 && jeton.length <= 100 ? await db.prepare('SELECT a.*, i.nom AS boutique FROM nl_abonnes a JOIN initiatives i ON i.id=a.initiative_id WHERE a.jeton=?').get(jeton) : null;
    if (!ab) return repondrePage(res, 400, 'Lien non valide', "Ce lien de confirmation n'est pas valide. Vous pouvez vous réinscrire depuis la boutique.");
    if (ab.statut === 'actif') return repondrePage(res, 200, 'Inscription déjà confirmée', `Vous recevez déjà la newsletter de ${ab.boutique}.`);
    if (ab.statut !== 'en_attente' || Date.now() - ms(ab.derniere_confirmation_le) > VALIDITE_CONFIRMATION_MS) {
      return repondrePage(res, 400, 'Lien expiré', "Ce lien de confirmation n'est plus valable. Vous pouvez vous réinscrire depuis la boutique.");
    }
    await db.prepare(`UPDATE nl_abonnes SET statut='actif', confirme_le=? WHERE id=?`).run(maintenant(), ab.id);
    repondrePage(res, 200, 'Inscription confirmée', `Merci ! Vous recevrez désormais la newsletter de ${ab.boutique}. Chaque message contient un lien pour vous désabonner à tout moment.`);
  });

  /* ── Public : désabonnement en un clic, sans connexion, propre à la boutique ── */
  const desabonner = async (req, res, params, body, query) => {
    const jeton = String((query && query.t) || '');
    const ab = jeton.length >= 20 && jeton.length <= 100 ? await db.prepare('SELECT a.*, i.nom AS boutique FROM nl_abonnes a JOIN initiatives i ON i.id=a.initiative_id WHERE a.jeton=?').get(jeton) : null;
    if (!ab) return repondrePage(res, 400, 'Lien non valide', "Ce lien de désabonnement n'est pas valide.");
    if (ab.statut !== 'desabonne') await db.prepare(`UPDATE nl_abonnes SET statut='desabonne', desabonne_le=? WHERE id=?`).run(maintenant(), ab.id);
    repondrePage(res, 200, 'Vous êtes désabonné(e)', `Vous ne recevrez plus la newsletter de ${ab.boutique}. Les autres boutiques ne sont pas concernées.`);
  };
  route('GET', '/api/newsletter/desabonner', desabonner);
  /* Désabonnement « en un clic » demandé par les boîtes mail (en-têtes List-Unsubscribe-Post, RFC 8058) : le même jeton, en POST. */
  route('POST', '/api/newsletter/desabonner', desabonner);

  /* ── Propriétaire de la boutique : ses abonnés (jamais ceux d'une autre boutique) ── */
  async function proprietaire(req, res, id) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: 'Connexion requise.' }); return null; }
    const init = await db.prepare('SELECT id, nom, owner_user_id FROM initiatives WHERE id=?').get(Number(id));
    if (!init) { sendJSON(res, 404, { error: 'Boutique introuvable.' }); return null; }
    if (Number(init.owner_user_id) !== Number(user.id)) { sendJSON(res, 403, { error: 'Réservé au propriétaire de la boutique.' }); return null; }
    return { user, init };
  }

  route('GET', '/api/initiatives/:id/newsletter/abonnes', async (req, res, params) => {
    const ctx = await proprietaire(req, res, params.id); if (!ctx) return;
    /* Le jeton n'est jamais renvoyé : il permettrait de se désabonner à la place de la personne. */
    const abonnes = await db.prepare(`SELECT id, email, nom, source, statut, confirme_le, desabonne_le, created_at FROM nl_abonnes WHERE initiative_id=? ORDER BY id DESC LIMIT 2000`).all(ctx.init.id);
    const c = { actifs: 0, en_attente: 0, desabonnes: 0 };
    for (const a of abonnes) { if (a.statut === 'actif') c.actifs++; else if (a.statut === 'en_attente') c.en_attente++; else if (a.statut === 'desabonne') c.desabonnes++; }
    sendJSON(res, 200, { abonnes, compteurs: c });
  });

  route('DELETE', '/api/initiatives/:id/newsletter/abonnes/:aid', async (req, res, params) => {
    const ctx = await proprietaire(req, res, params.id); if (!ctx) return;
    const r = await db.prepare('DELETE FROM nl_abonnes WHERE id=? AND initiative_id=?').run(Number(params.aid), ctx.init.id);
    if (!r || !r.changes) return sendJSON(res, 404, { error: 'Abonné introuvable.' });
    sendJSON(res, 200, { ok: true });
  });

  /* Étape N2 : campagnes, envoi par lots (« à blanc » tant que NEWSLETTER_EMAIL=1 n'est pas réglé) et statistiques agrégées. */
  require('./newsletter-campagnes').enregistrerCampagnes({ route, db, getCurrentUser, sendJSON, SEC, getOrigin, envoyerEmail, envoiReel, utils: { repondrePage, proprietaire } });
  /* Étape N3 : export des abonnés et demande d'accord unique aux comptes qui suivent la boutique. */
  require('./newsletter-abonnes').enregistrerAbonnes({ route, db, getCurrentUser, sendJSON, SEC, utils: { proprietaire } });
  /* Étape N5 : journal agrégé, signalements et suspension de l'envoi, pour l'administration. */
  require('./newsletter-admin').enregistrerAdmin({ route, db, getCurrentUser, sendJSON });
}

module.exports = { enregistrer, creerJeton, pageMessage, htmlConfirmation, MESSAGE_GENERIQUE, VALIDITE_CONFIRMATION_MS, DELAI_RENVOI_MS };
