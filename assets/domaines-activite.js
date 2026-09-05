/* ══════════════════════════════════════════════════════════════════════
   Domaines d'activité — taxonomie unifiée (2026-09-04)
   Source unique de vérité, chargée par : inscription.html, profil-app.html
   (module Paramètres du compte), annuaire (assets/app.js).
   Format : [clé, icône, libellé]. Une clé jamais renommée une fois publiée
   (des comptes réels la stockent) — n'ajouter/retirer que des entrées.
   ══════════════════════════════════════════════════════════════════════ */
window.DOMAINES_ACTIVITE = [
  ['medecine_sante',            '🏥', 'Médecine & Santé'],
  ['sante_mentale',              '🧠', 'Santé mentale'],
  ['transport_logistique',      '🚛', 'Transport & Logistique'],
  ['agriculture',                '🌾', 'Agriculture'],
  ['btp_immobilier',             '🏗️', 'BTP & Immobilier'],
  ['numerique_technologie',      '💻', 'Numérique & Technologie'],
  ['education_formation',        '🎓', 'Éducation & Formation'],
  ['finance_investissement',     '💰', 'Finance & Investissement'],
  ['droit_administration',       '⚖️', 'Droit & Administration'],
  ['commerce_distribution',      '🛍️', 'Commerce & Distribution'],
  ['restauration_agroalimentaire','🍽️', 'Restauration & Agroalimentaire'],
  ['energie_environnement',      '⚡', 'Énergie & Environnement'],
  ['eau_assainissement',         '💧', 'Eau & Assainissement'],
  ['mode_beaute',                '👗', 'Mode & Beauté'],
  ['culture_arts',               '🎨', 'Culture & Arts'],
  ['sport',                      '🏃', 'Sport'],
  ['tourisme_voyage',            '🧳', 'Tourisme & Voyage'],
  ['developpement_solidarite',   '🌍', 'Développement & Solidarité'],
  ['associations_vie_citoyenne', '🏛️', 'Associations & Vie citoyenne'],
  ['conseil_services',           '👩‍💼', 'Conseil & Services'],
  ['industrie_production',       '📦', 'Industrie & Production'],
  ['environnement',              '🌱', 'Environnement'],
  ['elevage_peche',              '🐄', 'Élevage & Pêche'],
  ['automobile_mobilite',        '🚗', 'Automobile & Mobilité'],
  ['communication_medias',       '📱', 'Communication & Médias'],
  ['banque_microfinance',        '🏦', 'Banque & Microfinance'],
  ['social_famille',             '👶', 'Social & Famille'],
  ['recherche_innovation',       '🔬', 'Recherche & Innovation'],
  ['mobilite_internationale',    '✈️', 'Mobilité internationale'],
  ['autre',                      '🏢', 'Autre'],
];

function domaineActiviteInfo(cle) {
  const d = window.DOMAINES_ACTIVITE.find(x => x[0] === cle);
  return d ? { cle: d[0], icone: d[1], label: d[2] } : null;
}
function domaineActiviteLabel(cle) {
  const d = domaineActiviteInfo(cle);
  return d ? `${d.icone} ${d.label}` : '';
}
