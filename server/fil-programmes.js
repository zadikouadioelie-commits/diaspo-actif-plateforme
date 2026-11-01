/* ═════════════════════════════════════════════════
   server/fil-programmes.js — MISE EN LIGNE DES PUBLICATIONS PROGRAMMÉES DU FIL (2026-11-01)

   Une publication programmée (bouton « Programmer » de la fenêtre Publier, ou Koffi) est enregistrée par POST /api/fil avec statut='programme' et programmed_at (UTC, ISO).
   Tant qu'elle est programmée, aucun fil ni aucune page ne la montre (voir les filtres « NOT IN ('archive','brouillon','programme') » de server/index.js). Ce module la met en ligne
   quand l'heure est passée : statut → 'publie', date de publication = maintenant, puis les mêmes notifications qu'une publication immédiate (mentions, abonnés).
   Déclenchement SANS planificateur à la minute (les tâches planifiées de Vercel ne tournent qu'une fois par jour) :
   - « paresseux » : à chaque chargement du fil, des profils ou des événements (au plus une vérification toutes les 20 secondes) ;
   - filet de sécurité : la tâche quotidienne /api/cron/fil-programmes.
   Conséquence : la publication est visible dès qu'une personne ouvre la plateforme après l'heure ; les notifications aux abonnés partent à ce moment-là. L'heure est donc APPROXIMATIVE,
   jamais avancée : Koffi en avertit toujours la personne avant de programmer (server/kofi-publication.js).
   La mise en ligne est atomique (UPDATE … WHERE statut='programme') : deux appels simultanés ne publient jamais deux fois la même publication.
   ═════════════════════════════════════════════════ */
"use strict";

const INTERVALLE_MS = 20000;
const MAX_PAR_PASSE = 200;
const MENTION_RE = /@\[([^\]]+)\]\(([ui]):(\d+)\)/g;

function creer({ db, creerNotif, nomCompteAffichage, maintenant }) {
  const horloge = typeof maintenant === "function" ? maintenant : Date.now;
  let derniere = 0, enCours = null;

  const extrait = txt => {
    const t = String(txt || "").replace(MENTION_RE, "@$1").replace(/<[^>]+>/g, "").trim();
    return t ? t.slice(0, 80) + (t.length > 80 ? "…" : "") : "Nouvelle publication sur son profil.";
  };

  /* Notifications d'une publication qui vient d'être mise en ligne (mêmes textes que POST /api/fil). */
  async function notifier(p) {
    const auteur = Number(p.auteur_id);
    const texte = [p.contenu, p.article_titre, p.article_contenu].join(" ");
    const vu = new Set(); let m;
    const nom = await nomCompteAffichage(auteur);
    const aff = String(texte).replace(MENTION_RE, "@$1").replace(/<[^>]+>/g, "").trim();
    const ext = aff.slice(0, 80) + (aff.length > 80 ? "…" : "");
    MENTION_RE.lastIndex = 0;
    while ((m = MENTION_RE.exec(texte)) !== null) {
      const [, , kind, rawId] = m, cible = Number(rawId);
      if (!cible || vu.has(kind + ":" + cible)) continue;
      vu.add(kind + ":" + cible);
      if (kind === "u") { if (cible !== auteur) creerNotif(cible, "mention", `${nom} vous a mentionné dans une publication`, `« ${ext} »`, { post_id: Number(p.id) }); }
      else {
        const o = await db.prepare("SELECT owner_user_id FROM initiatives WHERE id=?").get(cible);
        if (o && o.owner_user_id && Number(o.owner_user_id) !== auteur) creerNotif(o.owner_user_id, "mention", `${nom} a mentionné votre initiative dans une publication`, `« ${ext} »`, { post_id: Number(p.id) });
      }
    }
    if ((p.visibilite || "public") === "public") {
      const abonnes = await db.prepare("SELECT follower_id FROM user_follows WHERE followed_id=?").all(auteur);
      for (const a of abonnes) {
        if (Number(a.follower_id) === auteur) continue;
        creerNotif(a.follower_id, "nouvelle_publication", `${nom} a publié`, extrait(p.contenu || p.article_titre || p.article_contenu), { post_id: Number(p.id) });
      }
    }
  }

  /* Met en ligne toutes les publications dont l'heure est passée. Renvoie le nombre de publications mises en ligne. */
  async function passe() {
    const maint = horloge();
    const rows = await db.prepare("SELECT id, auteur_id, contenu, article_titre, article_contenu, visibilite, programmed_at FROM fil_posts WHERE statut='programme' ORDER BY id LIMIT " + MAX_PAR_PASSE).all();
    let n = 0;
    for (const p of rows) {
      const t = Date.parse(p.programmed_at);
      if (!p.programmed_at || isNaN(t)) {
        /* Date illisible : on ne publie jamais au hasard — la publication redevient un simple brouillon de son auteur. */
        await db.prepare("UPDATE fil_posts SET statut='brouillon' WHERE id=? AND statut='programme'").run(p.id);
        continue;
      }
      if (t > maint) continue;
      /* Le compte doit toujours exister : un compte supprimé ne publie plus rien. */
      const u = await db.prepare("SELECT id, nom FROM users WHERE id=?").get(p.auteur_id);
      if (!u || u.nom === "Compte supprimé") { await db.prepare("UPDATE fil_posts SET statut='archive' WHERE id=? AND statut='programme'").run(p.id); continue; }
      const claim = await db.prepare("UPDATE fil_posts SET statut='publie', created_at=datetime('now') WHERE id=? AND statut='programme'").run(p.id);
      if (!claim.changes) continue;   /* une autre requête vient de la publier */
      n++;
      try { await db.prepare("UPDATE users SET premiere_publication_le=datetime('now') WHERE id=? AND premiere_publication_le IS NULL").run(p.auteur_id); } catch (_) { /* jamais bloquant */ }
      try { await notifier(p); } catch (e) { console.error("[Fil programmé] notifications :", e && e.message); }
    }
    return n;
  }

  /* Appel « paresseux » : jamais bloquant, jamais en erreur, au plus une vérification toutes les 20 s. */
  function verifier(force) {
    const t = horloge();
    if (enCours) return enCours;
    if (!force && t - derniere < INTERVALLE_MS) return Promise.resolve(0);
    derniere = t;
    enCours = passe().catch(e => { console.error("[Fil programmé]", e && e.message); return 0; }).finally(() => { enCours = null; });
    return enCours;
  }

  return { verifier, passe };
}

module.exports = { creer, INTERVALLE_MS };
