/* ════════════════════════════════════════════════════════════════════════════════════════════
   Accréditations simplifiées (2026-11-02, demande explicite) — module « Accréditations ».

   Parcours :
   1. Le membre ouvre le module vert « Accréditations » et clique « Faire ma demande » (Formateur, Influenceur Diaspo'Actif…).
      Il laisse trois choses : téléphone, e-mail, motif. Les informations du compte partent avec la demande.
   2. Diaspo'Actif le recontacte (hors plateforme). Aucun rendez-vous n'est géré ici.
   3. Côté administrateur : « Attribuer » → un code d'activation est généré et envoyé au compte par MESSAGE SÉCURISÉ.
      Le code ne fonctionne QUE pour ce compte (il est lié à l'identifiant du compte), une seule fois, pendant 7 jours,
      3 erreurs = blocage 10 minutes. Il n'est jamais montré à l'administrateur ni conservé en clair (haché).
   4. Le membre saisit le code dans le module : l'accréditation passe « active » (les modules passent du vert au doré).
   5. L'administrateur peut suspendre, réactiver, révoquer, renvoyer un code (l'ancien est annulé) à tout moment.

   Phase de test : tout est réservé au compte Diaspo'Actif officiel (server/acces-reserve.js). Les routes membre répondent 403 aux
   autres comptes ; les routes administrateur restent réservées à l'administrateur.
   Ajouter une accréditation = ajouter une ligne dans TYPES (libellé, description), rien d'autre.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
const crypto = require('node:crypto');
const AccesReserve = require('./acces-reserve');

const TYPES = [
  { type: 'formateur', emoji: '🎓', label: 'Formateur', description: "Déposer et vendre des formations sur Diaspo'Actif." },
  { type: 'influenceur_ida', emoji: '🎙️', label: "Influenceur Diaspo'Actif", description: "Publier des vidéos de 30 minutes à 1 heure dans la rubrique Influenceur Diaspo'Actif." },
];
const LIBELLE = Object.fromEntries(TYPES.map(t => [t.type, t]));

const CODE_VALIDITE_MS = 7 * 86400000;
const MAX_ESSAIS = 3;
const VERROU_MS = 10 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sans 0/O/1/I : lisible et dictable

const maintenant = () => new Date().toISOString();
const dans = (ms) => new Date(Date.now() + ms).toISOString();
const versMs = (iso) => (iso ? Date.parse(iso instanceof Date ? iso.toISOString() : String(iso)) : NaN);

function secret() { return process.env.ACCRED_CODE_SECRET || process.env.AUTH_SECRET || 'diaspoactif-accreditation-simple-local'; }
const normaliserCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function genererCode() {
  const o = crypto.randomBytes(8); let c = '';
  for (let i = 0; i < 8; i++) c += ALPHABET[o[i] % ALPHABET.length];
  return c;   // 8 caractères ≈ 40 bits ; affiché « XXXX-XXXX »
}
const afficherCode = (c) => c.slice(0, 4) + '-' + c.slice(4);
/* Le haché dépend du compte ET du type : le même code copié sur un autre compte ne correspond à rien. */
function hacher(code, userId, type) {
  return crypto.createHmac('sha256', secret()).update(`${Number(userId)}:${type}:${normaliserCode(code)}`).digest('hex');
}
function memeHache(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

const TEL_OK = /^[0-9 +().\-]{6,25}$/;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function register({ route, db, sendJSON, getCurrentUser, SEC, creerNotif, nomCompteAffichage, getInitiativeOfficielleId, MessageSecurise }) {
  const sansCache = (res) => { try { res.setHeader('Cache-Control', 'no-store'); } catch (_) { /* en-têtes déjà partis */ } };
  const limiter = (req, res, uid, nom, max, fenetreMs) => {
    const r = SEC.rateLimit(`acs:${nom}:${uid}:${SEC.clientIp(req)}`, max, fenetreMs);
    if (!r.allowed) { sendJSON(res, 429, { error: 'Trop de tentatives, réessayez dans quelques instants.' }); return false; }
    return true;
  };

  /* Membre : connecté ET compte de test. Sinon 401 / 403 sans rien révéler. */
  async function membre(req, res) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: 'Connexion requise.' }); return null; }
    if (!AccesReserve.ouvert(user)) { sendJSON(res, 403, { error: "Cette rubrique n'est pas encore ouverte." }); return null; }
    return user;
  }
  async function admin(req, res) {
    const user = await getCurrentUser(req);
    if (!user || user.role !== 'administrateur') { sendJSON(res, 403, { error: 'Réservé aux administrateurs.' }); return null; }
    return user;
  }

  /* État d'un membre pour un type : aucune | demande_envoyee | demande_refusee | code_a_saisir | active | suspendue | revoquee. */
  async function etatPour(userId, type) {
    const a = await db.prepare('SELECT * FROM accred_simple_attributions WHERE user_id=? AND type=?').get(Number(userId), type);
    if (a) {
      if (a.statut === 'active') return { statut: 'active', depuis: a.active_le || null };
      if (a.statut === 'suspendue') return { statut: 'suspendue', motif: a.motif || null };
      if (a.statut === 'revoquee') return { statut: 'revoquee', motif: a.motif || null };
      if (a.statut === 'code_envoye') {
        const expire = a.code_expire_le && Date.now() >= versMs(a.code_expire_le);
        return { statut: 'code_a_saisir', code_expire: !!expire, expire_le: a.code_expire_le || null };
      }
    }
    const d = await db.prepare('SELECT statut, motif_refus FROM accred_simple_demandes WHERE user_id=? AND type=? ORDER BY id DESC LIMIT 1').get(Number(userId), type);
    if (d && d.statut === 'en_attente') return { statut: 'demande_envoyee' };
    if (d && d.statut === 'refusee') return { statut: 'demande_refusee', motif: d.motif_refus || null };
    return { statut: 'aucune' };
  }

  /* Résumé pour /api/auth/me : types actifs (le menu passe au doré). null si la rubrique n'est pas ouverte à ce compte. */
  async function resume(user) {
    if (!user || !AccesReserve.ouvert(user)) return null;
    const lignes = await db.prepare("SELECT type, statut FROM accred_simple_attributions WHERE user_id=?").all(Number(user.id));
    return {
      actives: lignes.filter(l => l.statut === 'active').map(l => l.type),
      suspendues: lignes.filter(l => l.statut === 'suspendue').map(l => l.type),
    };
  }

  /* ── Côté membre ── */
  route('GET', '/api/accreditation-simple/etat', async (req, res) => {
    const user = await membre(req, res); if (!user) return;
    sansCache(res);
    const types = [];
    for (const t of TYPES) types.push({ ...t, ...(await etatPour(user.id, t.type)) });
    let u = null;
    try { u = await db.prepare('SELECT email, telephone FROM users WHERE id=?').get(Number(user.id)); } catch (_) { /* colonne facultative */ }
    sendJSON(res, 200, { types, compte: { email: (u && u.email) || user.email || '', telephone: (u && u.telephone) || '' } });
  });

  route('POST', '/api/accreditation-simple/demande', async (req, res, params, body) => {
    const user = await membre(req, res); if (!user) return;
    const type = String(body && body.type || '');
    if (!LIBELLE[type]) return sendJSON(res, 400, { error: 'Accréditation inconnue.' });
    const tel = String(body && body.telephone || '').trim(), mail = String(body && body.email || '').trim(), motif = String(body && body.motif || '').trim();
    if (!TEL_OK.test(tel)) return sendJSON(res, 400, { error: 'Indiquez un numéro de téléphone valide.' });
    if (!EMAIL_OK.test(mail) || mail.length > 160) return sendJSON(res, 400, { error: 'Indiquez une adresse e-mail valide.' });
    if (motif.length < 10) return sendJSON(res, 400, { error: 'Expliquez en quelques mots le motif de votre demande (10 caractères au moins).' });
    if (motif.length > 2000) return sendJSON(res, 400, { error: 'Le motif est trop long (2 000 caractères au plus).' });

    const etat = await etatPour(user.id, type);
    if (etat.statut === 'active') return sendJSON(res, 409, { error: 'Vous possédez déjà cette accréditation.' });
    if (etat.statut === 'demande_envoyee') return sendJSON(res, 409, { error: 'Votre demande est déjà envoyée : Diaspo\'Actif vous recontactera.' });
    if (etat.statut === 'code_a_saisir') return sendJSON(res, 409, { error: "Un code d'activation vous a déjà été envoyé : saisissez-le dans le module." });
    if (etat.statut === 'suspendue' || etat.statut === 'revoquee') return sendJSON(res, 409, { error: 'Cette accréditation a été retirée. Contactez Diaspo\'Actif.' });

    if (!limiter(req, res, user.id, 'demande', 6, 3600 * 1000)) return;   // ne compte que les demandes valides : une faute de frappe ne coûte rien
    const id = Number((await db.prepare('INSERT INTO accred_simple_demandes (user_id, type, telephone, email, motif, statut, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(Number(user.id), type, tel, mail, motif, 'en_attente', maintenant())).lastInsertRowid);
    try {
      const nom = await nomCompteAffichage(user.id);
      const admins = await db.prepare("SELECT id FROM users WHERE role='administrateur'").all();
      for (const a of admins) await creerNotif(a.id, 'validation', "Nouvelle demande d'accréditation", `${nom} demande « ${LIBELLE[type].emoji} ${LIBELLE[type].label} »`, { demande_simple_id: id });
    } catch (_) { /* la demande est enregistrée même si la notification échoue */ }
    SEC.logSecurity('accred_simple_demande', { uid: Number(user.id), type });
    sendJSON(res, 201, { ok: true, id });
  });

  route('POST', '/api/accreditation-simple/activer', async (req, res, params, body) => {
    const user = await membre(req, res); if (!user) return;
    sansCache(res);
    if (!limiter(req, res, user.id, 'activer', 20, 3600 * 1000)) return;
    const type = String(body && body.type || '');
    if (!LIBELLE[type]) return sendJSON(res, 400, { error: 'Accréditation inconnue.' });
    const a = await db.prepare('SELECT * FROM accred_simple_attributions WHERE user_id=? AND type=?').get(Number(user.id), type);
    if (!a || a.statut !== 'code_envoye') return sendJSON(res, 404, { error: "Aucun code d'activation en attente pour cette accréditation." });
    if (a.verrou_jusqua && Date.now() < versMs(a.verrou_jusqua)) return sendJSON(res, 429, { error: 'Trop d\'erreurs : réessayez dans 10 minutes.' });
    if (a.code_expire_le && Date.now() >= versMs(a.code_expire_le)) return sendJSON(res, 410, { error: "Ce code a expiré. Demandez à Diaspo'Actif de vous en renvoyer un." });

    const saisi = normaliserCode(body && body.code);
    if (saisi.length !== 8 || !memeHache(hacher(saisi, user.id, type), a.code_hash)) {
      const essais = Number(a.essais || 0) + 1, verrou = essais >= MAX_ESSAIS;
      await db.prepare('UPDATE accred_simple_attributions SET essais=?, verrou_jusqua=?, maj_le=? WHERE id=?').run(verrou ? 0 : essais, verrou ? dans(VERROU_MS) : null, maintenant(), a.id);
      SEC.logSecurity(verrou ? 'accred_simple_code_verrouille' : 'accred_simple_code_incorrect', { uid: Number(user.id), type });
      if (verrou) return sendJSON(res, 429, { error: 'Code incorrect trop de fois : réessayez dans 10 minutes.' });
      const restants = MAX_ESSAIS - essais;
      return sendJSON(res, 403, { error: `Code incorrect (${restants} essai${restants > 1 ? 's' : ''} restant${restants > 1 ? 's' : ''}).`, essais_restants: restants });
    }
    /* Usage unique : le haché est effacé à l'activation. */
    await db.prepare("UPDATE accred_simple_attributions SET statut='active', code_hash=NULL, code_expire_le=NULL, essais=0, verrou_jusqua=NULL, active_le=?, maj_le=? WHERE id=?").run(maintenant(), maintenant(), a.id);
    SEC.logSecurity('accred_simple_activee', { uid: Number(user.id), type });
    try {
      const admins = await db.prepare("SELECT id FROM users WHERE role='administrateur'").all();
      const nom = await nomCompteAffichage(user.id);
      for (const ad of admins) await creerNotif(ad.id, 'validation', 'Accréditation activée', `${nom} a activé « ${LIBELLE[type].emoji} ${LIBELLE[type].label} »`, { type });
    } catch (_) { /* facultatif */ }
    sendJSON(res, 200, { ok: true, statut: 'active' });
  });

  /* ── Côté administrateur ── */
  route('GET', '/api/admin/accreditation-simple/types', async (req, res) => {
    if (!(await admin(req, res))) return;
    sendJSON(res, 200, { types: TYPES });
  });

  route('GET', '/api/admin/accreditation-simple/demandes', async (req, res, params, body, query) => {
    if (!(await admin(req, res))) return;
    const statut = ['en_attente', 'traitee', 'refusee'].includes(query && query.statut) ? query.statut : 'en_attente';
    const rows = await db.prepare(`SELECT d.id, d.user_id, d.type, d.telephone, d.email, d.motif, d.statut, d.motif_refus, d.created_at, d.traitee_at,
        u.nom AS user_nom, u.prenom AS user_prenom, u.role AS user_role, u.email AS compte_email
      FROM accred_simple_demandes d JOIN users u ON u.id=d.user_id WHERE d.statut=? ORDER BY d.id DESC LIMIT 200`).all(statut);
    sendJSON(res, 200, { demandes: rows.map(r => ({ ...r, label: (LIBELLE[r.type] || {}).label || r.type, emoji: (LIBELLE[r.type] || {}).emoji || '' })) });
  });

  route('GET', '/api/admin/accreditation-simple/attributions', async (req, res) => {
    if (!(await admin(req, res))) return;
    const rows = await db.prepare(`SELECT a.id, a.user_id, a.type, a.statut, a.code_expire_le, a.attribue_le, a.active_le, a.motif, a.maj_le,
        u.nom AS user_nom, u.prenom AS user_prenom, u.email AS compte_email, u.role AS user_role
      FROM accred_simple_attributions a JOIN users u ON u.id=a.user_id ORDER BY a.maj_le DESC LIMIT 300`).all();
    sendJSON(res, 200, { attributions: rows.map(r => ({ ...r, label: (LIBELLE[r.type] || {}).label || r.type, emoji: (LIBELLE[r.type] || {}).emoji || '' })) });
  });

  /* Recherche d'un compte à qui attribuer (pour une attribution sans demande préalable). */
  route('GET', '/api/admin/accreditation-simple/comptes', async (req, res, params, body, query) => {
    if (!(await admin(req, res))) return;
    const q = String(query && query.q || '').trim();
    if (q.length < 2) return sendJSON(res, 200, { comptes: [] });
    const like = `%${q.toLowerCase()}%`;
    const rows = await db.prepare(`SELECT id, nom, prenom, email, role FROM users
      WHERE LOWER(COALESCE(email,'')) LIKE ? OR LOWER(COALESCE(nom,'')) LIKE ? OR LOWER(COALESCE(prenom,'')) LIKE ? ORDER BY id DESC LIMIT 15`).all(like, like, like);
    sendJSON(res, 200, { comptes: rows });
  });

  /* Expéditeur du message sécurisé : le compte Diaspo'Actif officiel (propriétaire de l'initiative officielle), sinon l'administrateur. */
  async function expediteurPour(adminUser, destinataireId) {
    try {
      const id = getInitiativeOfficielleId ? await getInitiativeOfficielleId() : null;
      if (id) {
        const o = await db.prepare('SELECT owner_user_id FROM initiatives WHERE id=?').get(id);
        if (o && o.owner_user_id && Number(o.owner_user_id) !== Number(destinataireId)) return Number(o.owner_user_id);
      }
    } catch (_) { /* repli ci-dessous */ }
    return Number(adminUser.id) !== Number(destinataireId) ? Number(adminUser.id) : null;
  }

  /* Génère un code, l'enregistre (haché) et l'envoie par message sécurisé. Si l'envoi échoue, rien n'est conservé. */
  async function emettreCode(adminUser, userId, type, avant) {
    const exp = await expediteurPour(adminUser, userId);
    if (!exp) throw new Error("Aucun expéditeur possible pour le message sécurisé.");
    const code = genererCode();
    const texte = `Bonjour,\n\nVotre code d'activation « ${LIBELLE[type].label} » : ${afficherCode(code)}\n\nSaisissez-le dans le module Accréditations pour activer votre accès. Il est valable 7 jours, ne fonctionne que sur votre compte et ne peut servir qu'une fois. Ne le communiquez à personne.\n\nL'équipe Diaspo'Actif`;
    const t = maintenant();
    if (avant) await db.prepare("UPDATE accred_simple_attributions SET statut='code_envoye', code_hash=?, code_expire_le=?, essais=0, verrou_jusqua=NULL, attribue_par=?, attribue_le=?, maj_le=?, motif=NULL WHERE id=?")
      .run(hacher(code, userId, type), dans(CODE_VALIDITE_MS), Number(adminUser.id), t, t, avant.id);
    else await db.prepare("INSERT INTO accred_simple_attributions (user_id, type, statut, code_hash, code_expire_le, essais, attribue_par, attribue_le, maj_le) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(Number(userId), type, 'code_envoye', hacher(code, userId, type), dans(CODE_VALIDITE_MS), 0, Number(adminUser.id), t, t);
    try {
      await MessageSecurise.envoyerSysteme(db, { expediteurId: exp, destinataireId: Number(userId), texte, creerNotif, nomCompteAffichage });
    } catch (e) {
      /* pas de code orphelin : on annule */
      if (avant) await db.prepare("UPDATE accred_simple_attributions SET code_hash=NULL, code_expire_le=NULL, statut=?, maj_le=? WHERE id=?").run(avant.statut, maintenant(), avant.id);
      else await db.prepare('DELETE FROM accred_simple_attributions WHERE user_id=? AND type=?').run(Number(userId), type);
      throw e;
    }
  }

  route('POST', '/api/admin/accreditation-simple/attribuer', async (req, res, params, body) => {
    const ad = await admin(req, res); if (!ad) return;
    const userId = Number(body && body.user_id), type = String(body && body.type || '');
    if (!userId || !LIBELLE[type]) return sendJSON(res, 400, { error: 'Compte et accréditation requis.' });
    const cible = await db.prepare('SELECT id FROM users WHERE id=?').get(userId);
    if (!cible) return sendJSON(res, 404, { error: 'Compte introuvable.' });
    const avant = await db.prepare('SELECT * FROM accred_simple_attributions WHERE user_id=? AND type=?').get(userId, type);
    if (avant && avant.statut === 'active') return sendJSON(res, 409, { error: 'Ce compte possède déjà cette accréditation.' });
    try { await emettreCode(ad, userId, type, avant && avant.statut !== 'active' ? avant : null); }
    catch (e) { return sendJSON(res, 500, SEC.safeError(e, 'accréditation : envoi du code')); }
    await db.prepare("UPDATE accred_simple_demandes SET statut='traitee', traitee_at=?, traitee_par=? WHERE user_id=? AND type=? AND statut='en_attente'").run(maintenant(), Number(ad.id), userId, type);
    SEC.logSecurity('accred_simple_attribuee', { uid: userId, type, admin: Number(ad.id) });
    sendJSON(res, 200, { ok: true });
  });

  route('POST', '/api/admin/accreditation-simple/renvoyer', async (req, res, params, body) => {
    const ad = await admin(req, res); if (!ad) return;
    const userId = Number(body && body.user_id), type = String(body && body.type || '');
    const avant = await db.prepare('SELECT * FROM accred_simple_attributions WHERE user_id=? AND type=?').get(userId, type);
    if (!avant || avant.statut !== 'code_envoye') return sendJSON(res, 409, { error: "Aucun code en attente pour ce compte (déjà activé ou non attribué)." });
    try { await emettreCode(ad, userId, type, avant); }
    catch (e) { return sendJSON(res, 500, SEC.safeError(e, 'accréditation : renvoi du code')); }
    SEC.logSecurity('accred_simple_code_renvoye', { uid: userId, type, admin: Number(ad.id) });
    sendJSON(res, 200, { ok: true });
  });

  async function changerStatut(req, res, body, depuis, vers, journal, titre, texte) {
    const ad = await admin(req, res); if (!ad) return;
    const userId = Number(body && body.user_id), type = String(body && body.type || '');
    const motif = String(body && body.motif || '').trim().slice(0, 500) || null;
    const a = await db.prepare('SELECT * FROM accred_simple_attributions WHERE user_id=? AND type=?').get(userId, type);
    if (!a || !depuis.includes(a.statut)) return sendJSON(res, 409, { error: "Cette action n'est pas possible dans l'état actuel." });
    /* Révoquer annule aussi un code encore valable. Suspendre ne s'applique qu'à un accès actif (réactiver le rétablit tel quel). */
    await db.prepare('UPDATE accred_simple_attributions SET statut=?, motif=?, maj_le=? WHERE id=?').run(vers, vers === 'active' ? null : motif, maintenant(), a.id);
    if (vers === 'revoquee') await db.prepare('UPDATE accred_simple_attributions SET code_hash=NULL, code_expire_le=NULL WHERE id=?').run(a.id);
    try { await creerNotif(userId, 'validation', titre, texte(LIBELLE[type] || { label: type }, motif), { type }); } catch (_) { /* facultatif */ }
    SEC.logSecurity(journal, { uid: userId, type, admin: Number(ad.id) });
    sendJSON(res, 200, { ok: true });
  }
  route('POST', '/api/admin/accreditation-simple/suspendre', (req, res, p, body) => changerStatut(req, res, body, ['active'], 'suspendue', 'accred_simple_suspendue', 'Accréditation suspendue', (t, m) => `Votre accréditation « ${t.label} » est suspendue${m ? ` : ${m}` : '.'}`));
  route('POST', '/api/admin/accreditation-simple/reactiver', (req, res, p, body) => changerStatut(req, res, body, ['suspendue'], 'active', 'accred_simple_reactivee', 'Accréditation rétablie', (t) => `Votre accréditation « ${t.label} » est de nouveau active.`));
  route('POST', '/api/admin/accreditation-simple/revoquer', (req, res, p, body) => changerStatut(req, res, body, ['active', 'suspendue', 'code_envoye'], 'revoquee', 'accred_simple_revoquee', 'Accréditation retirée', (t, m) => `Votre accréditation « ${t.label} » a été retirée${m ? ` : ${m}` : '.'}`));

  route('POST', '/api/admin/accreditation-simple/refuser', async (req, res, params, body) => {
    const ad = await admin(req, res); if (!ad) return;
    const id = Number(body && body.demande_id), motif = String(body && body.motif || '').trim().slice(0, 500) || null;
    const d = await db.prepare("SELECT * FROM accred_simple_demandes WHERE id=? AND statut='en_attente'").get(id);
    if (!d) return sendJSON(res, 404, { error: 'Demande introuvable ou déjà traitée.' });
    await db.prepare("UPDATE accred_simple_demandes SET statut='refusee', motif_refus=?, traitee_at=?, traitee_par=? WHERE id=?").run(motif, maintenant(), Number(ad.id), id);
    try { await creerNotif(Number(d.user_id), 'validation', "Demande d'accréditation non retenue", `Votre demande « ${(LIBELLE[d.type] || { label: d.type }).label} » n'a pas été retenue${motif ? ` : ${motif}` : '.'}`, { type: d.type }); } catch (_) { /* facultatif */ }
    SEC.logSecurity('accred_simple_refusee', { uid: Number(d.user_id), type: d.type, admin: Number(ad.id) });
    sendJSON(res, 200, { ok: true });
  });

  return { resume, TYPES };
}

module.exports = { register, TYPES, _hacher: hacher, _genererCode: genererCode, _normaliserCode: normaliserCode, _afficherCode: afficherCode };
