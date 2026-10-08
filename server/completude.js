/* Complétude du profil — calcul unique + alertes « profil à compléter » (2026-10-08, demande explicite :
   « envoi des alertes pour que les comptes remplissent leurs informations pour ne pas avoir de profil vide,
   arrête les annonces quand c'est rempli à 80 % »).

   UNE SEULE liste de champs par type de compte, utilisée à la fois par les deux routes « score d'activité »
   (server/index.js) et par les alertes ci-dessous : le pourcentage affiché au compte et celui qui déclenche
   (ou arrête) les relances ne peuvent donc jamais diverger. Les listes « utilisateur » et « initiative »
   reprennent exactement celles qui existaient déjà dans ces deux routes ; « collectivité » est nouvelle
   (ce type de compte n'avait aucun calcul), bâtie sur les champs de son profil public.

   Cadence : une notification tous les 5 jours RÉELS (mesurés sur completude_relances.created_at, pas sur un
   cron « tous les 5 jours » qui dériverait avec les mois), texte qui change à chaque rang, jusqu'à ce que le
   profil atteigne 80 %. Alors : plus aucune alerte, et UN seul message de confirmation. Jamais deux
   notifications le même jour : si la relance « origine » est déjà partie aujourd'hui pour ce compte, on attend. */

const SEUIL_PCT = 80;
const INTERVALLE_MS = 5 * 24 * 3600 * 1000;
const AGE_MIN_COMPTE_MS = 3 * 24 * 3600 * 1000; // un compte tout neuf a déjà reçu son accueil : on lui laisse 3 jours

/* cles : un critère est rempli si AU MOINS un de ces champs l'est (ex. plusieurs façons de renseigner ses réseaux). */
const CRITERES = {
  utilisateur: [
    { cles: ['photo_url'], label: 'votre photo de profil' },
    { cles: ['bio'], label: 'votre présentation (bio)' },
    { cles: ['titre_pro'], label: 'votre titre professionnel' },
    { cles: ['competences'], label: 'vos compétences' },
    { cles: ['experiences'], label: 'vos expériences' },
    { cles: ['centres_interet'], label: 'vos centres d\'intérêt' },
    { cles: ['publics_json'], label: 'les publics que vous visez' },
    { cles: ['besoins_json'], label: 'vos besoins' },
    { cles: ['realisations_json'], label: 'vos réalisations' },
    { cles: ['services_perso'], label: 'vos services' },
    { cles: ['reseaux_json'], label: 'vos réseaux sociaux' },
    { cles: ['annee_debut'], label: 'votre année de début d\'activité' },
  ],
  initiative: [
    { cles: ['description'], label: 'la description' },
    { cles: ['mission'], label: 'la mission' },
    { cles: ['historique'], label: 'l\'historique' },
    { cles: ['logo_url'], label: 'le logo' },
    { cles: ['site_web'], label: 'le site web' },
    { cles: ['adresse'], label: 'l\'adresse' },
    { cles: ['vitrine_horaires'], label: 'les horaires' },
    { cles: ['vitrine_services'], label: 'les services' },
    { cles: ['publics_json'], label: 'les publics visés' },
    { cles: ['besoins_json'], label: 'les besoins' },
    { cles: ['realisations_json'], label: 'les réalisations' },
    { cles: ['galerie_json'], label: 'la galerie photos' },
    { cles: ['reseaux_sociaux'], label: 'les réseaux sociaux' },
    { cles: ['annee_creation'], label: 'l\'année de création' },
  ],
  collectivite: [
    { cles: ['logo_url', 'photo_url'], label: 'le logo' },
    { cles: ['description_institution'], label: 'la présentation de l\'institution' },
    { cles: ['sigle_institution'], label: 'le sigle' },
    { cles: ['date_creation_institution'], label: 'la date de création' },
    { cles: ['devise_institution'], label: 'la devise' },
    { cles: ['site_officiel', 'site_local'], label: 'le site officiel' },
    { cles: ['email_officiel'], label: 'l\'e-mail officiel' },
    { cles: ['adresse_exercice'], label: 'l\'adresse' },
    { cles: ['horaires_ouverture'], label: 'les horaires d\'ouverture' },
    { cles: ['reseaux_sociaux_officiels', 'facebook_officiel', 'linkedin_officiel', 'twitter_officiel', 'instagram_officiel', 'youtube_officiel'], label: 'les réseaux sociaux' },
    { cles: ['presentation_gouvernance'], label: 'la gouvernance' },
    { cles: ['projets_en_cours_json'], label: 'les projets en cours' },
    { cles: ['nom_responsable_etatique'], label: 'le responsable' },
  ],
};

function champRempli(v) {
  if (v == null) return false;
  const s = String(v).trim();
  return s !== '' && s !== '[]' && s !== '{}' && s !== 'null';
}

/* role : 'utilisateur' | 'initiative' | 'collectivite' ; ligne : la ligne users (ou initiatives pour une initiative).
   Renvoie { pct, remplis, total, manquants:[libellés] } — null si le rôle n'a pas de calcul. */
function evaluer(role, ligne) {
  const criteres = CRITERES[role];
  if (!criteres || !ligne) return null;
  const manquants = [];
  let remplis = 0;
  for (const c of criteres) {
    if (c.cles.some(k => champRempli(ligne[k]))) remplis++;
    else manquants.push(c.label);
  }
  return { pct: Math.round((remplis / criteres.length) * 100), remplis, total: criteres.length, manquants };
}

/* Instants stockés « YYYY-MM-DD HH:MM:SS » (UTC, SQLite) ou déjà Date/ISO (PostgreSQL) → millisecondes. */
function ms(v) {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const s = String(v);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z').getTime() || 0;
}
const jourParis = t => new Date(t).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });

/* Quatre textes qui tournent (au-delà, on reboucle sur les deux derniers) — {pct} et {liste} sont remplacés. */
const MESSAGES = [
  'Votre profil est rempli à {pct} %. Un profil complet est bien mieux repéré dans le réseau Diaspo\'Actif. Il vous manque notamment : {liste}.',
  'Rappel : votre profil n\'est rempli qu\'à {pct} %. Quelques minutes suffisent pour ajouter {liste}.',
  'Votre profil reste incomplet ({pct} %). Les membres qui visitent votre page ne voient pas encore : {liste}.',
  'Il manque encore {liste} sur votre profil ({pct} % rempli). Complétez-le pour inspirer confiance et être contacté plus facilement.',
];
function texte(rang, pct, manquants) {
  const montres = manquants.slice(0, 4);
  const reste = manquants.length - montres.length;
  const liste = montres.join(', ') + (reste > 0 ? ` (et ${reste} autre${reste > 1 ? 's' : ''})` : '');
  return MESSAGES[Math.min(rang - 1, MESSAGES.length - 1)].replace('{pct}', String(pct)).replace('{liste}', liste);
}

function lienProfil(role, ligne, idCompte, origine) {
  if (role === 'initiative') return `${origine}/initiative.html?id=${encodeURIComponent(ligne.slug || ligne.id)}&completer=profil`;
  if (role === 'collectivite') return `${origine}/profil-collectivite.html?id=${idCompte}&completer=profil`;
  return `${origine}/profil.html?id=${idCompte}&completer=profil`;
}

/* Comptes éligibles : ni démo, ni supprimé, ni masqué, ni suspendu ; créés depuis au moins 3 jours. */
const FILTRE_COMPTE = `(u.is_demo IS NULL OR u.is_demo=FALSE) AND u.nom != 'Compte supprimé'
  AND (u.compte_masque IS NULL OR u.compte_masque=0) AND COALESCE(u.suspendu_definitif,0)=0`;

async function chargerComptes(db) {
  const comptes = [];
  for (const role of ['utilisateur', 'collectivite']) {
    const lignes = await db.prepare(`SELECT u.* FROM users u WHERE u.role=? AND ${FILTRE_COMPTE}`).all(role);
    for (const l of lignes) comptes.push({ role, userId: Number(l.id), ligne: l, cree: l.created_at });
  }
  const inits = await db.prepare(
    `SELECT i.*, u.id AS _owner_id, u.created_at AS _compte_cree FROM initiatives i JOIN users u ON u.id=i.owner_user_id
     WHERE u.role='initiative' AND ${FILTRE_COMPTE}`).all();
  for (const l of inits) comptes.push({ role: 'initiative', userId: Number(l._owner_id), ligne: l, cree: l._compte_cree });
  return comptes;
}

/* Exécuté une fois par jour (greffé sur /api/cron/origine-relances). `creerNotif(userId, type, titre, contenu, data)` est
   celui de server/index.js ; `maintenant` ne sert qu'aux tests. */
async function relancerProfilsIncomplets({ db, creerNotif, origine, maintenant = Date.now() }) {
  const bilan = { examines: 0, relances: 0, confirmations: 0, reportes_meme_jour: 0, trop_recents: 0 };
  const aujourdhui = jourParis(maintenant);
  for (const c of await chargerComptes(db)) {
    bilan.examines++;
    const ev = evaluer(c.role, c.ligne);
    if (!ev) continue;
    const dernier = await db.prepare('SELECT created_at, rang FROM completude_relances WHERE user_id=? ORDER BY id DESC LIMIT 1').get(c.userId);

    if (ev.pct >= SEUIL_PCT) {
      /* Seuil atteint : plus aucune alerte. Un seul message de confirmation, et seulement si le compte avait été relancé. */
      if (!dernier) continue;
      const deja = await db.prepare("SELECT 1 FROM notifications WHERE user_id=? AND type='profil_completude_confirmee' LIMIT 1").get(c.userId);
      if (deja) continue;
      await creerNotif(c.userId, 'profil_completude_confirmee', 'Profil bien rempli — merci !',
        `Votre profil est maintenant rempli à ${ev.pct} %. Il inspire davantage confiance aux membres qui le consultent.`,
        { lien: lienProfil(c.role, c.ligne, c.userId, origine) });
      bilan.confirmations++;
      continue;
    }

    if (maintenant - ms(c.cree) < AGE_MIN_COMPTE_MS) { bilan.trop_recents++; continue; }
    if (dernier && maintenant - ms(dernier.created_at) < INTERVALLE_MS) continue;

    /* Jamais deux notifications le même jour : la relance « origine » (cron du même passage) est-elle déjà partie aujourd'hui ? */
    const origineLigne = c.role === 'initiative'
      ? await db.prepare('SELECT created_at FROM origine_relances WHERE initiative_id=? ORDER BY id DESC LIMIT 1').get(c.ligne.id)
      : await db.prepare('SELECT created_at FROM origine_relances WHERE user_id=? ORDER BY id DESC LIMIT 1').get(c.userId);
    if (origineLigne && jourParis(ms(origineLigne.created_at)) === aujourdhui) { bilan.reportes_meme_jour++; continue; }

    const rang = ((dernier && Number(dernier.rang)) || 0) + 1;
    await db.prepare('INSERT INTO completude_relances (user_id, rang, pourcentage) VALUES (?,?,?)').run(c.userId, rang, ev.pct);
    await creerNotif(c.userId, 'profil_completude_relance', `Votre profil est rempli à ${ev.pct} %`,
      texte(rang, ev.pct, ev.manquants), { lien: lienProfil(c.role, c.ligne, c.userId, origine), rang, pourcentage: ev.pct });
    bilan.relances++;
  }
  return bilan;
}

module.exports = { SEUIL_PCT, CRITERES, evaluer, champRempli, relancerProfilsIncomplets, texte };
