/* ─────────────────────────────────────────────────────────────────────────────
   Report des périodes « Découverte Premium » — 2026-07-25

   Repousse la date de fin des accréditations de découverte (essai gratuit) à
   AUJOURD'HUI + 2 MOIS, pour laisser le temps de finaliser l'encadrement des
   modules Premium avant les premières échéances.

   Base ciblée : la même que le serveur (server/db.js bascule automatiquement
   sur PostgreSQL si DATABASE_URL est définie, sinon SQLite local).

   ⚠ SIMULATION PAR DÉFAUT — le script n'écrit rien tant qu'on ne passe pas
   explicitement --appliquer. Lancer d'abord sans, lire le rapport, puis relancer.

     node server/etendre-decouverte-premium.js               → simulation
     node server/etendre-decouverte-premium.js --appliquer   → écriture réelle

   Ne touche QUE les lignes statut='active' ET type_tarif='decouverte' :
   les abonnements payants ne sont jamais modifiés.
   Ne raccourcit jamais une échéance déjà plus lointaine que la cible.
   ───────────────────────────────────────────────────────────────────────────── */

const db = require('./db');

const APPLIQUER = process.argv.includes('--appliquer');
const MOIS_AJOUTES = 2;

function cible() {
  const d = new Date();
  d.setMonth(d.getMonth() + MOIS_AJOUTES);
  return d;
}

(async function main() {
  const nouvelleFin = cible();
  const nouvelleFinIso = nouvelleFin.toISOString();

  console.log('═'.repeat(70));
  console.log('  Report des périodes « Découverte Premium »');
  console.log('═'.repeat(70));
  console.log('  Base            :', process.env.DATABASE_URL ? 'PostgreSQL (production)' : 'SQLite (locale)');
  console.log('  Aujourd\'hui     :', new Date().toISOString().slice(0, 10));
  console.log('  Nouvelle échéance:', nouvelleFinIso.slice(0, 10));
  console.log('  Mode            :', APPLIQUER ? '⚠ ÉCRITURE RÉELLE' : 'simulation (aucune écriture)');
  console.log('─'.repeat(70));

  const lignes = await db.prepare(`
    SELECT ua.id, ua.user_id, ua.date_expiration, ua.type_tarif, ad.type AS accred_type, u.nom, u.email
    FROM user_accreditations ua
    LEFT JOIN accred_definitions ad ON ad.id = ua.accred_id
    LEFT JOIN users u ON u.id = ua.user_id
    WHERE ua.statut = 'active' AND ua.type_tarif = 'decouverte'
    ORDER BY ua.date_expiration
  `).all();

  if (!lignes.length) {
    console.log('  Aucune accréditation de découverte active. Rien à faire.');
    return;
  }

  const aReporter = lignes.filter(l => {
    if (!l.date_expiration) return false;               // sans échéance : déjà illimitée
    return new Date(l.date_expiration).getTime() < nouvelleFin.getTime();
  });

  lignes.forEach(l => {
    const fin = (l.date_expiration || '—').slice(0, 10);
    const concerne = aReporter.some(x => x.id === l.id);
    console.log(
      ' ', (concerne ? '→' : ' '),
      String(l.accred_type || '?').padEnd(20),
      'fin:', fin.padEnd(12),
      concerne ? '⇒ ' + nouvelleFinIso.slice(0, 10) : '(inchangée)',
      ' ', String(l.email || l.nom || ('user#' + l.user_id)).slice(0, 34)
    );
  });

  console.log('─'.repeat(70));
  console.log('  Actives      :', lignes.length);
  console.log('  À reporter   :', aReporter.length);
  console.log('  Inchangées   :', lignes.length - aReporter.length, '(échéance déjà postérieure, ou sans date)');

  if (!APPLIQUER) {
    console.log('─'.repeat(70));
    console.log('  Simulation terminée — aucune écriture.');
    console.log('  Relancer avec --appliquer pour écrire réellement.');
    return;
  }

  let ok = 0;
  for (const l of aReporter) {
    await db.prepare('UPDATE user_accreditations SET date_expiration=? WHERE id=?').run(nouvelleFinIso, l.id);
    ok++;
  }
  console.log('─'.repeat(70));
  console.log('  ✓ Écriture terminée :', ok, 'accréditation(s) reportée(s) au', nouvelleFinIso.slice(0, 10));

  /* Relecture de contrôle : on ne se fie pas au compteur, on vérifie en base. */
  const restantes = await db.prepare(`
    SELECT COUNT(*) AS n FROM user_accreditations
    WHERE statut='active' AND type_tarif='decouverte'
      AND date_expiration IS NOT NULL AND date_expiration < ?
  `).get(nouvelleFinIso);
  console.log('  Contrôle : accréditations encore antérieures à la cible :', restantes ? restantes.n : '?');
})().catch(e => {
  console.error('ÉCHEC :', e.message);
  process.exit(1);
});
