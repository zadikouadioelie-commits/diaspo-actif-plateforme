/* ===========================================================
   server/newsletter-abonnes.js — Newsletter des initiatives (2026-11-11), étape N3 : export des abonnés et accord des comptes qui suivent
   ===========================================================
   Règles (validées par l'utilisateur le 2026-11-11) :
   - Un compte qui SUIT une boutique n'est jamais abonné automatiquement. La boutique peut lui envoyer UNE SEULE demande d'accord
     (une notification, une seule fois par compte et par boutique). Rien n'est ajouté à la liste sans sa réponse « Oui ».
   - Clients, CRM et contacts ne sont jamais ajoutés : seul le formulaire de la boutique et cette demande d'accord alimentent la liste.
   - Quelqu'un qui s'est déjà désabonné, ou qui est déjà dans la liste, ne reçoit pas la demande.
   - L'export des abonnés est réservé au propriétaire de la boutique ; il porte le statut de chaque personne (actif, en attente, désabonné).
   Lancer les tests : node --test tests/newsletter-abonnes.test.js
   =========================================================== */
'use strict';

const crypto = require('node:crypto');

const MAX_DEMANDES_PAR_ENVOI = 2000;

const sqlDate = (t) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
const maintenant = () => sqlDate(Date.now());

/* Cellule de tableur : guillemets si besoin, et une apostrophe devant tout ce qui ressemble à une formule (=, +, -, @). */
function cellule(v) {
  let s = String(v == null ? '' : v).replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t]/.test(s)) s = "'" + s;
  return /[;"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsv(abonnes) {
  const lignes = [['email', 'nom', 'statut', 'origine', 'inscrit_le', 'confirme_le', 'desabonne_le'].join(';')];
  for (const a of abonnes) lignes.push([a.email, a.nom, a.statut, a.source, a.created_at, a.confirme_le, a.desabonne_le].map(cellule).join(';'));
  return '﻿' + lignes.join('\r\n') + '\r\n'; // BOM : Excel lit correctement les accents
}

function enregistrerAbonnes({ route, db, getCurrentUser, sendJSON, SEC, utils }) {
  /* proprietaire() ne charge que l'identité de la boutique : on relit la fiche complète (nom affiché de la boutique). */
  const proprietaire = async (req, res, id) => {
    const ctx = await utils.proprietaire(req, res, id); if (!ctx) return null;
    ctx.init = await db.prepare('SELECT * FROM initiatives WHERE id=?').get(ctx.init.id);
    return ctx;
  };
  const creerJeton = () => crypto.randomBytes(24).toString('base64url');

  /* Comptes qui suivent la boutique et à qui l'on peut encore poser la question. */
  async function suiveursEligibles(init) {
    const suiveurs = await db.prepare(`SELECT a.user_id AS uid, u.email AS email FROM abonnements a JOIN users u ON u.id=a.user_id WHERE a.initiative_id=? ORDER BY a.id`).all(init.id);
    const demandes = new Set((await db.prepare('SELECT user_id AS uid FROM nl_demandes WHERE initiative_id=?').all(init.id)).map((x) => Number(x.uid)));
    const dansListe = new Set((await db.prepare('SELECT email FROM nl_abonnes WHERE initiative_id=?').all(init.id)).map((x) => String(x.email).toLowerCase()));
    const eligibles = [];
    let dejaDemandes = 0, dejaDansListe = 0;
    for (const s of suiveurs) {
      if (Number(s.uid) === Number(init.owner_user_id)) continue;
      const email = SEC.normalizeEmail(s.email);
      if (demandes.has(Number(s.uid))) { dejaDemandes++; continue; }
      if (!SEC.isValidEmail(email) || dansListe.has(email)) { dejaDansListe++; continue; }
      eligibles.push({ uid: Number(s.uid), email });
    }
    return { total: suiveurs.length, eligibles, dejaDemandes, dejaDansListe };
  }

  /* ── Propriétaire : export des abonnés ── */
  route('GET', '/api/initiatives/:id/newsletter/abonnes.csv', async (req, res, params) => {
    const ctx = await proprietaire(req, res, params.id); if (!ctx) return;
    const lim = SEC.rateLimit(`nl:export:${ctx.init.id}`, 20, 3600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop d'exports. Réessayez dans ${lim.retryAfter}s.` });
    const abonnes = await db.prepare('SELECT email, nom, statut, source, created_at, confirme_le, desabonne_le FROM nl_abonnes WHERE initiative_id=? ORDER BY id').all(ctx.init.id);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="abonnes-newsletter-${ctx.init.id}.csv"`, 'Cache-Control': 'no-store' });
    res.end(exportCsv(abonnes));
  });

  /* ── Propriétaire : combien de comptes qui suivent peuvent recevoir la demande d'accord ── */
  route('GET', '/api/initiatives/:id/newsletter/suiveurs', async (req, res, params) => {
    const ctx = await proprietaire(req, res, params.id); if (!ctx) return;
    const s = await suiveursEligibles(ctx.init);
    const stat = await db.prepare(`SELECT statut, COUNT(*) AS n FROM nl_demandes WHERE initiative_id=? GROUP BY statut`).all(ctx.init.id);
    const par = (k) => Number((stat.find((x) => x.statut === k) || {}).n) || 0;
    sendJSON(res, 200, { suiveurs: s.total, a_interroger: s.eligibles.length, deja_interroges: s.dejaDemandes, deja_dans_la_liste: s.dejaDansListe, reponses: { en_attente: par('en_attente'), acceptees: par('acceptee'), refusees: par('refusee') } });
  });

  /* ── Propriétaire : envoyer la demande d'accord (une fois par compte) ── */
  route('POST', '/api/initiatives/:id/newsletter/demander-accord', async (req, res, params) => {
    const ctx = await proprietaire(req, res, params.id); if (!ctx) return;
    const lim = SEC.rateLimit(`nl:accord:${ctx.init.id}`, 3, 24 * 3600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Limite atteinte : 3 envois de demande par 24 heures. Réessayez dans ${Math.ceil(lim.retryAfter / 60)} min.` });
    const s = await suiveursEligibles(ctx.init);
    if (!s.eligibles.length) return sendJSON(res, 200, { ok: true, envoyees: 0, message: "Personne à interroger : tous vos abonnés ont déjà été interrogés ou sont déjà dans votre liste." });
    const nom = String(ctx.init.boutique_nom || ctx.init.nom || 'cette boutique');
    let envoyees = 0;
    for (const e of s.eligibles.slice(0, MAX_DEMANDES_PAR_ENVOI)) {
      /* UNIQUE(initiative_id, user_id) : même en cas de double clic, une personne n'est interrogée qu'une fois. */
      const r = await db.prepare('INSERT INTO nl_demandes (initiative_id, user_id) VALUES (?,?) ON CONFLICT(initiative_id, user_id) DO NOTHING').run(ctx.init.id, e.uid);
      if (!r || r.changes !== 1) continue;
      const d = await db.prepare('SELECT id FROM nl_demandes WHERE initiative_id=? AND user_id=?').get(ctx.init.id, e.uid);
      await db.prepare('INSERT INTO notifications (user_id, type, titre, contenu, data_json) VALUES (?,?,?,?,?)').run(
        e.uid, 'newsletter_accord', `Recevoir la newsletter de ${nom} ?`,
        `Vous suivez ${nom}. Souhaitez-vous recevoir sa newsletter par e-mail ? Vous êtes libre de refuser : rien ne vous sera envoyé sans votre accord.`,
        JSON.stringify({ lien: `newsletter-accord.html?d=${d.id}`, initiative_id: ctx.init.id }));
      envoyees++;
    }
    sendJSON(res, 200, { ok: true, envoyees, message: `${envoyees} demande(s) envoyée(s). Chaque personne n'est interrogée qu'une seule fois.` });
  });

  /* ── Compte connecté : ses demandes d'accord en attente ── */
  async function moi(req, res) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: 'Connexion requise.' }); return null; }
    return user;
  }
  route('GET', '/api/newsletter/mes-demandes', async (req, res) => {
    const user = await moi(req, res); if (!user) return;
    const lignes = await db.prepare(`SELECT d.id, d.initiative_id, d.created_at, COALESCE(NULLIF(i.boutique_nom,''), i.nom) AS boutique
      FROM nl_demandes d JOIN initiatives i ON i.id=d.initiative_id WHERE d.user_id=? AND d.statut='en_attente' ORDER BY d.id DESC LIMIT 50`).all(user.id);
    sendJSON(res, 200, { demandes: lignes });
  });

  route('POST', '/api/newsletter/demandes/:id/repondre', async (req, res, params, body) => {
    const user = await moi(req, res); if (!user) return;
    body = body || {};
    if (typeof body.accepte !== 'boolean') return sendJSON(res, 400, { error: 'Répondez par oui ou par non.' });
    const d = await db.prepare(`SELECT d.*, COALESCE(NULLIF(i.boutique_nom,''), i.nom) AS boutique FROM nl_demandes d JOIN initiatives i ON i.id=d.initiative_id WHERE d.id=? AND d.user_id=?`).get(Number(params.id), user.id);
    if (!d) return sendJSON(res, 404, { error: 'Demande introuvable.' });
    if (d.statut !== 'en_attente') return sendJSON(res, 409, { error: 'Vous avez déjà répondu à cette demande.' });
    const marque = await db.prepare("UPDATE nl_demandes SET statut=?, repondu_le=? WHERE id=? AND statut='en_attente'").run(body.accepte ? 'acceptee' : 'refusee', maintenant(), d.id);
    if (!marque || marque.changes !== 1) return sendJSON(res, 409, { error: 'Vous avez déjà répondu à cette demande.' });
    if (!body.accepte) return sendJSON(res, 200, { ok: true, accepte: false, message: `C'est noté : vous ne recevrez pas la newsletter de ${d.boutique}.` });
    /* Accord explicite d'un compte connecté : l'adresse est celle du compte, la personne est active tout de suite. */
    const email = SEC.normalizeEmail(user.email);
    const maint = maintenant();
    const existant = await db.prepare('SELECT id FROM nl_abonnes WHERE initiative_id=? AND email=?').get(d.initiative_id, email);
    if (existant) {
      await db.prepare(`UPDATE nl_abonnes SET statut='actif', source='suivi', jeton=?, consentement_le=?, confirme_le=?, derniere_confirmation_le=?, desabonne_le=NULL WHERE id=?`).run(creerJeton(), maint, maint, maint, existant.id);
    } else {
      await db.prepare(`INSERT INTO nl_abonnes (initiative_id, email, nom, source, statut, jeton, consentement_le, confirme_le, derniere_confirmation_le) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(d.initiative_id, email, String(user.prenom || user.nom || '').trim().slice(0, 80) || null, 'suivi', 'actif', creerJeton(), maint, maint, maint);
    }
    sendJSON(res, 200, { ok: true, accepte: true, message: `Merci ! Vous recevrez désormais la newsletter de ${d.boutique}. Chaque message contient un lien pour vous désabonner.` });
  });
}

module.exports = { enregistrerAbonnes, exportCsv, cellule, MAX_DEMANDES_PAR_ENVOI };
