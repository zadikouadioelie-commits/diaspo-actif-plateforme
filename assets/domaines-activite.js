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

/* Suggestions de sous-domaine (2026-09-05, demande explicite) : « lorsqu'un domaine et un
   sous-domaine sont enregistrés, propose-les aux prochains inscrits qui choisissent le même
   domaine ». Sous domaine 1/2 restent des champs texte libres — pas de liste fermée possible
   (trop de nuances par métier) — mais une <datalist> native propose ce que d'autres comptes
   ont déjà tapé pour le même domaine : menu déroulant au clic/à la frappe, tout en laissant
   la main pour taper autre chose. Fonction PARTAGÉE par inscription.html et
   parametres-compte.html. Un seul appel réseau par domaine choisi (résultat mis en cache
   localement à cette page). */
function wireSousDomaineSuggestions(domaineSelect, sousDomaineInputs) {
  if (!domaineSelect || !sousDomaineInputs || !sousDomaineInputs.length) return;
  const dl = document.createElement('datalist');
  dl.id = 'sda-suggestions-' + Math.random().toString(36).slice(2, 8);
  document.body.appendChild(dl);
  sousDomaineInputs.forEach(inp => inp && inp.setAttribute('list', dl.id));

  const cache = {};
  function afficher(liste) {
    dl.innerHTML = '';
    (liste || []).forEach(s => { const o = document.createElement('option'); o.value = s; dl.appendChild(o); });
  }
  async function charger(domaine) {
    if (!domaine) { afficher([]); return; }
    if (cache[domaine]) { afficher(cache[domaine]); return; }
    try {
      const r = await api('GET', `/domaines-activite/sous-domaines?domaine=${encodeURIComponent(domaine)}`);
      cache[domaine] = r.suggestions || [];
      afficher(cache[domaine]);
    } catch (e) { /* champ libre, la saisie reste possible sans suggestion */ }
  }
  domaineSelect.addEventListener('change', () => charger(domaineSelect.value));
  if (domaineSelect.value) charger(domaineSelect.value);
}
window.wireSousDomaineSuggestions = wireSousDomaineSuggestions;
