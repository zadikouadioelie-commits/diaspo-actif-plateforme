/* ═══════════════════════════════════════════════════════════════════════════
   Appareils reconnus + connexion par code provisoire (e-mail).

   Historique : le 2026-10-05 une connexion avec le bon mot de passe pouvait être arrêtée par une fenêtre « Confirmez que c'est bien vous »
   (code à 3 chiffres, puis code multi-connexion, DS-ID, code e-mail). Le 2026-11-04 le titulaire du site a tranché : trop de codes. Désormais :
     • le mot de passe suffit, sur n'importe quel appareil — aucun code, aucun DS-ID n'est demandé ;
     • la personne qui n'a pas son mot de passe reçoit, à l'adresse e-mail DU COMPTE qu'elle a saisie, un code provisoire à 4 chiffres
       (10 minutes, 3 essais) qui l'y connecte. Deux comptes liés (Initiative + Utilisateur) ont chacun leur adresse : le code ouvre
       le compte dont l'adresse a été saisie, et le sélecteur de comptes liés permet ensuite de basculer.
   Les « défis » sont rangés dans la table confirmations_appareil (statuts code_connexion / code_utilise / code_bloque / code_remplace /
   code_expire : jamais confondus avec les anciennes demandes d'appareil). Un appareil qui a servi à se connecter est « reconnu » 30 jours
   (appareils_reconnus) : c'est ce que vérifie encore l'entrée par DS-ID seul (« Mon Associé »), qui n'a pas de mot de passe.
   Comptes de démonstration, administrateurs et administrateurs junior sont exclus du code par e-mail (un e-mail piraté ne doit pas
   suffire à ouvrir un compte à privilèges). Interrupteurs d'urgence : DESACTIVER_CONFIRMATION_APPAREIL=1 (appareils reconnus) et
   DESACTIVER_CODE_EMAIL_CONNEXION=1 (code par e-mail). Toutes les fonctions reçoivent `db` (module async partagé SQLite/Postgres).
   ═══════════════════════════════════════════════════════════════════════════ */
const crypto = require('node:crypto');
const Connexions = require('./connexions');
const { horodatage } = Connexions;

const ACTIVITE_RECENTE_MS = 24 * 3600 * 1000;
const DUREE_RECONNU_MS = 30 * 24 * 3600 * 1000;
const DUREE_CODE_MS = 10 * 60 * 1000;
const MAX_ESSAIS_CODE = 3;                  // essais par code (4 chiffres : on ne laisse pas deviner)
const MAX_CODES_PAR_HEURE = 5;              // codes envoyés par compte et par heure
const MAX_CODES_BLOQUES_PAR_JOUR = 3;       // au-delà : plus aucun code pendant 24 h (et le titulaire est prévenu)
const ROLES_SANS_CODE_EMAIL = ['administrateur', 'administrateur_junior'];
const STATUTS_CODE = ['code_connexion', 'code_utilise', 'code_bloque', 'code_remplace', 'code_expire'];

const estDesactive = () => process.env.DESACTIVER_CONFIRMATION_APPAREIL === '1';
const codeEmailDesactive = () => process.env.DESACTIVER_CODE_EMAIL_CONNEXION === '1';
const estCompteDemo = (u) => Number(u.is_demo) === 1 || u.is_demo === true || /@(diaspoactif\.demo|demo\.fr)$/i.test(String(u.email || ''));

/* Ce compte peut-il se connecter par code envoyé à son e-mail ? */
function codeEmailAutorise(u) {
  if (!u || codeEmailDesactive()) return false;
  if (estCompteDemo(u) || ROLES_SANS_CODE_EMAIL.includes(u.role)) return false;
  if (u.relais_invite_expire_le || u.relais_invite_fiche_id) return false;   // accès invité temporaire : identifiants remis par un producteur, pas d'e-mail propre
  return true;
}

async function estReconnu(db, userId, appareilId) {
  if (!appareilId) return false;
  const r = await db.prepare('SELECT expire_at FROM appareils_reconnus WHERE user_id=? AND appareil_id=?').all(userId, appareilId);
  const now = horodatage();
  return r.some(x => !x.expire_at || String(x.expire_at) > now);
}

async function reconnaitre(db, userId, appareilId, via) {
  if (!appareilId) return;
  await db.prepare('DELETE FROM appareils_reconnus WHERE user_id=? AND appareil_id=?').run(userId, appareilId);
  await db.prepare('INSERT INTO appareils_reconnus (user_id, appareil_id, via, confirme_at, expire_at) VALUES (?,?,?,?,?)')
    .run(userId, appareilId, via, horodatage(), horodatage(DUREE_RECONNU_MS));
  try { await db.prepare('DELETE FROM appareils_reconnus WHERE expire_at < ?').run(horodatage(-24 * 3600 * 1000)); } catch (_) {}
}

/* Entrée par DS-ID seul (sans mot de passe) : cet appareil est-il déjà connu ? Renvoie :
   { ok:true }      -> on peut ouvrir la session
   { requis:true }  -> le compte est déjà ouvert ailleurs (même catégorie d'appareil) et celui-ci n'a jamais servi à se connecter :
                       il faut d'abord se connecter depuis la page de connexion (mot de passe, ou code reçu par e-mail). */
async function evaluer(db, { req, user, ip }) {
  if (estDesactive() || estCompteDemo(user)) return { ok: true };
  const appareilId = Connexions.lireAppareilId(req);
  if (appareilId && await estReconnu(db, user.id, appareilId)) return { ok: true };

  const lignes = await db.prepare('SELECT appareil_id, last_seen_at, expire_at, type_appareil FROM connexions WHERE user_id=? AND revoque_at IS NULL').all(user.id);
  const maintenant = horodatage(), limite = horodatage(-ACTIVITE_RECENTE_MS);
  const maCategorie = Connexions.categorieDe(Connexions.analyserAppareil(req, ip).type);
  /* Un ordinateur et un téléphone peuvent être connectés ensemble au même compte : seul un autre appareil de la MÊME catégorie compte. */
  const autresActives = lignes.filter(l => l.appareil_id !== appareilId
    && Connexions.categorieDe(l.type_appareil) === maCategorie
    && (!l.expire_at || String(l.expire_at) >= maintenant) && String(l.last_seen_at || '') >= limite);
  return autresActives.length ? { requis: true } : { ok: true };
}

/* Le DS-ID saisi est-il celui du compte, ou d'un compte du même groupe de liaison ? (changement d'appareil principal) */
async function dsIdValide(db, userId, saisie) {
  const valeur = String(saisie || '').trim().toUpperCase();
  if (valeur.length < 6 || valeur.length > 30) return false;
  const cible = await db.prepare('SELECT id FROM users WHERE ds_id=?').get(valeur);
  if (!cible) return false;
  if (Number(cible.id) === Number(userId)) return true;
  const a = await db.prepare('SELECT groupe_id FROM comptes_lies_membres WHERE user_id=?').get(userId);
  const b = await db.prepare('SELECT groupe_id FROM comptes_lies_membres WHERE user_id=?').get(cible.id);
  return !!(a && b && Number(a.groupe_id) === Number(b.groupe_id));
}

function hacherCode(defiId, code) {
  return crypto.createHash('sha256').update(`${defiId}:${String(code).trim()}`).digest('hex');
}
function egalSur(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ── Code provisoire envoyé par e-mail ─────────────────────────────────────────────────────────
   Étape 1 : prépare un code pour CE navigateur (cookie da_dev, créé s'il n'existe pas). Renvoie :
     { code, appareilId, nouveauCookie, appareil, lieu }  -> à envoyer par e-mail
     { limite:true }                                      -> déjà 5 codes cette heure pour ce compte
     { verrouille:true }                                  -> 3 codes bloqués en 24 h : plus de code avant demain
   Le code n'est valable que depuis le navigateur qui l'a demandé : qui lit l'e-mail sur un autre appareil ne peut pas s'en servir
   sans avoir aussi demandé le code depuis celui-là. */
async function demanderCodeConnexion(db, { req, user, ip }) {
  let appareilId = Connexions.lireAppareilId(req);
  const nouveauCookie = !appareilId;
  if (!appareilId) appareilId = Connexions.nouvelAppareilId();

  const bloques = await db.prepare("SELECT COUNT(*) AS n FROM confirmations_appareil WHERE user_id=? AND statut='code_bloque' AND resolu_at > ?")
    .get(user.id, horodatage(-24 * 3600 * 1000));
  if (Number(bloques && bloques.n || 0) >= MAX_CODES_BLOQUES_PAR_JOUR) return { verrouille: true };
  const recents = await db.prepare(`SELECT COUNT(*) AS n FROM confirmations_appareil WHERE user_id=? AND created_at > ? AND statut IN (${STATUTS_CODE.map(() => '?').join(',')})`)
    .get(user.id, horodatage(-3600 * 1000), ...STATUTS_CODE);
  if (Number(recents && recents.n || 0) >= MAX_CODES_PAR_HEURE) return { limite: true };

  /* Un seul code valable à la fois pour ce navigateur : le précédent est annulé. */
  await db.prepare("UPDATE confirmations_appareil SET statut='code_remplace', resolu_at=? WHERE user_id=? AND appareil_id=? AND statut='code_connexion'")
    .run(horodatage(), user.id, appareilId);

  const a = Connexions.analyserAppareil(req, ip);
  const id = crypto.randomBytes(16).toString('hex');
  const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  await db.prepare(`INSERT INTO confirmations_appareil
    (id, user_id, appareil_id, type_appareil, navigateur, os, ville, pays, ip_masquee, statut, essais, envois_email, code_email_hash, code_email_expire, created_at, expire_at)
    VALUES (?,?,?,?,?,?,?,?,?, 'code_connexion', 0, 1, ?, ?, ?, ?)`)
    .run(id, user.id, appareilId, a.type, a.navigateur, a.os, a.ville, a.pays, a.ipMasquee, hacherCode(id, code), horodatage(DUREE_CODE_MS), horodatage(), horodatage(DUREE_CODE_MS));
  return {
    code, appareilId, nouveauCookie,
    appareil: Connexions.etiquette({ type_appareil: a.type, navigateur: a.navigateur, os: a.os }),
    lieu: [a.ville, a.pays].filter(Boolean).join(', '),
  };
}

/* Étape 2 : le code saisi est-il le bon ? Le compteur d'essais est incrémenté EN BASE avant toute comparaison (UPDATE atomique) : des
   requêtes lancées en parallèle ne peuvent donc pas multiplier les essais. Renvoie { ok:true } | { ok:false, restants } | { ok:false, bloque:true }
   | { ok:false } (aucun code en cours pour ce navigateur, ou code expiré). */
async function verifierCodeConnexion(db, { req, user, saisie }) {
  const appareilId = Connexions.lireAppareilId(req);
  if (!appareilId) return { ok: false };
  const d = await db.prepare("SELECT * FROM confirmations_appareil WHERE user_id=? AND appareil_id=? AND statut='code_connexion' ORDER BY created_at DESC LIMIT 1")
    .get(user.id, appareilId);
  if (!d) return { ok: false };
  if (String(d.code_email_expire || d.expire_at) <= horodatage()) {
    await db.prepare("UPDATE confirmations_appareil SET statut='code_expire', resolu_at=? WHERE id=? AND statut='code_connexion'").run(horodatage(), d.id);
    return { ok: false };
  }
  await db.prepare("UPDATE confirmations_appareil SET essais=COALESCE(essais,0)+1 WHERE id=? AND statut='code_connexion'").run(d.id);
  const apres = await db.prepare('SELECT essais, statut FROM confirmations_appareil WHERE id=?').get(d.id);
  const essais = Number(apres && apres.essais || 0);
  if (!apres || apres.statut !== 'code_connexion' || essais > MAX_ESSAIS_CODE) return { ok: false, bloque: true };

  const bon = /^\d{4}$/.test(String(saisie || '').trim()) && egalSur(d.code_email_hash, hacherCode(d.id, saisie));
  if (bon) {
    await db.prepare("UPDATE confirmations_appareil SET statut='code_utilise', resolu_at=? WHERE id=? AND statut='code_connexion'").run(horodatage(), d.id);
    return { ok: true };
  }
  if (essais >= MAX_ESSAIS_CODE) {
    await db.prepare("UPDATE confirmations_appareil SET statut='code_bloque', resolu_at=? WHERE id=? AND statut='code_connexion'").run(horodatage(), d.id);
    return { ok: false, bloque: true, restants: 0 };
  }
  return { ok: false, restants: MAX_ESSAIS_CODE - essais };
}

/* Vue « Mes connexions » : demandes d'appareil encore en attente (héritage : plus créées depuis le 2026-11-04) + incidents des 30 derniers jours
   (connexions refusées, ou codes e-mail bloqués après trois essais ratés). */
async function enAttente(db, userId) {
  const lignes = await db.prepare("SELECT * FROM confirmations_appareil WHERE user_id=? AND statut='en_attente' AND expire_at > ? ORDER BY created_at DESC").all(userId, horodatage());
  return lignes.map(d => ({
    id: d.id, etiquette: Connexions.etiquette(d),
    lieu: [d.ville, d.pays].filter(Boolean).join(', '), ip: d.ip_masquee || '', demande_a: d.created_at,
  }));
}
async function incidents30j(db, userId) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM confirmations_appareil WHERE user_id=? AND statut IN ('refusee','bloquee','code_bloque') AND resolu_at > ?")
    .get(userId, horodatage(-30 * 24 * 3600 * 1000));
  return Number(r && r.n || 0);
}

/* Le titulaire déclare « ce n'est pas moi » sur une demande d'appareil encore en attente (héritage). */
async function refuser(db, userId, defiId) {
  const d = await db.prepare("SELECT * FROM confirmations_appareil WHERE id=? AND user_id=? AND statut='en_attente'").get(defiId, userId);
  if (!d) return false;
  await db.prepare("UPDATE confirmations_appareil SET statut='refusee', resolu_at=? WHERE id=?").run(horodatage(), d.id);
  return true;
}

module.exports = {
  MAX_ESSAIS_CODE, MAX_CODES_PAR_HEURE, MAX_CODES_BLOQUES_PAR_JOUR, DUREE_CODE_MS,
  estDesactive, codeEmailDesactive, estCompteDemo, codeEmailAutorise, estReconnu, reconnaitre, evaluer, dsIdValide,
  demanderCodeConnexion, verifierCodeConnexion, enAttente, incidents30j, refuser,
};
