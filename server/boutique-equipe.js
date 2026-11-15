/* ═══════════════════════════════════════════════════════════════════
   server/boutique-equipe.js — Équipe d'une boutique : postes, droits, invitation, bascule de boutique (2026-11-15)

   Principe (validé le 2026-11-15) : chaque personne se connecte avec SON PROPRE compte. Le propriétaire de la boutique l'invite avec un
   poste ; la personne accepte ; elle peut alors travailler sur cette boutique avec les droits de son poste. Une personne peut avoir
   plusieurs boutiques (la sienne + celles où elle est invitée) et bascule de l'une à l'autre.

   Comment ça marche, côté serveur :
   • Table boutique_equipe : une ligne par (boutique, personne) — poste, droits cochés, statut (invite, accepte, refuse, retire).
   • Boutique « active » : cookie boutique_active = numéro de la boutique (posé par POST /api/boutique-active). Il ne donne AUCUN droit par lui-même :
     à chaque requête, le serveur revérifie en base que la personne est bien membre acceptée de cette boutique.
   • Garde (garde() ci-dessous, appelée par index.js avant le routeur) : si la requête vise une route de la liste REGLES, concerne la boutique active
     et que le poste a le droit exigé, la requête s'exécute AU NOM DU PROPRIÉTAIRE de la boutique (req._delegue) — c'est ce qui permet de ne pas
     réécrire les 900 routes qui vérifient « le compte connecté est le propriétaire ». Toute autre requête s'exécute au nom de la personne
     elle-même : sans droit sur la boutique, les contrôles « propriétaire » existants la refusent naturellement.
   • Un poste qui n'a pas le droit exigé reçoit 403 avec le droit manquant. Sans le droit « coordonnées », les champs de contact des clients
     sont retirés de la réponse (res._masque, appliqué par sendJSON).
   • Chaque action d'écriture faite au nom du propriétaire est inscrite au journal (boutique_equipe_journal) avec la VRAIE personne.
   • Le propriétaire a toujours tous les droits ; lui seul gère l'équipe.
   Seules les routes listées dans REGLES sont ouvertes au personnel pour l'instant (commandes, retours et litiges, produits, statistiques).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { parseCookies } = require('./auth');

/* ── Droits (identiques à la maquette « Paramètres vitrine », section 9) ── */
const DROITS = [
  { id: 'parametres',  libelle: 'Modifier les paramètres',       applique: false },
  { id: 'publier',     libelle: 'Publier',                       applique: true  },
  { id: 'commandes',   libelle: 'Gérer les commandes',           applique: true  },
  { id: 'rembourser',  libelle: 'Rembourser',                    applique: true  },
  { id: 'coordonnees', libelle: 'Voir les coordonnées clients',  applique: true  },
  { id: 'paiements',   libelle: 'Gérer les paiements',           applique: false },
  { id: 'supprimer',   libelle: 'Supprimer des contenus',        applique: true  },
  { id: 'statistiques', libelle: 'Voir les statistiques',        applique: true  },
];
const IDS_DROITS = DROITS.map(d => d.id);

/* ── Postes attribuables (le « Propriétaire » n'est jamais attribué : c'est le titulaire du compte) ── */
const POSTES = {
  'Administrateur':              ['parametres', 'publier', 'commandes', 'rembourser', 'coordonnees', 'supprimer', 'statistiques'],
  'Gestionnaire commercial':     ['publier', 'statistiques'],
  'Gestionnaire des commandes':  ['commandes', 'rembourser', 'coordonnees'],
  'Responsable des expéditions': ['commandes', 'coordonnees'],
  'Éditeur de contenus':         ['publier'],
  'Lecteur des statistiques':    ['statistiques'],
};
const NOMS_POSTES = Object.keys(POSTES);
const MAX_MEMBRES = 20;
const COOKIE = 'boutique_active';
const CACHE_MS = 5000;

/* Champs de contact des clients, retirés des réponses quand le poste n'a pas le droit « coordonnées ». */
const CLES_COORDONNEES = ['acheteur_email', 'email', 'telephone', 'livraison_nom', 'livraison_adresse', 'livraison_code_postal', 'livraison_ville', 'livraison_pays', 'livraison_telephone', 'plaignant_email'];

/* Routes ouvertes au personnel. init : comment retrouver la boutique visée par la requête. */
const REGLES = [
  { m: 'GET',    re: /^\/api\/initiatives\/(\d+)\/commandes$/,              droit: 'commandes',  init: 'direct',   masque: true },
  { m: 'PATCH',  re: /^\/api\/commandes_vitrine\/(\d+)$/,                   droit: 'commandes',  init: 'commande' },
  { m: 'PATCH',  re: /^\/api\/commandes_vitrine\/(\d+)\/livraison$/,        droit: 'commandes',  init: 'commande' },
  { m: 'GET',    re: /^\/api\/initiatives\/(\d+)\/retours$/,                droit: 'commandes',  init: 'direct' },
  { m: 'POST',   re: /^\/api\/retours\/(\d+)\/(accepter|preciser|refuser)$/, droit: 'commandes', init: 'retour' },
  { m: 'POST',   re: /^\/api\/retours\/(\d+)\/rembourser$/,                 droit: 'rembourser', init: 'retour' },
  { m: 'GET',    re: /^\/api\/initiatives\/(\d+)\/vitrine-messages$/,       droit: 'commandes',  init: 'direct',   masque: true },
  { m: 'POST',   re: /^\/api\/initiatives\/(\d+)\/produits$/,               droit: 'publier',    init: 'direct' },
  { m: 'PATCH',  re: /^\/api\/initiatives\/(\d+)\/produits\/reorder$/,      droit: 'publier',    init: 'direct' },
  { m: 'PUT',    re: /^\/api\/produits\/(\d+)$/,                            droit: 'publier',    init: 'produit' },
  { m: 'PUT',    re: /^\/api\/produits\/(\d+)\/mise-en-avant$/,             droit: 'publier',    init: 'produit' },
  { m: 'DELETE', re: /^\/api\/produits\/(\d+)$/,                            droit: 'supprimer',  init: 'produit' },
  { m: 'GET',    re: /^\/api\/initiatives\/(\d+)\/stats-impact$/,           droit: 'statistiques', init: 'direct' },
];

function trouverRegle(methode, chemin) {
  for (const r of REGLES) {
    if (r.m !== methode) continue;
    const m = chemin.match(r.re);
    if (m) return { regle: r, id: Number(m[1]) };
  }
  return null;
}

/* Droits valides : sous-ensemble des droits connus, sans doublon. */
function normaliserDroits(liste) {
  if (!Array.isArray(liste)) return null;
  const vus = new Set();
  for (const d of liste) if (IDS_DROITS.includes(d)) vus.add(d);
  return IDS_DROITS.filter(d => vus.has(d));
}
function lireDroits(json) {
  try { return normaliserDroits(JSON.parse(json || '[]')) || []; } catch (e) { return []; }
}

/* Retire de tout l'objet les clés de contact (réponse destinée à un poste sans le droit « coordonnées »). */
function masquer(valeur, cles) {
  if (Array.isArray(valeur)) return valeur.map(v => masquer(v, cles));
  if (valeur && typeof valeur === 'object') {
    const sortie = {};
    for (const k of Object.keys(valeur)) sortie[k] = cles.includes(k) ? null : masquer(valeur[k], cles);
    return sortie;
  }
  return valeur;
}

const cache = new Map();   // "userId:initId" -> { t, ctx }
const oublier = () => cache.clear();

/* Contexte de travail d'une personne sur une boutique : null si elle n'est pas membre accepté (ou si la boutique / son propriétaire ne sont plus valables). */
async function contexte(db, userId, initiativeId) {
  const cle = userId + ':' + initiativeId;
  const c = cache.get(cle);
  if (c && Date.now() - c.t < CACHE_MS) return c.ctx;
  let ctx = null;
  const m = await db.prepare(`SELECT e.poste, e.droits_json, i.owner_user_id, u.suspendu_definitif, u.suspendu_jusqu_au
    FROM boutique_equipe e JOIN initiatives i ON i.id = e.initiative_id JOIN users u ON u.id = i.owner_user_id
    WHERE e.initiative_id = ? AND e.user_id = ? AND e.statut = 'accepte'`).get(initiativeId, userId);
  if (m && Number(m.owner_user_id) !== Number(userId)
      && !m.suspendu_definitif && !(m.suspendu_jusqu_au && new Date(m.suspendu_jusqu_au) > new Date())) {
    ctx = { poste: m.poste, droits: lireDroits(m.droits_json), owner_id: Number(m.owner_user_id) };
  }
  cache.set(cle, { t: Date.now(), ctx });
  return ctx;
}

async function initiativeVisee(db, regle, id) {
  if (regle.init === 'direct') return id;
  const table = { commande: 'commandes_vitrine', retour: 'retours', produit: 'produits_vitrine' }[regle.init];
  if (!table) return null;
  try { const l = await db.prepare('SELECT initiative_id FROM ' + table + ' WHERE id = ?').get(id); return l ? Number(l.initiative_id) : null; }
  catch (e) { return null; }
}

async function journaliser(db, initiativeId, acteurId, poste, action, details) {
  try {
    await db.prepare('INSERT INTO boutique_equipe_journal (initiative_id, acteur_id, poste, action, details) VALUES (?,?,?,?,?)')
      .run(initiativeId, acteurId, poste || null, action, details ? String(details).slice(0, 400) : null);
  } catch (e) { /* le journal ne doit jamais bloquer une action */ }
}

/* ── Garde : appelée par index.js pour toute requête /api/*, avant le routeur.
   Renvoie null (on laisse passer, éventuellement au nom du propriétaire via req._delegue) ou { status, body } (refus). ── */
async function garde(db, req, res, chemin, lireUtilisateurReel) {
  const brut = parseCookies(req)[COOKIE];
  if (!brut) return null;
  const initiativeActive = Number(brut);
  if (!Number.isInteger(initiativeActive) || initiativeActive <= 0) return null;
  const trouve = trouverRegle(req.method, chemin);
  if (!trouve) return null;
  const user = await lireUtilisateurReel(req);
  if (!user) return null;
  const ctx = await contexte(db, Number(user.id), initiativeActive);
  if (!ctx) return null;
  const cible = await initiativeVisee(db, trouve.regle, trouve.id);
  if (cible !== initiativeActive) return null;
  if (!ctx.droits.includes(trouve.regle.droit)) {
    const d = DROITS.find(x => x.id === trouve.regle.droit);
    return { status: 403, body: { error: 'Votre poste (' + ctx.poste + ') ne permet pas cette action sur cette boutique.', droit_requis: trouve.regle.droit, droit_libelle: d ? d.libelle : trouve.regle.droit } };
  }
  req._delegue = { vrai_user_id: Number(user.id), owner_id: ctx.owner_id, initiative_id: initiativeActive, poste: ctx.poste, droits: ctx.droits };
  if (trouve.regle.masque && !ctx.droits.includes('coordonnees')) res._masque = CLES_COORDONNEES;
  if (req.method !== 'GET') await journaliser(db, initiativeActive, Number(user.id), ctx.poste, req.method + ' ' + chemin, null);
  return null;
}

/* ── Routes : équipe (propriétaire), mes boutiques, bascule ── */
function register({ route, db, sendJSON, getCurrentUser, creerNotif }) {
  /* Le propriétaire (la VRAIE personne, jamais un membre d'équipe) de la boutique visée, sinon réponse d'erreur envoyée et null renvoyé. */
  async function proprietaireOuRefus(req, res, params) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: 'Connexion requise.' }); return null; }
    if (user._delegue) { sendJSON(res, 403, { error: 'Seul le propriétaire gère l\'équipe de la boutique.' }); return null; }
    const init = await db.prepare('SELECT id, nom, owner_user_id FROM initiatives WHERE id = ?').get(Number(params.id));
    if (!init) { sendJSON(res, 404, { error: 'Boutique introuvable.' }); return null; }
    if (Number(init.owner_user_id) !== Number(user.id)) { sendJSON(res, 403, { error: 'Seul le propriétaire gère l\'équipe de la boutique.' }); return null; }
    return { user, init };
  }
  const nomComplet = (u) => (((u.prenom || '') + ' ' + (u.nom || '')).trim()) || u.email;
  const ligneMembre = (l) => ({
    user_id: Number(l.user_id), nom: l.nom, prenom: l.prenom, photo_url: l.photo_url || null,
    poste: l.poste, droits: lireDroits(l.droits_json), statut: l.statut, invite_le: l.created_at, accepte_le: l.accepte_le || null,
  });

  route('GET', '/api/initiatives/:id/equipe-boutique', async (req, res, params) => {
    const ctx = await proprietaireOuRefus(req, res, params); if (!ctx) return;
    const lignes = await db.prepare(`SELECT e.*, u.nom, u.prenom, u.photo_url FROM boutique_equipe e JOIN users u ON u.id = e.user_id
      WHERE e.initiative_id = ? AND e.statut IN ('invite','accepte','refuse') ORDER BY e.created_at`).all(ctx.init.id);
    sendJSON(res, 200, {
      membres: lignes.map(ligneMembre),
      postes: NOMS_POSTES.map(p => ({ poste: p, droits: POSTES[p] })),
      droits: DROITS,
    });
  });

  route('POST', '/api/initiatives/:id/equipe-boutique', async (req, res, params, body) => {
    const ctx = await proprietaireOuRefus(req, res, params); if (!ctx) return;
    const poste = String(body && body.poste || '');
    if (!POSTES[poste]) return sendJSON(res, 400, { error: 'Poste inconnu.', postes: NOMS_POSTES });
    const droits = body.droits === undefined ? POSTES[poste] : normaliserDroits(body.droits);
    if (!droits) return sendJSON(res, 400, { error: 'Droits invalides.' });
    let cible = null;
    if (body.user_id) cible = await db.prepare('SELECT id, nom, prenom, email, role FROM users WHERE id = ?').get(Number(body.user_id));
    else if (body.email) cible = await db.prepare('SELECT id, nom, prenom, email, role FROM users WHERE LOWER(email) = ?').get(String(body.email).trim().toLowerCase());
    if (!cible) return sendJSON(res, 404, { error: 'Aucun compte Diaspo\'Actif ne correspond. La personne doit d\'abord créer son compte.' });
    if (Number(cible.id) === Number(ctx.user.id)) return sendJSON(res, 400, { error: 'Vous êtes déjà le propriétaire de cette boutique.' });
    if (['administrateur', 'administrateur_junior'].includes(cible.role)) return sendJSON(res, 400, { error: 'Un compte d\'administration de la plateforme ne peut pas rejoindre une équipe de boutique.' });
    const existant = await db.prepare('SELECT id, statut FROM boutique_equipe WHERE initiative_id = ? AND user_id = ?').get(ctx.init.id, cible.id);
    if (existant && existant.statut === 'accepte') return sendJSON(res, 409, { error: 'Cette personne fait déjà partie de l\'équipe.' });
    if (existant && existant.statut === 'invite') return sendJSON(res, 409, { error: 'Une invitation est déjà en attente pour cette personne.' });
    const nb = (await db.prepare("SELECT COUNT(*) AS c FROM boutique_equipe WHERE initiative_id = ? AND statut IN ('invite','accepte')").get(ctx.init.id)).c;
    if (Number(nb) >= MAX_MEMBRES) return sendJSON(res, 409, { error: 'L\'équipe est complète (' + MAX_MEMBRES + ' personnes au plus).' });
    const message = body.message ? String(body.message).slice(0, 500) : null;
    if (existant) {
      await db.prepare("UPDATE boutique_equipe SET poste=?, droits_json=?, message=?, statut='invite', invite_par=?, created_at=datetime('now'), updated_at=datetime('now'), accepte_le=NULL WHERE id=?")
        .run(poste, JSON.stringify(droits), message, ctx.user.id, existant.id);
    } else {
      await db.prepare('INSERT INTO boutique_equipe (initiative_id, user_id, poste, droits_json, message, statut, invite_par) VALUES (?,?,?,?,?,?,?)')
        .run(ctx.init.id, cible.id, poste, JSON.stringify(droits), message, 'invite', ctx.user.id);
    }
    oublier();
    await journaliser(db, ctx.init.id, ctx.user.id, 'Propriétaire', 'invitation', nomComplet(cible) + ' — ' + poste);
    try { await creerNotif(cible.id, 'boutique_equipe_invitation', 'Invitation à rejoindre une boutique',
      nomComplet(ctx.user) + ' vous invite à rejoindre l\'équipe de « ' + ctx.init.nom + ' » comme ' + poste + '.', { initiative_id: ctx.init.id }); } catch (e) { /* notification best-effort */ }
    sendJSON(res, 201, { ok: true });
  });

  route('PATCH', '/api/initiatives/:id/equipe-boutique/:userId', async (req, res, params, body) => {
    const ctx = await proprietaireOuRefus(req, res, params); if (!ctx) return;
    const ligne = await db.prepare("SELECT id, poste, droits_json FROM boutique_equipe WHERE initiative_id = ? AND user_id = ? AND statut IN ('invite','accepte')").get(ctx.init.id, Number(params.userId));
    if (!ligne) return sendJSON(res, 404, { error: 'Cette personne ne fait pas partie de l\'équipe.' });
    let poste = ligne.poste, droits = lireDroits(ligne.droits_json);
    if (body.poste !== undefined) {
      if (!POSTES[body.poste]) return sendJSON(res, 400, { error: 'Poste inconnu.', postes: NOMS_POSTES });
      if (body.poste !== poste && body.droits === undefined) droits = POSTES[body.poste];
      poste = body.poste;
    }
    if (body.droits !== undefined) {
      const d = normaliserDroits(body.droits);
      if (!d) return sendJSON(res, 400, { error: 'Droits invalides.' });
      droits = d;
    }
    await db.prepare("UPDATE boutique_equipe SET poste=?, droits_json=?, updated_at=datetime('now') WHERE id=?").run(poste, JSON.stringify(droits), ligne.id);
    oublier();
    await journaliser(db, ctx.init.id, ctx.user.id, 'Propriétaire', 'modification', 'compte ' + params.userId + ' — ' + poste + ' — ' + droits.join(','));
    sendJSON(res, 200, { ok: true, poste, droits });
  });

  route('DELETE', '/api/initiatives/:id/equipe-boutique/:userId', async (req, res, params) => {
    const ctx = await proprietaireOuRefus(req, res, params); if (!ctx) return;
    const r = await db.prepare("UPDATE boutique_equipe SET statut='retire', updated_at=datetime('now') WHERE initiative_id = ? AND user_id = ? AND statut IN ('invite','accepte')").run(ctx.init.id, Number(params.userId));
    if (!r || !r.changes) return sendJSON(res, 404, { error: 'Cette personne ne fait pas partie de l\'équipe.' });
    oublier();
    await journaliser(db, ctx.init.id, ctx.user.id, 'Propriétaire', 'retrait', 'compte ' + params.userId);
    try { await creerNotif(Number(params.userId), 'boutique_equipe_retrait', 'Accès à une boutique retiré', 'Vous ne faites plus partie de l\'équipe de « ' + ctx.init.nom + ' ».', { initiative_id: ctx.init.id }); } catch (e) { /* best-effort */ }
    sendJSON(res, 200, { ok: true });
  });

  /* Journal consultable par le propriétaire : qui a fait quoi, avec quel poste. */
  route('GET', '/api/initiatives/:id/equipe-boutique-journal', async (req, res, params) => {
    const ctx = await proprietaireOuRefus(req, res, params); if (!ctx) return;
    const lignes = await db.prepare(`SELECT j.id, j.acteur_id, j.poste, j.action, j.details, j.created_at, u.nom, u.prenom FROM boutique_equipe_journal j
      LEFT JOIN users u ON u.id = j.acteur_id WHERE j.initiative_id = ? ORDER BY j.id DESC LIMIT 200`).all(ctx.init.id);
    sendJSON(res, 200, { journal: lignes });
  });

  /* ── Côté personne invitée ── */
  route('GET', '/api/mes-boutiques', async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
    if (user._delegue) return sendJSON(res, 403, { error: 'Non disponible dans ce contexte.' });
    const active = Number(parseCookies(req)[COOKIE]) || 0;
    const boutiques = [];
    const propre = await db.prepare('SELECT id, nom, slug, logo_url FROM initiatives WHERE owner_user_id = ? ORDER BY id LIMIT 1').get(user.id);
    if (propre) boutiques.push({ initiative_id: Number(propre.id), nom: propre.nom, slug: propre.slug, logo_url: propre.logo_url || null, poste: 'Propriétaire', droits: IDS_DROITS, proprietaire: true });
    const membres = await db.prepare(`SELECT e.initiative_id, e.poste, e.droits_json, i.nom, i.slug, i.logo_url FROM boutique_equipe e JOIN initiatives i ON i.id = e.initiative_id
      WHERE e.user_id = ? AND e.statut = 'accepte' ORDER BY e.accepte_le`).all(user.id);
    for (const m of membres) boutiques.push({ initiative_id: Number(m.initiative_id), nom: m.nom, slug: m.slug, logo_url: m.logo_url || null, poste: m.poste, droits: lireDroits(m.droits_json), proprietaire: false });
    /* Active = celle du cookie si la personne y a bien accès, sinon sa propre boutique (0 si elle n'en a pas : elle agit alors comme elle-même). */
    const idActive = boutiques.some(b => b.initiative_id === active && !b.proprietaire) ? active : (propre ? Number(propre.id) : 0);
    for (const b of boutiques) b.active = b.initiative_id === idActive;
    const invitations = await db.prepare(`SELECT e.id, e.initiative_id, e.poste, e.droits_json, e.message, e.created_at, i.nom AS boutique_nom, i.logo_url FROM boutique_equipe e
      JOIN initiatives i ON i.id = e.initiative_id WHERE e.user_id = ? AND e.statut = 'invite' ORDER BY e.created_at DESC`).all(user.id);
    sendJSON(res, 200, {
      boutiques, active: idActive,
      invitations: invitations.map(i => ({ id: Number(i.id), initiative_id: Number(i.initiative_id), boutique_nom: i.boutique_nom, logo_url: i.logo_url || null, poste: i.poste, droits: lireDroits(i.droits_json), message: i.message || null, invite_le: i.created_at })),
      droits: DROITS,
    });
  });

  route('POST', '/api/mes-invitations-boutique/:id/repondre', async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
    const inv = await db.prepare("SELECT e.id, e.initiative_id, e.poste, i.nom, i.owner_user_id FROM boutique_equipe e JOIN initiatives i ON i.id = e.initiative_id WHERE e.id = ? AND e.user_id = ? AND e.statut = 'invite'").get(Number(params.id), user.id);
    if (!inv) return sendJSON(res, 404, { error: 'Invitation introuvable ou déjà traitée.' });
    const accepter = body && (body.accepter === true || body.accepter === 'true');
    if (accepter) await db.prepare("UPDATE boutique_equipe SET statut='accepte', accepte_le=datetime('now'), updated_at=datetime('now') WHERE id=?").run(inv.id);
    else await db.prepare("UPDATE boutique_equipe SET statut='refuse', updated_at=datetime('now') WHERE id=?").run(inv.id);
    oublier();
    await journaliser(db, inv.initiative_id, user.id, inv.poste, accepter ? 'invitation acceptée' : 'invitation refusée', null);
    try { await creerNotif(inv.owner_user_id, 'boutique_equipe_reponse', accepter ? 'Invitation acceptée' : 'Invitation refusée',
      nomComplet(user) + (accepter ? ' a accepté de rejoindre' : ' a refusé de rejoindre') + ' l\'équipe de « ' + inv.nom + ' » (' + inv.poste + ').', { initiative_id: inv.initiative_id }); } catch (e) { /* best-effort */ }
    sendJSON(res, 200, { ok: true, statut: accepter ? 'accepte' : 'refuse', initiative_id: Number(inv.initiative_id) });
  });

  route('DELETE', '/api/mes-boutiques/:id/quitter', async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
    const r = await db.prepare("UPDATE boutique_equipe SET statut='retire', updated_at=datetime('now') WHERE initiative_id = ? AND user_id = ? AND statut = 'accepte'").run(Number(params.id), user.id);
    if (!r || !r.changes) return sendJSON(res, 404, { error: 'Vous ne faites pas partie de l\'équipe de cette boutique.' });
    oublier();
    await journaliser(db, Number(params.id), user.id, null, 'départ', null);
    sendJSON(res, 200, { ok: true });
  });

  /* Bascule : choisir la boutique sur laquelle on travaille. initiative_id vide ou = sa propre boutique : retour à son propre compte. */
  route('POST', '/api/boutique-active', async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
    const cible = Number(body && body.initiative_id) || 0;
    const secure = ((req.headers['x-forwarded-proto'] || (req.socket && req.socket.encrypted ? 'https' : 'http')) === 'https') ? '; Secure' : '';
    if (!cible) return sendJSON(res, 200, { ok: true, active: null }, { 'Set-Cookie': COOKIE + '=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' + secure });
    const propre = await db.prepare('SELECT id FROM initiatives WHERE owner_user_id = ? AND id = ?').get(user.id, cible);
    if (propre) return sendJSON(res, 200, { ok: true, active: cible, proprietaire: true }, { 'Set-Cookie': COOKIE + '=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' + secure });
    const ctx = await contexte(db, Number(user.id), cible);
    if (!ctx) return sendJSON(res, 403, { error: 'Vous n\'avez pas accès à cette boutique.' });
    sendJSON(res, 200, { ok: true, active: cible, poste: ctx.poste, droits: ctx.droits },
      { 'Set-Cookie': COOKIE + '=' + cible + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000' + secure });
  });
}

/* Information sur la boutique active, jointe à GET /api/auth/me (aucun droit n'en découle : la garde revérifie à chaque requête). */
async function infoActive(db, req, userId) {
  const brut = Number(parseCookies(req)[COOKIE]);
  if (!Number.isInteger(brut) || brut <= 0) return null;
  const ctx = await contexte(db, Number(userId), brut);
  if (!ctx) return null;
  const i = await db.prepare('SELECT id, nom, slug, logo_url FROM initiatives WHERE id = ?').get(brut);
  return i ? { initiative_id: Number(i.id), nom: i.nom, slug: i.slug, logo_url: i.logo_url || null, poste: ctx.poste, droits: ctx.droits } : null;
}

module.exports = { DROITS, POSTES, NOMS_POSTES, CLES_COORDONNEES, REGLES, COOKIE, trouverRegle, normaliserDroits, masquer, garde, register, infoActive, oublier };
