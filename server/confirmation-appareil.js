/* ═══════════════════════════════════════════════════════════════════════════
   Confirmation d'un nouvel appareil (2026-10-05, étape 2 — voir le commentaire des tables
   confirmations_appareil / appareils_reconnus dans db.js).

   Règle : bon mot de passe + appareil inconnu + compte déjà ouvert ailleurs (activité < 24 h)
   => pas de session, un « défi » à résoudre par DS-ID (compte ou compte lié) ou code e-mail.
   Un appareil confirmé est reconnu 30 jours. Comptes de démonstration exemptés (partagés par
   conception). Interrupteur d'urgence : variable d'environnement DESACTIVER_CONFIRMATION_APPAREIL=1.
   Toutes les fonctions reçoivent `db` (module async partagé SQLite/Postgres).
   ═══════════════════════════════════════════════════════════════════════════ */
const crypto = require('node:crypto');
const Connexions = require('./connexions');
const { horodatage } = Connexions;

const ACTIVITE_RECENTE_MS = 24 * 3600 * 1000;
const DUREE_DEFI_MS = 10 * 60 * 1000;
const DUREE_CODE_EMAIL_MS = 10 * 60 * 1000;
const VERROU_MS = 15 * 60 * 1000;
const DUREE_RECONNU_MS = 30 * 24 * 3600 * 1000;
const MAX_ESSAIS = 5;
const MAX_ENVOIS_EMAIL = 3;
const DEFI_RE = /^[a-f0-9]{32}$/;

const estDesactive = () => process.env.DESACTIVER_CONFIRMATION_APPAREIL === '1';
const estCompteDemo = (u) => Number(u.is_demo) === 1 || u.is_demo === true || /@(diaspoactif\.demo|demo\.fr)$/i.test(String(u.email || ''));

async function estReconnu(db, userId, appareilId) {
  if (!appareilId) return false;
  const r = await db.prepare('SELECT expire_at FROM appareils_reconnus WHERE user_id=? AND appareil_id=?').all(userId, appareilId);
  const now = horodatage();
  return r.some(x => !x.expire_at || String(x.expire_at) > now);
}

async function reconnaitre(db, userId, appareilId, via) {
  await db.prepare('DELETE FROM appareils_reconnus WHERE user_id=? AND appareil_id=?').run(userId, appareilId);
  await db.prepare('INSERT INTO appareils_reconnus (user_id, appareil_id, via, confirme_at, expire_at) VALUES (?,?,?,?,?)')
    .run(userId, appareilId, via, horodatage(), horodatage(DUREE_RECONNU_MS));
  try { await db.prepare('DELETE FROM appareils_reconnus WHERE expire_at < ?').run(horodatage(-24 * 3600 * 1000)); } catch (_) {}
}

/* Faut-il un défi pour cette connexion ? Renvoie :
   { ok:true }                                  -> on peut ouvrir la session normalement
   { bloque:true, reessayerDans }               -> trop de tentatives récentes depuis cet appareil
   { defi, appareilId, nouveauCookie }          -> défi à résoudre (créé ou repris) */
async function evaluer(db, { req, user, ip, notifier, creerDefi = true }) {
  if (estDesactive() || estCompteDemo(user)) return { ok: true };
  let appareilId = Connexions.lireAppareilId(req);
  if (appareilId && await estReconnu(db, user.id, appareilId)) return { ok: true };

  const lignes = await db.prepare('SELECT appareil_id, last_seen_at, expire_at, type_appareil, navigateur, os FROM connexions WHERE user_id=? AND revoque_at IS NULL').all(user.id);
  const maintenant = horodatage(), limite = horodatage(-ACTIVITE_RECENTE_MS);
  const autresActives = lignes.filter(l => l.appareil_id !== appareilId
    && (!l.expire_at || String(l.expire_at) >= maintenant) && String(l.last_seen_at || '') >= limite);
  if (!autresActives.length) return { ok: true };
  if (!creerDefi) return { requis: true };   // entrée sans mot de passe (DS-ID seul) : on n'ouvre pas de défi, on renvoie vers la page de connexion

  const nouveauCookie = !appareilId;
  if (!appareilId) appareilId = Connexions.nouvelAppareilId();

  const verrou = await db.prepare("SELECT resolu_at FROM confirmations_appareil WHERE user_id=? AND appareil_id=? AND statut IN ('refusee','bloquee') AND resolu_at > ? ORDER BY resolu_at DESC LIMIT 1")
    .get(user.id, appareilId, horodatage(-VERROU_MS));
  if (verrou) {
    const fin = new Date(String(verrou.resolu_at).replace(' ', 'T') + 'Z').getTime() + VERROU_MS;
    return { bloque: true, reessayerDans: Math.max(60, Math.ceil((fin - Date.now()) / 1000)) };
  }

  let defi = await db.prepare("SELECT * FROM confirmations_appareil WHERE user_id=? AND appareil_id=? AND statut='en_attente' AND expire_at > ? ORDER BY created_at DESC LIMIT 1")
    .get(user.id, appareilId, maintenant);
  if (!defi) {
    const a = Connexions.analyserAppareil(req, ip);
    const id = crypto.randomBytes(16).toString('hex');
    await db.prepare(`INSERT INTO confirmations_appareil
      (id, user_id, appareil_id, type_appareil, navigateur, os, ville, pays, ip_masquee, statut, essais, envois_email, created_at, expire_at)
      VALUES (?,?,?,?,?,?,?,?,?, 'en_attente', 0, 0, ?, ?)`)
      .run(id, user.id, appareilId, a.type, a.navigateur, a.os, a.ville, a.pays, a.ipMasquee, horodatage(), horodatage(DUREE_DEFI_MS));
    defi = await db.prepare('SELECT * FROM confirmations_appareil WHERE id=?').get(id);
    if (notifier) { try { await notifier(defi); } catch (_) { /* l'alerte est best-effort */ } }
  }
  /* Où le compte est-il déjà ouvert ? Affiché dans la fenêtre de confirmation pour que la personne comprenne de quel appareil on parle
     (type, système, navigateur, ancienneté — jamais la ville ni l'adresse IP). */
  const autres = autresActives.map(l => {
    const t = new Date(String(l.last_seen_at || '').replace(' ', 'T') + 'Z').getTime();
    return { libelle: Connexions.etiquette(l), il_y_a_min: isNaN(t) ? null : Math.max(0, Math.round((Date.now() - t) / 60000)) };
  });
  return { defi, appareilId, nouveauCookie, autres };
}

/* Charge un défi en vérifiant qu'il est actionnable depuis CE navigateur. */
async function charger(db, req, defiId) {
  if (!DEFI_RE.test(String(defiId || ''))) return { erreur: 'Demande de confirmation invalide.', code: 400 };
  const d = await db.prepare('SELECT * FROM confirmations_appareil WHERE id=?').get(defiId);
  if (!d) return { erreur: 'Demande de confirmation introuvable.', code: 404 };
  if (Connexions.lireAppareilId(req) !== d.appareil_id) return { erreur: 'Cette demande a été ouverte depuis un autre navigateur.', code: 403 };
  if (d.statut === 'refusee') return { erreur: 'Cette connexion a été refusée par le titulaire du compte.', code: 403 };
  if (d.statut === 'bloquee') return { erreur: 'Trop d\'essais. Réessayez dans 15 minutes.', code: 429 };
  if (d.statut !== 'en_attente') return { erreur: 'Cette demande a déjà été traitée.', code: 409 };
  if (String(d.expire_at) <= horodatage()) {
    await db.prepare("UPDATE confirmations_appareil SET statut='expiree', resolu_at=? WHERE id=?").run(horodatage(), d.id);
    return { erreur: 'La demande a expiré : reconnectez-vous.', code: 410 };
  }
  return { defi: d };
}

async function compterEchec(db, d) {
  const essais = Number(d.essais || 0) + 1;
  if (essais >= MAX_ESSAIS) {
    await db.prepare("UPDATE confirmations_appareil SET essais=?, statut='bloquee', resolu_at=? WHERE id=?").run(essais, horodatage(), d.id);
    return { restants: 0, bloque: true };
  }
  await db.prepare('UPDATE confirmations_appareil SET essais=? WHERE id=?').run(essais, d.id);
  return { restants: MAX_ESSAIS - essais, bloque: false };
}

/* Le DS-ID saisi est-il celui du compte du défi, ou d'un compte du même groupe de liaison ? */
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

/* Génère et mémorise un code à 6 chiffres pour ce défi ; renvoie le code en clair (à envoyer par e-mail). */
async function preparerCodeEmail(db, d) {
  if (Number(d.envois_email || 0) >= MAX_ENVOIS_EMAIL) return { erreur: 'Nombre maximal de codes envoyés pour cette demande.', code: 429 };
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await db.prepare('UPDATE confirmations_appareil SET code_email_hash=?, code_email_expire=?, envois_email=? WHERE id=?')
    .run(hacherCode(d.id, code), horodatage(DUREE_CODE_EMAIL_MS), Number(d.envois_email || 0) + 1, d.id);
  return { code };
}

function codeEmailValide(d, saisie) {
  if (!d.code_email_hash || !d.code_email_expire || String(d.code_email_expire) < horodatage()) return false;
  if (!/^\d{6}$/.test(String(saisie || '').trim())) return false;
  return egalSur(d.code_email_hash, hacherCode(d.id, saisie));
}

async function valider(db, d, via) {
  await db.prepare("UPDATE confirmations_appareil SET statut='confirmee', resolu_at=? WHERE id=?").run(horodatage(), d.id);
  await reconnaitre(db, d.user_id, d.appareil_id, via);
}

/* Vue « sur l'appareil déjà connecté » : demandes en attente + incidents des 30 derniers jours. */
async function enAttente(db, userId) {
  const lignes = await db.prepare("SELECT * FROM confirmations_appareil WHERE user_id=? AND statut='en_attente' AND expire_at > ? ORDER BY created_at DESC").all(userId, horodatage());
  return lignes.map(d => ({
    id: d.id, etiquette: Connexions.etiquette(d),
    lieu: [d.ville, d.pays].filter(Boolean).join(', '), ip: d.ip_masquee || '', demande_a: d.created_at,
  }));
}
async function incidents30j(db, userId) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM confirmations_appareil WHERE user_id=? AND statut IN ('refusee','bloquee') AND resolu_at > ?")
    .get(userId, horodatage(-30 * 24 * 3600 * 1000));
  return Number(r && r.n || 0);
}

/* Le titulaire déclare « ce n'est pas moi » depuis un appareil déjà connecté. */
async function refuser(db, userId, defiId) {
  const d = await db.prepare("SELECT * FROM confirmations_appareil WHERE id=? AND user_id=? AND statut='en_attente'").get(defiId, userId);
  if (!d) return false;
  await db.prepare("UPDATE confirmations_appareil SET statut='refusee', resolu_at=? WHERE id=?").run(horodatage(), d.id);
  return true;
}

function masquerEmail(email) {
  const [nom, domaine] = String(email || '').split('@');
  if (!domaine) return '';
  return (nom.length <= 2 ? nom[0] + '*' : nom.slice(0, 2) + '***') + '@' + domaine;
}

module.exports = {
  MAX_ESSAIS, estDesactive, estCompteDemo, estReconnu, evaluer, charger, compterEchec, dsIdValide,
  preparerCodeEmail, codeEmailValide, valider, enAttente, incidents30j, refuser, masquerEmail,
};
