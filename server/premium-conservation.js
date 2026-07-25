/* ─────────────────────────────────────────────────────────────────────────────
   Conservation des données Premium après expiration — inventaire

   Cahier des charges : après l'expiration d'un abonnement, AUCUNE donnée n'est
   supprimée pendant 7 mois. Passé ce délai, la plateforme doit éviter
   l'accumulation illimitée de données inutilisées.

   ⚠ CE SCRIPT NE SUPPRIME RIEN. Il se contente d'inventorier : quels comptes
   sont expirés, depuis combien de temps, ce qu'ils détiennent, et lesquels
   dépassent le délai de conservation.

   La suppression est une opération irréversible qui touche le travail réel des
   utilisateurs. Elle n'est volontairement pas automatisée ici : elle demande une
   décision explicite, une notification préalable aux personnes concernées, et
   très probablement un export préalable de leurs données.

     node server/premium-conservation.js          → inventaire (base du serveur)

   Base ciblée : PostgreSQL si DATABASE_URL est définie, SQLite sinon.
   ───────────────────────────────────────────────────────────────────────────── */

const db = require('./db');

const CONSERVATION_JOURS = 210; // ≈ 7 mois — doit rester aligné sur PREMIUM_CONSERVATION_JOURS

(async function main() {
  const maintenant = Date.now();

  console.log('═'.repeat(74));
  console.log('  Conservation des données Premium — inventaire (aucune suppression)');
  console.log('═'.repeat(74));
  console.log('  Base                :', process.env.DATABASE_URL ? 'PostgreSQL (production)' : 'SQLite (locale)');
  console.log('  Délai de conservation:', CONSERVATION_JOURS, 'jours (≈ 7 mois)');
  console.log('─'.repeat(74));

  const expirees = await db.prepare(`
    SELECT ua.user_id, ua.date_expiration, ua.type_tarif, ad.type AS accred_type,
           u.nom, u.email, u.role
    FROM user_accreditations ua
    LEFT JOIN accred_definitions ad ON ad.id = ua.accred_id
    LEFT JOIN users u ON u.id = ua.user_id
    WHERE ad.type IN ('initiative_abonne','utilisateur_abonne')
      AND ua.date_expiration IS NOT NULL
      AND ua.date_expiration < ?
    ORDER BY ua.date_expiration
  `).all(new Date(maintenant).toISOString());

  if (!expirees.length) {
    console.log('  Aucun abonnement expiré. Rien à inventorier.');
    console.log('─'.repeat(74));
    return;
  }

  let auDela = 0;
  for (const e of expirees) {
    const jours = Math.floor((maintenant - new Date(e.date_expiration).getTime()) / 86400000);
    const restant = CONSERVATION_JOURS - jours;
    const depasse = restant <= 0;
    if (depasse) auDela++;

    /* Ce que détient ce compte — pour mesurer ce qu'une purge détruirait réellement. */
    const init = e.role === 'initiative'
      ? await db.prepare("SELECT id, nom, vitrine_active FROM initiatives WHERE owner_user_id=?").get(e.user_id)
      : null;
    const inventaire = [];
    if (init) {
      const n = async (sql) => { try { const r = await db.prepare(sql).get(init.id); return r ? (r.n || 0) : 0; } catch (_) { return 0; } };
      const produits = await n("SELECT COUNT(*) AS n FROM produits_vitrine WHERE initiative_id=?");
      const publications = await n("SELECT COUNT(*) AS n FROM vitrine_publications WHERE initiative_id=?");
      if (init.vitrine_active) inventaire.push('vitrine en ligne');
      if (produits) inventaire.push(produits + ' produit(s)');
      if (publications) inventaire.push(publications + ' publication(s)');
    }

    console.log(
      ' ', (depasse ? '⚠' : ' '),
      String(e.accred_type || '?').padEnd(20),
      'expiré depuis', String(jours).padStart(4), 'j',
      depasse ? '→ DÉLAI DÉPASSÉ' : '→ conservation ' + String(restant).padStart(4) + ' j',
      ' ', String(e.email || e.nom || ('user#' + e.user_id)).slice(0, 30),
      inventaire.length ? ' | ' + inventaire.join(', ') : ''
    );
  }

  console.log('─'.repeat(74));
  console.log('  Abonnements expirés          :', expirees.length);
  console.log('  Encore dans le délai de 7 mois:', expirees.length - auDela);
  console.log('  Délai dépassé                :', auDela);
  if (auDela) {
    console.log();
    console.log('  ⚠ ' + auDela + ' compte(s) dépassent le délai de conservation.');
    console.log('    Aucune suppression n\'a été effectuée. Avant toute purge :');
    console.log('      1. prévenir les personnes concernées ;');
    console.log('      2. leur proposer un export de leurs données ;');
    console.log('      3. décider explicitement du périmètre supprimé.');
  }
  console.log('─'.repeat(74));
})().catch(e => {
  console.error('ÉCHEC :', e.message);
  process.exit(1);
});
