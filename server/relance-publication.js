/* ═══════════════════════════════════════════════════════════════════════════
   RELANCE « PREMIÈRE PUBLICATION » (2026-10-09, demande explicite)
   « Faites votre première publication » reste visible (bandeau, assets/app.js) à toutes les
   personnes qui n'en ont encore écrit aucune, une connexion sur deux, jusqu'à ce qu'elles
   publient. En plus de ce bandeau, ce module calcule automatiquement — tous les 6 jours
   RÉELS, jusqu'à la première publication — une notification : « Vous n'avez encore rien
   partagé avec la diaspora. Écrivez votre publication. »

   Même principe que server/completude.js (intervalle mesuré sur une table de relances, jamais
   un cron qui dériverait avec les mois) mais sur une condition différente : l'existence d'au
   moins une publication propre dans fil_posts (users.premiere_publication_le, posé par
   POST /api/fil — jamais par un partage/republication, qui ne « compte » pas comme écrire sa
   publication).
   ═══════════════════════════════════════════════════════════════════════════ */

const INTERVALLE_MS = 6 * 24 * 3600 * 1000;
const AGE_MIN_COMPTE_MS = 3 * 24 * 3600 * 1000; // un compte tout neuf a déjà reçu son accueil : on lui laisse 3 jours

function ms(v) {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const s = String(v);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z').getTime() || 0;
}

/* Comptes éligibles : rôles qui publient réellement sur le fil (pas administrateur), ni démo,
   ni supprimé, ni masqué, ni suspendu ; créés depuis au moins 3 jours. */
const FILTRE_COMPTE = `u.role IN ('utilisateur','initiative','collectivite')
  AND (u.is_demo IS NULL OR u.is_demo=FALSE) AND u.nom != 'Compte supprimé'
  AND (u.compte_masque IS NULL OR u.compte_masque=0) AND COALESCE(u.suspendu_definitif,0)=0`;

/* Exécuté une fois par jour (greffé sur /api/cron/origine-relances, même route que les relances
   d'origine et de complétude). `creerNotif(userId, type, titre, contenu, data)` est celui de
   server/index.js ; `maintenant` ne sert qu'aux tests. */
async function relancerPublicationsManquantes({ db, creerNotif, origine, maintenant = Date.now() }) {
  const bilan = { examines: 0, relances: 0, trop_recents: 0, reportes: 0 };
  const comptes = await db.prepare(
    `SELECT u.id, u.created_at FROM users u WHERE u.premiere_publication_le IS NULL AND ${FILTRE_COMPTE}`
  ).all();
  for (const c of comptes) {
    bilan.examines++;
    if (maintenant - ms(c.created_at) < AGE_MIN_COMPTE_MS) { bilan.trop_recents++; continue; }
    const dernier = await db.prepare('SELECT created_at FROM publication_relances WHERE user_id=? ORDER BY id DESC LIMIT 1').get(c.id);
    if (dernier && maintenant - ms(dernier.created_at) < INTERVALLE_MS) { bilan.reportes++; continue; }
    await db.prepare('INSERT INTO publication_relances (user_id) VALUES (?)').run(c.id);
    await creerNotif(c.id, 'publication_relance', 'Partagez votre expérience',
      "Vous n'avez encore rien partagé avec la diaspora. Écrivez votre publication.",
      { lien: `${origine}/fil-actualite.html?publier=1` });
    bilan.relances++;
  }
  return bilan;
}

module.exports = { relancerPublicationsManquantes, INTERVALLE_MS, AGE_MIN_COMPTE_MS };
