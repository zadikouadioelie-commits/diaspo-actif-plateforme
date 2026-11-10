/* ═════════════════════════════════════════════════════════════════
   server/retours.js — Réclamations, retours et remboursements des commandes de boutique (lot G, 2026-11-10)

   Référence : dossier-claude-code/03-reclamations-remboursements.md et 05-tests-acceptation.md §5.4 ;
   plan : Téléchargements\PLAN-lot-G-retours-remboursements.md. Les réglages encore ouverts sont dans server/retours-config.js.

   Acteurs : le client (acheteur connecté), le vendeur (propriétaire de la boutique), l'administrateur (litiges).
   Statuts : envoyee → precisions → acceptee / refusee → remboursement_en_cours → remboursee ;
             envoyee (15 jours sans réponse, calcul SERVEUR par la tâche planifiée) → litige → litige_traite.
   Un dossier en litige est VERROUILLÉ pour le vendeur.
   Traçabilité : chaque événement est écrit dans dispute_events (ajout seul, heure serveur, jamais modifié ni supprimé).
   Remboursement : demandé au prestataire depuis le compte du commerçant (server/payments/refunds.js) ; « remboursé »
   n'est écrit qu'après la confirmation du prestataire (webhook Stripe ou relecture de l'état par l'API).
   Le montant est recalculé côté serveur à partir de la commande, jamais saisi par le client.
   ═════════════════════════════════════════════════════════════════ */
"use strict";

const Config = require("./retours-config");
const Refunds = require("./payments/refunds");

const JOUR = 86400000;
const sqlDate = (t) => new Date(t).toISOString().slice(0, 19).replace("T", " ");
function ms(v) {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const s = String(v);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z").getTime() || 0;
}

const STATUTS_TERMINAUX = ["refusee", "remboursee", "litige_traite"];
const ROLE_LIBELLE = { client: "client", vendeur: "vendeur", administrateur: "administrateur litiges", systeme: "système" };

/* ── Historique (ajout seul) ─────────────────────────────────────── */

async function ajouterEvenement(db, { retourId, auteurId = null, role, action, avant = null, apres = null, message = null, piece = null, maintenant = new Date() }) {
  const t = sqlDate(maintenant);
  await db.prepare(`INSERT INTO dispute_events (retour_id, auteur_id, role, action, statut_avant, statut_apres, message, piece_url, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(retourId, auteurId, role, action, avant, apres, message, piece, t);
  /* La dernière activité (client, vendeur, administrateur ou système) repousse le délai de 15 jours. */
  await db.prepare(`UPDATE retours SET derniere_activite_at=?, updated_at=? WHERE id=?`).run(t, t, retourId);
}

/* Change le statut SEULEMENT si le dossier est encore dans l'un des statuts de départ (garde contre deux actions simultanées,
   par exemple la tâche des 15 jours et le vendeur). Renvoie false si le dossier a déjà changé. */
async function transition(db, retour, { de, vers, auteurId = null, role, action, message = null, piece = null, extra = null, maintenant = new Date() }) {
  const t = sqlDate(maintenant);
  const marques = de.map(() => "?").join(",");
  const r = await db.prepare(`UPDATE retours SET statut=?, updated_at=?, derniere_activite_at=? ${extra ? ", " + extra.sql : ""} WHERE id=? AND statut IN (${marques})`)
    .run(vers, t, t, ...(extra ? extra.args : []), retour.id, ...de);
  if (!r || !Number(r.changes)) return false;
  await ajouterEvenement(db, { retourId: retour.id, auteurId, role, action, avant: retour.statut, apres: vers, message, piece, maintenant });
  retour.statut = vers;
  return true;
}

/* ── Photo (1 Mo au plus, type vérifié par signature) ───────────────── */

function lirePhoto(photoBase64) {
  if (!photoBase64) return { ok: true, buffer: null };
  const brut = String(photoBase64);
  const m = brut.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is);
  const b64 = (m ? m[2] : brut).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return { ok: false, erreur: "Photo illisible." };
  const buffer = Buffer.from(b64, "base64");
  if (buffer.length > Config.PHOTO_MAX_OCTETS) return { ok: false, erreur: "Photo trop lourde : 1 Mo maximum." };
  let ext = null;
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ext = "jpg";
  else if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ext = "png";
  else if (buffer.length > 6 && buffer.subarray(0, 4).toString("latin1") === "GIF8") ext = "gif";
  else if (buffer.length > 12 && buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") ext = "webp";
  if (!ext) return { ok: false, erreur: "Format de photo non reconnu (JPEG, PNG, WebP ou GIF)." };
  return { ok: true, buffer, ext };
}

async function enregistrerPhoto(photo, commandeId) {
  if (!photo.buffer) return null;
  if (process.env.BUNNY_API_KEY) {
    const { uploadToBunny } = require("./upload");
    return uploadToBunny(photo.buffer, `retour-${commandeId}-${Date.now()}.${photo.ext}`, "retours");
  }
  /* Sans stockage de fichiers configuré (développement, tests) : l'image reste dans la base, sous forme de data URL. */
  const mime = { jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" }[photo.ext];
  return `data:${mime};base64,${photo.buffer.toString("base64")}`;
}

/* ── Règle de retour affichée ────────────────────────────────────── */

function regleDe(regleId) {
  const r = Config.REGLES_RETOUR.find((x) => x.id === regleId);
  return r ? r.txt : "Règle non précisée par le vendeur.";
}

/* ── Mise en forme ───────────────────────────────────────────────── */

async function formaterDossier(db, r, { vue, maintenant = Date.now() }) {
  const evts = await db.prepare(`SELECT created_at, role, action, statut_avant, statut_apres, message, piece_url FROM dispute_events WHERE retour_id=? ORDER BY id ASC`).all(r.id);
  const refund = await db.prepare(`SELECT statut, montant, devise, provider, confirme_at FROM refunds WHERE retour_id=? ORDER BY id DESC LIMIT 1`).get(r.id);
  return {
    id: r.id,
    commande_id: r.commande_id,
    produit: r.produit_nom,
    quantite: r.quantite,
    montant: r.montant_commande,
    devise: r.devise,
    regle: r.regle_retour,
    motif: r.motif,
    details: r.details,
    photo: r.photo_url || null,
    statut: r.statut,
    decision: r.decision || null,
    cree_le: r.created_at,
    derniere_activite: r.derniere_activite_at,
    jours_sans_reponse: Math.max(0, Math.floor((maintenant - ms(r.derniere_activite_at)) / JOUR)),
    /* Le vendeur ne peut plus agir dès que le dossier est confié à l'administrateur ou terminé. */
    verrouille_vendeur: ["litige", "litige_traite", "remboursement_en_cours", "remboursee", "refusee"].includes(r.statut),
    remboursement: refund ? { statut: refund.statut, montant: refund.montant, devise: refund.devise, confirme_le: refund.confirme_at || null } : null,
    historique: evts.map((e) => ({ le: e.created_at, par: ROLE_LIBELLE[e.role] || e.role, action: e.action, texte: e.message || "", piece: e.piece_url || null })),
    ...(vue === "vendeur" ? { plaignant: r._plaignant_nom || null } : {}),
    ...(vue === "admin" ? {
      boutique: r._boutique_nom || null, proprietaire: r._proprietaire_nom || null,
      plaignant: r._plaignant_nom || null, plaignant_email: r._plaignant_email || null,
    } : {}),
  };
}

/* ── Notifications ───────────────────────────────────────────────── */

async function notifierAdministrateurs(db, creerNotif, type, titre, contenu, data) {
  const admins = await db.prepare(`SELECT id FROM users WHERE role='administrateur'`).all();
  for (const a of admins) creerNotif(a.id, type, titre, contenu, data);
}

/* ── Remboursement : confirmation / échec (prestataire) ─────────────── */

async function ligneComptable(db, commandeId) {
  const lignes = await db.prepare(`SELECT * FROM wallet_transactions WHERE commande_vitrine_id=? ORDER BY id ASC`).all(commandeId);
  return {
    plateforme: lignes.find((l) => l.type === "platform_fee"),
    vendeur: lignes.find((l) => l.type === "organizer_credit"),
  };
}

/* Écritures de contrepartie (jamais de réécriture de l'historique), comme pour les billets d'événements. */
async function appliquerComptabilite(db, commande, init) {
  const { plateforme, vendeur } = await ligneComptable(db, commande.id);
  if (!Number(commande.paiement_direct)) {
    /* Ancienne commande encaissée par la plateforme : le vendeur avait été crédité, on reprend ce crédit et la commission. */
    const frais = plateforme ? Number(plateforme.montant) : 0;
    const part = vendeur ? Number(vendeur.montant) : 0;
    const taux = plateforme ? plateforme.commission_rate : null;
    const prix = Number(commande.montant_total) || 0;
    await db.prepare(`INSERT INTO wallet_transactions (commande_vitrine_id,type,beneficiaire_id,montant,commission_rate,prix_billet,platform_fee,organizer_amount,sens) VALUES (?,'refund_platform_fee',NULL,?,?,?,?,?,'debit')`)
      .run(commande.id, frais, taux, prix, frais, part);
    await db.prepare(`INSERT INTO wallet_transactions (commande_vitrine_id,type,beneficiaire_id,montant,commission_rate,prix_billet,platform_fee,organizer_amount,sens) VALUES (?,'refund_organizer_debit',?,?,?,?,?,?,'debit')`)
      .run(commande.id, init ? init.owner_user_id : null, part, taux, prix, frais, part);
    if (init && part) await db.prepare(`UPDATE users SET wallet_balance = COALESCE(wallet_balance,0) - ? WHERE id=?`).run(part, init.owner_user_id);
    if (frais) await db.prepare(`UPDATE platform_wallet SET total_commissions = total_commissions - ?, updated_at = datetime('now') WHERE id = 1`).run(frais);
  } else if (Config.REMBOURSER_COMMISSION && plateforme) {
    /* Paiement direct : le vendeur a reçu l'argent lui-même ; seule la commission peut être rendue (réglage Q2). */
    const frais = Number(plateforme.montant);
    await db.prepare(`INSERT INTO wallet_transactions (commande_vitrine_id,type,beneficiaire_id,montant,commission_rate,prix_billet,platform_fee,organizer_amount,sens) VALUES (?,'refund_platform_fee',NULL,?,?,?,?,?,'debit')`)
      .run(commande.id, frais, plateforme.commission_rate, Number(commande.montant_total) || 0, frais, Number(plateforme.organizer_amount) || 0);
    await db.prepare(`UPDATE platform_wallet SET total_commissions = total_commissions - ?, updated_at = datetime('now') WHERE id = 1`).run(frais);
  }
}

/* Le prestataire a confirmé le remboursement. Idempotent : ne fait rien si déjà confirmé. source = 'webhook' | 'lecture_api'. */
async function confirmerRemboursement(db, refund, source, { creerNotif, maintenant = new Date() }) {
  const t = sqlDate(maintenant);
  const r = await db.prepare(`UPDATE refunds SET statut='confirme', confirme_par=?, confirme_at=?, updated_at=?, erreur=NULL WHERE id=? AND statut IN ('demande','en_cours','verification_manuelle')`)
    .run(source, t, t, refund.id);
  if (!r || !Number(r.changes)) return false;
  const commande = await db.prepare(`SELECT * FROM commandes_vitrine WHERE id=?`).get(refund.commande_id);
  const retour = await db.prepare(`SELECT * FROM retours WHERE id=?`).get(refund.retour_id);
  const init = commande ? await db.prepare(`SELECT id, nom, owner_user_id FROM initiatives WHERE id=?`).get(commande.initiative_id) : null;
  if (commande) await db.prepare(`UPDATE commandes_vitrine SET paiement_statut='rembourse' WHERE id=?`).run(commande.id);
  try { if (commande) await appliquerComptabilite(db, commande, init); }
  catch (e) { console.error("[retours] comptabilité du remboursement", refund.id, e.message); }
  if (retour) {
    const demandeur = refund.demande_par ? await db.prepare(`SELECT role FROM users WHERE id=?`).get(refund.demande_par) : null;
    const parAdmin = demandeur && demandeur.role === "administrateur";
    const vers = parAdmin ? "litige_traite" : "remboursee";
    await transition(db, retour, {
      de: ["remboursement_en_cours", "litige", "acceptee", "envoyee", "precisions"], vers, role: "systeme", action: "remboursement_confirme",
      message: `Remboursement de ${Number(refund.montant).toFixed(2)} ${refund.devise || "EUR"} confirmé par ${refund.provider === "paypal" ? "PayPal" : "Stripe"}.`,
      extra: { sql: "decision='remboursement'", args: [] }, maintenant,
    });
    creerNotif(retour.acheteur_id, "retour_rembourse", "Remboursement effectué", `Votre remboursement pour « ${retour.produit_nom} » (${Number(refund.montant).toFixed(2)} ${refund.devise || "EUR"}) est confirmé.`, { retour_id: retour.id });
    if (init) creerNotif(init.owner_user_id, "retour_rembourse", "Remboursement confirmé", `Le remboursement de « ${retour.produit_nom} » est confirmé par le prestataire de paiement.`, { retour_id: retour.id });
  }
  return true;
}

/* Le prestataire a refusé / annulé le remboursement : on revient à l'état précédent et on prévient. */
async function echecRemboursement(db, refund, erreur, { creerNotif, maintenant = new Date() }) {
  const t = sqlDate(maintenant);
  const r = await db.prepare(`UPDATE refunds SET statut='echoue', erreur=?, updated_at=? WHERE id=? AND statut IN ('demande','en_cours')`).run(String(erreur || "").slice(0, 500), t, refund.id);
  if (!r || !Number(r.changes)) return false;
  await db.prepare(`UPDATE commandes_vitrine SET paiement_statut='paye' WHERE id=? AND paiement_statut='remboursement_en_cours'`).run(refund.commande_id);
  const retour = await db.prepare(`SELECT * FROM retours WHERE id=?`).get(refund.retour_id);
  if (retour) {
    const demandeur = refund.demande_par ? await db.prepare(`SELECT role FROM users WHERE id=?`).get(refund.demande_par) : null;
    const retour_a = demandeur && demandeur.role === "administrateur" ? "litige" : "acceptee";
    await transition(db, retour, { de: ["remboursement_en_cours"], vers: retour_a, role: "systeme", action: "remboursement_echoue", message: "Le prestataire de paiement n'a pas pu effectuer le remboursement. Il peut être redemandé.", maintenant });
    const init = await db.prepare(`SELECT owner_user_id FROM initiatives WHERE id=?`).get(retour.initiative_id);
    if (init) creerNotif(init.owner_user_id, "retour_remboursement_echoue", "Remboursement non effectué", `Le remboursement de « ${retour.produit_nom} » a échoué. Vous pouvez le redemander.`, { retour_id: retour.id });
    await notifierAdministrateurs(db, creerNotif, "retour_remboursement_echoue", "Remboursement non effectué", `Un remboursement a échoué (dossier ${retour.id}).`, { retour_id: retour.id });
  }
  return true;
}

/* Relit chez le prestataire l'état des remboursements « en cours » (filet de sécurité si un webhook est manqué, et seule
   preuve possible pour PayPal tant qu'aucun webhook PayPal n'existe). */
async function verifierRemboursementsEnCours(db, deps) {
  const { creerNotif, stripe = null, env = process.env, fetchImpl = fetch, maintenant = new Date() } = deps;
  const lignes = await db.prepare(`SELECT * FROM refunds WHERE statut='en_cours' AND provider_refund_id IS NOT NULL ORDER BY id ASC LIMIT 200`).all();
  const bilan = { examines: lignes.length, confirmes: 0, echoues: 0, en_cours: 0, erreurs: 0 };
  for (const refund of lignes) {
    try {
      const compte = refund.compte_beneficiaire || null;
      const etat = refund.provider === "paypal"
        ? await Refunds.lireRemboursementPayPal({ providerRefundId: refund.provider_refund_id, compte, env, fetchImpl })
        : await Refunds.lireRemboursementStripe({ stripe, providerRefundId: refund.provider_refund_id, compte });
      if (etat === "confirme") { await confirmerRemboursement(db, refund, "lecture_api", { creerNotif, maintenant }); bilan.confirmes++; }
      else if (etat === "echoue") { await echecRemboursement(db, refund, "Refusé par le prestataire de paiement.", { creerNotif, maintenant }); bilan.echoues++; }
      else bilan.en_cours++;
    } catch (e) { bilan.erreurs++; console.error("[retours] vérification du remboursement", refund.id, e.message); }
  }
  return bilan;
}

/* Événement Stripe signé (webhook) : refund.created / refund.updated / charge.refunded. Seul moyen, avec la relecture,
   de passer un remboursement à « confirmé ». */
async function traiterEvenementStripe(db, event, { creerNotif }) {
  const obj = event && event.data && event.data.object;
  if (!obj) return false;
  let refundsStripe = [];
  if (event.type === "refund.created" || event.type === "refund.updated") refundsStripe = [obj];
  else if (event.type === "charge.refunded") refundsStripe = (obj.refunds && obj.refunds.data) || [];
  else return false;
  let touche = false;
  for (const rs of refundsStripe) {
    if (!rs || !rs.id) continue;
    const refund = await db.prepare(`SELECT * FROM refunds WHERE provider='stripe' AND provider_refund_id=?`).get(rs.id);
    if (!refund) continue;
    const etat = Refunds.traduireStatutStripe(rs.status);
    if (etat === "confirme") touche = (await confirmerRemboursement(db, refund, "webhook", { creerNotif })) || touche;
    else if (etat === "echoue") touche = (await echecRemboursement(db, refund, "Refusé par le prestataire de paiement.", { creerNotif })) || touche;
  }
  return touche;
}

/* ── Remboursement : demande au prestataire ──────────────────────── */

async function lancerRemboursement(db, deps, { retour, commande, acteur, role, de }) {
  const { creerNotif, stripe = null, env = process.env, fetchImpl = fetch } = deps;
  const dejaFait = await db.prepare(`SELECT id FROM refunds WHERE retour_id=? AND statut IN ('demande','en_cours','confirme')`).get(retour.id);
  if (dejaFait) return { ok: false, status: 409, erreur: "Un remboursement est déjà demandé pour ce dossier." };
  if (commande.paiement_statut !== "paye") return { ok: false, status: 409, erreur: "Cette commande n'est pas dans un état remboursable." };

  const montant = Refunds.montantRemboursable(commande); // toujours recalculé ici
  if (!(montant > 0)) return { ok: false, status: 400, erreur: "Aucun montant à rembourser pour cette commande." };
  const devise = retour.devise || "EUR";
  const compte = await Refunds.compteDuCommercant(db, commande);
  const provider = commande.provider === "paypal" ? "paypal" : "stripe";
  const t = sqlDate(new Date());
  const ins = await db.prepare(`INSERT INTO refunds (retour_id, commande_id, provider, compte_beneficiaire, montant, devise, statut, demande_par, created_at, updated_at) VALUES (?,?,?,?,?,?, 'demande', ?,?,?)`)
    .run(retour.id, commande.id, provider, compte, montant, devise, acteur.id, t, t);
  const refundId = Number(ins.lastInsertRowid);

  /* Paiement direct sans compte retrouvé : on ne devine rien, un administrateur vérifie à la main. */
  if (Number(commande.paiement_direct) && !compte) {
    await db.prepare(`UPDATE refunds SET statut='verification_manuelle', erreur='Compte de paiement du vendeur introuvable.', updated_at=? WHERE id=?`).run(t, refundId);
    await ajouterEvenement(db, { retourId: retour.id, role: "systeme", action: "remboursement_a_verifier", message: "Compte de paiement du vendeur introuvable : vérification manuelle par l'administrateur." });
    await notifierAdministrateurs(db, creerNotif, "retour_verification_manuelle", "Remboursement à vérifier", `Dossier ${retour.id} : compte de paiement du vendeur introuvable.`, { retour_id: retour.id });
    return { ok: false, status: 409, erreur: "Le compte de paiement du vendeur est introuvable : l'administrateur a été prévenu." };
  }

  let res;
  try {
    res = provider === "paypal"
      ? await Refunds.demanderRemboursementPayPal({ commande, montant, devise, compte, env, fetchImpl, idempotence: `retour-${retour.id}-${refundId}` })
      : await Refunds.demanderRemboursementStripe({ stripe, commande, montant, compte, metadata: { diaspoactif_retour_id: String(retour.id), diaspoactif_refund_id: String(refundId) }, idempotence: `diaspoactif-refund-${refundId}` });
  } catch (e) {
    await db.prepare(`UPDATE refunds SET statut='echoue', erreur=?, updated_at=? WHERE id=?`).run(String(e.message || "").slice(0, 500), t, refundId);
    if (e.code === "REMBOURSEMENT_INDISPONIBLE") return { ok: false, status: 503, erreur: e.message };
    console.error("[retours] remboursement refusé par le prestataire", refundId, e.message);
    await ajouterEvenement(db, { retourId: retour.id, role: "systeme", action: "remboursement_refuse_prestataire", message: "Le prestataire de paiement n'a pas pu exécuter le remboursement." });
    return { ok: false, status: 502, erreur: "Le prestataire de paiement n'a pas pu exécuter le remboursement. Réessayez plus tard." };
  }

  await db.prepare(`UPDATE refunds SET statut='en_cours', provider_refund_id=?, updated_at=? WHERE id=?`).run(res.providerRefundId, t, refundId);
  if (res.paymentIntent && !commande.stripe_payment_intent) await db.prepare(`UPDATE commandes_vitrine SET stripe_payment_intent=? WHERE id=?`).run(res.paymentIntent, commande.id);
  if (res.captureId && !commande.paypal_capture_id) await db.prepare(`UPDATE commandes_vitrine SET paypal_capture_id=? WHERE id=?`).run(res.captureId, commande.id);
  await db.prepare(`UPDATE commandes_vitrine SET paiement_statut='remboursement_en_cours' WHERE id=?`).run(commande.id);
  await transition(db, retour, {
    de, vers: "remboursement_en_cours", auteurId: acteur.id, role,
    action: "remboursement_demande",
    message: `Remboursement de ${montant.toFixed(2)} ${devise} demandé au prestataire de paiement. En attente de sa confirmation.`,
    extra: { sql: "decision='remboursement'", args: [] },
  });
  creerNotif(retour.acheteur_id, "retour_remboursement_demande", "Remboursement en cours", `Le remboursement de « ${retour.produit_nom} » est en cours de traitement par le prestataire de paiement.`, { retour_id: retour.id });
  return { ok: true, status: 200, montant, devise };
}

/* ── Tâche planifiée : 15 jours sans réponse du vendeur ───────────── */

async function escalader(db, { creerNotif, maintenant = new Date() }) {
  const limite = sqlDate(maintenant.getTime() - Config.DELAI_JOURS * JOUR);
  const lignes = await db.prepare(`SELECT * FROM retours WHERE statut='envoyee' AND derniere_activite_at <= ? ORDER BY id ASC`).all(limite);
  let transmis = 0;
  for (const r of lignes) {
    const ok = await transition(db, r, {
      de: ["envoyee"], vers: "litige", role: "systeme", action: "escalade_delai",
      message: `Sans réponse du vendeur depuis ${Config.DELAI_JOURS} jours : dossier transmis à l'administrateur litiges.`, maintenant,
    });
    if (!ok) continue;
    transmis++;
    const init = await db.prepare(`SELECT owner_user_id FROM initiatives WHERE id=?`).get(r.initiative_id);
    creerNotif(r.acheteur_id, "retour_litige", "Votre demande est confiée à l'administrateur", `Le vendeur n'a pas répondu sous ${Config.DELAI_JOURS} jours : votre demande pour « ${r.produit_nom} » est transmise à l'administrateur litiges.`, { retour_id: r.id });
    if (init) creerNotif(init.owner_user_id, "retour_litige", "Dossier confié à l'administrateur", `Sans réponse de votre part depuis ${Config.DELAI_JOURS} jours, le dossier « ${r.produit_nom} » est confié à l'administrateur litiges. Vous ne pouvez plus agir dessus.`, { retour_id: r.id });
    await notifierAdministrateurs(db, creerNotif, "retour_litige", "Nouveau litige à traiter", `Dossier ${r.id} (« ${r.produit_nom} ») transmis après ${Config.DELAI_JOURS} jours sans réponse.`, { retour_id: r.id });
  }
  return { examines: lignes.length, transmis };
}

/* ── Routes ──────────────────────────────────────────────────────── */

function enregistrer({ route, db, getCurrentUser, sendJSON, creerNotif, SEC, getStripe = () => null }) {
  const deps = () => ({ creerNotif, stripe: getStripe() });

  async function dossierEtRole(req, res, params) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    const retour = await db.prepare(`SELECT * FROM retours WHERE id=?`).get(Number(params.id));
    if (!retour) { sendJSON(res, 404, { error: "Dossier introuvable." }); return null; }
    const init = await db.prepare(`SELECT id, nom, owner_user_id FROM initiatives WHERE id=?`).get(retour.initiative_id);
    let role = null;
    if (user.role === "administrateur") role = "administrateur";
    else if (retour.acheteur_id === user.id) role = "client";
    else if (init && Number(init.owner_user_id) === Number(user.id)) role = "vendeur";
    if (!role) { sendJSON(res, 403, { error: "Accès refusé." }); return null; }
    return { user, retour, init, role };
  }
  const texte = (v, max = Config.DETAIL_MAX) => String(v == null ? "" : v).trim().slice(0, max);

  /* — Client : ouvrir une réclamation — */
  route("POST", "/api/retours", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const lim = SEC.rateLimit(`retour:${user.id}`, 8, 3600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop de demandes. Réessayez dans ${lim.retryAfter}s.` });
    const motif = texte(body.motif, 100);
    const details = texte(body.details);
    if (!Config.MOTIFS.includes(motif)) return sendJSON(res, 400, { error: "Choisissez un motif." });
    if (details.length < Config.DETAIL_MIN) return sendJSON(res, 400, { error: `Expliquez le problème en au moins ${Config.DETAIL_MIN} caractères.` });
    const commande = await db.prepare(`SELECT c.*, p.nom AS produit_nom, p.devise AS produit_devise, p.regle_retour_id FROM commandes_vitrine c LEFT JOIN produits_vitrine p ON p.id=c.produit_id WHERE c.id=?`).get(Number(body.commande_id));
    if (!commande || Number(commande.acheteur_id) !== Number(user.id)) return sendJSON(res, 404, { error: "Commande introuvable." });
    if (commande.paiement_statut !== "paye") return sendJSON(res, 409, { error: "Seule une commande payée peut faire l'objet d'une demande de retour." });
    const existant = await db.prepare(`SELECT id FROM retours WHERE commande_id=? AND statut NOT IN ('refusee','litige_traite')`).get(commande.id);
    if (existant) return sendJSON(res, 409, { error: "Une demande est déjà en cours pour cette commande." });
    const photo = lirePhoto(body.photo_base64);
    if (!photo.ok) return sendJSON(res, 400, { error: photo.erreur });
    let photoUrl = null;
    try { photoUrl = await enregistrerPhoto(photo, commande.id); }
    catch (e) { console.error("[retours] photo", e.message); return sendJSON(res, 502, { error: "La photo n'a pas pu être enregistrée. Réessayez ou envoyez la demande sans photo." }); }

    const t = sqlDate(new Date());
    const ins = await db.prepare(`INSERT INTO retours (commande_id, initiative_id, acheteur_id, produit_nom, quantite, montant_commande, devise, regle_retour, motif, details, photo_url, statut, derniere_activite_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'envoyee',?,?,?)`)
      .run(commande.id, commande.initiative_id, user.id, commande.produit_nom || "Article", commande.quantite || 1, commande.montant_total, commande.produit_devise || "EUR", regleDe(commande.regle_retour_id), motif, details, photoUrl, t, t, t);
    const id = Number(ins.lastInsertRowid);
    await ajouterEvenement(db, { retourId: id, auteurId: user.id, role: "client", action: "ouverture", avant: null, apres: "envoyee", message: "Demande envoyée.", piece: photoUrl ? "photo" : null });
    const init = await db.prepare(`SELECT owner_user_id FROM initiatives WHERE id=?`).get(commande.initiative_id);
    if (init) creerNotif(init.owner_user_id, "retour_nouveau", "Nouvelle demande de retour", `Un client demande un retour pour « ${commande.produit_nom} » (${motif}). Vous avez ${Config.DELAI_JOURS} jours pour répondre.`, { retour_id: id });
    sendJSON(res, 201, { ok: true, id });
  });

  /* — Client : ses demandes — */
  route("GET", "/api/mes-retours", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const rows = await db.prepare(`SELECT * FROM retours WHERE acheteur_id=? ORDER BY id DESC`).all(user.id);
    const retours = [];
    for (const r of rows) retours.push(await formaterDossier(db, r, { vue: "client" }));
    sendJSON(res, 200, { ok: true, retours });
  });

  /* — Commandes de l'acheteur pouvant faire l'objet d'une demande (alimente la liste d'articles du formulaire) — */
  route("GET", "/api/mes-retours/commandes-eligibles", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const rows = await db.prepare(`
      SELECT c.id, c.quantite, c.montant_total, c.created_at, p.nom AS produit_nom, p.devise, p.regle_retour_id, i.nom AS boutique
      FROM commandes_vitrine c JOIN produits_vitrine p ON p.id=c.produit_id JOIN initiatives i ON i.id=c.initiative_id
      WHERE c.acheteur_id=? AND c.paiement_statut='paye'
        AND NOT EXISTS (SELECT 1 FROM retours r WHERE r.commande_id=c.id AND r.statut NOT IN ('refusee','litige_traite'))
      ORDER BY c.id DESC`).all(user.id);
    sendJSON(res, 200, { ok: true, commandes: rows.map((c) => ({ id: c.id, produit: c.produit_nom, boutique: c.boutique, quantite: c.quantite, montant: c.montant_total, devise: c.devise || "EUR", regle: regleDe(c.regle_retour_id), le: c.created_at })), motifs: Config.MOTIFS });
  });

  /* — Client ET vendeur : répondre (message dans l'historique) — */
  route("POST", "/api/retours/:id/repondre", async (req, res, params, body) => {
    const ctx = await dossierEtRole(req, res, params); if (!ctx) return;
    const { user, retour, role } = ctx;
    const message = texte(body.message);
    if (message.length < Config.MESSAGE_MIN) return sendJSON(res, 400, { error: "Écrivez votre réponse." });
    if (role === "client") {
      if (retour.statut === "precisions") {
        const ok = await transition(db, retour, { de: ["precisions"], vers: "envoyee", auteurId: user.id, role: "client", action: "reponse_client", message });
        if (!ok) return sendJSON(res, 409, { error: "Ce dossier a changé entre-temps." });
      } else if (retour.statut === "litige") {
        await ajouterEvenement(db, { retourId: retour.id, auteurId: user.id, role: "client", action: "reponse_client", message });
      } else return sendJSON(res, 409, { error: "Aucune réponse n'est attendue pour ce dossier." });
      if (ctx.init) creerNotif(ctx.init.owner_user_id, "retour_reponse", "Réponse du client", `Le client a répondu pour « ${retour.produit_nom} ».`, { retour_id: retour.id });
    } else if (role === "vendeur") {
      if (!["envoyee", "precisions", "acceptee"].includes(retour.statut)) return sendJSON(res, 409, { error: "Ce dossier est confié à l'administrateur litiges ou terminé : vous ne pouvez plus agir." });
      await ajouterEvenement(db, { retourId: retour.id, auteurId: user.id, role: "vendeur", action: "message_vendeur", message });
      creerNotif(retour.acheteur_id, "retour_reponse", "Réponse du vendeur", `Le vendeur a répondu pour « ${retour.produit_nom} ».`, { retour_id: retour.id });
    } else return sendJSON(res, 403, { error: "Utilisez l'espace administrateur litiges." });
    sendJSON(res, 200, { ok: true });
  });

  /* — Vendeur : liste des dossiers de sa boutique — */
  route("GET", "/api/initiatives/:id/retours", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const init = await db.prepare(`SELECT id, owner_user_id FROM initiatives WHERE id=?`).get(Number(params.id));
    if (!init || Number(init.owner_user_id) !== Number(user.id)) return sendJSON(res, 403, { error: "Réservé au propriétaire de la boutique." });
    const rows = await db.prepare(`SELECT r.*, TRIM(COALESCE(u.prenom,'') || ' ' || COALESCE(u.nom,'')) AS _plaignant_nom FROM retours r JOIN users u ON u.id=r.acheteur_id WHERE r.initiative_id=? ORDER BY r.id DESC`).all(init.id);
    const retours = [];
    for (const r of rows) retours.push(await formaterDossier(db, r, { vue: "vendeur" }));
    sendJSON(res, 200, { ok: true, delai_jours: Config.DELAI_JOURS, retours });
  });

  /* — Vendeur : accepter / demander des précisions / refuser / rembourser — */
  async function actionVendeur(req, res, params, body, fn) {
    const ctx = await dossierEtRole(req, res, params); if (!ctx) return;
    if (ctx.role !== "vendeur") return sendJSON(res, 403, { error: "Action réservée au vendeur de la boutique." });
    if (["litige", "litige_traite", "remboursement_en_cours", "remboursee", "refusee"].includes(ctx.retour.statut)) {
      return sendJSON(res, 409, { error: "Ce dossier est confié à l'administrateur litiges ou terminé : vous ne pouvez plus agir." });
    }
    return fn(ctx);
  }
  route("POST", "/api/retours/:id/accepter", (req, res, params, body) => actionVendeur(req, res, params, body, async ({ user, retour }) => {
    const ok = await transition(db, retour, { de: ["envoyee", "precisions"], vers: "acceptee", auteurId: user.id, role: "vendeur", action: "accepte", message: "Retour accepté. Le client peut renvoyer l'article." });
    if (!ok) return sendJSON(res, 409, { error: "Ce dossier a changé entre-temps." });
    creerNotif(retour.acheteur_id, "retour_accepte", "Retour accepté", `Le vendeur a accepté votre demande pour « ${retour.produit_nom} ».`, { retour_id: retour.id });
    sendJSON(res, 200, { ok: true, statut: "acceptee" });
  }));
  route("POST", "/api/retours/:id/preciser", (req, res, params, body) => actionVendeur(req, res, params, body, async ({ user, retour }) => {
    const message = texte(body.message);
    if (message.length < Config.MESSAGE_MIN) return sendJSON(res, 400, { error: "Indiquez les précisions demandées au client." });
    const ok = await transition(db, retour, { de: ["envoyee"], vers: "precisions", auteurId: user.id, role: "vendeur", action: "precisions_demandees", message });
    if (!ok) return sendJSON(res, 409, { error: "Ce dossier a changé entre-temps." });
    creerNotif(retour.acheteur_id, "retour_precisions", "Le vendeur demande des précisions", `Répondez au vendeur pour « ${retour.produit_nom} ».`, { retour_id: retour.id });
    sendJSON(res, 200, { ok: true, statut: "precisions" });
  }));
  route("POST", "/api/retours/:id/refuser", (req, res, params, body) => actionVendeur(req, res, params, body, async ({ user, retour }) => {
    const motif = texte(body.motif);
    if (motif.length < Config.MESSAGE_MIN) return sendJSON(res, 400, { error: "Le motif du refus est obligatoire." });
    const ok = await transition(db, retour, { de: ["envoyee", "precisions"], vers: "refusee", auteurId: user.id, role: "vendeur", action: "refuse", message: `Retour refusé. Motif : ${motif}`, extra: { sql: "decision='refus', motif_decision=?", args: [motif] } });
    if (!ok) return sendJSON(res, 409, { error: "Ce dossier a changé entre-temps." });
    creerNotif(retour.acheteur_id, "retour_refuse", "Demande refusée", `Le vendeur a refusé votre demande pour « ${retour.produit_nom} ».`, { retour_id: retour.id });
    sendJSON(res, 200, { ok: true, statut: "refusee" });
  }));
  route("POST", "/api/retours/:id/rembourser", (req, res, params, body) => actionVendeur(req, res, params, body, async ({ user, retour }) => {
    const commande = await db.prepare(`SELECT * FROM commandes_vitrine WHERE id=?`).get(retour.commande_id);
    if (!commande) return sendJSON(res, 404, { error: "Commande introuvable." });
    const r = await lancerRemboursement(db, deps(), { retour, commande, acteur: user, role: "vendeur", de: ["envoyee", "precisions", "acceptee"] });
    if (!r.ok) return sendJSON(res, r.status, { error: r.erreur });
    sendJSON(res, 200, { ok: true, statut: "remboursement_en_cours", montant: r.montant, devise: r.devise });
  }));

  /* — Administrateur litiges — */
  async function adminSeulement(req, res) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    if (user.role !== "administrateur") { sendJSON(res, 403, { error: "Réservé à l'administration." }); return null; }
    return user;
  }
  route("GET", "/api/admin/litiges", async (req, res) => {
    const admin = await adminSeulement(req, res); if (!admin) return;
    const rows = await db.prepare(`
      SELECT r.*, i.nom AS _boutique_nom, TRIM(COALESCE(ow.prenom,'') || ' ' || COALESCE(ow.nom,'')) AS _proprietaire_nom,
             TRIM(COALESCE(u.prenom,'') || ' ' || COALESCE(u.nom,'')) AS _plaignant_nom, u.email AS _plaignant_email
      FROM retours r
      JOIN initiatives i ON i.id=r.initiative_id
      LEFT JOIN users ow ON ow.id=i.owner_user_id
      JOIN users u ON u.id=r.acheteur_id
      WHERE r.statut IN ('litige','litige_traite')
         OR r.id IN (SELECT rf.retour_id FROM refunds rf JOIN users ua ON ua.id=rf.demande_par WHERE ua.role='administrateur')
      ORDER BY (CASE WHEN r.statut='litige' THEN 0 ELSE 1 END), r.id DESC`).all();
    const litiges = [];
    for (const r of rows) litiges.push(await formaterDossier(db, r, { vue: "admin" }));
    sendJSON(res, 200, { ok: true, delai_jours: Config.DELAI_JOURS, litiges });
  });
  async function actionAdmin(req, res, params, body, { exigerMessage, fn }) {
    const admin = await adminSeulement(req, res); if (!admin) return;
    const retour = await db.prepare(`SELECT * FROM retours WHERE id=?`).get(Number(params.id));
    if (!retour) return sendJSON(res, 404, { error: "Dossier introuvable." });
    if (retour.statut !== "litige") return sendJSON(res, 409, { error: "Ce dossier n'est pas en litige." });
    const message = texte(body.message);
    if (exigerMessage && message.length < Config.MESSAGE_MIN) return sendJSON(res, 400, { error: "Rédigez un message ou un motif (5 caractères minimum)." });
    return fn({ admin, retour, message });
  }
  route("POST", "/api/admin/litiges/:id/demander-pieces", (req, res, params, body) => actionAdmin(req, res, params, body, {
    exigerMessage: false,
    fn: async ({ admin, retour, message }) => {
      await ajouterEvenement(db, { retourId: retour.id, auteurId: admin.id, role: "administrateur", action: "pieces_demandees", message: "Pièces demandées au plaignant et au vendeur." + (message ? " " + message : "") });
      creerNotif(retour.acheteur_id, "retour_pieces", "Pièces demandées", `L'administrateur litiges demande des pièces pour « ${retour.produit_nom} ».`, { retour_id: retour.id });
      const init = await db.prepare(`SELECT owner_user_id FROM initiatives WHERE id=?`).get(retour.initiative_id);
      if (init) creerNotif(init.owner_user_id, "retour_pieces", "Pièces demandées", `L'administrateur litiges demande des pièces pour « ${retour.produit_nom} ».`, { retour_id: retour.id });
      sendJSON(res, 200, { ok: true });
    },
  }));
  route("POST", "/api/admin/litiges/:id/refuser", (req, res, params, body) => actionAdmin(req, res, params, body, {
    exigerMessage: true,
    fn: async ({ admin, retour, message }) => {
      const ok = await transition(db, retour, { de: ["litige"], vers: "litige_traite", auteurId: admin.id, role: "administrateur", action: "litige_refus", message: `Demande refusée. Motif : ${message}`, extra: { sql: "decision='refus', motif_decision=?", args: [message] } });
      if (!ok) return sendJSON(res, 409, { error: "Ce dossier a changé entre-temps." });
      creerNotif(retour.acheteur_id, "retour_litige_traite", "Décision de l'administrateur", `Votre demande pour « ${retour.produit_nom} » a été examinée : elle est refusée.`, { retour_id: retour.id });
      const init = await db.prepare(`SELECT owner_user_id FROM initiatives WHERE id=?`).get(retour.initiative_id);
      if (init) creerNotif(init.owner_user_id, "retour_litige_traite", "Décision de l'administrateur", `Le litige « ${retour.produit_nom} » est clos : demande refusée.`, { retour_id: retour.id });
      sendJSON(res, 200, { ok: true, statut: "litige_traite" });
    },
  }));
  route("POST", "/api/admin/litiges/:id/rembourser", (req, res, params, body) => actionAdmin(req, res, params, body, {
    exigerMessage: true,
    fn: async ({ admin, retour, message }) => {
      const commande = await db.prepare(`SELECT * FROM commandes_vitrine WHERE id=?`).get(retour.commande_id);
      if (!commande) return sendJSON(res, 404, { error: "Commande introuvable." });
      await ajouterEvenement(db, { retourId: retour.id, auteurId: admin.id, role: "administrateur", action: "litige_remboursement_valide", message: `Remboursement validé. ${message}` });
      const r = await lancerRemboursement(db, deps(), { retour, commande, acteur: admin, role: "administrateur", de: ["litige"] });
      if (!r.ok) return sendJSON(res, r.status, { error: r.erreur });
      sendJSON(res, 200, { ok: true, statut: "remboursement_en_cours", montant: r.montant, devise: r.devise });
    },
  }));
  route("POST", "/api/admin/litiges/:id/verifier-remboursement", async (req, res) => {
    const admin = await adminSeulement(req, res); if (!admin) return;
    sendJSON(res, 200, { ok: true, ...(await verifierRemboursementsEnCours(db, deps())) });
  });

  /* — Tâche planifiée quotidienne (Vercel Cron) : 15 jours sans réponse + relecture des remboursements en cours — */
  route("GET", "/api/cron/retours-escalade", async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers["authorization"] || "";
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) return sendJSON(res, 401, { error: "Non autorisé." });
    try {
      const escalade = await escalader(db, { creerNotif });
      const verification = await verifierRemboursementsEnCours(db, deps());
      sendJSON(res, 200, { ok: true, escalade, verification });
    } catch (e) {
      console.error("[retours-escalade]", e.stack || e.message);
      sendJSON(res, 500, { error: "Échec de la tâche des retours." });
    }
  });
}

module.exports = { enregistrer, escalader, verifierRemboursementsEnCours, traiterEvenementStripe, confirmerRemboursement, echecRemboursement, lancerRemboursement };
