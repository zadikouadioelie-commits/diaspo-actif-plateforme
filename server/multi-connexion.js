/* ════════════════════════════════════════════════════════════════════════════════════════════
   Connexion à plusieurs endroits à la fois — reconfirmation toutes les heures (2026-10-31, demande explicite).

   Règles (voir aussi le code secret multi-connexion, table multi_connexion de db.js) :
   • Dès qu'un compte a au moins DEUX connexions actives (registre server/connexions.js : non révoquées, non
     expirées, vues depuis moins de 24 h), TOUTE l'API est refusée (403, multi_connexion:true) tant que le titulaire
     n'a pas répondu à « Est-ce vous qui êtes connecté à plusieurs endroits ? ».
   • « Non » : les autres connexions sont déconnectées sur-le-champ (seule celle qui répond reste).
   • « Oui » : accès pendant 1 heure. La première fois, la personne crée en même temps son code secret (4 chiffres) ;
     ensuite, ce même code est redemandé à chaque reconfirmation. Passée l'heure, la question revient — même si le
     code a déjà été saisi — tant qu'il y a plusieurs connexions.
   • Le code est volontairement peu sensible : il ne permet NI de changer NI de réinitialiser le mot de passe, seulement
     de confirmer la multi-connexion. Il est donc stocké lisible (« Rendre visible » dans parametres-compte.html) et se
     change à volonté — changer le code coupe toutes les autres connexions (révocation immédiate). Limite d'essais :
     3 erreurs, puis 5 minutes de blocage.
   • Comptes de démonstration exemptés (partagés par conception), comme pour la confirmation d'appareil.
   Complète la confirmation d'un NOUVEL appareil (server/confirmation-appareil.js) : celle-ci filtre l'entrée, ce module
   s'applique ensuite, en continu, tant que plusieurs connexions coexistent.
   Interrupteur d'urgence : variable d'environnement DESACTIVER_MULTI_CONNEXION=1.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
const crypto = require('node:crypto');
const Connexions = require('./connexions');
const ConfirmationAppareil = require('./confirmation-appareil');
const { verifyAuthToken, parseCookies } = require('./auth');
const { horodatage } = Connexions;

const DUREE_OK_MS = 3600 * 1000;
const ACTIVITE_RECENTE_MS = 24 * 3600 * 1000;
const MAX_ESSAIS = 3;
const VERROU_MS = 5 * 60 * 1000;
const CACHE_MS = 5000;
const CODE_RE = /^\d{4}$/;
const EXEMPTS = [/^\/api\/auth\//, /^\/api\/multi-connexion\//, /^\/api\/stripe\//, /^\/api\/cron\//];

const estDesactive = () => process.env.DESACTIVER_MULTI_CONNEXION === '1';
const cache = new Map();   // userId -> { t, resultat } : évite une lecture du registre à CHAQUE requête d'API
const oublier = (userId) => cache.delete(Number(userId));

const memeCode = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

async function lireEtat(db, userId) {
  return (await db.prepare('SELECT code, ok_jusqua, essais, verrou_jusqua FROM multi_connexion WHERE user_id=?').get(userId)) || null;
}

/* Connexions actives du compte (celle qui interroge comprise). */
async function connexionsActives(db, userId) {
  const maintenant = horodatage(), limite = horodatage(-ACTIVITE_RECENTE_MS);
  const lignes = await db.prepare('SELECT id, type_appareil, navigateur, os, ville, pays, last_seen_at, expire_at FROM connexions WHERE user_id=? AND revoque_at IS NULL').all(userId);
  return lignes.filter(l => (!l.expire_at || String(l.expire_at) >= maintenant) && (!l.last_seen_at || String(l.last_seen_at) >= limite));
}

/* La confirmation est-elle requise pour ce compte ? Renvoie null (non) ou { code_existe, autres:[…] } (oui). */
async function evaluer(db, userId, connexionId) {
  if (estDesactive() || !userId || !connexionId) return null;
  const u = await db.prepare('SELECT email, is_demo FROM users WHERE id=?').get(userId);
  if (!u || ConfirmationAppareil.estCompteDemo(u)) return null;
  const actives = await connexionsActives(db, userId);
  if (actives.length < 2) return null;
  const etat = await lireEtat(db, userId);
  if (etat && etat.ok_jusqua && String(etat.ok_jusqua) > horodatage()) return null;
  return {
    code_existe: !!(etat && etat.code),
    autres: actives.filter(l => l.id !== connexionId).map(l => ({ appareil: Connexions.etiquette(l), ville: l.ville || null, pays: l.pays || null, vue: l.last_seen_at || null })),
  };
}

/* Garde placée devant TOUTE l'API : renvoie l'objet de réponse 403, ou null si la requête peut continuer.
   Lit le jeton signé du cookie « auth » (jti = connexion) : aucune requête supplémentaire hors cache de 5 s. */
async function garde(db, req, pathname) {
  try {
    if (estDesactive() || EXEMPTS.some(re => re.test(pathname))) return null;
    const jeton = parseCookies(req).auth;
    if (!jeton) return null;
    const p = verifyAuthToken(jeton);
    if (!p || !p.uid || !p.jti) return null;
    const uid = Number(p.uid), c = cache.get(uid);
    let requis;
    if (c && Date.now() - c.t < CACHE_MS && c.jti === p.jti) requis = c.requis;
    else {
      requis = !!(await evaluer(db, uid, p.jti));
      cache.set(uid, { t: Date.now(), requis, jti: p.jti });
    }
    if (!requis) return null;
    return { error: 'Ce compte est connecté à plusieurs endroits : confirmez que c\'est bien vous pour continuer.', multi_connexion: true };
  } catch (e) { console.error('[multi-connexion.garde]', e.message); return null; }   // jamais bloquant en cas de panne
}

function register({ route, db, sendJSON, getCurrentUser, creerNotif, SEC }) {
  const limiter = (req, res, cle) => {
    const r = SEC.rateLimit(`mc:${cle}:${SEC.clientIp(req)}`, 30, 60 * 1000);
    if (!r.allowed) { sendJSON(res, 429, { error: 'Trop de tentatives, réessayez dans quelques instants.' }); return false; }
    return true;
  };

  /* État : faut-il afficher la question ? (appelé par assets/multi-connexion.js à chaque page) */
  route('GET', '/api/multi-connexion/etat', async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 200, { requise: false });
    const ev = await evaluer(db, user.id, req._connexionId);
    if (!ev) return sendJSON(res, 200, { requise: false });
    const etat = await lireEtat(db, user.id);
    const bloque = etat && etat.verrou_jusqua && String(etat.verrou_jusqua) > horodatage();
    sendJSON(res, 200, { requise: true, code_existe: ev.code_existe, autres: ev.autres, bloque: !!bloque });
  });

  /* Réponse à la question : « non » coupe les autres connexions ; « oui » (+ code) ouvre une heure. */
  route('POST', '/api/multi-connexion/repondre', async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
    if (!limiter(req, res, 'rep')) return;
    if (!req._connexionId) return sendJSON(res, 400, { error: 'Connexion non identifiable. Reconnectez-vous.' });
    const reponse = String(body && body.reponse || '');

    if (reponse === 'non') {
      const n = await Connexions.revoquerAutres(db, user.id, req._connexionId, 'multi_connexion_refusee');
      oublier(user.id);
      SEC.logSecurity('multi_connexion_refusee', { uid: Number(user.id), deconnectees: n });
      try {
        await creerNotif(user.id, 'connexion_suspecte', 'Une autre connexion a été fermée',
          `Vous avez indiqué ne pas être connecté à plusieurs endroits : ${n} autre(s) connexion(s) ont été déconnectées. Par prudence, changez votre mot de passe.`,
          { lien: 'parametres-compte.html' });
      } catch (_) { /* notification best-effort */ }
      return sendJSON(res, 200, { ok: true, deconnectees: n });
    }

    if (reponse !== 'oui') return sendJSON(res, 400, { error: 'Réponse invalide.' });
    const code = String(body && body.code || '').trim();
    const etat = await lireEtat(db, user.id);
    if (etat && etat.verrou_jusqua && String(etat.verrou_jusqua) > horodatage())
      return sendJSON(res, 429, { error: 'Trop d\'erreurs : réessayez dans quelques minutes.' });
    if (!CODE_RE.test(code)) return sendJSON(res, 400, { error: etat && etat.code ? 'Saisissez votre code secret à 4 chiffres.' : 'Choisissez un code secret de 4 chiffres.' });

    if (etat && etat.code) {
      if (!memeCode(code, etat.code)) {
        const essais = Number(etat.essais || 0) + 1;
        if (essais >= MAX_ESSAIS) {
          await db.prepare('UPDATE multi_connexion SET essais=0, verrou_jusqua=? WHERE user_id=?').run(horodatage(VERROU_MS), user.id);
          SEC.logSecurity('multi_connexion_code_verrouille', { uid: Number(user.id) });
          return sendJSON(res, 429, { error: 'Code incorrect trop de fois : réessayez dans 5 minutes.' });
        }
        await db.prepare('UPDATE multi_connexion SET essais=? WHERE user_id=?').run(essais, user.id);
        return sendJSON(res, 403, { error: `Code incorrect (${MAX_ESSAIS - essais} essai(s) restant(s)).` });
      }
      await db.prepare('UPDATE multi_connexion SET ok_jusqua=?, essais=0, verrou_jusqua=NULL WHERE user_id=?').run(horodatage(DUREE_OK_MS), user.id);
    } else {
      /* Première confirmation : la personne crée son code en même temps. */
      await db.prepare('INSERT INTO multi_connexion (user_id, code, ok_jusqua, essais, code_cree_at, code_modifie_at) VALUES (?,?,?,0,?,?)')
        .run(user.id, code, horodatage(DUREE_OK_MS), horodatage(), horodatage());
    }
    oublier(user.id);
    sendJSON(res, 200, { ok: true, valable_jusqua: horodatage(DUREE_OK_MS) });
  });

  /* Lecture du code (bouton « Rendre visible » des paramètres de sécurité). */
  route('GET', '/api/multi-connexion/code', async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
    const etat = await lireEtat(db, user.id);
    sendJSON(res, 200, { code: etat && etat.code ? etat.code : null });
  });

  /* Création / modification du code — facile par conception ; coupe les autres connexions. */
  route('PUT', '/api/multi-connexion/code', async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
    if (!limiter(req, res, 'code')) return;
    const code = String(body && body.code || '').trim();
    if (!CODE_RE.test(code)) return sendJSON(res, 400, { error: 'Le code secret doit comporter exactement 4 chiffres.' });
    const etat = await lireEtat(db, user.id);
    if (etat) await db.prepare('UPDATE multi_connexion SET code=?, essais=0, verrou_jusqua=NULL, ok_jusqua=NULL, code_modifie_at=? WHERE user_id=?').run(code, horodatage(), user.id);
    else await db.prepare('INSERT INTO multi_connexion (user_id, code, essais, code_cree_at, code_modifie_at) VALUES (?,?,0,?,?)').run(user.id, code, horodatage(), horodatage());
    let deconnectees = 0;
    if (req._connexionId) deconnectees = await Connexions.revoquerAutres(db, user.id, req._connexionId, 'code_multi_modifie');
    oublier(user.id);
    SEC.logSecurity('multi_connexion_code_modifie', { uid: Number(user.id), deconnectees });
    sendJSON(res, 200, { ok: true, deconnectees });
  });
}

module.exports = { register, garde, evaluer, oublier };
