/* ===========================================================
   server/boutique-reglages.js — Réglages par boutique (assistant de création, lot 2, 2026-11-13)
   ===========================================================
   Étapes de la maquette « Paramètres vitrine » : 6 Paramètres commerciaux, 7 Livraison et expéditions, 10 Confiance et informations légales.
   Les valeurs par défaut n'imposent AUCUNE restriction : une boutique qui n'a rien réglé se comporte exactement comme avant.
   Tout est enregistré dans le brouillon, puis publié avec le reste (voir server/index.js, vitrine-draft / vitrine-publish).

   Ce qui est APPLIQUÉ au moment de la commande (controlerCommande, fraisLivraison) :
     - minimum de commande ; pays de vente (adresse d'expédition) ; expédition / retrait autorisés par la boutique ; frais de livraison (par produit, gratuit ou fixe).
   Ce qui est seulement ENREGISTRÉ puis affiché : délai de préparation, délai estimé, informations légales (confiance).
   =========================================================== */
"use strict";

const STATUTS_JURIDIQUES = ["", "Auto-entrepreneur", "Entreprise (SAS, SARL…)", "Association", "Particulier (sans entreprise)", "Autre"];
const MODES_FRAIS = ["produit", "gratuit", "fixe"];
const DOCUMENTS = ["cgv", "retours", "mentions", "confidentialite"];
const MAX_PAYS = 250;

function defauts() {
  return {
    commercial: { minimum_commande: 0, pays_vente: [] },
    livraison: { expedition: true, retrait: true, frais_mode: "produit", frais_montant: 0, preparation_jours: 0, delai_estime: "" },
    confiance: {
      raison_sociale: "", nom_commercial: "", statut_juridique: "", siret: "", email: "", tel: "",
      cgv: { texte: "", url: "" }, retours: { texte: "", url: "" }, mentions: { texte: "", url: "" }, confidentialite: { texte: "", url: "" },
    },
  };
}

const texte = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
const nombre = (v, min, max, repli) => { const n = Number(String(v == null ? "" : v).replace(",", ".")); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : repli; };
const booleen = (v, repli) => (v === undefined || v === null ? repli : v === true || v === 1 || v === "1" || v === "true");
const lienSur = (v) => { const s = texte(v, 300); return /^https?:\/\/\S+$/i.test(s) ? s : ""; };

/* Lecture tolérante d'une colonne JSON : n'importe quelle valeur illisible redonne les défauts. */
function lire(brut) {
  let o = brut;
  if (typeof brut === "string") { try { o = JSON.parse(brut || "{}"); } catch (_) { o = {}; } }
  if (!o || typeof o !== "object" || Array.isArray(o)) o = {};
  return normaliser(o).reglages;
}

/* Normalise un objet partiel (les champs absents gardent leur valeur actuelle) et signale la première erreur. */
function normaliser(entree, actuel) {
  const base = actuel ? JSON.parse(JSON.stringify(actuel)) : defauts();
  const d = defauts();
  const e = entree && typeof entree === "object" ? entree : {};
  const c = e.commercial && typeof e.commercial === "object" ? e.commercial : null;
  const l = e.livraison && typeof e.livraison === "object" ? e.livraison : null;
  const k = e.confiance && typeof e.confiance === "object" ? e.confiance : null;

  if (c) {
    if (c.minimum_commande !== undefined) base.commercial.minimum_commande = Math.round(nombre(c.minimum_commande, 0, 100000, d.commercial.minimum_commande) * 100) / 100;
    if (c.pays_vente !== undefined) {
      if (!Array.isArray(c.pays_vente)) return { erreur: "La liste des pays de vente est invalide." };
      if (c.pays_vente.length > MAX_PAYS) return { erreur: "Trop de pays dans la liste." };
      const vus = new Set();
      base.commercial.pays_vente = c.pays_vente.map(p => texte(p, 60)).filter(p => p && !vus.has(p.toLowerCase()) && vus.add(p.toLowerCase()));
    }
  }
  if (l) {
    if (l.expedition !== undefined) base.livraison.expedition = booleen(l.expedition, true);
    if (l.retrait !== undefined) base.livraison.retrait = booleen(l.retrait, true);
    if (l.frais_mode !== undefined) {
      if (!MODES_FRAIS.includes(l.frais_mode)) return { erreur: "Le mode de frais de livraison est invalide." };
      base.livraison.frais_mode = l.frais_mode;
    }
    if (l.frais_montant !== undefined) base.livraison.frais_montant = Math.round(nombre(l.frais_montant, 0, 1000, 0) * 100) / 100;
    if (l.preparation_jours !== undefined) base.livraison.preparation_jours = Math.round(nombre(l.preparation_jours, 0, 60, 0));
    if (l.delai_estime !== undefined) base.livraison.delai_estime = texte(l.delai_estime, 80);
  }
  if (k) {
    for (const champ of ["raison_sociale", "nom_commercial"]) if (k[champ] !== undefined) base.confiance[champ] = texte(k[champ], 120);
    if (k.statut_juridique !== undefined) {
      if (!STATUTS_JURIDIQUES.includes(k.statut_juridique)) return { erreur: "Le statut juridique est invalide." };
      base.confiance.statut_juridique = k.statut_juridique;
    }
    if (k.siret !== undefined) base.confiance.siret = texte(k.siret, 40);
    if (k.tel !== undefined) base.confiance.tel = texte(k.tel, 40);
    if (k.email !== undefined) {
      const m = texte(k.email, 120);
      if (m && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) return { erreur: "L'adresse e-mail de contact est invalide." };
      base.confiance.email = m;
    }
    for (const doc of DOCUMENTS) {
      if (k[doc] === undefined) continue;
      if (!k[doc] || typeof k[doc] !== "object") return { erreur: "Un document légal est invalide." };
      if (k[doc].texte !== undefined) base.confiance[doc].texte = texte(k[doc].texte, 8000);
      if (k[doc].url !== undefined) {
        const brut = texte(k[doc].url, 300);
        const sur = lienSur(brut);
        if (brut && !sur) return { erreur: "Un lien de document doit commencer par http:// ou https://." };
        base.confiance[doc].url = sur;
      }
    }
  }
  return { reglages: base };
}

const sansAccent = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-'’]/g, " ").replace(/\s+/g, " ").trim();

/* Contrôle d'une commande avant création. Renvoie un message d'erreur, ou null si tout est permis.
   mode : "retrait" | "expedition" — pays : pays saisi pour l'expédition — montant : prix des articles hors livraison. */
function controlerCommande(reglages, { mode, pays, montant }) {
  const r = reglages || defauts();
  if (mode === "expedition" && r.livraison.expedition === false) return "Cette boutique ne propose pas l'expédition.";
  if (mode === "retrait" && r.livraison.retrait === false) return "Cette boutique ne propose pas le retrait sur place.";
  const min = Number(r.commercial.minimum_commande) || 0;
  if (min > 0 && montant !== undefined && Number(montant) + 1e-9 < min) return "Le montant minimum de commande de cette boutique est de " + min.toFixed(2).replace(".", ",") + " €.";
  const zones = r.commercial.pays_vente || [];
  if (mode === "expedition" && zones.length && pays !== undefined && !zones.some(z => sansAccent(z) === sansAccent(pays))) {
    return "Cette boutique ne livre pas dans ce pays. Pays desservis : " + zones.join(", ") + ".";
  }
  return null;
}

/* Frais de livraison d'UNE commande : « produit » garde le frais du produit, « gratuit » le supprime, « fixe » impose le montant. */
function fraisLivraison(reglages, fraisProduit) {
  const l = (reglages || defauts()).livraison;
  if (l.frais_mode === "gratuit") return 0;
  if (l.frais_mode === "fixe") return Number(l.frais_montant) || 0;
  return Number(fraisProduit) || 0;
}

module.exports = { defauts, lire, normaliser, controlerCommande, fraisLivraison, STATUTS_JURIDIQUES, MODES_FRAIS, DOCUMENTS, MAX_PAYS };
