/* ═══════════════════════════════════════════════════════════════════════════
   Registre des connexions (2026-10-05) — voir le commentaire de la table `connexions` dans db.js.

   Principe : chaque session ouverte écrit une ligne ; son id est embarqué dans le jeton `auth`
   (champ jti) et revérifié à chaque requête (verifier). Révoquer une ligne tue la session sur
   l'appareil concerné immédiatement, sans attendre l'expiration du jeton. Les jetons émis AVANT
   cette fonctionnalité n'ont pas de jti : ils restent acceptés (transition) mais n'apparaissent
   pas dans la liste ; seule une montée de credential_version peut les invalider.
   Toutes les fonctions reçoivent `db` (module async partagé SQLite/Postgres).
   ═══════════════════════════════════════════════════════════════════════════ */
const crypto = require('node:crypto');
const { parseCookies } = require('./auth');

const COOKIE_APPAREIL = 'da_dev';
/* Durées (étape 3, 2026-10-05) : appareil principal 30 jours glissants ; tout autre appareil 3 jours
   fermes depuis la connexion (jamais prolongés par l'usage) ; comptes de démonstration : 7 jours
   comme avant (partagés par conception, hors du dispositif). */
const DUREE_PRINCIPAL_MS = 30 * 24 * 3600 * 1000;
const DUREE_SECONDAIRE_MS = 3 * 24 * 3600 * 1000;
const DUREE_EXEMPT_MS = 7 * 24 * 3600 * 1000;
const INACTIVITE_LIBERE_PLACE_MS = 90 * 24 * 3600 * 1000;
const DUREE_COOKIE_APPAREIL_S = 365 * 24 * 3600;
const ID_RE = /^[a-f0-9]{32}$/;

const horodatage = (ms = 0) => new Date(Date.now() + ms).toISOString().slice(0, 19).replace('T', ' ');

/* ── Reconnaissance de l'appareil à partir des en-têtes (User-Agent, indices client, géo Vercel) ── */
function analyserAppareil(req, ip) {
  const ua = String(req.headers['user-agent'] || '');
  let type = 'ordinateur';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) type = 'tablette';
  else if (req.headers['sec-ch-ua-mobile'] === '?1' || /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) type = 'mobile';

  let navigateur = 'Navigateur';
  if (/Edg(e|A|iOS)?\//i.test(ua)) navigateur = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) navigateur = 'Opera';
  else if (/SamsungBrowser/i.test(ua)) navigateur = 'Samsung Internet';
  else if (/Firefox\/|FxiOS/i.test(ua)) navigateur = 'Firefox';
  else if (/CriOS|Chrome\//i.test(ua)) navigateur = 'Chrome';
  else if (/Safari\//i.test(ua)) navigateur = 'Safari';

  let os = '';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  // Géolocalisation approximative fournie gratuitement par Vercel en production (absente en local).
  let ville = '', pays = '';
  try { ville = decodeURIComponent(String(req.headers['x-vercel-ip-city'] || '')); } catch (_) { ville = ''; }
  const codePays = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  if (/^[A-Z]{2}$/.test(codePays)) {
    try { pays = new Intl.DisplayNames(['fr'], { type: 'region' }).of(codePays) || codePays; } catch (_) { pays = codePays; }
  }

  // Adresse IP jamais conservée en entier : deux premiers blocs seulement (assez pour reconnaître un réseau).
  let ipMasquee = '';
  const brute = String(ip || '').replace(/^::ffff:/, '');
  if (/^(127\.|::1$|::$)/.test(brute)) ipMasquee = ''; // boucle locale : rien d'utile à afficher
  else if (/^\d+\.\d+\.\d+\.\d+$/.test(brute)) ipMasquee = brute.split('.').slice(0, 2).join('.') + '.x.x';
  else if (brute.includes(':')) ipMasquee = brute.split(':').slice(0, 2).join(':') + ':…';

  return { type, navigateur, os, ville: ville.slice(0, 80), pays: pays.slice(0, 80), ipMasquee };
}

function etiquette(c) {
  const quoi = c.type_appareil === 'mobile' ? 'Téléphone' : c.type_appareil === 'tablette' ? 'Tablette' : 'Ordinateur';
  return [quoi, [c.navigateur, c.os].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');
}

/* ── Révocation (interne) : marque la ligne ET détruit la session SQL (cookie sid) associée ── */
async function revoquerLignes(db, lignes, motif) {
  const t = horodatage();
  for (const l of lignes) {
    await db.prepare('UPDATE connexions SET revoque_at=?, revoque_motif=? WHERE id=? AND revoque_at IS NULL').run(t, motif || null, l.id);
    if (l.sid_token) { try { await db.prepare('DELETE FROM sessions WHERE token=?').run(l.sid_token); } catch (_) { /* session déjà absente */ } }
  }
}

/* ── Ouverture d'une connexion : renvoie { id, appareilId, cookieAppareil(sf) } ──────────────────
   Un navigateur (appareil_id) ne détient jamais qu'UNE session : toute ligne active du même
   navigateur — quel que soit le compte — est révoquée, car les cookies viennent d'être écrasés. */
/* mobile = téléphone ou tablette ; ordinateur = le reste. */
const categorieDe = (type) => (type === 'mobile' || type === 'tablette') ? 'mobile' : 'ordinateur';

/* Une désignation « appareil principal » est-elle encore vivante pour cette catégorie ? */
async function principalActif(db, userId, categorie) {
  const limite = horodatage(-INACTIVITE_LIBERE_PLACE_MS);
  const lignes = await db.prepare('SELECT * FROM appareils_principaux WHERE user_id=? AND categorie=? ORDER BY designe_at DESC').all(userId, categorie);
  return lignes.find(l => String(l.derniere_activite || l.designe_at || '') >= limite) || null;
}

/* Cet appareil est-il principal pour ce compte ? Hérité d'un compte lié : si le même navigateur est
   l'appareil principal d'un compte du même groupe et que celui-ci n'a pas encore de principal dans
   cette catégorie, il le devient aussi (la bascule entre comptes liés reste sur le même appareil). */
async function estPrincipal(db, userId, appareilId, categorie) {
  const direct = await db.prepare('SELECT id FROM appareils_principaux WHERE user_id=? AND appareil_id=? AND categorie=?').get(userId, appareilId, categorie);
  if (direct) return true;
  if (await principalActif(db, userId, categorie)) return false;
  try {
    const m = await db.prepare('SELECT groupe_id FROM comptes_lies_membres WHERE user_id=?').get(userId);
    if (!m) return false;
    const frere = await db.prepare(`SELECT ap.id FROM appareils_principaux ap
      JOIN comptes_lies_membres cm ON cm.user_id = ap.user_id
      WHERE cm.groupe_id=? AND ap.user_id<>? AND ap.appareil_id=? AND ap.categorie=?`).get(m.groupe_id, userId, appareilId, categorie);
    if (!frere) return false;
    await db.prepare('INSERT INTO appareils_principaux (user_id, appareil_id, categorie, designe_at, derniere_activite) VALUES (?,?,?,?,?)')
      .run(userId, appareilId, categorie, horodatage(), horodatage());
    return true;
  } catch (_) { return false; }
}

async function ouvrir(db, { req, userId, sidToken, ip, exempt }) {
  const cookies = parseCookies(req);
  const appareilId = ID_RE.test(cookies[COOKIE_APPAREIL] || '') ? cookies[COOKIE_APPAREIL] : crypto.randomBytes(16).toString('hex');
  const id = crypto.randomBytes(16).toString('hex');
  const a = analyserAppareil(req, ip);
  const anciennes = await db.prepare('SELECT id, sid_token FROM connexions WHERE appareil_id=? AND revoque_at IS NULL').all(appareilId);
  await revoquerLignes(db, anciennes, 'remplacee');
  // Durée : principal 30 j (glissants), autre appareil 3 j fermes, compte de démonstration 7 j.
  let principal = 0, duree = exempt ? DUREE_EXEMPT_MS : DUREE_SECONDAIRE_MS;
  if (!exempt && await estPrincipal(db, userId, appareilId, categorieDe(a.type))) { principal = 1; duree = DUREE_PRINCIPAL_MS; }
  await db.prepare(`INSERT INTO connexions
    (id, user_id, sid_token, appareil_id, type_appareil, navigateur, os, ville, pays, ip_masquee, created_at, last_seen_at, expire_at, principal)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, userId, sidToken || null, appareilId, a.type, a.navigateur, a.os, a.ville, a.pays, a.ipMasquee, horodatage(), horodatage(), horodatage(duree), principal);
  // Nettoyage opportuniste des vieilles lignes révoquées (garde 90 jours d'historique).
  try { await db.prepare('DELETE FROM connexions WHERE revoque_at IS NOT NULL AND revoque_at < ?').run(horodatage(-90 * 24 * 3600 * 1000)); } catch (_) {}
  return {
    id, appareilId,
    cookieAppareil: (sf) => `${COOKIE_APPAREIL}=${appareilId}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${DUREE_COOKIE_APPAREIL_S}${sf || ''}`,
  };
}

/* ── Vérification à chaque requête : la connexion existe, n'est ni révoquée ni expirée ── */
async function verifier(db, id) {
  if (!ID_RE.test(String(id || ''))) return null;
  const c = await db.prepare('SELECT * FROM connexions WHERE id=?').get(id);
  if (!c || c.revoque_at) return null;
  if (c.expire_at && String(c.expire_at) < horodatage()) return null;
  return c;
}

const dernierToucher = new Map();
async function toucher(db, cx) {
  const id = cx.id;
  const maintenant = Date.now();
  if (maintenant - (dernierToucher.get(id) || 0) < 60 * 1000) return;
  dernierToucher.set(id, maintenant);
  if (dernierToucher.size > 5000) dernierToucher.clear();
  try {
    if (Number(cx.principal) === 1) {
      await db.prepare('UPDATE connexions SET last_seen_at=?, expire_at=? WHERE id=?').run(horodatage(), horodatage(DUREE_PRINCIPAL_MS), id);
      await db.prepare('UPDATE appareils_principaux SET derniere_activite=? WHERE user_id=? AND appareil_id=?').run(horodatage(), cx.user_id, cx.appareil_id);
    } else {
      await db.prepare('UPDATE connexions SET last_seen_at=? WHERE id=?').run(horodatage(), id);   // JAMAIS d'allongement pour un appareil secondaire
    }
  } catch (_) {}
}
function _viderThrottle() { dernierToucher.clear(); }   // tests uniquement

/* ── Lecture : connexions actives d'un compte ── */
async function lister(db, userId, courantId) {
  const lignes = await db.prepare('SELECT * FROM connexions WHERE user_id=? AND revoque_at IS NULL ORDER BY last_seen_at DESC').all(userId);
  const now = horodatage();
  return lignes.filter(l => !l.expire_at || String(l.expire_at) >= now).map(l => ({
    id: l.id,
    etiquette: etiquette(l),
    type: l.type_appareil || 'ordinateur',
    navigateur: l.navigateur || '',
    os: l.os || '',
    lieu: [l.ville, l.pays].filter(Boolean).join(', '),
    ip: l.ip_masquee || '',
    cree: l.created_at,
    derniere_activite: l.last_seen_at,
    expire: l.expire_at,
    principal: !!Number(l.principal),
    categorie: categorieDe(l.type_appareil),
    courante: !!courantId && l.id === courantId,
  }));
}

/* ── Appareils principaux : état des deux places + désignation / retrait ── */
async function etatPrincipaux(db, userId) {
  const etat = {};
  for (const cat of ['mobile', 'ordinateur']) {
    const p = await principalActif(db, userId, cat);
    etat[cat] = { occupe: !!p, appareil_id: p ? p.appareil_id : null };
  }
  return etat;
}

/* Désigne l'appareil de la connexion `cx` (ligne complète) comme principal de sa catégorie.
   `remplacer` : true si l'appelant a déjà prouvé son identité (DS-ID) pour prendre une place occupée. */
async function designerPrincipal(db, cx, { remplacer }) {
  const cat = categorieDe(cx.type_appareil);
  const existant = await principalActif(db, cx.user_id, cat);
  if (existant && existant.appareil_id === cx.appareil_id) return { ok: true, deja: true };
  if (existant && !remplacer) return { erreur: 'place_occupee', categorie: cat };
  if (existant) {
    // L'ancien principal redevient secondaire : ses sessions sont plafonnées à 3 jours à partir de maintenant.
    await db.prepare('DELETE FROM appareils_principaux WHERE id=?').run(existant.id);
    const butee = horodatage(DUREE_SECONDAIRE_MS);
    const sessions = await db.prepare('SELECT id, expire_at FROM connexions WHERE user_id=? AND appareil_id=? AND revoque_at IS NULL').all(cx.user_id, existant.appareil_id);
    for (const s of sessions) {
      await db.prepare('UPDATE connexions SET principal=0, expire_at=? WHERE id=?').run(String(s.expire_at || butee) < butee ? s.expire_at : butee, s.id);
    }
  }
  await db.prepare('DELETE FROM appareils_principaux WHERE user_id=? AND appareil_id=?').run(cx.user_id, cx.appareil_id);
  await db.prepare('INSERT INTO appareils_principaux (user_id, appareil_id, categorie, designe_at, derniere_activite) VALUES (?,?,?,?,?)')
    .run(cx.user_id, cx.appareil_id, cat, horodatage(), horodatage());
  await db.prepare('UPDATE connexions SET principal=1, expire_at=? WHERE id=?').run(horodatage(DUREE_PRINCIPAL_MS), cx.id);
  return { ok: true, categorie: cat, remplace: !!existant };
}

async function retirerPrincipal(db, cx) {
  const r = await db.prepare('SELECT id FROM appareils_principaux WHERE user_id=? AND appareil_id=?').get(cx.user_id, cx.appareil_id);
  if (!r) return false;
  await db.prepare('DELETE FROM appareils_principaux WHERE user_id=? AND appareil_id=?').run(cx.user_id, cx.appareil_id);
  const butee = horodatage(DUREE_SECONDAIRE_MS);
  const sessions = await db.prepare('SELECT id, expire_at FROM connexions WHERE user_id=? AND appareil_id=? AND revoque_at IS NULL').all(cx.user_id, cx.appareil_id);
  for (const s of sessions) {
    await db.prepare('UPDATE connexions SET principal=0, expire_at=? WHERE id=?').run(String(s.expire_at || butee) < butee ? s.expire_at : butee, s.id);
  }
  return true;
}

async function compter(db, userId) {
  const now = horodatage();
  const lignes = await db.prepare('SELECT expire_at FROM connexions WHERE user_id=? AND revoque_at IS NULL').all(userId);
  return lignes.filter(l => !l.expire_at || String(l.expire_at) >= now).length;
}

/* ── Révocations publiques ── */
async function revoquer(db, userId, id, motif) {
  const l = await db.prepare('SELECT id, sid_token FROM connexions WHERE id=? AND user_id=? AND revoque_at IS NULL').get(id, userId);
  if (!l) return false;
  await revoquerLignes(db, [l], motif || 'deconnexion_manuelle');
  return true;
}

/* Toutes les connexions du compte SAUF `exceptId` (la session courante, si fournie). */
async function revoquerAutres(db, userId, exceptId, motif) {
  const lignes = await db.prepare('SELECT id, sid_token FROM connexions WHERE user_id=? AND revoque_at IS NULL').all(userId);
  const cibles = lignes.filter(l => l.id !== exceptId);
  await revoquerLignes(db, cibles, motif || 'deconnexion_des_autres');
  return cibles.length;
}

/* Identifiant de navigateur (cookie da_dev) : lecture, création et texte du Set-Cookie. */
function lireAppareilId(req) {
  const v = parseCookies(req)[COOKIE_APPAREIL];
  return ID_RE.test(v || '') ? v : null;
}
function nouvelAppareilId() { return crypto.randomBytes(16).toString('hex'); }
function cookieAppareilTexte(appareilId, sf) {
  return `${COOKIE_APPAREIL}=${appareilId}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${DUREE_COOKIE_APPAREIL_S}${sf || ''}`;
}

module.exports = { categorieDe, etatPrincipaux, designerPrincipal, retirerPrincipal, _viderThrottle, COOKIE_APPAREIL, analyserAppareil, etiquette, horodatage, lireAppareilId, nouvelAppareilId, cookieAppareilTexte, ouvrir, verifier, toucher, lister, compter, revoquer, revoquerAutres };
