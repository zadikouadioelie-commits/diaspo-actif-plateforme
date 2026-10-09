/* Numéro d'immatriculation d'une structure — type choisi par la personne, contrôle de la saisie, confirmation dans le registre officiel
   et comparaison du NOM (2026-10-08, demande explicite : « un bouton RCCM / SIREN / IFU… la personne clique sur ce qu'elle va noter » ;
   « envoie à l'équipe si le nom diffère »).

   Fonctions pures (sans base de données) pour pouvoir être testées seules ; server/index.js s'en sert pour enregistrer, noter et relayer à
   l'équipe. Le registre interrogé est celui de l'État français (API publique recherche-entreprises.api.gouv.fr, gratuite, sans clé) : il ne
   couvre que SIREN / SIRET / RNA. RCCM, IFU et les autres numéros ne peuvent être contrôlés que sur leur format ; leur vérification reste
   manuelle (justificatif examiné par l'équipe). */

const TYPES = {
  RCCM:  { libelle: 'RCCM',  registre: false },
  SIREN: { libelle: 'SIREN', registre: true },
  SIRET: { libelle: 'SIRET', registre: true },
  RNA:   { libelle: 'RNA (association)', registre: true },
  IFU:   { libelle: 'IFU',   registre: false },
  AUTRE: { libelle: 'Autre', registre: false },
};

const compact = n => String(n || '').replace(/[\s.\-\/]/g, '').toUpperCase();

/* Clé de contrôle des SIREN (9 chiffres) et SIRET (14 chiffres) : algorithme de Luhn. Exception connue : les SIRET de La Poste (SIREN 356 000 000)
   ne suivent pas Luhn — leur somme de chiffres est un multiple de 5. */
function luhnValide(chiffres) {
  let somme = 0;
  for (let i = 0; i < chiffres.length; i++) {
    let d = Number(chiffres[chiffres.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    somme += d;
  }
  return somme % 10 === 0;
}
function cleValide(type, n) {
  if (type === 'SIREN') return luhnValide(n);
  if (type === 'SIRET') {
    if (luhnValide(n)) return true;
    // Autres établissements de La Poste : valides si la somme des chiffres est un multiple de 5.
    return n.startsWith('356000000') && n.split('').reduce((s, c) => s + Number(c), 0) % 5 === 0;
  }
  return true;
}

/* Type reconnu d'après la seule forme du numéro (ancien comportement de server/index.js, conservé pour les comptes qui n'ont pas de type
   enregistré). Renvoie { type, n } ou null. */
function formatImmatriculation(numero) {
  const n = compact(numero);
  if (/^W\d{9}$/.test(n)) return { type: 'RNA', n };
  if (/^\d{14}$/.test(n)) return { type: 'SIRET', n };
  if (/^\d{9}$/.test(n)) return { type: 'SIREN', n };
  return null;
}
/* Type d'un compte : celui qu'il a choisi, sinon celui que la forme du numéro laisse deviner, sinon RCCM si le texte le dit, sinon ''. */
function typeEffectif(typeChoisi, numero) {
  const t = String(typeChoisi || '').toUpperCase();
  if (TYPES[t]) return t;
  const f = formatImmatriculation(numero);
  if (f) return f.type;
  if (/^RCCM\b|^RC[\s\/\-]|^[A-Z]{2}[\s\-][A-Z]{2,4}[\s\-]\d{4}[\s\-][A-Z]/i.test(String(numero || '').trim())) return 'RCCM';
  return '';
}

/* Contrôle de la saisie selon le type choisi. → { ok, type, message? }. Volontairement tolérant pour RCCM / IFU / AUTRE (formats très variables
   selon les pays) : seule une saisie manifestement incomplète est refusée. */
function validerSaisie(typeChoisi, numero) {
  const brut = String(numero || '').trim();
  if (!brut) return { ok: false, message: "Renseignez le numéro d'immatriculation." };
  const type = typeEffectif(typeChoisi, brut);
  const n = compact(brut);
  if (typeChoisi && !TYPES[String(typeChoisi).toUpperCase()]) return { ok: false, message: "Type de numéro inconnu." };
  switch (type) {
    case 'SIREN':
      if (!/^\d{9}$/.test(n)) return { ok: false, type, message: "Un SIREN comporte 9 chiffres." };
      if (!cleValide('SIREN', n)) return { ok: false, type, message: "Ce SIREN comporte une faute de frappe (clé de contrôle invalide). Vérifiez les chiffres." };
      break;
    case 'SIRET':
      if (!/^\d{14}$/.test(n)) return { ok: false, type, message: "Un SIRET comporte 14 chiffres (SIREN + 5 chiffres)." };
      if (!cleValide('SIRET', n)) return { ok: false, type, message: "Ce SIRET comporte une faute de frappe (clé de contrôle invalide). Vérifiez les chiffres." };
      break;
    case 'RNA':
      if (!/^W\d{9}$/.test(n)) return { ok: false, type, message: "Un numéro RNA s'écrit W suivi de 9 chiffres (ex. W751234567)." };
      break;
    case 'RCCM':
      if (n.length < 6 || !/\d/.test(n)) return { ok: false, type, message: "Un RCCM comporte le pays, la ville, l'année et un numéro (ex. CI-ABJ-2024-B-1234)." };
      break;
    case 'IFU':
      if (n.length < 5 || !/\d/.test(n)) return { ok: false, type, message: "Ce numéro IFU paraît incomplet." };
      break;
    default:
      if (n.length < 4) return { ok: false, type: type || 'AUTRE', message: "Ce numéro paraît incomplet." };
  }
  return { ok: true, type: type || 'AUTRE' };
}

/* ── Comparaison des noms ── */
const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'en', 'au', 'aux', 'pour', 'sur', 'a', 'the', 'of', 'and']);
const MOTS_JURIDIQUES = new Set(['association', 'asso', 'ong', 'sas', 'sasu', 'sarl', 'eurl', 'sa', 'scop', 'scic', 'sci', 'snc', 'sca', 'ste', 'societe', 'entreprise',
  'cooperative', 'fondation', 'federation', 'collectif', 'groupement', 'loi', '1901', 'ets', 'etablissements', 'etablissement', 'compagnie', 'cie', 'international']);
function jetons(nom) {
  const base = String(nom || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' et ').replace(/[^a-z0-9]+/g, ' ').trim();
  const tous = base.split(/\s+/).filter(Boolean);
  const utiles = tous.filter(t => !MOTS_VIDES.has(t) && !MOTS_JURIDIQUES.has(t));
  return utiles.length ? utiles : tous.filter(t => !MOTS_VIDES.has(t));
}
function memeNom(a, b) {
  const A = jetons(a), B = jetons(b);
  if (!A.length || !B.length) return false;
  const ca = A.join(''), cb = B.join('');
  if (ca === cb) return true;                                     // « Diaspo Actif » = « DiaspoActif »
  const sa = new Set(A), sb = new Set(B);
  const [petit, grand] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  const inclus = [...petit].every(t => grand.has(t));
  if (inclus && (petit.size >= 2 || [...petit][0].length >= 5)) return true;   // un nom contenu dans l'autre (sigle exclu : trop court)
  const commun = [...sa].filter(t => sb.has(t)).length;
  const jaccard = commun / new Set([...sa, ...sb]).size;
  if (jaccard >= 0.6) return true;
  const [pc, gc] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  return pc.length >= 6 && gc.includes(pc);                       // « diasporactif » contenu dans « diasporactifinternational »
}
/* saisis : noms donnés par la personne (nom de la structure, dénomination officielle…) ; registre : noms du registre (raison sociale, sigle,
   enseignes…). Vrai dès qu'un nom saisi correspond à un nom du registre. */
function nomsConcordent(saisis, registre) {
  const a = (saisis || []).map(x => String(x || '').trim()).filter(Boolean);
  const b = (registre || []).map(x => String(x || '').trim()).filter(Boolean);
  return a.some(x => b.some(y => memeNom(x, y)));
}

/* ── Registre officiel français ──
   → { statut: 'ok' | 'introuvable' | 'indisponible' | 'format' | 'cle_invalide', nom?, noms? } — le numéro cherché doit se retrouver À L'IDENTIQUE
   (siren, siret du siège ou identifiant d'association) : l'API fait une recherche floue et peut renvoyer des structures sans rapport pour un
   faux numéro. `noms` liste tous les noms du registre pour cette structure, utilisés pour la comparaison. */
async function chercherRegistre(numero, fetchImpl) {
  const f = formatImmatriculation(numero);
  if (!f) return { statut: 'format' };
  if (!cleValide(f.type, f.n)) return { statut: 'cle_invalide' };
  try {
    const r = await (fetchImpl || fetch)('https://recherche-entreprises.api.gouv.fr/search?q=' + encodeURIComponent(f.n), { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { statut: 'indisponible' };
    const data = await r.json();
    const match = (data.results || []).find(x => {
      const siren = String(x.siren || '').toUpperCase(), siret = String(x.siege?.siret || '').toUpperCase(), rna = String(x.complements?.identifiant_association || '').toUpperCase();
      return siren === f.n || siret === f.n || (rna && rna === f.n);
    });
    /* Une fiche sans nom (SIREN « fantôme » du registre, constaté sur 123456789) ne confirme aucune structure réelle. Limite assumée : le registre
       prouve qu'une structure existe sous ce numéro, pas que ce compte en est le titulaire — d'où la comparaison des noms ci-dessus et, au besoin,
       l'examen par l'équipe. */
    const nom = match ? (match.nom_complet || match.nom_raison_sociale || null) : null;
    if (!nom) return { statut: 'introuvable' };
    const noms = [...new Set([match.nom_complet, match.nom_raison_sociale, match.sigle, match.siege?.nom_commercial, ...(match.siege?.liste_enseignes || [])]
      .map(x => String(x || '').trim()).filter(Boolean))];
    return { statut: 'ok', nom, noms };
  } catch (e) { return { statut: 'indisponible' }; }
}

module.exports = { TYPES, compact, luhnValide, cleValide, formatImmatriculation, typeEffectif, validerSaisie, jetons, memeNom, nomsConcordent, chercherRegistre };
