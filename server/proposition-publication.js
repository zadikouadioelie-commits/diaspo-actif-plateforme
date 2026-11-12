/* ============================================================
   Diaspo'Actif — Publication préparée automatiquement (2026-11-12, demande explicite)
   « À la prochaine connexion pour les comptes déjà créés, dès la fin de la création pour les nouveaux : écrire automatiquement une
   publication (nom, descriptif, tweet, et la mention « disponible pour des rencontres et du networking »), la proposer pour le fil
   d'actualité. Le compte peut la modifier puis la publier, ou la reporter. Proposée 2 fois ; après, plus jamais. Tous les comptes. »

   RIEN n'est publié à la place du compte : ce module ne fait que PRÉPARER le texte et compter les propositions. La publication, quand
   le compte la valide, passe par POST /api/fil (mêmes contrôles, même titre automatique, même « première publication »).

   Règles :
   • Comptes concernés : utilisateur, initiative, collectivité — hors compte de démonstration, supprimé, masqué ou suspendu —
     et SEULEMENT s'ils n'ont encore rien publié (users.premiere_publication_le vide : un simple partage n'y compte pas).
   • Déclencheurs : une connexion (finaliserConnexion) ou la création du compte (POST /api/auth/signup) « arme » la proposition.
     Jamais de tâche planifiée.
   • Décompte : une proposition compte quand la carte est AFFICHÉE (GET /api/fil/proposition), pas quand le compte se connecte :
     se connecter sans ouvrir de page ne consomme rien. Elle reste affichée tant que le compte ne l'a pas reportée, publiée ou
     qu'il ne se reconnecte pas. 2 affichages au plus (PROPOSITIONS_MAX), puis plus rien.
   • Si le compte publie quoi que ce soit entre-temps, la proposition disparaît d'elle-même (plus éligible).

   GET  /api/fil/proposition           → { a_proposer, texte?, nom?, numero?, max? }
   POST /api/fil/proposition/reporter  → { ok } — « Reporter » : la carte disparaît jusqu'à la prochaine connexion
   ============================================================ */
'use strict';

const PROPOSITIONS_MAX = 2;
const ROLES = ['utilisateur', 'initiative', 'collectivite'];
const MENTION_NETWORKING = 'est disponible pour des rencontres et du networking';

/* Texte brut : sans balise HTML, entités courantes décodées, espaces et retours à la ligne compactés. */
function nettoyer(t) {
  return String(t == null ? '' : t)
    .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

/* Coupe sans casser un mot et ajoute « … » seulement si le texte a vraiment été raccourci. */
function couper(t, max) {
  const s = nettoyer(t).replace(/\n+/g, ' ');
  if (s.length <= max) return s;
  const c = s.slice(0, max);
  const fin = Math.max(c.lastIndexOf(' '), c.lastIndexOf('.'), c.lastIndexOf(','));
  return (fin > max * 0.6 ? c.slice(0, fin) : c).replace(/[\s.,;:!?-]+$/, '') + '…';
}

function eligible(u) {
  if (!u) return false;
  return ROLES.includes(u.role)
    && !u.premiere_publication_le
    && !Number(u.is_demo || 0)
    && u.nom !== 'Compte supprimé'
    && !Number(u.compte_masque || 0)
    && !Number(u.suspendu_definitif || 0);
}

async function lireCompte(db, userId) {
  return db.prepare(
    `SELECT id, role, nom, prenom, nom_institution, bio, titre_pro, is_demo, compte_masque, suspendu_definitif, premiere_publication_le,
            prop_pub_nb, prop_pub_en_cours, prop_pub_vue FROM users WHERE id=?`
  ).get(userId);
}

/* « Arme » la proposition : appelée à la connexion et à la fin de la création du compte. Ne consomme rien (le décompte se fait à
   l'affichage). Une proposition armée mais jamais affichée n'est pas réarmée deux fois. Toujours best-effort : ne bloque jamais. */
async function armer(db, userId) {
  const u = await lireCompte(db, userId);
  if (!u) return false;
  const nb = Number(u.prop_pub_nb || 0);
  if (!eligible(u) || nb >= PROPOSITIONS_MAX) {
    if (Number(u.prop_pub_en_cours || 0)) await db.prepare('UPDATE users SET prop_pub_en_cours=0 WHERE id=?').run(userId);
    return false;
  }
  if (Number(u.prop_pub_en_cours || 0) && !Number(u.prop_pub_vue || 0)) return true; // déjà armée, pas encore vue
  await db.prepare('UPDATE users SET prop_pub_en_cours=1, prop_pub_vue=0 WHERE id=?').run(userId);
  return true;
}

/* Texte proposé. Initiative : nom, descriptif, accroche (la mission, si elle existe et diffère du descriptif), mention networking.
   Autres comptes : nom, présentation (bio sinon titre), mention networking à la première personne. */
async function composerTexte(db, u, nomAffiche) {
  const lignes = [];
  if (u.role === 'initiative') {
    const ini = await db.prepare('SELECT nom, description, mission, ville, pays FROM initiatives WHERE owner_user_id=? ORDER BY id LIMIT 1').get(u.id);
    const nom = (ini && ini.nom) || nomAffiche || u.nom;
    const description = ini ? couper(ini.description, 450) : '';
    const mission = ini ? couper(ini.mission, 160) : '';
    const lieu = ini ? [ini.ville, ini.pays].filter(Boolean).join(', ') : '';
    lignes.push(`🌍 ${nom}${lieu ? ' — ' + lieu : ''}`);
    if (description) lignes.push(description);
    if (mission && !description.toLowerCase().startsWith(mission.toLowerCase().slice(0, 40))) lignes.push(`💬 ${mission}`);
    lignes.push(`🤝 ${nom} ${MENTION_NETWORKING} : écrivez-nous pour échanger, collaborer ou nous rejoindre !`);
    return { nom, texte: lignes.join('\n\n') + '\n\n#Diaspora #Networking' };
  }
  const nom = nomAffiche || [u.prenom, u.nom].filter(Boolean).join(' ') || u.nom;
  const presentation = couper(u.bio || u.titre_pro, 450);
  lignes.push(`👋 ${nom}`);
  if (presentation) lignes.push(presentation);
  lignes.push(`🤝 Je suis disponible pour des rencontres et du networking : n'hésitez pas à m'écrire pour échanger ou collaborer !`);
  return { nom, texte: lignes.join('\n\n') + '\n\n#Diaspora #Networking' };
}

/* Lecture de la carte à afficher. Compte la proposition la première fois qu'elle est vue (UPDATE conditionnel : deux pages qui
   interrogent en même temps ne comptent qu'une fois). */
async function lire(db, userId, nomCompteAffichage) {
  const u = await lireCompte(db, userId);
  if (!u) return { a_proposer: false };
  if (!eligible(u)) {
    if (Number(u.prop_pub_en_cours || 0)) await db.prepare('UPDATE users SET prop_pub_en_cours=0 WHERE id=?').run(userId);
    return { a_proposer: false };
  }
  if (!Number(u.prop_pub_en_cours || 0)) return { a_proposer: false };
  if (!Number(u.prop_pub_vue || 0)) {
    if (Number(u.prop_pub_nb || 0) >= PROPOSITIONS_MAX) {
      await db.prepare('UPDATE users SET prop_pub_en_cours=0 WHERE id=?').run(userId);
      return { a_proposer: false };
    }
    await db.prepare('UPDATE users SET prop_pub_nb=COALESCE(prop_pub_nb,0)+1, prop_pub_vue=1 WHERE id=? AND COALESCE(prop_pub_vue,0)=0').run(userId);
  }
  const frais = await lireCompte(db, userId);
  const nomAffiche = nomCompteAffichage ? await nomCompteAffichage(userId) : '';
  const { nom, texte } = await composerTexte(db, frais, nomAffiche);
  return { a_proposer: true, nom, texte, numero: Number(frais.prop_pub_nb || 1), max: PROPOSITIONS_MAX };
}

async function reporter(db, userId) {
  await db.prepare('UPDATE users SET prop_pub_en_cours=0 WHERE id=?').run(userId);
}

function register({ route, db, sendJSON, getCurrentUser, nomCompteAffichage }) {
  route('GET', '/api/fil/proposition', async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 200, { a_proposer: false });
    try { return sendJSON(res, 200, await lire(db, user.id, nomCompteAffichage)); }
    catch (e) { console.error('[proposition-publication]', e.message); return sendJSON(res, 200, { a_proposer: false }); }
  });
  route('POST', '/api/fil/proposition/reporter', async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
    await reporter(db, user.id);
    sendJSON(res, 200, { ok: true });
  });
}

module.exports = { register, armer, lire, reporter, composerTexte, eligible, couper, nettoyer, PROPOSITIONS_MAX };
