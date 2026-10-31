/* ═════════════════════════════════════════════════
   server/kofi-portefeuille.js — LE PORTEFEUILLE DE KOFFI (2026-10-31)

   Un SEUL solde, en euros, pour tout Koffi : tuteur des formations, assistant de création du formateur et conseiller de l'Annuaire.
   - Chaque compte Premium reçoit un crédit d'utilisation MENSUEL (mois civil, remis à zéro le 1er, non reporté) : 0,50 € par défaut pour un utilisateur, une initiative
     ou une collectivité (réglages de l'administration). Épuisé, la personne recharge.
   - Chaque appel à l'IA est décompté à son coût réel (kofi_usage.cout_eur) multiplié par le coefficient des réglages (1 par défaut).
   - Recharge : on PAIE `recharge_ratio` fois le crédit reçu (3 € payés = 1 € d'utilisation par défaut ; minimum 3 €). Le crédit acheté dure 12 mois.
     Il reste utilisable même si le Premium s'arrête (seul le crédit MENSUEL est réservé aux comptes Premium).
   - Les comptes SANS Premium ont 15 questions offertes au total, jamais renouvelées (table kofi_credits, lot « gratuit »), pour le tuteur et l'assistant de création ;
     une fois épuisées, ils rechargent (même minimum, même ratio) et utilisent le crédit acheté. Le conseiller de l'Annuaire leur reste fermé.
   - Les questions sur ce que sait faire Koffi ne coûtent rien (voir kofi-competences.js) : elles ne passent jamais par ici.
   ═════════════════════════════════════════════════ */
"use strict";

/* En dessous, le solde est considéré comme épuisé : aucun appel n'est lancé. */
const MIN_APPEL_EUR = 0.001;
/* Coût moyen d'un échange, par outil : sert UNIQUEMENT à traduire le solde en « environ N questions » pour l'affichage. */
const COUT_MOYEN = { eleve: 0.0007, createur: 0.0015, annuaire: 0.0012 };

const arrondi = (n, d) => { const p = Math.pow(10, d); return Math.round((Number(n) || 0) * p) / p; };
const sqlDate = d => d.toISOString().slice(0, 19).replace("T", " ");

/* Mois civil à Paris : « AAAA-MM ». Le 1er du mois suivant : « AAAA-MM-01 ». */
function moisParis(date) {
  const p = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).format(date || new Date());
  return p.slice(0, 7);
}
function moisSuivant(date) {
  const [a, m] = moisParis(date).split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

/* Le compte « Diaspo'Actif Officiel » et les comptes administrateurs n'ont AUCUNE limite (décision du 2026-10-31) : ni solde, ni plafond quotidien.
   Il n'existe pas de rôle « officiel » : le compte officiel est une initiative (son responsable est un compte de rôle « initiative »). Il est désigné, au choix de l'administration,
   par le réglage « compte_officiel_id » (Budget IA) ou par le marquage users.is_official=1 (en production aucun compte n'est marqué : d'où le réglage). Jamais d'identifiant codé en dur. */
const ILLIMITES = ["administrateur"];
const illimite = role => ILLIMITES.includes(role);
const _officiels = new Map();   /* cache de 30 s du marquage is_official */
async function estIllimite(db, { userId, role, r }) {
  if (illimite(role)) return true;
  const id = Number(userId);
  if (r && Number(r.compte_officiel_id) > 0 && Number(r.compte_officiel_id) === id) return true;
  const c = _officiels.get(id);
  if (c && Date.now() - c.t < 30000) return c.ok;
  let ok = false;
  try { const u = await db.prepare("SELECT is_official FROM users WHERE id=?").get(id); ok = !!(u && Number(u.is_official) === 1); } catch (_) { ok = false; }
  _officiels.set(id, { t: Date.now(), ok });
  return ok;
}

/* Crédit mensuel offert selon le type de compte. */
function creditMensuel(r, role) {
  if (role === "initiative") return Number(r.credit_mensuel_initiative_eur);
  if (role === "collectivite" || role === "institutionnel") return Number(r.credit_mensuel_collectivite_eur);
  return Number(r.credit_mensuel_utilisateur_eur);
}

/* Montants de recharge proposés (payés) et crédit d'utilisation reçu en échange. */
function offresRecharge(r) {
  const min = Number(r.recharge_min_eur), ratio = Math.max(1, Number(r.recharge_ratio));
  return [min, min * 2, min * 5].map(paye => ({ paye_eur: arrondi(paye, 2), credit_eur: arrondi(paye / ratio, 2) }));
}

/* Lots utilisables : le crédit du mois en cours d'abord (s'il est permis), puis les lots achetés, le plus proche de l'échéance en premier. */
async function lotsValides(db, userId, { avecMensuel }) {
  const maintenant = sqlDate(new Date());
  const rows = await db.prepare("SELECT * FROM kofi_solde WHERE user_id=? AND montant_restant>0 ORDER BY id").all(Number(userId));
  const mois = moisParis();
  const valides = rows.filter(l => l.origine === "mensuel" ? (avecMensuel && l.mois === mois) : (!l.expire_le || String(l.expire_le) > maintenant));
  return valides.sort((a, b) => (a.origine === b.origine ? (String(a.expire_le || "9") < String(b.expire_le || "9") ? -1 : 1) : (a.origine === "mensuel" ? -1 : 1)));
}

/* Crée, une seule fois par mois, le crédit offert du compte Premium. Sans effet si le crédit existe déjà (index unique) ou si la réserve d'IA est basse. */
async function assurerCreditMensuel(db, userId, r, role) {
  const montant = creditMensuel(r, role);
  if (!(montant > 0)) return false;
  const mois = moisParis();
  if (await db.prepare("SELECT id FROM kofi_solde WHERE user_id=? AND origine='mensuel' AND mois=?").get(Number(userId), mois)) return false;
  try {
    await db.prepare("INSERT INTO kofi_solde (user_id, origine, mois, montant_total, montant_restant, reference) VALUES (?,?,?,?,?,?)").run(Number(userId), "mensuel", mois, montant, montant, "crédit mensuel " + mois);
    return true;
  } catch (e) { if (/unique|duplicate|constraint/i.test(String(e && e.message))) return false; throw e; }
}

/* Photographie du portefeuille d'un compte.
   premium : le compte est Premium actif (ou administrateur) ; reserveBasse : la réserve d'IA est sous le seuil → le crédit offert est suspendu, le crédit acheté reste utilisable. */
async function etat(db, { userId, role, r, premium, reserveBasse }) {
  const offres = offresRecharge(r);
  const base = { recharge: { min_eur: Number(r.recharge_min_eur), ratio: Number(r.recharge_ratio), offres, validite_mois: Number(r.forfait_validite_mois) } };
  if (await estIllimite(db, { userId, role, r })) return { ...base, type: "illimite", illimite: true, premium: true, solde_eur: null, mensuel_restant_eur: 0, mensuel_eur: 0, achete_restant_eur: 0, achete_expire: null, offertes: null, renouvelle_le: null, bas: false, epuise: false, reserve_basse: false, equivalent: null };
  const avecMensuel = !!premium && !reserveBasse;
  if (avecMensuel) await assurerCreditMensuel(db, userId, r, role);
  const lots = await lotsValides(db, userId, { avecMensuel });
  const mensuel = lots.filter(l => l.origine === "mensuel").reduce((a, l) => a + Number(l.montant_restant), 0);
  const achete = lots.filter(l => l.origine !== "mensuel").reduce((a, l) => a + Number(l.montant_restant), 0);
  const total = arrondi(mensuel + achete, 6);
  const alloc = creditMensuel(r, role);
  const expire = lots.filter(l => l.origine !== "mensuel" && l.expire_le).map(l => l.expire_le).sort()[0] || null;
  /* Questions offertes aux comptes sans Premium : un total, jamais renouvelé. */
  let offertes = null;
  if (!premium) {
    const g = await db.prepare("SELECT questions_total, questions_restantes FROM kofi_credits WHERE user_id=? AND origine='gratuit'").get(Number(userId));
    offertes = { total: g ? Number(g.questions_total) : Number(r.gratuit_questions), restantes: g ? Number(g.questions_restantes) : Number(r.gratuit_questions), renouvelable: false, accorde: !!g };
  }
  const seuilBas = (alloc || creditMensuel(r, "utilisateur")) * (Number(r.alerte_solde_pct) / 100);
  return {
    ...base, type: "euros", premium: !!premium,
    solde_eur: total, mensuel_restant_eur: arrondi(mensuel, 4), mensuel_eur: premium ? alloc : 0, achete_restant_eur: arrondi(achete, 4), achete_expire: expire, offertes,
    renouvelle_le: premium ? moisSuivant() : null, bas: total >= MIN_APPEL_EUR && total <= seuilBas, epuise: total < MIN_APPEL_EUR, reserve_basse: !!reserveBasse,
    equivalent: { eleve: Math.floor(total / COUT_MOYEN.eleve / Math.max(1, Number(r.coefficient_cout))), createur: Math.floor(total / COUT_MOYEN.createur / Math.max(1, Number(r.coefficient_cout))), annuaire: Math.floor(total / COUT_MOYEN.annuaire / Math.max(1, Number(r.coefficient_cout))) },
  };
}

/* Retire `cout` € (déjà multiplié par le coefficient) des lots, dans l'ordre. Atomique par lot. Renvoie { reste, depuis_achat } :
   `reste` = part non couverte (le dernier échange peut dépasser de quelques millièmes d'euro : la plateforme l'absorbe). */
async function debiter(db, userId, cout, { avecMensuel }) {
  let reste = arrondi(cout, 6), depuisAchat = false;
  if (!(reste > 0)) return { reste: 0, depuis_achat: false };
  for (const lot of await lotsValides(db, userId, { avecMensuel })) {
    if (reste <= 0) break;
    const prise = arrondi(Math.min(Number(lot.montant_restant), reste), 6);
    if (!(prise > 0)) continue;
    const res = await db.prepare("UPDATE kofi_solde SET montant_restant=montant_restant-? WHERE id=? AND montant_restant>=?").run(prise, lot.id, prise);
    if (res && Number(res.changes) === 1) { reste = arrondi(reste - prise, 6); if (lot.origine !== "mensuel") depuisAchat = true; }
  }
  return { reste, depuis_achat: depuisAchat };
}

/* Les questions offertes (comptes sans Premium) sont-elles utilisables ? Pas de NOUVEL essai offert quand la réserve d'IA est basse. */
const offertesDispo = e => !!(e && e.offertes && e.offertes.restantes > 0 && (e.offertes.accorde || !e.reserve_basse));
/* Peut-on lancer un appel ? (solde suffisant) */
const peutAppeler = e => !!e && (!!e.illimite || e.solde_eur >= MIN_APPEL_EUR);
const peutUtiliser = e => offertesDispo(e) || peutAppeler(e);

/* Crédite un achat confirmé (webhook Stripe) : `creditEur` d'utilisation, valable `moisValidite` mois. */
async function crediterAchat(db, userId, creditEur, moisValidite, reference) {
  const fin = new Date(); fin.setMonth(fin.getMonth() + Number(moisValidite || 12));
  const x = await db.prepare("INSERT INTO kofi_solde (user_id, origine, mois, montant_total, montant_restant, expire_le, reference) VALUES (?,?,?,?,?,?,?)")
    .run(Number(userId), "achat", null, creditEur, creditEur, sqlDate(fin), reference || null);
  return x.lastInsertRowid;
}

const eur = v => (Math.round(Number(v) * 100) / 100).toFixed(2).replace(".", ",") + " €";
const TEXTE_RECHARGE_NON_REMBOURSABLE = "Achat définitif : le crédit d'utilisation de Koffi acheté ne donne lieu à aucun remboursement, qu'il soit utilisé ou non. Il est valable 12 mois. Réfléchissez bien avant d'acheter.";
const TEXTE_RECHARGE_RETRACTATION = "Je demande l'utilisation immédiate de mon crédit et je reconnais que je perds mon droit de rétractation dès que la recharge est créditée.";
const VERSION_CONSENTEMENT_RECHARGE = "2026-10-31";

module.exports = {
  MIN_APPEL_EUR, COUT_MOYEN, illimite, estIllimite, moisParis, moisSuivant, creditMensuel, offresRecharge, lotsValides, assurerCreditMensuel, etat, debiter, peutAppeler, offertesDispo, peutUtiliser, crediterAchat,
  TEXTE_RECHARGE_NON_REMBOURSABLE, TEXTE_RECHARGE_RETRACTATION, VERSION_CONSENTEMENT_RECHARGE, eur, arrondi,
};
