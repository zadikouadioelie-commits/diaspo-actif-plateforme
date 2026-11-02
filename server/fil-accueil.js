/* ============================================================
   Diaspo'Actif — Fil de l'accueil du profil public (2026-11-02, demande explicite)
   « Sur le profil public : les derniers Reels au-dessus, puis toutes les nouvelles actualités (textes, vidéos, événements),
   avec un système de filtres ergonomique et un bouton « Mes actualités » qui ne montre que ce qu'on a publié soi-même. »

   GET /api/fil/accueil?filtre=…&categorie=…&avant=<id>&limit=<n>
     filtre : tout (défaut) · textes · photos · videos · articles · evenements · abonnements · mes
     Réponse : { posts: [...publications enrichies comme /api/fil...], suivant: <id>|null, filtre, conseil? }
   Un ordre simple et prévisible : du plus récent au plus ancien (les Reels ont leur propre bande, au-dessus).
   Pagination par curseur (« avant » = dernier id reçu) : le tri par type (photo / vidéo / texte) se fait sur le contenu des médias,
   donc on parcourt les publications par paquets jusqu'à en avoir assez — sans jamais sauter ni répéter une publication.
   Mêmes règles de publication que le fil général : ni archivée, ni brouillon, ni programmée ; comptes de démonstration exclus ;
   une publication non publique n'est visible que de son auteur ; « Mes actualités » = ce que le compte connecté a publié ou republié.
   ============================================================ */
'use strict';

const FILTRES = ['tout', 'textes', 'photos', 'videos', 'articles', 'evenements', 'abonnements', 'mes'];
const PAQUET = 40, PASSES_MAX = 8;

/* Publication « événement » : catégorie Événement, promotion d'un événement, compte-rendu d'événement. */
const SQL_EVENEMENT = "(COALESCE(p.categorie,'') IN ('Événement','Événements','événement','événements','Evenement','Evenements','evenement','evenements','EVENEMENT') OR p.promo_evenement_id IS NOT NULL OR p.compte_rendu_evenement_id IS NOT NULL OR p.type IN ('evenement','compte_rendu') OR p.pub_type='compte_rendu')";

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

  route('GET', '/api/fil/accueil', async (req, res, params, body, query) => {
    try { if (verifierProgrammes) await verifierProgrammes(); } catch (_) { /* facultatif */ }
    const cu = await getCurrentUser(req);
    const filtre = FILTRES.includes(String(query.filtre || '')) ? String(query.filtre) : 'tout';
    if ((filtre === 'mes' || filtre === 'abonnements') && !cu) return sendJSON(res, 401, { error: 'Connexion requise.' });
    const limite = Math.min(Math.max(Number(query.limit) || 10, 1), 20);
    const categorie = query.categorie ? String(query.categorie).slice(0, 60) : '';
    let curseur = Number(query.avant) || null;

    /* « Mes actualités » : ce que MOI j'ai publié ou republié (jamais celles des autres, jamais filtré par démo) ; sinon, fil de toute la plateforme. */
    const conds = ["COALESCE(p.statut,'publie') NOT IN ('archive','brouillon','programme')"];
    const baseArgs = [];
    if (filtre === 'mes') { conds.push('p.auteur_id=?'); baseArgs.push(cu.id); }
    else {
      conds.push("(COALESCE(p.visibilite,'public')='public'" + (cu ? ' OR p.auteur_id=?' : '') + ')');
      if (cu) baseArgs.push(cu.id);
      conds.push('(u.is_demo IS NULL OR u.is_demo=FALSE)');
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
      const ids = [...new Set([...suivis, ...proprios])];
      if (!ids.length) return sendJSON(res, 200, { posts: [], suivant: null, filtre, conseil: 'Abonnez-vous à des personnes et à des initiatives pour voir ici leurs actualités.' });
      conds.push(`p.auteur_id IN (${ids.map(() => '?').join(',')})`); baseArgs.push(...ids);
    }
    const sqlBase = `SELECT p.* FROM fil_posts p JOIN users u ON u.id=p.auteur_id WHERE ${conds.join(' AND ')}${clausesFil()}`;

    const retenus = []; let epuise = false;
    for (let passe = 0; passe < PASSES_MAX && retenus.length < limite && !epuise; passe++) {
      const args = [...baseArgs]; let sql = sqlBase;
      if (curseur) { sql += ' AND p.id<?'; args.push(curseur); }
      sql += ` ORDER BY p.id DESC LIMIT ${PAQUET}`;
      const rows = await db.prepare(sql).all(...args);
      if (!rows.length) { epuise = true; break; }
      for (const p of rows) {
        curseur = Number(p.id);
        let garder = true;
        if (filtre === 'textes' || filtre === 'photos' || filtre === 'videos') {
          const m = await mediasDe(p);
          if (filtre === 'videos') garder = m.some(x => x.kind === 'video');
          else if (filtre === 'photos') garder = m.some(x => x.kind === 'photo');
          else garder = !m.length && !(p.pub_type === 'article' || p.type === 'article');
        }
        if (garder) { retenus.push(p); if (retenus.length >= limite) break; }
      }
      if (rows.length < PAQUET && retenus.length < limite) epuise = true;
    }
    const posts = await Promise.all(retenus.map(async p => ({ ...(await enrichPost(p, cu)), source: 'accueil' })));
    /* Curseur de la page suivante : la dernière publication retenue (page pleine) ou la dernière parcourue (recherche interrompue) ; plus rien → null. */
    const suivant = epuise ? null : (retenus.length >= limite ? Number(retenus[retenus.length - 1].id) : curseur);
    sendJSON(res, 200, { posts, suivant, filtre });
  });
}

module.exports = { register, FILTRES };
