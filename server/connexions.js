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
const DUREE_SESSION_MS = 7 * 24 * 3600 * 1000;      // aligné sur TOKEN_TTL (auth.js)
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
async function ouvrir(db, { req, userId, sidToken, ip }) {
  const cookies = parseCookies(req);
  const appareilId = ID_RE.test(cookies[COOKIE_APPAREIL] || '') ? cookies[COOKIE_APPAREIL] : crypto.randomBytes(16).toString('hex');
  const id = crypto.randomBytes(16).toString('hex');
  const a = analyserAppareil(req, ip);
  const anciennes = await db.prepare('SELECT id, sid_token FROM connexions WHERE appareil_id=? AND revoque_at IS NULL').all(appareilId);
  await revoquerLignes(db, anciennes, 'remplacee');
  await db.prepare(`INSERT INTO connexions
    (id, user_id, sid_token, appareil_id, type_appareil, navigateur, os, ville, pays, ip_masquee, created_at, last_seen_at, expire_at, principal)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0)`)
    .run(id, userId, sidToken || null, appareilId, a.type, a.navigateur, a.os, a.ville, a.pays, a.ipMasquee, horodatage(), horodatage(), horodatage(DUREE_SESSION_MS));
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
async function toucher(db, id) {
  const maintenant = Date.now();
  if (maintenant - (dernierToucher.get(id) || 0) < 60 * 1000) return;
  dernierToucher.set(id, maintenant);
  if (dernierToucher.size > 5000) dernierToucher.clear();
  try { await db.prepare('UPDATE connexions SET last_seen_at=? WHERE id=?').run(horodatage(), id); } catch (_) {}
}

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
    courante: !!courantId && l.id === courantId,
  }));
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

module.exports = { COOKIE_APPAREIL, analyserAppareil, etiquette, horodatage, lireAppareilId, nouvelAppareilId, cookieAppareilTexte, ouvrir, verifier, toucher, lister, compter, revoquer, revoquerAutres };
