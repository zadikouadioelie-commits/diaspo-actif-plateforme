/* ═══════════════════════════════════════════════════════
   server/cartographie-competences.js — Cartographie des compétences (2026-10-11, demande explicite)

   « Un bouton cartographie compétences pour voir les domaines d'activité des comptes de la diaspora,
     avec graphiques et indication par diaspora, zone de vie, etc. »

   Observation AGRÉGÉE ET ANONYMISÉE (principe « observer largement ») : la route ne renvoie que des
   comptages — jamais un nom, un e-mail ni un identifiant. Réservée aux administrateurs.

   Données normalisées ici, parce que la base contient des saisies hétérogènes :
   · domaine d'activité : clé de la taxonomie unifiée (assets/domaines-activite.js, lue telle quelle — source
     unique), anciens libellés (« culture », « Commerce »…) rattachés à leur clé ; le reste → « autre » ;
   · diaspora = nationalité 1 (ou origine 1), saisie en « Sénégalaise » comme en « Sénégal » → un seul pays ;
   · zone de vie = zone géographique du pays de résidence.
   Calcul 100 % en JavaScript sur des lignes simples (pas de GROUP BY SQL : SQLite le tolère, PostgreSQL non).
   ═══════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");

/* ───────── Texte ───────── */
const sans = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[’']/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/* ───────── Domaines d'activité (taxonomie unifiée) ───────── */
let DOMAINES = [];            // [{ cle, icone, label }]
try {
  const src = fs.readFileSync(path.join(__dirname, "..", "assets", "domaines-activite.js"), "utf8");
  const re = /\[\s*'([a-z_]+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\]/g;
  let m; while ((m = re.exec(src))) DOMAINES.push({ cle: m[1], icone: m[2], label: m[3] });
} catch (e) { DOMAINES = []; }

const ALIAS_DOMAINE = {};
DOMAINES.forEach(d => { ALIAS_DOMAINE[sans(d.cle)] = d.cle; ALIAS_DOMAINE[sans(d.label)] = d.cle; });
/* Anciens libellés des listes disjointes d'avant la taxonomie unifiée (2026-09-04) → clé actuelle. */
Object.entries({
  culture: "culture_arts", arts: "culture_arts", art: "culture_arts", education: "education_formation", formation: "education_formation",
  enseignement: "education_formation", commerce: "commerce_distribution", distribution: "commerce_distribution", numerique: "numerique_technologie",
  technologie: "numerique_technologie", technologies: "numerique_technologie", informatique: "numerique_technologie", it: "numerique_technologie",
  btp: "btp_immobilier", batiment: "btp_immobilier", construction: "btp_immobilier", finance: "finance_investissement", banque: "banque_microfinance",
  transport: "transport_logistique", logistique: "transport_logistique", tourisme: "tourisme_voyage", restauration: "restauration_agroalimentaire",
  agroalimentaire: "restauration_agroalimentaire", communication: "communication_medias", medias: "communication_medias", energie: "energie_environnement",
  industrie: "industrie_production", conseil: "conseil_services", services: "conseil_services", social: "social_famille", solidarite: "developpement_solidarite",
  developpement: "developpement_solidarite", droit: "droit_administration", justice: "droit_administration", recherche: "recherche_innovation", mode: "mode_beaute",
  beaute: "mode_beaute", sante: "sante", medecine: "medecine_sante", elevage: "elevage_peche", peche: "elevage_peche", mines: "mines_ressources",
  associations: "associations_vie_citoyenne", association: "associations_vie_citoyenne", assurance: "assurance_prevoyance", securite: "securite_gardiennage",
  telecoms: "telecoms_infrastructures", evenement: "evenementiel", evenements: "evenementiel", hotellerie: "hotellerie_hebergement", eau: "eau_assainissement",
  automobile: "automobile_mobilite", mobilite: "automobile_mobilite", funeraire: "services_funeraires",
}).forEach(([k, v]) => { if (!ALIAS_DOMAINE[k]) ALIAS_DOMAINE[k] = v; });

function cleDomaine(v) {
  const s = sans(v);
  if (!s) return null;
  if (ALIAS_DOMAINE[s]) return ALIAS_DOMAINE[s];
  const mot = s.split(" ")[0];                    // « Commerce et négoce » → commerce
  if (ALIAS_DOMAINE[mot]) return ALIAS_DOMAINE[mot];
  return "autre";                                 // saisie libre non reconnue : comptée dans « Autre », jamais perdue
}

/* ───────── Zones de vie et pays ───────── */
const ZONES = {
  AFO: "Afrique de l'Ouest", AFC: "Afrique centrale", AFE: "Afrique de l'Est et océan Indien", AFN: "Afrique du Nord", AFA: "Afrique australe",
  EUR: "Europe", AMN: "Amérique du Nord", AML: "Amérique latine et Caraïbes", ASI: "Asie", MOY: "Moyen-Orient", OCE: "Océanie",
};
/* Nom | adjectif (féminin) | zone | alias éventuels. */
const PAYS_BRUT = `
Bénin|Béninoise|AFO
Burkina Faso|Burkinabè|AFO|Burkina
Cap-Vert|Capverdienne|AFO
Côte d'Ivoire|Ivoirienne|AFO|Cote d Ivoire,CI,Ivory Coast
Gambie|Gambienne|AFO
Ghana|Ghanéenne|AFO
Guinée|Guinéenne|AFO|Guinée Conakry,Guinee Conakry
Guinée-Bissau|Bissau-guinéenne|AFO
Libéria|Libérienne|AFO|Liberia
Mali|Malienne|AFO|ML
Mauritanie|Mauritanienne|AFO
Niger|Nigérienne|AFO
Nigéria|Nigériane|AFO|Nigeria
Sénégal|Sénégalaise|AFO|SN,Senegal
Sierra Leone|Sierra-léonaise|AFO
Togo|Togolaise|AFO|TG
Cameroun|Camerounaise|AFC|CM
Centrafrique|Centrafricaine|AFC|République centrafricaine
Congo|Congolaise|AFC|Congo-Brazzaville,République du Congo,Congo (Brazzaville),Congo Brazzaville
République démocratique du Congo|Congolaise (RDC)|AFC|RDC,RD Congo,Congo-Kinshasa,Congo (Kinshasa),Congo Kinshasa,DRC
Gabon|Gabonaise|AFC
Guinée équatoriale|Équato-guinéenne|AFC
Tchad|Tchadienne|AFC
Sao Tomé-et-Principe|Santoméenne|AFC
Burundi|Burundaise|AFE
Rwanda|Rwandaise|AFE
Éthiopie|Éthiopienne|AFE|Ethiopie
Kenya|Kényane|AFE
Tanzanie|Tanzanienne|AFE
Ouganda|Ougandaise|AFE
Somalie|Somalienne|AFE
Djibouti|Djiboutienne|AFE
Érythrée|Érythréenne|AFE
Soudan du Sud|Sud-soudanaise|AFE
Madagascar|Malgache|AFE
Maurice|Mauricienne|AFE|Île Maurice
Comores|Comorienne|AFE
Seychelles|Seychelloise|AFE
Maroc|Marocaine|AFN|MA
Algérie|Algérienne|AFN|Algerie,DZ
Tunisie|Tunisienne|AFN|TN
Libye|Libyenne|AFN
Égypte|Égyptienne|AFN|Egypte
Soudan|Soudanaise|AFN
Afrique du Sud|Sud-africaine|AFA
Angola|Angolaise|AFA
Botswana|Botswanaise|AFA
Namibie|Namibienne|AFA
Zambie|Zambienne|AFA
Zimbabwe|Zimbabwéenne|AFA
Mozambique|Mozambicaine|AFA
Malawi|Malawienne|AFA
France|Française|EUR|FR,Métropole
Belgique|Belge|EUR|BE
Suisse|Suisse|EUR|CH
Luxembourg|Luxembourgeoise|EUR
Allemagne|Allemande|EUR|DE
Italie|Italienne|EUR|IT
Espagne|Espagnole|EUR|ES
Portugal|Portugaise|EUR|PT
Royaume-Uni|Britannique|EUR|UK,GB,Angleterre,Grande-Bretagne,Anglaise,Royaume Uni
Irlande|Irlandaise|EUR
Pays-Bas|Néerlandaise|EUR|Hollande,Pays Bas,Néerlande
Autriche|Autrichienne|EUR
Suède|Suédoise|EUR|Suede
Norvège|Norvégienne|EUR|Norvege
Danemark|Danoise|EUR
Finlande|Finlandaise|EUR
Pologne|Polonaise|EUR
Roumanie|Roumaine|EUR
Bulgarie|Bulgare|EUR
Grèce|Grecque|EUR|Grece
Hongrie|Hongroise|EUR
Tchéquie|Tchèque|EUR|République tchèque
Russie|Russe|EUR
Ukraine|Ukrainienne|EUR
Malte|Maltaise|EUR
Chypre|Chypriote|EUR
Canada|Canadienne|AMN|CA,Québec,Quebec
États-Unis|Américaine|AMN|Etats-Unis,USA,US,Etats-Unis d'Amérique,États-Unis d'Amérique,Usa
Mexique|Mexicaine|AML
Haïti|Haïtienne|AML|Haiti
République dominicaine|Dominicaine|AML
Cuba|Cubaine|AML
Jamaïque|Jamaïcaine|AML
Guadeloupe|Guadeloupéenne|AML
Martinique|Martiniquaise|AML
Guyane|Guyanaise|AML
Brésil|Brésilienne|AML|Bresil
Argentine|Argentine|AML
Colombie|Colombienne|AML
Pérou|Péruvienne|AML|Perou
Chili|Chilienne|AML
Venezuela|Vénézuélienne|AML
Chine|Chinoise|ASI
Japon|Japonaise|ASI
Inde|Indienne|ASI
Vietnam|Vietnamienne|ASI
Thaïlande|Thaïlandaise|ASI
Corée du Sud|Sud-coréenne|ASI
Philippines|Philippine|ASI
Indonésie|Indonésienne|ASI
Pakistan|Pakistanaise|ASI
Bangladesh|Bangladaise|ASI
Sri Lanka|Sri-lankaise|ASI
Singapour|Singapourienne|ASI
Malaisie|Malaisienne|ASI
Liban|Libanaise|MOY
Syrie|Syrienne|MOY
Israël|Israélienne|MOY
Arabie saoudite|Saoudienne|MOY
Émirats arabes unis|Émirienne|MOY|Emirats arabes unis,EAU
Qatar|Qatarie|MOY
Turquie|Turque|MOY
Iran|Iranienne|MOY
Irak|Irakienne|MOY
Jordanie|Jordanienne|MOY
Koweït|Koweïtienne|MOY
Australie|Australienne|OCE
Nouvelle-Zélande|Néo-zélandaise|OCE
Nouvelle-Calédonie|Calédonienne|OCE
Polynésie française|Polynésienne|OCE
`;
const PAYS = [];                 // [{ nom, zone }]
const ALIAS_PAYS = {};           // texte normalisé → index dans PAYS
PAYS_BRUT.split("\n").map(l => l.trim()).filter(Boolean).forEach(l => {
  const [nom, adj, zone, alias] = l.split("|");
  const i = PAYS.push({ nom, zone }) - 1;
  const formes = [nom, adj, ...(alias ? alias.split(",") : [])];
  const fem = adj || "";
  /* masculin dérivé de l'adjectif : Ivoirienne → Ivoirien, Sénégalaise → Sénégalais, Malienne → Malien… */
  formes.push(fem.replace(/ienne$/i, "ien"), fem.replace(/aise$/i, "ais"), fem.replace(/oise$/i, "ois"), fem.replace(/enne$/i, "en"),
    fem.replace(/ane$/i, "an"), fem.replace(/ine$/i, "in"), fem.replace(/e$/i, ""));
  formes.forEach(f => { const k = sans(f); if (k && !(k in ALIAS_PAYS)) ALIAS_PAYS[k] = i; });
});

function paysDe(v) {
  const s = sans(v);
  if (!s) return null;
  if (s in ALIAS_PAYS) return PAYS[ALIAS_PAYS[s]];
  const sansParentheses = sans(String(v).replace(/\(.*?\)/g, ""));   // « Congo (Brazzaville) » déjà géré ; « Mali (Bamako) » → Mali
  if (sansParentheses && sansParentheses in ALIAS_PAYS) return PAYS[ALIAS_PAYS[sansParentheses]];
  return null;
}

/* ───────── Agrégation ───────── */
const NON_RENSEIGNE = "Non renseigné";
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const trier = o => Object.entries(o).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "fr"));
const top = (o, n) => trier(o).slice(0, n).map(([cle, nb]) => ({ cle, n: nb }));
const jsonListe = v => { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
const proprement = s => { s = String(s || "").trim().replace(/\s+/g, " "); return s.length > 60 ? s.slice(0, 60) : s; };

/* Une ligne SQL → un compte « normalisé ». */
function normaliser(r) {
  const principal = [r.domaine_principal, r.init_dp, r.domaine_utilisateur, r.init_domaine].map(cleDomaine).find(Boolean) || null;
  const origine = paysDe(r.nationalite1) || paysDe(r.origine1);
  const residence = paysDe(r.pays);
  const competences = new Set();
  [r.sous_domaine_1, r.sous_domaine_2, r.init_sd1, r.init_sd2, ...jsonListe(r.competences)].forEach(c => {
    const t = proprement(typeof c === "string" ? c : ""); if (t.length >= 2) competences.add(t.toLowerCase());
  });
  return {
    role: r.role, domaine: principal,
    origine: origine ? origine.nom : null, origine_connue: !!origine,
    pays: residence ? residence.nom : null, pays_connu: !!residence,
    zone: residence ? ZONES[residence.zone] : null,
    competences: [...competences],
  };
}

function appliquerFiltres(comptes, f) {
  return comptes.filter(c =>
    (!f.role || c.role === f.role) &&
    (!f.domaine || c.domaine === f.domaine) &&
    (!f.origine || (f.origine === NON_RENSEIGNE ? !c.origine : c.origine === f.origine)) &&
    (!f.zone || (f.zone === NON_RENSEIGNE ? !c.zone : c.zone === f.zone)) &&
    (!f.pays || (f.pays === NON_RENSEIGNE ? !c.pays : c.pays === f.pays)));
}

/* Ventilation d'une dimension : nombre de comptes, taux de domaine renseigné et 3 domaines dominants. */
function ventiler(comptes, cleDe, max) {
  const g = {};
  comptes.forEach(c => {
    const k = cleDe(c) || NON_RENSEIGNE;
    const e = g[k] || (g[k] = { n: 0, renseignes: 0, domaines: {} });
    e.n++;
    if (c.domaine) { e.renseignes++; inc(e.domaines, c.domaine); }
  });
  return Object.entries(g).sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], "fr")).slice(0, max)
    .map(([cle, e]) => ({ cle, n: e.n, renseignes: e.renseignes, top_domaines: top(e.domaines, 3) }));
}

/* Tableau croisé domaines × une dimension (zone, diaspora, type de compte) pour la carte de chaleur. */
function croiser(comptes, cleDe, nbColonnes, nbLignes) {
  const colonnes = trier(comptes.reduce((o, c) => { const k = cleDe(c); if (k) inc(o, k); return o; }, {})).slice(0, nbColonnes).map(([k]) => k);
  const parDomaine = {};
  comptes.forEach(c => { if (c.domaine) inc(parDomaine, c.domaine); });
  const lignes = trier(parDomaine).slice(0, nbLignes).map(([dom]) => ({
    cle: dom,
    valeurs: colonnes.map(col => comptes.filter(c => c.domaine === dom && cleDe(c) === col).length),
  }));
  return { colonnes, lignes };
}

function cartographier(lignesSql, filtres) {
  const tous = lignesSql.map(normaliser);
  const comptes = appliquerFiltres(tous, filtres || {});
  const avecDomaine = comptes.filter(c => c.domaine);
  const parDomaine = {}; avecDomaine.forEach(c => inc(parDomaine, c.domaine));
  const compet = {}; comptes.forEach(c => c.competences.forEach(k => inc(compet, k)));
  const nonReconnus = { origines: tous.filter(c => !c.origine_connue).length, pays: tous.filter(c => !c.pays_connu).length };
  const distinct = fn => new Set(comptes.map(fn).filter(Boolean)).size;
  const disponibles = (fn) => [...new Set(tous.map(fn).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "fr"));
  const total = comptes.length;
  return {
    total, total_plateforme: tous.length,
    kpis: {
      avec_domaine: avecDomaine.length, taux_domaine: total ? Math.round(avecDomaine.length / total * 100) : 0,
      nb_domaines: Object.keys(parDomaine).length, nb_diasporas: distinct(c => c.origine), nb_pays_residence: distinct(c => c.pays),
      nb_zones: distinct(c => c.zone), nb_competences: Object.keys(compet).length,
    },
    par_domaine: trier(parDomaine).map(([cle, n]) => ({ cle, n, pct: avecDomaine.length ? Math.round(n / avecDomaine.length * 1000) / 10 : 0 })),
    par_diaspora: ventiler(comptes, c => c.origine, 30),
    par_zone: ventiler(comptes, c => c.zone, 20)
      .map(z => ({ ...z, pays: top(comptes.filter(c => (c.zone || NON_RENSEIGNE) === z.cle).reduce((o, c) => { if (c.pays) inc(o, c.pays); return o; }, {}), 5) })),
    par_pays: ventiler(comptes, c => c.pays, 25),
    par_role: ventiler(comptes, c => c.role, 6),
    croisements: {
      zone: croiser(comptes, c => c.zone, 8, 10),
      diaspora: croiser(comptes, c => c.origine, 8, 10),
      role: croiser(comptes, c => c.role, 4, 10),
    },
    top_competences: top(compet, 25),
    non_reconnus: nonReconnus,
    filtres: {
      domaines: disponibles(c => c.domaine), diasporas: disponibles(c => c.origine), zones: disponibles(c => c.zone),
      pays: disponibles(c => c.pays), roles: disponibles(c => c.role),
    },
    domaines_libelles: DOMAINES.reduce((o, d) => { o[d.cle] = { icone: d.icone, label: d.label }; return o; }, {}),
  };
}

/* Comptes de la diaspora « réels » : ni démonstration, ni masqués, ni supprimés (même règle que l'audience publicitaire). */
const SQL_COMPTES = `
  SELECT u.role, u.pays, u.nationalite1, u.origine1, u.domaine_principal, u.sous_domaine_1, u.sous_domaine_2, u.domaine_utilisateur, u.competences,
    (SELECT i.domaine_principal FROM initiatives i WHERE i.owner_user_id = u.id ORDER BY i.id LIMIT 1) AS init_dp,
    (SELECT i.sous_domaine_1    FROM initiatives i WHERE i.owner_user_id = u.id ORDER BY i.id LIMIT 1) AS init_sd1,
    (SELECT i.sous_domaine_2    FROM initiatives i WHERE i.owner_user_id = u.id ORDER BY i.id LIMIT 1) AS init_sd2,
    (SELECT i.domaine           FROM initiatives i WHERE i.owner_user_id = u.id ORDER BY i.id LIMIT 1) AS init_domaine
  FROM users u
  WHERE u.role IN ('utilisateur', 'initiative', 'collectivite')
    AND (u.compte_masque IS NULL OR u.compte_masque = 0)
    AND (u.is_demo IS NULL OR u.is_demo = FALSE)
    AND u.nom != 'Compte supprimé'`;

module.exports = { cartographier, normaliser, paysDe, cleDomaine, ZONES, DOMAINES, SQL_COMPTES };
module.exports.register = function register({ route, db, sendJSON, getCurrentUser }) {
  route("GET", "/api/admin/cartographie-competences", async (req, res, params, body, query) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    if (user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
    try {
      const lignes = await db.prepare(SQL_COMPTES).all();
      const q = query || {};
      return sendJSON(res, 200, cartographier(lignes, {
        role: q.role || "", domaine: q.domaine || "", origine: q.origine || "", pays: q.pays || "", zone: q.zone || "",
      }));
    } catch (e) {
      console.error("[cartographie-competences]", e && e.message);
      return sendJSON(res, 500, { error: "Erreur de calcul de la cartographie." });
    }
  });
};
