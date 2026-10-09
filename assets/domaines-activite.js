/* ══════════════════════════════════════════════════════════════════════
   Domaines d'activité — taxonomie unifiée (2026-09-04)
   Source unique de vérité, chargée par : inscription.html, profil-app.html
   (module Paramètres du compte), annuaire (assets/app.js).
   Format : [clé, icône, libellé]. Une clé jamais renommée une fois publiée
   (des comptes réels la stockent) — n'ajouter/retirer que des entrées.
   Ordre alphabétique par libellé (2026-09-05, demande explicite) — "Autre"
   reste en dernier par convention (catégorie fourre-tout, pas un domaine
   réel). Réordonner cette liste est sans risque : les selects référencent
   toujours une entrée par sa clé, jamais par sa position.
   ══════════════════════════════════════════════════════════════════════ */
window.DOMAINES_ACTIVITE = [
  ['agriculture',                '🌾', 'Agriculture'],
  ['artisanat',                  '🧵', 'Artisanat'],
  ['associations_vie_citoyenne', '🏛️', 'Associations & Vie citoyenne'],
  ['assurance_prevoyance',       '🛡️', 'Assurance & Prévoyance'],
  ['automobile_mobilite',        '🚗', 'Automobile & Mobilité'],
  ['banque_microfinance',        '🏦', 'Banque & Microfinance'],
  ['btp_immobilier',             '🏗️', 'BTP & Immobilier'],
  ['commerce_distribution',      '🛍️', 'Commerce & Distribution'],
  ['commerce_international',     '🚢', 'Commerce international'],
  ['communication_medias',       '📱', 'Communication & Médias'],
  ['conseil_services',           '👩‍💼', 'Conseil & Services'],
  ['culture_arts',               '🎨', 'Culture & Arts'],
  ['developpement_solidarite',   '🌍', 'Développement & Solidarité'],
  ['droit_administration',       '⚖️', 'Droit & Administration'],
  ['eau_assainissement',         '💧', 'Eau & Assainissement'],
  ['education_formation',        '🎓', 'Éducation & Formation'],
  ['elevage_peche',              '🐄', 'Élevage & Pêche'],
  ['energie_environnement',      '⚡', 'Énergie & Environnement'],
  ['environnement',              '🌱', 'Environnement'],
  ['evenementiel',               '🎉', 'Événementiel'],
  ['finance_investissement',     '💰', 'Finance & Investissement'],
  ['hotellerie_hebergement',     '🏨', 'Hôtellerie & Hébergement'],
  ['immobilier',                 '🏠', 'Immobilier'],
  ['industrie_production',       '📦', 'Industrie & Production'],
  ['medecine_sante',             '🏥', 'Médecine & Santé'],
  ['mines_ressources',           '⛏️', 'Mines & Ressources naturelles'],
  ['mobilite_internationale',    '✈️', 'Mobilité internationale'],
  ['mode_beaute',                '👗', 'Mode & Beauté'],
  ['numerique_technologie',      '💻', 'Numérique & Technologie'],
  ['recherche_innovation',       '🔬', 'Recherche & Innovation'],
  ['restauration_agroalimentaire','🍽️', 'Restauration & Agroalimentaire'],
  ['sante',                      '🩺', 'Santé'],
  ['sante_mentale',              '🧠', 'Santé mentale'],
  ['securite_gardiennage',       '🔐', 'Sécurité & Gardiennage'],
  ['services_personne',          '🧑‍🤝‍🧑', 'Services à la personne'],
  ['services_funeraires',        '🕊️', 'Services funéraires'],
  ['social_famille',             '👶', 'Social & Famille'],
  ['sport',                      '🏃', 'Sport'],
  ['telecoms_infrastructures',   '📡', 'Télécommunications & Infrastructures'],
  ['tourisme_voyage',            '🧳', 'Tourisme & Voyage'],
  ['transport_logistique',       '🚛', 'Transport & Logistique'],
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

/* Construit les <option> d'un <select> "Domaine d'activité" groupées par lettre initiale
   (<optgroup label="A">, <optgroup label="B">...) — repère visuel demandé pour se situer dans
   une liste de 30 entrées. "Autre" reste hors groupe, toujours en dernier (catégorie
   fourre-tout, pas une lettre). Fonction PARTAGÉE par les 3 endroits qui affichent cette liste
   (inscription.html, parametres-compte.html, filtre annuaire dans assets/app.js) pour que les
   groupes ne puissent pas diverger d'un endroit à l'autre. */
function domaineActiviteOptionsHTML(selectedCle) {
  const groupes = [];
  let derniereLettre = null;
  window.DOMAINES_ACTIVITE.forEach(([cle, icone, label]) => {
    if (cle === 'autre') return; // ajouté à part, après les groupes
    /* Retire les diacritiques (é→e, etc.) sans littéral regex \u...\u... — trop fragile à
       retranscrire fidèlement à travers les couches d'échappement (bash/JSON/JS) ; comparaison
       numérique de code point à la place, strictement équivalente. */
    const lettre = [...label.normalize('NFD')].filter(ch => {
      const code = ch.codePointAt(0);
      return code < 0x0300 || code > 0x036f;
    }).join('')[0].toUpperCase();
    if (lettre !== derniereLettre) { groupes.push({ lettre, items: [] }); derniereLettre = lettre; }
    groupes[groupes.length - 1].items.push([cle, icone, label]);
  });
  let html = groupes.map(g => `<optgroup label="${g.lettre}">${
    g.items.map(([cle, icone, label]) =>
      `<option value="${cle}"${cle === selectedCle ? ' selected' : ''}>${icone} ${label}</option>`
    ).join('')
  }</optgroup>`).join('');
  const autre = window.DOMAINES_ACTIVITE.find(d => d[0] === 'autre');
  if (autre) html += `<option value="autre"${selectedCle === 'autre' ? ' selected' : ''}>${autre[1]} ${autre[2]}</option>`;
  return html;
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
  /* Suggestions fixes par domaine (assets/structures-initiative.js, 2026-10-09) fusionnées avec celles déjà tapées par d'autres comptes. */
  const fusion = (domaine, deja) => {
    const fixes = (window.STRUCTURES_INITIATIVE && window.STRUCTURES_INITIATIVE.SOUS_DOMAINES && window.STRUCTURES_INITIATIVE.SOUS_DOMAINES[domaine]) || [];
    const vus = new Set();
    return fixes.concat(deja || []).filter(s => { const k = String(s).trim().toLowerCase(); if (!k || vus.has(k)) return false; vus.add(k); return true; });
  };
  async function charger(domaine) {
    if (!domaine) { afficher([]); return; }
    afficher(fusion(domaine, cache[domaine]));
    if (cache[domaine]) return;
    try {
      const r = await api('GET', `/domaines-activite/sous-domaines?domaine=${encodeURIComponent(domaine)}`);
      cache[domaine] = r.suggestions || [];
      afficher(fusion(domaine, cache[domaine]));
    } catch (e) { /* champ libre, la saisie reste possible ; les suggestions fixes restent affichées */ }
  }
  domaineSelect.addEventListener('change', () => charger(domaineSelect.value));
  if (domaineSelect.value) charger(domaineSelect.value);
}
window.wireSousDomaineSuggestions = wireSousDomaineSuggestions;
