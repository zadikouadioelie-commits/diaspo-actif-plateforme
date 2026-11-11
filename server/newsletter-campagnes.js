/* ===========================================================
   server/newsletter-campagnes.js — Newsletter des initiatives (2026-11-11), étape N2 : campagnes, aperçu, envoi par lots, statistiques
   ===========================================================
   Règles (validées par l'utilisateur le 2026-11-11) :
   - Envoi libre : pas de validation préalable par l'administration, mais contrôle automatique des textes (dépôt de projet détourné
     hors du module « Soumettre à Diaspo'Actif ») et lien « Signaler ce message » dans chaque e-mail.
   - Le texte libre n'est jamais cliquable : les seuls liens sont construits par le serveur (boutique, produit, événement) et suivis.
   - Statistiques agrégées seulement : envoyés, échecs, désabonnés, signalements, clics PAR LIEN. Aucun pixel d'ouverture, aucune
     statistique par personne, aucune adresse dans les statistiques.
   - Quota : 500 e-mails par mois et par boutique (envois réels et envois à blanc comptés séparément) ; 5 campagnes lancées par jour.
   - Envoi réel UNIQUEMENT si NEWSLETTER_EMAIL=1 ; sinon « à blanc » : on prépare les destinataires, on compte, on n'envoie rien.
   - Un abonné qui n'est plus « actif » au moment de l'envoi est ignoré. Chaque e-mail porte un lien de désabonnement (+ en-têtes
     List-Unsubscribe), l'expéditeur affiché est « Nom de la boutique via Diaspo'Actif » et « répondre » écrit à la boutique.
   Lancer les tests : node --test tests/newsletter-campagnes.test.js
   =========================================================== */
'use strict';

const DepotDetourne = require('./depot-detourne');
const mailer = require('./mailer');

const QUOTA_MENSUEL = 500;
const TAILLE_LOT = 40;              // e-mails envoyés par appel (le tableau de bord rappelle jusqu'à la fin)
const MAX_CAMPAGNES_PAR_JOUR = 5;
const MAX_ELEMENTS = 6;
const LONG_SUJET = 150;
const LONG_TEXTE = 5000;
const MODELES_CLES = ['libre', 'promotion', 'produit', 'service', 'evenement'];
const TYPES_ELEMENTS = ['produit', 'service', 'offre_flash', 'evenement'];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sqlDate = (t) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
const maintenant = () => sqlDate(Date.now());
const debutDuMois = () => { const d = new Date(); return sqlDate(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); };
const sansBalises = (s) => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const liste = (v) => { if (Array.isArray(v)) return v; try { const x = JSON.parse(v || '[]'); return Array.isArray(x) ? x : []; } catch (e) { return []; } };

/* Textes de départ proposés à la création (« {boutique} » est remplacé par le nom de la boutique). */
function modeles(nomBoutique) {
  const n = (t) => t.replace(/\{boutique\}/g, nomBoutique);
  return [
    { cle: 'libre', label: 'Message libre', sujet: '', texte: '', elements: [] },
    { cle: 'promotion', label: 'Promotion', sujet: n('Une promotion de {boutique}'), texte: n("Bonjour,\n\nPendant une durée limitée, {boutique} vous propose une offre spéciale.\n\nRetrouvez les détails ci-dessous."), elements: ['offre_flash', 'produit'] },
    { cle: 'produit', label: 'Nouveau produit', sujet: n('Nouveau produit : {boutique}'), texte: n("Bonjour,\n\n{boutique} vient d'ajouter un nouveau produit à sa boutique. Nous espérons qu'il vous plaira.\n\nDécouvrez-le ci-dessous."), elements: ['produit'] },
    { cle: 'service', label: 'Nouveau service', sujet: n('Un nouveau service proposé par {boutique}'), texte: n("Bonjour,\n\n{boutique} élargit son offre avec un nouveau service.\n\nTous les détails ci-dessous."), elements: ['service'] },
    { cle: 'evenement', label: 'Événement', sujet: n('Rejoignez-nous : un événement de {boutique}'), texte: n("Bonjour,\n\n{boutique} organise un événement et vous y invite.\n\nLes informations pratiques et la réservation sont ci-dessous."), elements: ['evenement'] },
  ];
}

/* Services de la boutique : catégories de services, sinon une ligne par service dans le texte libre. */
function servicesDe(init) {
  const sortie = [];
  const ajoute = (x) => {
    if (typeof x === 'string') { const t = sansBalises(x); if (t) sortie.push({ titre: t.slice(0, 120), description: '' }); }
    else if (x && sansBalises(x.titre || x.nom)) sortie.push({ titre: sansBalises(x.titre || x.nom).slice(0, 120), description: sansBalises(x.description).slice(0, 200) });
  };
  liste(init.vitrine_services_categories_json).forEach(ajoute);
  if (!sortie.length) String(init.vitrine_services || '').replace(/<\/(p|li|div|br)>|<br\s*\/?>/gi, '\n').split(/\r?\n/).forEach(ajoute);
  return sortie.slice(0, 12);
}

const lienBoutiqueDe = (init) => `/profil-app.html?id=${Number(init.owner_user_id)}`;

function prixTexte(p) {
  const dev = p.devise || 'EUR';
  const fmt = (v) => `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${dev === 'EUR' ? '€' : dev}`;
  if (p.prix_promo != null && p.prix != null && Number(p.prix_promo) > 0 && Number(p.prix_promo) < Number(p.prix)) return `${fmt(p.prix_promo)} au lieu de ${fmt(p.prix)}`;
  return p.prix != null && Number(p.prix) > 0 ? fmt(p.prix) : '';
}

/* Transforme la sélection enregistrée en blocs prêts à afficher ; un élément qui n'existe plus est simplement retiré. */
async function resoudreElements(db, init, elements) {
  const blocs = [];
  for (const el of liste(elements)) {
    if (!el || !TYPES_ELEMENTS.includes(el.type)) continue;
    if (el.type === 'produit') {
      const p = await db.prepare('SELECT * FROM produits_vitrine WHERE id=? AND initiative_id=?').get(Number(el.id), init.id);
      if (p) blocs.push({ type: 'produit', etiquette: 'Produit', titre: p.nom, detail: [prixTexte(p), sansBalises(p.description).slice(0, 160)].filter(Boolean).join(' — '), chemin: lienBoutiqueDe(init), libelle: p.nom });
    } else if (el.type === 'service') {
      const s = servicesDe(init).find((x) => x.titre === String(el.titre || ''));
      if (s) blocs.push({ type: 'service', etiquette: 'Service', titre: s.titre, detail: s.description, chemin: lienBoutiqueDe(init), libelle: s.titre });
    } else if (el.type === 'offre_flash') {
      if (sansBalises(init.vitrine_offre_flash_titre)) {
        const fin = init.vitrine_offre_flash_fin ? `Jusqu'au ${String(init.vitrine_offre_flash_fin).slice(0, 10).split('-').reverse().join('/')}` : '';
        blocs.push({ type: 'offre_flash', etiquette: 'Offre flash', titre: sansBalises(init.vitrine_offre_flash_titre), detail: fin, chemin: lienBoutiqueDe(init), libelle: 'Offre flash' });
      }
    } else if (el.type === 'evenement') {
      const e = await db.prepare("SELECT id, titre, date_debut, ville FROM events WHERE id=? AND organisateur_id=? AND statut='publie'").get(Number(el.id), init.owner_user_id);
      if (e) blocs.push({ type: 'evenement', etiquette: 'Événement', titre: e.titre, detail: [String(e.date_debut || '').slice(0, 10).split('-').reverse().join('/'), e.ville].filter(Boolean).join(' — '), chemin: `/evenement-billetterie.html?id=${e.id}`, libelle: e.titre });
    }
  }
  return blocs;
}

/* Contrôle d'une campagne saisie ; renvoie { ok, valeurs } ou { erreur }. */
async function valider(db, init, corps) {
  corps = corps || {};
  const sujet = String(corps.sujet == null ? '' : corps.sujet).replace(/[\r\n]+/g, ' ').trim();
  const texte = String(corps.texte == null ? '' : corps.texte).replace(/\r\n/g, '\n').trim();
  const modele = MODELES_CLES.includes(corps.modele) ? corps.modele : 'libre';
  if (sujet.length < 3) return { erreur: 'Le sujet est trop court (3 caractères minimum).' };
  if (sujet.length > LONG_SUJET) return { erreur: `Le sujet est trop long (${LONG_SUJET} caractères maximum).` };
  if (!texte) return { erreur: 'Écrivez le message de votre newsletter.' };
  if (texte.length > LONG_TEXTE) return { erreur: `Le message est trop long (${LONG_TEXTE} caractères maximum).` };
  const refus = DepotDetourne.controlerTextes([sujet, texte]);
  if (refus) return { erreur: refus };
  const brut = Array.isArray(corps.elements) ? corps.elements : [];
  if (brut.length > MAX_ELEMENTS) return { erreur: `Une newsletter contient ${MAX_ELEMENTS} éléments au maximum.` };
  const elements = [];
  for (const el of brut) {
    if (!el || !TYPES_ELEMENTS.includes(el.type)) return { erreur: "Type d'élément inconnu." };
    const dejaLa = elements.some((x) => x.type === el.type && x.id === Number(el.id) && x.titre === (el.titre || undefined));
    if (dejaLa) continue;
    if (el.type === 'produit' || el.type === 'evenement') {
      const id = Number(el.id);
      if (!Number.isInteger(id) || id <= 0) return { erreur: 'Élément introuvable.' };
      const un = (await resoudreElements(db, init, [{ type: el.type, id }])).length;
      if (!un) return { erreur: el.type === 'produit' ? "Ce produit n'appartient pas à votre boutique." : "Cet événement n'est pas publié par votre boutique." };
      elements.push({ type: el.type, id });
    } else if (el.type === 'service') {
      const titre = String(el.titre || '');
      if (!servicesDe(init).some((s) => s.titre === titre)) return { erreur: "Ce service n'existe pas dans votre boutique." };
      elements.push({ type: 'service', titre });
    } else if (el.type === 'offre_flash') {
      if (!sansBalises(init.vitrine_offre_flash_titre)) return { erreur: "Votre boutique n'a pas d'offre flash en cours." };
      elements.push({ type: 'offre_flash' });
    }
  }
  return { ok: true, valeurs: { sujet, texte, modele, elements } };
}

/* Corps de l'e-mail. Le texte libre est échappé (jamais de lien, de balise ou de style venant de l'initiative). */
function htmlCampagne({ nomBoutique, texte, blocs, lienBoutique, lienDesabo, lienSignaler, test }) {
  const paragraphes = String(texte || '').split(/\n{2,}/).map((p) => `<p style="line-height:1.65;margin:0 0 14px;font-size:15px">${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  const cartes = (blocs || []).map((b) =>
    `<tr><td style="padding:0 0 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3dccb;border-radius:10px;background:#fbf8f1"><tr><td style="padding:14px 16px">` +
    `<div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8a6d2b;font-weight:700">${esc(b.etiquette)}</div>` +
    `<div style="font-size:16px;font-weight:700;margin:4px 0">${esc(b.titre)}</div>` +
    (b.detail ? `<div style="font-size:14px;color:#55607a;line-height:1.5">${esc(b.detail)}</div>` : '') +
    (b.lien ? `<div style="margin-top:10px"><a href="${esc(b.lien)}" style="color:#14213a;font-weight:700;font-size:14px">Voir sur la boutique →</a></div>` : '') +
    `</td></tr></table></td></tr>`).join('');
  const pied = lienDesabo
    ? `<a href="${esc(lienDesabo)}" style="color:#55607a">Se désabonner</a>` + (lienSignaler ? ` · <a href="${esc(lienSignaler)}" style="color:#55607a">Signaler ce message</a>` : '')
    : '<span>Les liens de désabonnement et de signalement apparaissent dans le message réellement envoyé.</span>';
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#14213a">` +
    (test ? `<div style="background:#fff3cd;border:1px solid #e6c969;border-radius:8px;padding:8px 12px;font-size:13px;margin:0 0 16px">Message de test — il n'a pas été envoyé à vos abonnés.</div>` : '') +
    `<div style="font-size:13px;color:#8a6d2b;font-weight:700;margin:0 0 14px">${esc(nomBoutique)}</div>` +
    paragraphes +
    (cartes ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 10px">${cartes}</table>` : '') +
    (lienBoutique ? `<p style="margin:18px 0"><a href="${esc(lienBoutique)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#d8b36a;color:#111;font-weight:700;text-decoration:none">Visiter la boutique</a></p>` : '') +
    `<hr style="border:none;border-top:1px solid #e3dccb;margin:24px 0 12px">` +
    `<p style="font-size:12px;color:#55607a;line-height:1.6;margin:0">Vous recevez ce message parce que vous êtes inscrit(e) à la newsletter de <strong>${esc(nomBoutique)}</strong> sur Diaspo'Actif. ${pied}</p></div>`;
}

function enregistrerCampagnes({ route, db, getCurrentUser, sendJSON, SEC, getOrigin, envoyerEmail = mailer.sendEmail, envoiReel, utils }) {
  const { repondrePage, proprietaire } = utils;
  const reel = () => (envoiReel !== undefined ? !!envoiReel : process.env.NEWSLETTER_EMAIL === '1');
  const verrous = new Set();

  async function initiativeComplete(id) { return db.prepare('SELECT * FROM initiatives WHERE id=?').get(Number(id)); }
  const nomDe = (init) => String(init.boutique_nom || init.nom || 'la boutique');
  const replyToDe = async (init) => {
    const direct = [init.vitrine_email_pro, init.email_responsable].map((x) => String(x || '').trim()).find((x) => SEC.isValidEmail(SEC.normalizeEmail(x)));
    if (direct) return SEC.normalizeEmail(direct);
    const u = await db.prepare('SELECT email FROM users WHERE id=?').get(init.owner_user_id);
    return u && u.email ? SEC.normalizeEmail(u.email) : undefined;
  };

  async function usageMois(initId, modeEnvoi) {
    const r = await db.prepare(`SELECT COUNT(*) AS n FROM nl_envois e JOIN nl_campagnes c ON c.id=e.campagne_id
      WHERE c.initiative_id=? AND c.mode_envoi=? AND c.envoye_le >= ? AND e.statut IN ('envoye','envoi','en_attente','a_blanc')`).get(initId, modeEnvoi, debutDuMois());
    return Number(r && r.n) || 0;
  }

  async function stats(c) {
    const compte = async (req, ...a) => Number(((await db.prepare(req).get(...a)) || {}).n) || 0;
    const parStatut = async (s) => compte('SELECT COUNT(*) AS n FROM nl_envois WHERE campagne_id=? AND statut=?', c.id, s);
    const liens = await db.prepare('SELECT id, libelle, clics FROM nl_liens WHERE campagne_id=? ORDER BY id').all(c.id);
    const restants = (await parStatut('en_attente')) + (await parStatut('envoi'));
    return {
      destinataires: Number(c.nb_destinataires) || 0,
      envoyes: await parStatut('envoye'),
      a_blanc: await parStatut('a_blanc'),
      echecs: await parStatut('echec'),
      ignores: await parStatut('ignore'),
      restants,
      desabonnes: c.envoye_le ? await compte(`SELECT COUNT(*) AS n FROM nl_envois e JOIN nl_abonnes a ON a.id=e.abonne_id WHERE e.campagne_id=? AND a.statut='desabonne' AND a.desabonne_le >= ?`, c.id, c.envoye_le) : 0,
      signalements: await compte('SELECT COUNT(*) AS n FROM nl_signalements WHERE campagne_id=?', c.id),
      clics: liens.reduce((t, l) => t + (Number(l.clics) || 0), 0),
      liens: liens.map((l) => ({ libelle: l.libelle, clics: Number(l.clics) || 0 })),
    };
  }

  const vue = (c) => ({ id: c.id, sujet: c.sujet, texte: c.texte, modele: c.modele, elements: liste(c.elements_json), statut: c.statut, mode_envoi: c.mode_envoi, nb_destinataires: c.nb_destinataires, envoye_le: c.envoye_le, termine_le: c.termine_le, created_at: c.created_at, updated_at: c.updated_at });

  async function campagneDe(res, ctx, cid) {
    const c = await db.prepare('SELECT * FROM nl_campagnes WHERE id=? AND initiative_id=?').get(Number(cid), ctx.init.id);
    if (!c) { sendJSON(res, 404, { error: 'Campagne introuvable.' }); return null; }
    return c;
  }
  const proprio = async (req, res, id) => {
    const ctx = await proprietaire(req, res, id); if (!ctx) return null;
    ctx.init = await initiativeComplete(ctx.init.id);
    return ctx;
  };

  /* ── Aide à la rédaction : contenus insérables, modèles, quota ── */
  route('GET', '/api/initiatives/:id/newsletter/contenus', async (req, res, params) => {
    const ctx = await proprio(req, res, params.id); if (!ctx) return;
    const init = ctx.init;
    const produits = (await db.prepare("SELECT * FROM produits_vitrine WHERE initiative_id=? AND (disponible=1 OR disponible IS NULL) ORDER BY ordre ASC, id ASC LIMIT 50").all(init.id))
      .map((p) => ({ id: p.id, nom: p.nom, prix: prixTexte(p), categorie: p.categorie || null }));
    const evenements = (await db.prepare("SELECT id, titre, date_debut, ville FROM events WHERE organisateur_id=? AND statut='publie' AND date_debut >= ? ORDER BY date_debut ASC LIMIT 20").all(init.owner_user_id, new Date().toISOString().slice(0, 10)))
      .map((e) => ({ id: e.id, titre: e.titre, date: String(e.date_debut || '').slice(0, 10), ville: e.ville || null }));
    const actifs = Number(((await db.prepare("SELECT COUNT(*) AS n FROM nl_abonnes WHERE initiative_id=? AND statut='actif'").get(init.id)) || {}).n) || 0;
    const mode = reel() ? 'reel' : 'a_blanc';
    const utilise = await usageMois(init.id, mode);
    sendJSON(res, 200, {
      produits, evenements, services: servicesDe(init),
      offre_flash: sansBalises(init.vitrine_offre_flash_titre) ? { titre: sansBalises(init.vitrine_offre_flash_titre), fin: init.vitrine_offre_flash_fin || null } : null,
      modeles: modeles(nomDe(init)),
      limites: { sujet: LONG_SUJET, texte: LONG_TEXTE, elements: MAX_ELEMENTS },
      quota: { limite: QUOTA_MENSUEL, utilise, restant: Math.max(0, QUOTA_MENSUEL - utilise), mode },
      abonnes_actifs: actifs,
    });
  });

  route('GET', '/api/initiatives/:id/newsletter/campagnes', async (req, res, params) => {
    const ctx = await proprio(req, res, params.id); if (!ctx) return;
    const lignes = await db.prepare('SELECT * FROM nl_campagnes WHERE initiative_id=? ORDER BY id DESC LIMIT 100').all(ctx.init.id);
    const campagnes = [];
    for (const c of lignes) campagnes.push({ ...vue(c), stats: await stats(c) });
    sendJSON(res, 200, { campagnes });
  });

  route('POST', '/api/initiatives/:id/newsletter/campagnes', async (req, res, params, body) => {
    const ctx = await proprio(req, res, params.id); if (!ctx) return;
    const lim = SEC.rateLimit(`nl:creer:${ctx.init.id}`, 60, 3600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop de brouillons créés. Réessayez dans ${lim.retryAfter}s.` });
    const v = await valider(db, ctx.init, body);
    if (v.erreur) return sendJSON(res, 400, { error: v.erreur });
    const { sujet, texte, modele, elements } = v.valeurs;
    const r = await db.prepare('INSERT INTO nl_campagnes (initiative_id, sujet, texte, modele, elements_json) VALUES (?,?,?,?,?)').run(ctx.init.id, sujet, texte, modele, JSON.stringify(elements));
    const c = await db.prepare('SELECT * FROM nl_campagnes WHERE id=?').get(Number(r.lastInsertRowid));
    sendJSON(res, 201, { campagne: vue(c) });
  });

  route('GET', '/api/initiatives/:id/newsletter/campagnes/:cid', async (req, res, params) => {
    const ctx = await proprio(req, res, params.id); if (!ctx) return;
    const c = await campagneDe(res, ctx, params.cid); if (!c) return;
    sendJSON(res, 200, { campagne: vue(c), stats: await stats(c) });
  });

  route('PUT', '/api/initiatives/:id/newsletter/campagnes/:cid', async (req, res, params, body) => {
    const ctx = await proprio(req, res, params.id); if (!ctx) return;
    const c = await campagneDe(res, ctx, params.cid); if (!c) return;
    if (c.statut !== 'brouillon') return sendJSON(res, 409, { error: 'Une campagne déjà lancée ne peut plus être modifiée.' });
    const v = await valider(db, ctx.init, body);
    if (v.erreur) return sendJSON(res, 400, { error: v.erreur });
    const { sujet, texte, modele, elements } = v.valeurs;
    await db.prepare("UPDATE nl_campagnes SET sujet=?, texte=?, modele=?, elements_json=?, updated_at=? WHERE id=? AND statut='brouillon'").run(sujet, texte, modele, JSON.stringify(elements), maintenant(), c.id);
    sendJSON(res, 200, { campagne: vue(await db.prepare('SELECT * FROM nl_campagnes WHERE id=?').get(c.id)) });
  });

  route('DELETE', '/api/initiatives/:id/newsletter/campagnes/:cid', async (req, res, params) => {
    const ctx = await proprio(req, res, params.id); if (!ctx) return;
    const c = await campagneDe(res, ctx, params.cid); if (!c) return;
    if (c.statut !== 'brouillon') return sendJSON(res, 409, { error: 'Une campagne lancée est conservée pour ses statistiques.' });
    await db.prepare("DELETE FROM nl_campagnes WHERE id=? AND statut='brouillon'").run(c.id);
    sendJSON(res, 200, { ok: true });
  });

  /* ── Aperçu : exactement le message, avec des liens factices ── */
  route('GET', '/api/initiatives/:id/newsletter/campagnes/:cid/apercu', async (req, res, params) => {
    const ctx = await proprio(req, res, params.id); if (!ctx) return;
    const c = await campagneDe(res, ctx, params.cid); if (!c) return;
    const origine = getOrigin(req);
    const blocs = (await resoudreElements(db, ctx.init, c.elements_json)).map((b) => ({ ...b, lien: origine + b.chemin }));
    sendJSON(res, 200, { sujet: c.sujet, html: htmlCampagne({ nomBoutique: nomDe(ctx.init), texte: c.texte, blocs, lienBoutique: origine + lienBoutiqueDe(ctx.init), test: false }) });
  });

  /* ── Envoi de test : uniquement à l'adresse du compte connecté ── */
  route('POST', '/api/initiatives/:id/newsletter/campagnes/:cid/test', async (req, res, params) => {
    const ctx = await proprio(req, res, params.id); if (!ctx) return;
    const c = await campagneDe(res, ctx, params.cid); if (!c) return;
    const lim = SEC.rateLimit(`nl:test:${ctx.user.id}`, 5, 3600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop d'envois de test. Réessayez dans ${lim.retryAfter}s.` });
    const v = await valider(db, ctx.init, vue(c));
    if (v.erreur) return sendJSON(res, 400, { error: v.erreur });
    if (!reel()) return sendJSON(res, 200, { ok: true, a_blanc: true, message: "Envoi à blanc : le message de test n'est pas encore envoyé (l'envoi réel n'est pas activé sur la plateforme)." });
    const origine = getOrigin(req);
    const blocs = (await resoudreElements(db, ctx.init, c.elements_json)).map((b) => ({ ...b, lien: origine + b.chemin }));
    const r = await envoyerEmail({
      to: ctx.user.email, subject: `[TEST] ${c.sujet}`, fromName: nomDe(ctx.init), replyTo: await replyToDe(ctx.init),
      html: htmlCampagne({ nomBoutique: nomDe(ctx.init), texte: c.texte, blocs, lienBoutique: origine + lienBoutiqueDe(ctx.init), test: true }),
    });
    if (r && r.ok === false) return sendJSON(res, 502, { error: "Le message de test n'a pas pu être envoyé. Réessayez plus tard." });
    sendJSON(res, 200, { ok: true, a_blanc: false, message: `Message de test envoyé à ${ctx.user.email}.` });
  });

  /* ── Envoi par lots ── */
  async function traiterLot(campagne, init, origine) {
    if (verrous.has(campagne.id)) return { occupe: true };
    verrous.add(campagne.id);
    try {
      /* Un lot interrompu (arrêt du serveur) laisse des lignes « envoi » : on ne sait pas si l'e-mail est parti, on ne le renvoie jamais. */
      await db.prepare("UPDATE nl_envois SET statut='echec' WHERE campagne_id=? AND statut='envoi'").run(campagne.id);
      const liens = await db.prepare('SELECT id, chemin FROM nl_liens WHERE campagne_id=?').all(campagne.id);
      const idLien = (chemin) => { const l = liens.find((x) => x.chemin === chemin); return l ? l.id : null; };
      const blocsBase = await resoudreElements(db, init, campagne.elements_json);
      const aBlanc = campagne.mode_envoi !== 'reel';
      const replyTo = aBlanc ? undefined : await replyToDe(init);
      const lignes = await db.prepare(`SELECT e.id AS eid, a.id AS aid, a.email, a.nom, a.jeton
        FROM nl_envois e JOIN nl_abonnes a ON a.id=e.abonne_id WHERE e.campagne_id=? AND e.statut='en_attente' ORDER BY e.id LIMIT ?`).all(campagne.id, aBlanc ? 1000 : TAILLE_LOT);
      for (const l of lignes) {
        const pris = await db.prepare("UPDATE nl_envois SET statut='envoi' WHERE id=? AND statut='en_attente'").run(l.eid);
        if (!pris || pris.changes !== 1) continue;
        const fin = async (statut) => db.prepare('UPDATE nl_envois SET statut=?, envoye_le=? WHERE id=?').run(statut, maintenant(), l.eid);
        /* Le statut est relu juste avant l'envoi : quelqu'un qui s'est désabonné pendant le lot ne reçoit rien. */
        const courant = await db.prepare('SELECT statut FROM nl_abonnes WHERE id=?').get(l.aid);
        if (!courant || courant.statut !== 'actif') { await fin('ignore'); continue; }
        if (aBlanc) { await fin('a_blanc'); continue; }
        const lienDe = (chemin) => { const id = idLien(chemin); return origine + (id ? `/api/newsletter/lien/${id}` : chemin); };
        const lienDesabo = `${origine}/api/newsletter/desabonner?t=${encodeURIComponent(l.jeton)}`;
        const html = htmlCampagne({
          nomBoutique: nomDe(init), texte: campagne.texte,
          blocs: blocsBase.map((b) => ({ ...b, lien: lienDe(b.chemin) })),
          lienBoutique: lienDe(lienBoutiqueDe(init)), lienDesabo,
          lienSignaler: `${origine}/api/newsletter/signaler?t=${encodeURIComponent(l.jeton)}&c=${campagne.id}`,
        });
        let ok = false;
        try {
          const r = await envoyerEmail({
            to: l.email, subject: campagne.sujet, html, replyTo, fromName: nomDe(init),
            headers: { 'List-Unsubscribe': `<${lienDesabo}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          });
          ok = !(r && r.ok === false);
        } catch (e) { console.error('[newsletter] envoi :', e && e.message); }
        await fin(ok ? 'envoye' : 'echec');
      }
      const reste = Number(((await db.prepare("SELECT COUNT(*) AS n FROM nl_envois WHERE campagne_id=? AND statut IN ('en_attente','envoi')").get(campagne.id)) || {}).n) || 0;
      if (!reste) await db.prepare("UPDATE nl_campagnes SET statut='envoyee', termine_le=? WHERE id=? AND statut='en_cours'").run(maintenant(), campagne.id);
      return { occupe: false, restants: reste };
    } finally { verrous.delete(campagne.id); }
  }

  async function progression(id) {
    const c = await db.prepare('SELECT * FROM nl_campagnes WHERE id=?').get(id);
    return { campagne: vue(c), stats: await stats(c) };
  }

  route('POST', '/api/initiatives/:id/newsletter/campagnes/:cid/envoyer', async (req, res, params) => {
    const ctx = await proprio(req, res, params.id); if (!ctx) return;
    const c = await campagneDe(res, ctx, params.cid); if (!c) return;
    if (c.statut !== 'brouillon') return sendJSON(res, 409, { error: 'Cette campagne a déjà été lancée.' });
    const v = await valider(db, ctx.init, vue(c));
    if (v.erreur) return sendJSON(res, 400, { error: v.erreur });
    const jour = Number(((await db.prepare('SELECT COUNT(*) AS n FROM nl_campagnes WHERE initiative_id=? AND envoye_le >= ?').get(ctx.init.id, sqlDate(Date.now() - 24 * 3600 * 1000))) || {}).n) || 0;
    if (jour >= MAX_CAMPAGNES_PAR_JOUR) return sendJSON(res, 429, { error: `Limite atteinte : ${MAX_CAMPAGNES_PAR_JOUR} newsletters par 24 heures et par boutique.` });
    const abonnes = await db.prepare("SELECT id FROM nl_abonnes WHERE initiative_id=? AND statut='actif' ORDER BY id").all(ctx.init.id);
    if (!abonnes.length) return sendJSON(res, 400, { error: "Aucun abonné actif : personne ne recevrait ce message." });
    const mode = reel() ? 'reel' : 'a_blanc';
    const utilise = await usageMois(ctx.init.id, mode);
    if (utilise + abonnes.length > QUOTA_MENSUEL) {
      return sendJSON(res, 403, { error: `Quota mensuel dépassé : il reste ${Math.max(0, QUOTA_MENSUEL - utilise)} e-mail(s) ce mois-ci sur ${QUOTA_MENSUEL}, et ce message partirait vers ${abonnes.length} abonné(s).` });
    }
    /* Passage atomique brouillon → en cours : deux clics simultanés ne lancent qu'une seule campagne. */
    const pris = await db.prepare("UPDATE nl_campagnes SET statut='en_cours', mode_envoi=?, nb_destinataires=?, envoye_le=? WHERE id=? AND statut='brouillon'").run(mode, abonnes.length, maintenant(), c.id);
    if (!pris || pris.changes !== 1) return sendJSON(res, 409, { error: 'Cette campagne a déjà été lancée.' });
    for (const a of abonnes) await db.prepare("INSERT INTO nl_envois (campagne_id, abonne_id, statut) VALUES (?,?, 'en_attente')").run(c.id, a.id);
    const origine = getOrigin(req);
    /* Les liens suivis sont créés une fois pour la campagne : un clic est compté par lien, jamais par personne. */
    const blocs = await resoudreElements(db, ctx.init, c.elements_json);
    const chemins = [{ chemin: lienBoutiqueDe(ctx.init), libelle: 'Visiter la boutique' }];
    for (const b of blocs) if (!chemins.some((x) => x.chemin === b.chemin && x.libelle === b.libelle)) chemins.push({ chemin: b.chemin, libelle: b.libelle });
    const dejaVus = new Set();
    for (const l of chemins) { if (dejaVus.has(l.chemin)) continue; dejaVus.add(l.chemin); await db.prepare('INSERT INTO nl_liens (campagne_id, chemin, libelle) VALUES (?,?,?)').run(c.id, l.chemin, l.libelle); }
    const frais = await db.prepare('SELECT * FROM nl_campagnes WHERE id=?').get(c.id);
    await traiterLot(frais, ctx.init, origine);
    sendJSON(res, 200, await progression(c.id));
  });

  route('POST', '/api/initiatives/:id/newsletter/campagnes/:cid/continuer', async (req, res, params) => {
    const ctx = await proprio(req, res, params.id); if (!ctx) return;
    const c = await campagneDe(res, ctx, params.cid); if (!c) return;
    if (c.statut === 'en_cours') {
      const r = await traiterLot(c, ctx.init, getOrigin(req));
      if (r.occupe) return sendJSON(res, 409, { error: 'Un lot est déjà en cours d\'envoi. Patientez quelques secondes.' });
    }
    sendJSON(res, 200, await progression(c.id));
  });

  /* ── Public : clic sur un lien d'une newsletter (compté par lien) ── */
  route('GET', '/api/newsletter/lien/:id', async (req, res, params) => {
    const l = await db.prepare('SELECT id, chemin FROM nl_liens WHERE id=?').get(Number(params.id));
    /* Le chemin a été construit par le serveur ; la vérification empêche malgré tout toute redirection vers un autre site. */
    if (!l || !/^\/[^/\\]/.test(l.chemin)) return repondrePage(res, 404, 'Lien introuvable', "Ce lien n'est plus valable.");
    await db.prepare('UPDATE nl_liens SET clics = clics + 1 WHERE id=?').run(l.id);
    res.writeHead(302, { Location: l.chemin, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    res.end();
  });

  /* ── Public : signaler un message (depuis le lien du pied d'e-mail) ── */
  route('GET', '/api/newsletter/signaler', async (req, res, params, body, query) => {
    const jeton = String((query && query.t) || '');
    const cid = Number(query && query.c);
    const ab = jeton.length >= 20 && jeton.length <= 100 && Number.isInteger(cid) ? await db.prepare('SELECT id, initiative_id FROM nl_abonnes WHERE jeton=?').get(jeton) : null;
    const envoi = ab ? await db.prepare('SELECT e.id FROM nl_envois e JOIN nl_campagnes c ON c.id=e.campagne_id WHERE e.campagne_id=? AND e.abonne_id=? AND c.initiative_id=?').get(cid, ab.id, ab.initiative_id) : null;
    if (!envoi) return repondrePage(res, 400, 'Lien non valide', "Ce lien de signalement n'est pas valide.");
    const deja = await db.prepare('SELECT id FROM nl_signalements WHERE campagne_id=? AND abonne_id=?').get(cid, ab.id);
    if (!deja) await db.prepare('INSERT INTO nl_signalements (campagne_id, abonne_id) VALUES (?,?)').run(cid, ab.id);
    repondrePage(res, 200, 'Merci pour votre signalement', "Votre signalement a bien été enregistré. L'équipe Diaspo'Actif examinera ce message. Vous pouvez aussi vous désabonner depuis l'e-mail.");
  });
}

module.exports = { enregistrerCampagnes, htmlCampagne, modeles, servicesDe, valider, resoudreElements, QUOTA_MENSUEL, TAILLE_LOT, MAX_CAMPAGNES_PAR_JOUR, MAX_ELEMENTS };
