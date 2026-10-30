/* ═══════════════════════════════════════════════════════
   server/kofi-pays.js — Pays où Koffi (tuteur IA) peut être utilisé (2026-10-30)
   Le fournisseur d'IA n'est disponible que dans certains pays : « Any country or region not listed is unsupported », et cela couvre l'usage par une personne se
   trouvant physiquement dans une région non prise en charge, y compris les utilisateurs d'un client autorisé (conditions commerciales, art. D.2 ; politique des
   régions prises en charge). Koffi est donc fermé aux personnes connectées depuis un pays hors liste ; le reste de la plateforme reste ouvert partout.
   Le pays est déduit de l'adresse IP par l'hébergeur (en-tête x-vercel-ip-country) ; il n'est ni stocké ni journalisé. Meilleur effort : un VPN le contourne.
   Pays inconnu (en-tête absent, « XX », réseau Tor « T1 ») = autorisé : on ne bloque pas par défaut quelqu'un dont on ne peut rien dire.
   ═══════════════════════════════════════════════════════ */

const SOURCE = "https://www.anthropic.com/supported-countries";
/* Liste copiée de la page ci-dessus le 2026-10-30 : 185 pays (la politique annonce une version « effective » le 12 novembre 2026 : À RE-VÉRIFIER). */
const RELEVE_LE = "2026-10-30";
const CODES = ("AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CO KM CG CD CR CI HR CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ NA NR NP NL NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SO SB ZA KR SS ES LK SD SR SE CH TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VN ZM ZW").split(" ");

/* « Territories and dependencies of a listed country are also supported » : ces territoires héritent du statut de leur pays de rattachement. */
const TERRITOIRES = {
  FR: "GF GP MQ RE YT PM BL MF NC PF WF TF", US: "PR GU VI AS MP UM", GB: "GG JE IM GI KY BM VG AI MS TC FK SH IO PN GS",
  NL: "AW CW SX BQ", DK: "GL FO", NO: "SJ BV", AU: "CX CC NF HM", NZ: "CK NU TK", FI: "AX",
};
const PARENT = {};
Object.keys(TERRITOIRES).forEach(p => TERRITOIRES[p].split(" ").forEach(t => { PARENT[t] = p; }));
const SUPPORTES = new Set(CODES);

/* Code pays (2 lettres) de la requête, ou null s'il est inconnu. */
function codePaysDe(req) {
  const h = (req && req.headers) || {};
  const v = String(h["x-vercel-ip-country"] || h["cf-ipcountry"] || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) && v !== "XX" && v !== "T1" ? v : null;
}
/* true = pris en charge, false = hors liste, null = pays inconnu (autorisé). */
function priseEnCharge(code) {
  if (!code) return null;
  return SUPPORTES.has(PARENT[code] || code);
}

module.exports = { SOURCE, RELEVE_LE, CODES, TERRITOIRES, codePaysDe, priseEnCharge };
