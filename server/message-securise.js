/* ════════════════════════════════════════════════════════════════════════════════════════════
   Message sécurisé (2026-11-01, demande explicite).

   Dans la messagerie, l'expéditeur peut « sécuriser » un message : le destinataire doit saisir SON DS-ID
   (Code de Sécurité Diaspo'Actif, users.ds_id) pour le lire. Il est alors lisible 2 minutes, puis DÉTRUIT.

   Règles :
   • Le texte n'est JAMAIS dans la table messages : on y met seulement le marqueur « 🔒 Message sécurisé » (type='securise'),
     si bien qu'aucune surface existante (liste des conversations, recherche, favoris, épinglés, notifications, e-mails,
     sauvegarde JSON) ne peut le révéler. Le vrai texte vit chiffré (AES-256-GCM) dans messages_securises.
   • Le décompte est CÔTÉ SERVEUR : le texte est remis à la saisie du bon DS-ID, avec une fin fixée à +2 min. Passé ce délai,
     plus aucune route ne le remet, et le texte chiffré est effacé (détruit pour de bon). Recharger la page ne prolonge rien.
   • Seul le DS-ID du destinataire lui-même est accepté (pas celui d'un compte lié). 3 erreurs → 5 minutes de blocage, compté
     par COMPTE (le DS-ID est le même pour tous ses messages, un blocage par message serait contournable).
   • Un message jamais ouvert est détruit après 30 jours. Un message supprimé par son expéditeur (fenêtre de 10 min) est détruit.
   • L'expéditeur ne peut pas relire son message ; il voit seulement l'état (non ouvert / ouvert le… / détruit).
   • Pièces jointes volontairement exclues de cette première version (texte seulement).

   Clé de chiffrement : MESSAGES_SECURISES_CLE (64 caractères hexadécimaux) ; à défaut, dérivée de AUTH_SECRET. Changer cette clé
   rend illisibles les messages encore fermés — la définir une fois pour toutes dans l'hébergeur.
   Ce n'est pas du chiffrement de bout en bout : le serveur peut déchiffrer au moment de la remise. Il protège contre une fuite
   de la base ou d'une sauvegarde, pas contre le serveur lui-même.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
const crypto = require('node:crypto');

const DUREE_LECTURE_MS = 2 * 60 * 1000;
const NON_OUVERT_JOURS = 30;
const MAX_CARACTERES = 4000;
const MAX_ESSAIS = 3;
const VERROU_MS = 5 * 60 * 1000;
const PURGE_INTERVALLE_MS = 20 * 1000;
const MARQUEUR = '🔒 Message sécurisé';

let _cle = null;
function cle() {
  if (_cle) return _cle;
  const brut = process.env.MESSAGES_SECURISES_CLE;
  if (brut && /^[0-9a-f]{64}$/i.test(brut)) {
    _cle = Buffer.from(brut, 'hex');
  } else {
    const graine = brut || process.env.AUTH_SECRET || 'diaspoactif-messages-securises-local';
    if (!process.env.MESSAGES_SECURISES_CLE && (process.env.VERCEL || process.env.NODE_ENV === 'production'))
      console.warn('[message-securise] MESSAGES_SECURISES_CLE absente : clé dérivée de AUTH_SECRET. Définissez MESSAGES_SECURISES_CLE (64 hex).');
    _cle = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(String(graine)), Buffer.from('diaspoactif'), Buffer.from('messages-securises-v1'), 32));
  }
  return _cle;
}

/* Le texte chiffré est lié au message ET à son destinataire (données associées authentifiées) : copié sur une autre ligne, il ne se déchiffre plus. */
const aad = (messageId, destinataireId) => Buffer.from(`ms:${Number(messageId)}:${Number(destinataireId)}`);

function chiffrer(texte, donneesAssociees) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cle(), iv);
  c.setAAD(donneesAssociees);
  const chiffre = Buffer.concat([c.update(String(texte), 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), chiffre: chiffre.toString('base64') };
}
function dechiffrer(ligne, donneesAssociees) {
  const d = crypto.createDecipheriv('aes-256-gcm', cle(), Buffer.from(ligne.iv, 'base64'));
  d.setAAD(donneesAssociees);
  d.setAuthTag(Buffer.from(ligne.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ligne.chiffre, 'base64')), d.final()]).toString('utf8');
}

const maintenant = () => new Date().toISOString();
const dans = (ms) => new Date(Date.now() + ms).toISOString();
const versMs = (iso) => (iso ? Date.parse(iso instanceof Date ? iso.toISOString() : String(iso)) : NaN);
const num = (v) => Number(v);

/* DS-ID : on ne garde que lettres et chiffres, en majuscules (la personne peut le taper avec espaces ou tirets). */
const normaliser = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function memeChaine(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const formatParis = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/* ── Destruction ──────────────────────────────────────────────────────────────────────────── */
async function detruire(db, messageId, motif) {
  await db.prepare('UPDATE messages_securises SET iv=NULL, tag=NULL, chiffre=NULL, detruit_le=?, detruit_motif=? WHERE message_id=? AND detruit_le IS NULL')
    .run(maintenant(), motif, num(messageId));
}

/* Motif de destruction dû à l'instant présent (ou null si le message est encore vivant). */
function echeance(ligne) {
  if (ligne.detruit_le) return null;
  const t = Date.now();
  if (ligne.expire_le && t >= versMs(ligne.expire_le)) return 'expire_lecture';
  if (!ligne.ouvert_le && t >= versMs(ligne.cree_le) + NON_OUVERT_JOURS * 86400000) return 'non_ouvert';
  return null;
}
async function appliquerEcheance(db, ligne) {
  const motif = echeance(ligne);
  if (motif) { await detruire(db, ligne.message_id, motif); ligne.detruit_le = maintenant(); ligne.detruit_motif = motif; ligne.iv = ligne.tag = ligne.chiffre = null; }
  return ligne;
}

/* Effacement physique de tout ce qui est échu, même si personne n'a rouvert la conversation. Limité à un passage toutes les 20 s par processus. */
let dernierePurge = 0;
async function purger(db, forcer) {
  const t = Date.now();
  if (!forcer && t - dernierePurge < PURGE_INTERVALLE_MS) return 0;
  dernierePurge = t;
  const maint = maintenant(), limiteNonOuvert = new Date(t - NON_OUVERT_JOURS * 86400000).toISOString();
  const eff = "iv=NULL, tag=NULL, chiffre=NULL, detruit_le=?, detruit_motif=?";
  const r1 = await db.prepare(`UPDATE messages_securises SET ${eff} WHERE detruit_le IS NULL AND expire_le IS NOT NULL AND expire_le <= ?`).run(maint, 'expire_lecture', maint);
  const r2 = await db.prepare(`UPDATE messages_securises SET ${eff} WHERE detruit_le IS NULL AND ouvert_le IS NULL AND cree_le <= ?`).run(maint, 'non_ouvert', limiteNonOuvert);
  const r3 = await db.prepare(`UPDATE messages_securises SET ${eff} WHERE detruit_le IS NULL AND message_id IN (SELECT id FROM messages WHERE deleted=1)`).run(maint, 'supprime_par_expediteur');
  return [r1, r2, r3].reduce((n, r) => n + (Number(r && r.changes) || 0), 0);
}

/* ── Verrou de saisie, par compte ─────────────────────────────────────────────────────────── */
async function verrouActif(db, uid) {
  const v = await db.prepare('SELECT essais, verrou_jusqua FROM messages_securises_verrous WHERE user_id=?').get(num(uid));
  return v && v.verrou_jusqua && Date.now() < versMs(v.verrou_jusqua) ? v : null;
}
async function noterEchec(db, uid) {
  const v = await db.prepare('SELECT essais FROM messages_securises_verrous WHERE user_id=?').get(num(uid));
  const essais = (v ? num(v.essais) || 0 : 0) + 1;
  const verrouille = essais >= MAX_ESSAIS;
  const nouveauxEssais = verrouille ? 0 : essais, verrou = verrouille ? dans(VERROU_MS) : null;
  if (v) await db.prepare('UPDATE messages_securises_verrous SET essais=?, verrou_jusqua=? WHERE user_id=?').run(nouveauxEssais, verrou, num(uid));
  else await db.prepare('INSERT INTO messages_securises_verrous (user_id, essais, verrou_jusqua) VALUES (?,?,?)').run(num(uid), nouveauxEssais, verrou);
  return { verrouille, restants: Math.max(0, MAX_ESSAIS - essais) };
}
async function noterReussite(db, uid) {
  await db.prepare('UPDATE messages_securises_verrous SET essais=0, verrou_jusqua=NULL WHERE user_id=?').run(num(uid));
}

/* ── État visible (jamais de texte ni de matériel chiffré) ─────────────────────────────────── */
function etatPublic(ligne, uid, supprime) {
  const detruit = !!ligne.detruit_le || !!supprime;
  const statut = detruit ? 'detruit' : (ligne.ouvert_le ? 'ouvert' : 'ferme');
  const restantes = statut === 'ouvert' ? Math.max(0, Math.ceil((versMs(ligne.expire_le) - Date.now()) / 1000)) : 0;
  return {
    statut,
    est_destinataire: num(ligne.destinataire_id) === num(uid),
    ouvert_le: ligne.ouvert_le || null,
    detruit_le: detruit ? (ligne.detruit_le || maintenant()) : null,
    secondes_restantes: restantes,
  };
}

/* Ajoute à chaque message de type « securise » d'une liste son état (appelé par GET /api/conversations/:id/messages). */
async function enrichir(db, messages, uid) {
  const securises = (messages || []).filter(m => m.type === 'securise');
  if (!securises.length) return;
  await purger(db);
  const ids = securises.map(m => num(m.id));
  const lignes = await db.prepare(`SELECT message_id, conversation_id, expediteur_id, destinataire_id, cree_le, ouvert_le, expire_le, detruit_le, detruit_motif FROM messages_securises WHERE message_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const parId = new Map(lignes.map(l => [num(l.message_id), l]));
  for (const m of securises) {
    const l = parId.get(num(m.id));
    if (!l) { m.securise = { statut: 'detruit', est_destinataire: false, secondes_restantes: 0 }; continue; }
    await appliquerEcheance(db, l);
    m.securise = etatPublic(l, uid, !!m.deleted);
  }
}

function register({ route, db, sendJSON, getCurrentUser, creerNotif, SEC, contactBloque, peutEcrireDirectement, nomCompteAffichage }) {
  const limiter = (req, res, uid, nom, max, fenetreMs) => {
    const r = SEC.rateLimit(`ms:${nom}:${uid}:${SEC.clientIp(req)}`, max, fenetreMs);
    if (!r.allowed) { sendJSON(res, 429, { error: 'Trop de tentatives, réessayez dans quelques instants.' }); return false; }
    return true;
  };
  const sansCache = (res) => { try { res.setHeader('Cache-Control', 'no-store'); } catch (_) { /* en-têtes déjà partis */ } };

  /* Ligne du message sécurisé + vérification d'appartenance (sinon « introuvable », sans rien dire de plus). */
  async function charger(user, messageId, { destinataireSeul }) {
    const ligne = await db.prepare('SELECT * FROM messages_securises WHERE message_id=?').get(num(messageId));
    if (!ligne) return null;
    const estDest = num(ligne.destinataire_id) === num(user.id), estExp = num(ligne.expediteur_id) === num(user.id);
    if (destinataireSeul ? !estDest : !(estDest || estExp)) return null;
    const msg = await db.prepare('SELECT id, deleted FROM messages WHERE id=?').get(num(messageId));
    if (!msg) return null;
    if (msg.deleted && !ligne.detruit_le) { await detruire(db, messageId, 'supprime_par_expediteur'); ligne.detruit_le = maintenant(); ligne.iv = ligne.tag = ligne.chiffre = null; }
    await appliquerEcheance(db, ligne);
    return ligne;
  }

  /* Envoi d'un message sécurisé dans une conversation existante. */
  route('POST', '/api/conversations/:id/messages-securises', async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
    if (!limiter(req, res, user.id, 'envoi', 20, 60 * 1000)) return;

    const conv = await db.prepare('SELECT * FROM conversations WHERE id = ?').get(params.id);
    if (!conv || (num(conv.user1_id) !== num(user.id) && num(conv.user2_id) !== num(user.id))) return sendJSON(res, 403, { error: 'Accès refusé.' });
    const autreId = num(conv.user1_id) === num(user.id) ? num(conv.user2_id) : num(conv.user1_id);

    /* Mêmes garde-fous que l'envoi d'un message ordinaire (blocage, lien de contact actif). */
    if (await contactBloque(user.id, autreId)) return sendJSON(res, 403, { code: 'contact_bloque', error: "Aucun échange n'est possible avec ce compte." });
    if (conv.contexte !== 'vitrine' && conv.contexte !== 'formation' && !(await peutEcrireDirectement(user, autreId)))
      return sendJSON(res, 403, { code: 'contact_requis', error: "Vous n'êtes plus en contact avec ce compte. Envoyez une nouvelle demande pour reprendre l'échange.", destinataire_id: autreId });

    const texte = String(body && body.contenu || '').trim();
    if (!texte) return sendJSON(res, 400, { error: 'Message vide.' });
    if (texte.length > MAX_CARACTERES) return sendJSON(res, 400, { error: `Un message sécurisé ne peut pas dépasser ${MAX_CARACTERES} caractères.` });

    const id = num((await db.prepare('INSERT INTO messages (conversation_id, sender_id, contenu, type) VALUES (?, ?, ?, ?)').run(conv.id, user.id, MARQUEUR, 'securise')).lastInsertRowid);
    try {
      const c = chiffrer(texte, aad(id, autreId));
      await db.prepare('INSERT INTO messages_securises (message_id, conversation_id, expediteur_id, destinataire_id, iv, tag, chiffre, cree_le) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, num(conv.id), num(user.id), autreId, c.iv, c.tag, c.chiffre, maintenant());
    } catch (e) {
      await db.prepare('DELETE FROM messages WHERE id=?').run(id);   // jamais de marqueur sans texte derrière
      throw e;
    }

    if (num(conv.user1_id) === num(user.id) && conv.deleted_u2) await db.prepare('UPDATE conversations SET deleted_u2=0 WHERE id=?').run(conv.id);
    if (num(conv.user2_id) === num(user.id) && conv.deleted_u1) await db.prepare('UPDATE conversations SET deleted_u1=0 WHERE id=?').run(conv.id);
    try { await creerNotif(autreId, 'message', 'Nouveau message sécurisé', `${await nomCompteAffichage(user.id)} vous a envoyé un message sécurisé`, { conversation_id: conv.id }); } catch (_) { /* notification best-effort */ }

    const msg = await db.prepare('SELECT m.*, u.nom AS sender_nom FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?').get(id);
    msg.securise = { statut: 'ferme', est_destinataire: false, ouvert_le: null, detruit_le: null, secondes_restantes: 0 };
    SEC.logSecurity('message_securise_envoye', { uid: num(user.id), mid: id });
    sendJSON(res, 201, { message: msg });
  });

  /* État (les deux parties) — jamais de texte. */
  route('GET', '/api/messages-securises/:id/etat', async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
    sansCache(res);
    await purger(db);
    const ligne = await charger(user, params.id, { destinataireSeul: false });
    if (!ligne) return sendJSON(res, 404, { error: 'Message introuvable.' });
    sendJSON(res, 200, etatPublic(ligne, user.id, false));
  });

  /* Ouverture : le destinataire saisit son DS-ID ; le texte est remis, lisible jusqu'à expire_le (fixée à la PREMIÈRE remise). */
  route('POST', '/api/messages-securises/:id/ouvrir', async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
    sansCache(res);
    if (!limiter(req, res, user.id, 'ouvrir', 30, 60 * 1000)) return;

    let ligne = await charger(user, params.id, { destinataireSeul: true });
    if (!ligne) return sendJSON(res, 404, { error: 'Message introuvable.' });
    if (ligne.detruit_le) return sendJSON(res, 410, { detruit: true, error: 'Ce message a été détruit.' });

    if (await verrouActif(db, user.id)) return sendJSON(res, 429, { error: 'Trop d\'erreurs : réessayez dans 5 minutes.' });

    const u = await db.prepare('SELECT ds_id FROM users WHERE id=?').get(num(user.id));
    if (!u || !u.ds_id) return sendJSON(res, 409, { ds_id_absent: true, error: "Vous n'avez pas encore généré votre DS-ID. Rendez-vous dans Confidentialité pour le créer, puis revenez ouvrir ce message." });

    const saisie = normaliser(body && body.ds_id);
    if (!saisie || !memeChaine(saisie, normaliser(u.ds_id))) {
      const r = await noterEchec(db, user.id);
      SEC.logSecurity(r.verrouille ? 'message_securise_verrouille' : 'message_securise_ds_id_incorrect', { uid: num(user.id), mid: num(params.id) });
      if (r.verrouille) return sendJSON(res, 429, { error: 'DS-ID incorrect trop de fois : réessayez dans 5 minutes.' });
      return sendJSON(res, 403, { error: `DS-ID incorrect (${r.restants} essai${r.restants > 1 ? 's' : ''} restant${r.restants > 1 ? 's' : ''}).`, essais_restants: r.restants });
    }
    await noterReussite(db, user.id);

    /* Première remise : fixe la fin de lecture. Les remises suivantes (page rechargée) ne prolongent RIEN. */
    const premiere = !ligne.ouvert_le;
    if (premiere) {
      await db.prepare('UPDATE messages_securises SET ouvert_le=?, expire_le=? WHERE message_id=? AND ouvert_le IS NULL').run(maintenant(), dans(DUREE_LECTURE_MS), num(params.id));
      ligne = await db.prepare('SELECT * FROM messages_securises WHERE message_id=?').get(num(params.id));
    }
    const restantes = Math.ceil((versMs(ligne.expire_le) - Date.now()) / 1000);
    if (restantes <= 0 || !ligne.chiffre) { await detruire(db, params.id, 'expire_lecture'); return sendJSON(res, 410, { detruit: true, error: 'Ce message a été détruit.' }); }

    let texte;
    try { texte = dechiffrer(ligne, aad(ligne.message_id, ligne.destinataire_id)); }
    catch (e) {
      SEC.logSecurity('message_securise_dechiffrement_impossible', { uid: num(user.id), mid: num(params.id) });
      return sendJSON(res, 500, { error: "Ce message ne peut plus être lu (clé de chiffrement modifiée)." });
    }

    await db.prepare('UPDATE messages SET lu=1 WHERE id=?').run(num(params.id));
    if (premiere) {
      try { await creerNotif(num(ligne.expediteur_id), 'message', 'Message sécurisé ouvert', `${await nomCompteAffichage(user.id)} a ouvert votre message sécurisé`, { conversation_id: num(ligne.conversation_id) }); } catch (_) { /* best-effort */ }
      SEC.logSecurity('message_securise_ouvert', { uid: num(user.id), mid: num(params.id) });
    }
    sendJSON(res, 200, {
      contenu: texte,
      expire_le: ligne.expire_le,
      secondes_restantes: restantes,
      filigrane: `${await nomCompteAffichage(user.id)} · ${formatParis.format(new Date())} · n°${num(params.id)}`,
    });
  });

  /* « Terminer et détruire maintenant » : le destinataire peut détruire sans attendre la fin des 2 minutes (ou sans lire). */
  route('POST', '/api/messages-securises/:id/detruire', async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
    sansCache(res);
    const ligne = await charger(user, params.id, { destinataireSeul: true });
    if (!ligne) return sendJSON(res, 404, { error: 'Message introuvable.' });
    if (!ligne.detruit_le) await detruire(db, params.id, 'detruit_par_destinataire');
    SEC.logSecurity('message_securise_detruit', { uid: num(user.id), mid: num(params.id) });
    sendJSON(res, 200, { ok: true, statut: 'detruit' });
  });
}

module.exports = { register, enrichir, purger, MARQUEUR, DUREE_LECTURE_MS, _chiffrer: chiffrer, _dechiffrer: dechiffrer };
