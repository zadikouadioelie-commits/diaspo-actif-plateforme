/* ============================================================
   Diaspo'Actif — Fil de l'accueil du profil public (2026-11-02, demande explicite)
   « Sur le profil public : les derniers Reels au-dessus, puis toutes les nouvelles actualités (textes, vidéos, événements),
   avec un système de filtres ergonomique et un bouton « Mes actualités » qui ne montre que ce qu'on a publié soi-même. »

   GET /api/fil/accueil?filtre=…&categorie=…&avant=<curseur>&limit=<n>
     filtre : tout (défaut) · textes · photos · videos · articles · evenements · abonnements · mes
     Réponse : { posts: [...publications enrichies comme /api/fil...], suivant: <curseur>|null, filtre, conseil? }

   ORDRE D'AFFICHAGE (demande du 2026-11-02) — « les publications de Diaspo'Actif, puis ses publications à lui », ordre rafraîchi chaque heure :
     1. les dernières publications du compte officiel Diaspo'Actif (6 au plus) ;
     2. les autres publications de la plateforme : les 4 plus récentes d'abord, puis le reste BRASSÉ — l'ordre change à chaque heure
        (tirage déterministe : rang = hachage(identifiant, heure), jamais Math.random → stable pendant l'heure, donc sans saut ni doublon) ;
     3. à la suite : toutes les publications du compte connecté, de la plus récente à la plus ancienne.
   « Mes actualités » = seulement ce que le compte connecté a publié ou republié, du plus récent au plus ancien (tout, Reels compris).
   Le curseur « suivant » est « <heure>-<position> » : l'heure y est gardée, si bien qu'un défilement qui passe l'heure pile garde le même ordre.

   Les Reels (publications dont la vidéo porte le marquage reel) ont leur propre bande, au-dessus : ils ne reviennent pas dans ce fil,
   sauf dans « Mes actualités ». Une vidéo ordinaire (non Reel) est une publication comme les autres.
   Mêmes règles de publication que le fil général : ni archivée, ni brouillon, ni programmée ; comptes de démonstration exclus ;
   une publication non publique n'est visible que de son auteur.
   ============================================================ */
'use strict';

const FILTRES = ['tout', 'textes', 'photos', 'videos', 'articles', 'evenements', 'abonnements', 'mes'];
const HEURE_MS = 3600000;
const CAP_AUTRES = 500, CAP_MIENS = 300, OFFICIELLES_EN_TETE = 6, RECENTES_FIXES = 4, VALIDITE_CACHE_MS = 60000;

/* Publication « événement » : catégorie Événement, promotion d'un événement, compte-rendu d'événement. */
const SQL_EVENEMENT = "(COALESCE(p.categorie,'') IN ('Événement','Événements','événement','événements','Evenement','Evenements','evenement','evenements','EVENEMENT') OR p.promo_evenement_id IS NOT NULL OR p.compte_rendu_evenement_id IS NOT NULL OR p.type IN ('evenement','compte_rendu') OR p.pub_type='compte_rendu')";

/* Rang pseudo-aléatoire d'une publication pour une heure donnée (entier 32 bits non signé). */
function rang(id, heure) {
  let x = (Math.imul(Number(id) | 0, 374761393) + Math.imul(Number(heure) | 0, 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return x >>> 0;
}
const heureCourante = () => Math.floor(Date.now() / HEURE_MS);

/* Ordre du fil : officielles en tête, récentes fixes, reste brassé pour l'heure donnée, puis les publications du compte. */
function ordonner({ autres, miens, officiels, heure }) {
  const off = [], reste = [];
  for (const p of autres) {
    if (officiels.has(Number(p.auteur_id)) && off.length < OFFICIELLES_EN_TETE) off.push(p); else reste.push(p);
  }
  const recentes = reste.slice(0, RECENTES_FIXES);
  const brassees = reste.slice(RECENTES_FIXES).sort((a, b) => (rang(a.id, heure) - rang(b.id, heure)) || (Number(b.id) - Number(a.id)));
  return [...off, ...recentes, ...brassees, ...miens].map(p => Number(p.id));
}

function register({ route, db, sendJSON, getCurrentUser, enrichPost, filMediasDuPost, dateParisISO, TutoPartage, verifierProgrammes }) {
  /* Promotion J-7 retirée dès que l'événement est terminé, tuto dépublié : mêmes clauses que le fil général (GET /api/fil). */
  const clausesFil = () =>
    " AND (p.promo_evenement_id IS NULL OR EXISTS (SELECT 1 FROM evenements pe WHERE pe.id=p.promo_evenement_id AND COALESCE(NULLIF(pe.date_fin,''), pe.date_evt) >= '" + dateParisISO() + "'))"
    + (TutoPartage && TutoPartage.tutoClause ? TutoPartage.tutoClause : '');

  /* Les médias d'une republication sont ceux de la publication d'origine. */
  async function mediasDe(p) {
    let src = p;
    if ((p.type === 'repost' || p.pub_type === 'repost') && p.original_post_id) {
      const o = await db.prepare('SELECT * FROM fil_posts WHERE id=?').get(p.original_post_id);
      if (o) src = o;
    }
    return filMediasDuPost(src);
  }

  /* Comptes « officiels » : marquage users.is_official=1 ou réglage « compte_officiel_id » (en production aucun compte n'est marqué : d'où le réglage). */
  async function idsOfficiels() {
    const ids = new Set();
    try { for (const r of await db.prepare('SELECT id FROM users WHERE is_official=1').all()) ids.add(Number(r.id)); } catch (_) { /* facultatif */ }
    try { const r = await require('./kofi').reglages(db); if (r && Number(r.compte_officiel_id) > 0) ids.add(Number(r.compte_officiel_id)); } catch (_) { /* facultatif */ }
    return ids;
  }

  /* Une publication reste-t-elle dans ce filtre ? (les Reels n'y sont jamais, hors « Mes actualités ») */
  async function garder(p, filtre) {
    if (filtre === 'mes') return true;
    const m = await mediasDe(p);
    if (m.some(x => x.kind === 'video' && x.reel)) return false;
    if (filtre === 'videos') return m.some(x => x.kind === 'video');
    if (filtre === 'photos') return m.some(x => x.kind === 'photo');
    if (filtre === 'textes') return !m.length && !(p.pub_type === 'article' || p.type === 'article');
    return true;
  }

  const cache = new Map();   /* ordre complet d'une heure, gardé 1 min : évite de tout recalculer à chaque page */

  route('GET', '/api/fil/accueil', async (req, res, params, body, query) => {
    try { if (verifierProgrammes) await verifierProgrammes(); } catch (_) { /* facultatif */ }
    const cu = await getCurrentUser(req);
    const filtre = FILTRES.includes(String(query.filtre || '')) ? String(query.filtre) : 'tout';
    if ((filtre === 'mes' || filtre === 'abonnements') && !cu) return sendJSON(res, 401, { error: 'Connexion requise.' });
    const limite = Math.min(Math.max(Number(query.limit) || 10, 1), 20);
    const categorie = query.categorie ? String(query.categorie).slice(0, 60) : '';
    const cur = /^(\d+)-(\d+)$/.exec(String(query.avant || ''));
    const heure = cur ? Number(cur[1]) : heureCourante();
    const decalage = cur ? Number(cur[2]) : 0;

    const cle = `${cu ? cu.id : 0}|${filtre}|${categorie}|${heure}`;
    let ids; const dejaCalcule = cache.get(cle);
    if (dejaCalcule && Date.now() - dejaCalcule.t < VALIDITE_CACHE_MS) ids = dejaCalcule.ids;
    else {
      /* « Mes actualités » : ce que MOI j'ai publié ou republié (jamais celles des autres, jamais filtré par démo) ; sinon, fil de toute la plateforme. */
      const conds = ["COALESCE(p.statut,'publie') NOT IN ('archive','brouillon','programme')"];
      const baseArgs = [];
      if (filtre === 'mes') { conds.push('p.auteur_id=?'); baseArgs.push(cu.id); }
      else {
        conds.push("(COALESCE(p.visibilite,'public')='public'" + (cu ? ' OR p.auteur_id=?' : '') + ')');
        if (cu) baseArgs.push(cu.id);
        conds.push('(u.is_demo IS NULL OR u.is_demo=FALSE' + (cu ? ' OR p.auteur_id=?' : '') + ')');   /* ses propres publications restent visibles pour soi, même d'un compte de démonstration */
        if (cu) baseArgs.push(cu.id);
      }
      if (categorie) { conds.push('p.categorie=?'); baseArgs.push(categorie); }
      if (filtre === 'articles') conds.push("(p.pub_type='article' OR p.type='article')");
      if (filtre === 'evenements') conds.push(SQL_EVENEMENT);
      if (filtre === 'abonnements') {
        const suivis = (await db.prepare('SELECT followed_id FROM user_follows WHERE follower_id=?').all(cu.id)).map(r => Number(r.followed_id));
        const inits = (await db.prepare('SELECT initiative_id FROM abonnements WHERE user_id=?').all(cu.id)).map(r => Number(r.initiative_id));
        const proprios = inits.length
          ? (await db.prepare(`SELECT owner_user_id AS id FROM initiatives WHERE id IN (${inits.map(() => '?').join(',')}) AND owner_user_id IS NOT NULL`).all(...inits)).map(r => Number(r.id))
          : [];
        const abonnes = [...new Set([...suivis, ...proprios])];
        if (!abonnes.length) return sendJSON(res, 200, { posts: [], suivant: null, filtre, conseil: 'Abonnez-vous à des personnes et à des initiatives pour voir ici leurs actualités.' });
        conds.push(`p.auteur_id IN (${abonnes.map(() => '?').join(',')})`); baseArgs.push(...abonnes);
      }
      const sqlBase = `SELECT p.* FROM fil_posts p JOIN users u ON u.id=p.auteur_id WHERE ${conds.join(' AND ')}${clausesFil()}`;
      const lire = async (extra, args, cap) => {
        const rows = await db.prepare(`${sqlBase}${extra} ORDER BY p.id DESC LIMIT ${cap}`).all(...baseArgs, ...args);
        const sortie = [];
        for (const p of rows) if (await garder(p, filtre)) sortie.push(p);
        return sortie;
      };
      if (filtre === 'mes') {
        ids = (await lire('', [], CAP_MIENS * 2)).map(p => Number(p.id));
      } else {
        const autres = await lire(cu ? ' AND p.auteur_id<>?' : '', cu ? [cu.id] : [], CAP_AUTRES);
        const miens = cu ? await lire(' AND p.auteur_id=?', [cu.id], CAP_MIENS) : [];
        ids = ordonner({ autres, miens, officiels: await idsOfficiels(), heure });
      }
      cache.set(cle, { t: Date.now(), ids });
      if (cache.size > 300) for (const [k, v] of cache) if (Date.now() - v.t > VALIDITE_CACHE_MS) cache.delete(k);
    }

    const page = ids.slice(decalage, decalage + limite);
    let rows = [];
    if (page.length) {
      rows = await db.prepare(`SELECT p.* FROM fil_posts p WHERE p.id IN (${page.map(() => '?').join(',')}) AND COALESCE(p.statut,'publie') NOT IN ('archive','brouillon','programme')`).all(...page);
    }
    const parId = new Map(rows.map(r => [Number(r.id), r]));
    const retenus = page.map(id => parId.get(id)).filter(Boolean);
    const posts = await Promise.all(retenus.map(async p => ({ ...(await enrichPost(p, cu)), source: 'accueil' })));
    const suivant = decalage + limite < ids.length ? `${heure}-${decalage + limite}` : null;
    sendJSON(res, 200, { posts, suivant, filtre });
  });
}

module.exports = { register, FILTRES, ordonner, rang };
