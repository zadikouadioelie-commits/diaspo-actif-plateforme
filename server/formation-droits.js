/* ═════════════════════════════════════════════════
   server/formation-droits.js — Formation Diaspora, lot A (2026-10-30) : droits d'accès, commandes, achat par module

   - formation_acces : UN droit par apprenant et par formation (module_cle = 0) ou par module (module_cle = id du module).
     États : en_attente, actif, expire, revoque (jamais de remboursement de formation). Type : gratuit, paye, code. Date de début, date d'expiration éventuelle (formations.duree_acces_jours).
   - formation_commandes / formation_commande_lignes : l'historique d'achat (une commande = une formation complète OU un module).
   - formation_inscriptions reste le « parcours » (progression, relances, attestations) : une inscription par apprenant et par formation ;
     inscriptions.portee = « formation » (tout le contenu) ou « modules » (seulement les modules acquis).
   - Tout est contrôlé ICI, côté serveur. Un paiement n'est validé que par le retour sécurisé du prestataire (webhook Stripe → confirmerCommande).
   ═════════════════════════════════════════════════ */
"use strict";
const Finances = require("./formation-finances");

/* Aucun remboursement (décision du 2026-10-30, « à préciser partout ») : une formation achetée appartient à l'élève, qu'il la suive ou non.
   Ces deux textes sont la SOURCE UNIQUE : renvoyés au navigateur (assets/formation-achat-consent.js les affiche) et posés sur la page de paiement Stripe.
   Droit de la consommation (UE) : pour un contenu numérique à accès immédiat, le consommateur doit demander l'accès immédiat ET reconnaître qu'il perd
   son droit de rétractation — d'où la case à cocher exigée côté serveur, jamais seulement dans l'interface. */
const TEXTE_NON_REMBOURSABLE = "Achat définitif : une formation achetée vous appartient, que vous la suiviez ou non, et ne donne lieu à aucun remboursement. Réfléchissez bien avant d'acheter.";
const TEXTE_RETRACTATION = "Je demande l'accès immédiat au contenu et je reconnais que je perds mon droit de rétractation dès que l'accès est ouvert.";
const VERSION_CONSENTEMENT = "2026-10-30";

/* Pas d'état « remboursé » : décision du 2026-10-30, aucune formation ne se rembourse. */
const STATUTS_ACCES = ["en_attente", "actif", "expire", "revoque"];
const TYPES_ACCES = ["gratuit", "paye", "code"];

/* Inscriptions existantes (payées ou gratuites) SANS aucun droit enregistré → droit « formation complète » (une inscription portant déjà des droits, par exemple des modules, n'est jamais retouchée). Les inscriptions en attente de paiement n'en reçoivent pas : le webhook historique les traite encore. */
const SQL_RATTRAPAGE = `INSERT INTO formation_acces (user_id, formation_id, module_cle, type_acces, statut, montant_paye, inscription_id, date_debut)
  SELECT i.user_id, i.formation_id, 0,
    CASE WHEN COALESCE(i.montant_paye,0)>0 THEN 'paye' WHEN COALESCE(i.acces_gratuit_membre,0)=1 THEN 'code' ELSE 'gratuit' END,
    CASE WHEN i.statut='active' THEN 'actif' WHEN i.statut='expiree' THEN 'expire' ELSE 'revoque' END,
    COALESCE(i.montant_paye,0), i.id, i.date_inscription
  FROM formation_inscriptions i
  WHERE COALESCE(i.paiement_statut,'paye')='paye' AND COALESCE(i.portee,'formation')='formation'
    AND NOT EXISTS (SELECT 1 FROM formation_acces a WHERE a.user_id=i.user_id AND a.formation_id=i.formation_id)`;

/* Au démarrage (SQLite, synchrone) — idempotent. */
function rattrapageSQL(db) { db.exec(SQL_RATTRAPAGE); }
/* À la demande, pour un compte (Postgres comme SQLite) — idempotent. */
async function rattrapageCompte(db, userId) { await db.prepare(SQL_RATTRAPAGE + " AND i.user_id=?").run(Number(userId)); }

const sqlDate = d => d.toISOString().slice(0, 19).replace("T", " ");
function dateExpiration(f) {
  const j = Math.floor(Number(f && f.duree_acces_jours));
  return j > 0 ? sqlDate(new Date(Date.now() + j * 86400000)) : null;
}

/* Prix d'un module acheté seul : 0 = gratuit (formation gratuite, ou prix du module explicitement à 0). */
function prixModule(f, m) {
  if ((f.mode_acces || "gratuit") === "gratuit") return 0;
  const p = Number(m && m.prix);
  return Number.isFinite(p) && p > 0 ? p : 0;
}

/* Remet l'inscription en phase avec les droits : active (portée « formation » ou « modules ») s'il reste un droit actif, sinon expirée / annulée. Ne touche pas aux inscriptions sans droit enregistré. */
async function synchroniserInscription(db, userId, formationId) {
  const insc = await db.prepare("SELECT * FROM formation_inscriptions WHERE formation_id=? AND user_id=?").get(Number(formationId), Number(userId));
  if (!insc) return null;
  const droits = await db.prepare("SELECT module_cle, statut FROM formation_acces WHERE user_id=? AND formation_id=?").all(Number(userId), Number(formationId));
  if (!droits.length) return insc;
  if ((insc.paiement_statut || "paye") !== "paye") return insc; /* première commande encore en attente : le webhook l'activera */
  const actifs = droits.filter(d => d.statut === "actif");
  if (actifs.length) {
    const portee = actifs.some(d => Number(d.module_cle) === 0) ? "formation" : "modules";
    await db.prepare("UPDATE formation_inscriptions SET statut='active', portee=? WHERE id=?").run(portee, insc.id);
  } else if (!droits.some(d => d.statut === "en_attente")) {
    await db.prepare("UPDATE formation_inscriptions SET statut=? WHERE id=?").run(droits.some(d => d.statut === "expire") ? "expiree" : "annulee", insc.id);
  }
  return await db.prepare("SELECT * FROM formation_inscriptions WHERE id=?").get(insc.id);
}

/* Marque « expire » les droits arrivés à échéance. Renvoie le nombre de droits expirés. */
async function balayerExpirations(db, filtre) {
  const f = filtre || {};
  let cond = "statut='actif' AND date_expiration IS NOT NULL AND date_expiration<=datetime('now')";
  const args = [];
  if (f.userId != null) { cond += " AND user_id=?"; args.push(Number(f.userId)); }
  if (f.formationId != null) { cond += " AND formation_id=?"; args.push(Number(f.formationId)); }
  const echus = await db.prepare(`SELECT DISTINCT user_id, formation_id FROM formation_acces WHERE ${cond}`).all(...args);
  if (!echus.length) return 0;
  const res = await db.prepare(`UPDATE formation_acces SET statut='expire' WHERE ${cond}`).run(...args);
  for (const e of echus) await synchroniserInscription(db, e.user_id, e.formation_id);
  return (res && Number(res.changes)) || echus.length;
}

/* Modules accessibles à cette inscription : null = tout le contenu ; sinon l'ensemble des ids de module acquis (et non expirés). */
async function modulesAutorises(db, inscription) {
  if (!inscription || (inscription.portee || "formation") !== "modules") return null;
  const rows = await db.prepare("SELECT module_cle FROM formation_acces WHERE user_id=? AND formation_id=? AND module_cle<>0 AND statut='actif' AND (date_expiration IS NULL OR date_expiration>datetime('now'))")
    .all(Number(inscription.user_id), Number(inscription.formation_id));
  return new Set(rows.map(r => Number(r.module_cle)));
}

/* Une leçon de CETTE formation, et (si l'accès est limité à des modules) l'un des modules acquis. */
async function leconPermise(db, inscription, formationId, leconId) {
  const l = await db.prepare("SELECT l.module_id, m.formation_id FROM formation_lecons l JOIN formation_modules m ON m.id=l.module_id WHERE l.id=?").get(Number(leconId));
  if (!l || Number(l.formation_id) !== Number(formationId)) return false;
  const auto = await modulesAutorises(db, inscription);
  return !auto || auto.has(Number(l.module_id));
}

/* Un quiz rattaché à une leçon d'un module acquis ; un quiz général de la formation reste réservé à l'accès complet. */
async function quizPermis(db, inscription, quiz) {
  const auto = await modulesAutorises(db, inscription);
  if (!auto) return true;
  if (quiz.lecon_id == null) return false;
  const l = await db.prepare("SELECT module_id FROM formation_lecons WHERE id=?").get(Number(quiz.lecon_id));
  return !!l && auto.has(Number(l.module_id));
}

/* Paiement confirmé par le prestataire (webhook) — idempotent : ne traite qu'une commande encore « en_attente ». Renvoie { commande, formation, montant } ou null. */
async function confirmerCommande(db, commandeId, montantRecu) {
  const cmd = await db.prepare("SELECT * FROM formation_commandes WHERE id=? AND statut='en_attente'").get(Number(commandeId));
  if (!cmd) return null;
  const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(cmd.formation_id);
  const montant = montantRecu != null && Number.isFinite(Number(montantRecu)) ? Number(montantRecu) : Number(cmd.montant) || 0;
  await db.prepare("UPDATE formation_commandes SET statut='payee', paye_le=datetime('now') WHERE id=?").run(cmd.id);
  await db.prepare("UPDATE formation_acces SET statut='actif', type_acces=CASE WHEN type_acces='code' THEN type_acces ELSE 'paye' END, montant_paye=?, date_debut=datetime('now'), date_expiration=? WHERE commande_id=? AND statut='en_attente'")
    .run(montant, dateExpiration(f), cmd.id);
  const insc = await db.prepare("SELECT * FROM formation_inscriptions WHERE formation_id=? AND user_id=?").get(cmd.formation_id, cmd.user_id);
  if (insc) {
    await db.prepare("UPDATE formation_inscriptions SET paiement_statut='paye', statut='active', montant_paye=COALESCE(montant_paye,0)+?, stripe_session_id=? WHERE id=?").run(montant, cmd.stripe_session_id || null, insc.id);
    await synchroniserInscription(db, cmd.user_id, cmd.formation_id);
  }
  return { commande: cmd, formation: f, montant };
}

/* Session de paiement expirée ou abandonnée : la commande est close, les droits en attente retirés, et une première inscription jamais payée est supprimée. */
async function annulerCommande(db, commandeId, statut) {
  const cmd = await db.prepare("SELECT * FROM formation_commandes WHERE id=? AND statut='en_attente'").get(Number(commandeId));
  if (!cmd) return null;
  await db.prepare("UPDATE formation_commandes SET statut=? WHERE id=?").run(statut || "expiree", cmd.id);
  await db.prepare("DELETE FROM formation_acces WHERE commande_id=? AND statut='en_attente'").run(cmd.id);
  const reste = await db.prepare("SELECT COUNT(*) AS n FROM formation_acces WHERE user_id=? AND formation_id=?").get(cmd.user_id, cmd.formation_id);
  if (!Number(reste && reste.n)) {
    const insc = await db.prepare("SELECT id FROM formation_inscriptions WHERE formation_id=? AND user_id=? AND paiement_statut='en_attente'").get(cmd.formation_id, cmd.user_id);
    if (insc) await db.prepare("DELETE FROM formation_inscriptions WHERE id=?").run(insc.id);
  }
  return cmd;
}

/* Paiement historique (session créée avant le lot A, repérée par l'inscription) : le droit « formation complète » correspondant passe à actif. */
async function activerDepuisInscription(db, inscriptionId, montant) {
  await db.prepare("UPDATE formation_acces SET statut='actif', type_acces='paye', montant_paye=?, date_debut=datetime('now') WHERE inscription_id=? AND module_cle=0 AND statut='en_attente'").run(Number(montant) || 0, Number(inscriptionId));
}

/* Mode TEST (2026-10-30) : FORMATION_PAIEMENT_SIMULE=1 → « payer » ouvre l'accès tout de suite, sans Stripe. Jamais actif sur Vercel (production), quoi qu'on y configure. */
function paiementSimule() { return process.env.FORMATION_PAIEMENT_SIMULE === "1" && !process.env.VERCEL; }

module.exports = {
  paiementSimule, TEXTE_NON_REMBOURSABLE, TEXTE_RETRACTATION, VERSION_CONSENTEMENT, STATUTS_ACCES, TYPES_ACCES, rattrapageSQL, rattrapageCompte, dateExpiration, prixModule, synchroniserInscription, balayerExpirations,
  modulesAutorises, leconPermise, quizPermis, confirmerCommande, annulerCommande, activerDepuisInscription,
};

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC, checkFormationOwner, creerNotif, getOrigin, ParcoursFormation } = deps;
  const D = module.exports;

  /* ── Acquérir une formation complète (POST …/inscrire, conservé pour les écrans existants) ou un module (POST …/acquerir) ── */
  async function acquerir(req, res, formationId, moduleIdBrut, body) {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const lim = SEC.rateLimit(`formation-acquerir:${user.id}`, 30, 600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop de demandes. Réessayez dans ${lim.retryAfter}s.` });
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(formationId);
    if (!f || f.statut !== "publiee") return sendJSON(res, 404, { error: "Formation introuvable ou non publiée." });
    if (f.date_suppression_prevue) return sendJSON(res, 400, { error: "Les inscriptions sont fermées : cette formation sera bientôt retirée du catalogue." });
    await rattrapageCompte(db, user.id);
    await balayerExpirations(db, { userId: user.id, formationId: f.id });

    let module = null, cle = 0;
    if (moduleIdBrut != null && moduleIdBrut !== "") {
      module = await db.prepare("SELECT * FROM formation_modules WHERE id=? AND formation_id=?").get(Number(moduleIdBrut), f.id);
      if (!module) return sendJSON(res, 404, { error: "Module introuvable dans cette formation." });
      if (!Number(module.vendable_seul)) return sendJSON(res, 400, { error: "Ce module n'est pas proposé séparément : obtenez la formation complète." });
      cle = Number(module.id);
    }

    /* Droit déjà détenu ? (un droit « actif » ne se rachète jamais ; la formation complète inclut tous ses modules) */
    const entiere = await db.prepare("SELECT * FROM formation_acces WHERE user_id=? AND formation_id=? AND module_cle=0").get(user.id, f.id);
    const actuel = cle === 0 ? entiere : await db.prepare("SELECT * FROM formation_acces WHERE user_id=? AND formation_id=? AND module_cle=?").get(user.id, f.id, cle);
    if (cle !== 0 && entiere && entiere.statut === "actif") return sendJSON(res, 409, { error: "Ce module est déjà inclus dans votre accès à la formation complète." });
    if (actuel && actuel.statut === "actif") return sendJSON(res, 409, { error: "Déjà inscrit." });

    /* Prérequis (lot 3) : contrôle serveur, avant toute inscription. */
    const manquants = await ParcoursFormation.prerequisManquants(db, f.id, user.id);
    if (manquants.length) return sendJSON(res, 403, { error: `Cette formation demande d'abord de terminer : ${manquants.map(m => `« ${m.titre} »`).join(", ")}.`, code: "prerequis_manquants", prerequis: manquants });

    /* Prix et code d'accès */
    let montant = 0, acces_gratuit = 0, code_valide = null;
    const mode = f.mode_acces || "gratuit";
    /* Formation complète : prix catalogue, puis promotion en cours (lot B) ; module : son prix. */
    const pf = Finances.prixFormation(f);
    const prixCatalogue = cle === 0 ? pf.catalogue : D.prixModule(f, module);
    const promoPct = cle === 0 ? pf.promo_pct : null;
    const prixBase = cle === 0 ? pf.prix : D.prixModule(f, module);
    if (mode === "payant_sauf_membres" && prixBase > 0) {
      const code = String((body && body.code) || "").trim().toUpperCase();
      const codeRow = code ? await db.prepare("SELECT * FROM formation_codes_acces WHERE code=? AND actif=1").get(code) : null;
      if (codeRow && (!codeRow.date_expiration || codeRow.date_expiration > new Date().toISOString())
          && (!codeRow.limite_utilisations || codeRow.nb_utilisations < codeRow.limite_utilisations)) {
        acces_gratuit = 1; code_valide = code;
        await db.prepare("UPDATE formation_codes_acces SET nb_utilisations=nb_utilisations+1 WHERE id=?").run(codeRow.id);
      } else montant = prixBase;
    } else montant = prixBase;
    /* Coupon de réduction (lot B) : calculé ici, jamais par le navigateur. Un code refusé arrête l'achat plutôt que de faire payer le plein tarif sans le dire. */
    let coupon = null, remise = 0;
    const codeCoupon = String((body && body.coupon) || "").trim();
    if (codeCoupon && montant > 0) {
      const ev = await Finances.evaluerCoupon(db, f, codeCoupon, user.id, montant);
      if (!ev.ok) return sendJSON(res, 400, { error: ev.erreur, code: "coupon_refuse" });
      coupon = ev.coupon; remise = ev.remise; montant = ev.prix_final;
    }
    const colsVente = [prixCatalogue, remise, coupon ? coupon.code : null, coupon ? coupon.source : null, coupon ? coupon.id : null, promoPct];
    const libelle = cle === 0 ? f.titre : `${f.titre} — ${module.titre}`;
    const portee = cle === 0 ? "formation" : "modules";
    const expiration = D.dateExpiration(f);

    /* L'inscription (le parcours) : une par apprenant et par formation. */
    async function assurerInscription(paiementStatut) {
      let insc = await db.prepare("SELECT * FROM formation_inscriptions WHERE formation_id=? AND user_id=?").get(f.id, user.id);
      if (insc) return { insc, creee: false };
      try {
        const r = await db.prepare("INSERT INTO formation_inscriptions (formation_id,user_id,montant_paye,acces_gratuit_membre,code_acces,paiement_statut,portee) VALUES (?,?,0,?,?,?,?)")
          .run(f.id, user.id, acces_gratuit, code_valide, paiementStatut, portee);
        insc = await db.prepare("SELECT * FROM formation_inscriptions WHERE id=?").get(r.lastInsertRowid);
        return { insc, creee: true };
      } catch (e) {
        insc = await db.prepare("SELECT * FROM formation_inscriptions WHERE formation_id=? AND user_id=?").get(f.id, user.id);
        if (insc) return { insc, creee: false };
        throw e;
      }
    }
    /* Crée le droit ou réutilise la ligne d'un ancien droit (expiré, révoqué) : une seule ligne par apprenant et par formation / module. */
    async function poserDroit(statut, type, inscriptionId, commandeId) {
      if (actuel) {
        await db.prepare("UPDATE formation_acces SET statut=?, type_acces=?, montant_paye=0, commande_id=?, inscription_id=?, date_debut=?, date_expiration=?, motif=NULL WHERE id=?")
          .run(statut, type, commandeId || null, inscriptionId, statut === "actif" ? sqlDate(new Date()) : null, statut === "actif" ? expiration : null, actuel.id);
        return actuel.id;
      }
      const r = await db.prepare("INSERT INTO formation_acces (user_id,formation_id,module_cle,type_acces,statut,montant_paye,commande_id,inscription_id,date_debut,date_expiration) VALUES (?,?,?,?,?,0,?,?,?,?)")
        .run(user.id, f.id, cle, type, statut, commandeId || null, inscriptionId, statut === "actif" ? sqlDate(new Date()) : null, statut === "actif" ? expiration : null);
      return r.lastInsertRowid;
    }

    /* ── Gratuit (ou code d'accès valide) : accès immédiat ── */
    if (montant <= 0) {
      try {
        const { insc } = await assurerInscription("paye");
        const r = await db.prepare("INSERT INTO formation_commandes (user_id,formation_id,montant,statut,code_acces,paye_le,prix_initial,remise,coupon_code,coupon_source,coupon_id,promo_pct) VALUES (?,?,0,'payee',?,datetime('now'),?,?,?,?,?,?)").run(user.id, f.id, code_valide, ...colsVente);
        await db.prepare("INSERT INTO formation_commande_lignes (commande_id,module_id,libelle,prix) VALUES (?,?,?,0)").run(r.lastInsertRowid, cle || null, libelle);
        await poserDroit("actif", code_valide || coupon ? "code" : "gratuit", insc.id, r.lastInsertRowid);
        await D.synchroniserInscription(db, user.id, f.id);
        const eff = await db.prepare("SELECT * FROM formation_inscriptions WHERE id=?").get(insc.id);
        if (eff && (eff.paiement_statut || "paye") !== "paye") await db.prepare("UPDATE formation_inscriptions SET paiement_statut='paye' WHERE id=?").run(eff.id);
      } catch (e) {
        if (/unique|duplicate/i.test(String(e && e.message))) return sendJSON(res, 409, { error: "Déjà inscrit." });
        return sendJSON(res, 500, SEC.safeError(e, "formation-acquerir"));
      }
      creerNotif(user.id, "formation", "Inscription confirmée", cle === 0 ? `Vous êtes inscrit à la formation « ${f.titre} ».` : `Vous avez accès au module « ${module.titre} » de « ${f.titre} ».`, { formation_id: f.id });
      return sendJSON(res, 201, { ok: true, acces_gratuit, portee });
    }

    /* ── Payant : rien n'est accordé tant que Stripe n'a pas confirmé le paiement ── */
    /* Aucun remboursement : le consentement exprès est exigé ICI, côté serveur, avant toute commande (une interface qui l'oublierait ne contournerait rien). */
    if (!body || body.accepte_non_remboursable !== true) {
      return sendJSON(res, 409, { error: "Avant de payer, confirmez que vous avez compris que cet achat n'est pas remboursable.", code: "consentement_requis", texte: TEXTE_NON_REMBOURSABLE, retractation: TEXTE_RETRACTATION, montant });
    }
    const { stripe, getOrCreateStripeCustomer } = require("./stripe-client");
    if (!D.paiementSimule() && !stripe) return sendJSON(res, 503, { error: "Paiements momentanément indisponibles." });
    if (D.paiementSimule() && actuel && actuel.statut === "en_attente" && actuel.commande_id) {
      /* « Finaliser mon paiement » en mode test : la commande restée en attente est considérée comme payée. */
      const conf = await D.confirmerCommande(db, actuel.commande_id, null);
      if (conf) return sendJSON(res, 200, { ok: true, paiement_simule: true, portee });
    }
    if (D.paiementSimule()) {
      /* Mode test : la commande est créée normalement, puis confirmée aussitôt, comme le ferait le webhook Stripe. */
      try {
        if (actuel && actuel.statut === "en_attente") await db.prepare("DELETE FROM formation_acces WHERE id=? AND statut='en_attente'").run(actuel.id);
        const { insc } = await assurerInscription("en_attente");
        const c = await db.prepare("INSERT INTO formation_commandes (user_id,formation_id,montant,statut,code_acces,prix_initial,remise,coupon_code,coupon_source,coupon_id,promo_pct) VALUES (?,?,?,'en_attente',?,?,?,?,?,?,?)").run(user.id, f.id, montant, code_valide, ...colsVente);
        await db.prepare("INSERT INTO formation_commande_lignes (commande_id,module_id,libelle,prix) VALUES (?,?,?,?)").run(c.lastInsertRowid, cle || null, libelle, prixCatalogue);
        if (actuel && actuel.statut !== "en_attente") await db.prepare("UPDATE formation_acces SET statut='en_attente', type_acces='paye', montant_paye=0, commande_id=?, inscription_id=?, date_debut=NULL, date_expiration=NULL, motif=NULL WHERE id=?").run(c.lastInsertRowid, insc.id, actuel.id);
        else await db.prepare("INSERT INTO formation_acces (user_id,formation_id,module_cle,type_acces,statut,montant_paye,commande_id,inscription_id) VALUES (?,?,?,'paye','en_attente',0,?,?)").run(user.id, f.id, cle, c.lastInsertRowid, insc.id);
        await db.prepare("UPDATE formation_commandes SET consentement_le=? WHERE id=?").run(`${new Date().toISOString()} v${VERSION_CONSENTEMENT} (paiement simulé)`, c.lastInsertRowid);
        await D.confirmerCommande(db, c.lastInsertRowid, montant);
        creerNotif(user.id, "formation", "Inscription confirmée", cle === 0 ? `Vous êtes inscrit à la formation « ${f.titre} » (paiement simulé).` : `Vous avez accès au module « ${module.titre} » de « ${f.titre} » (paiement simulé).`, { formation_id: f.id });
        return sendJSON(res, 201, { ok: true, paiement_simule: true, commande_id: Number(c.lastInsertRowid), portee });
      } catch (e) {
        if (/unique|duplicate/i.test(String(e && e.message))) return sendJSON(res, 409, { error: "Une demande est déjà en cours pour cette formation. Réessayez dans un instant." });
        return sendJSON(res, 500, SEC.safeError(e, "formation-paiement-simule"));
      }
    }
    if (actuel && actuel.statut === "en_attente") {
      /* Double clic ou retour en arrière : on reprend le paiement en cours plutôt que d'en créer un second. */
      const cmdEnCours = actuel.commande_id ? await db.prepare("SELECT * FROM formation_commandes WHERE id=? AND statut='en_attente'").get(actuel.commande_id) : null;
      if (cmdEnCours && cmdEnCours.stripe_session_id) {
        try {
          const s = await stripe.checkout.sessions.retrieve(cmdEnCours.stripe_session_id);
          if (s && s.status === "open" && s.url) return sendJSON(res, 200, { checkout_url: s.url, en_attente_paiement: true, repris: true });
          if (s && s.status === "complete") return sendJSON(res, 409, { error: "Votre paiement est en cours de validation : votre accès s'ouvrira dans quelques instants." });
        } catch (e) { if (!e || e.code !== "resource_missing") return sendJSON(res, 502, { error: "Impossible de vérifier votre paiement en cours. Réessayez dans un instant." }); }
        await D.annulerCommande(db, cmdEnCours.id, "expiree");
      } else if (cmdEnCours) {
        return sendJSON(res, 409, { error: "Une demande de paiement est déjà en cours d'initialisation. Réessayez dans un instant." });
      } else {
        await db.prepare("DELETE FROM formation_acces WHERE id=? AND statut='en_attente'").run(actuel.id);
      }
    }
    const droitActuel = actuel && actuel.statut === "en_attente" ? null : actuel; /* après nettoyage, la ligne n'existe plus si elle était en attente */
    let inscCreee = null, commandeId = null, droitId = null;
    try {
      const { insc, creee } = await assurerInscription("en_attente");
      if (creee) inscCreee = insc.id;
      const c = await db.prepare("INSERT INTO formation_commandes (user_id,formation_id,montant,statut,code_acces,prix_initial,remise,coupon_code,coupon_source,coupon_id,promo_pct) VALUES (?,?,?,'en_attente',?,?,?,?,?,?,?)").run(user.id, f.id, montant, code_valide, ...colsVente);
      commandeId = c.lastInsertRowid;
      await db.prepare("INSERT INTO formation_commande_lignes (commande_id,module_id,libelle,prix) VALUES (?,?,?,?)").run(commandeId, cle || null, libelle, prixCatalogue);
      /* poserDroit lit « actuel » ; si la ligne en attente vient d'être supprimée, on repart d'une insertion. */
      if (droitActuel) { await db.prepare("UPDATE formation_acces SET statut='en_attente', type_acces='paye', montant_paye=0, commande_id=?, inscription_id=?, date_debut=NULL, date_expiration=NULL, motif=NULL WHERE id=?").run(commandeId, insc.id, droitActuel.id); droitId = droitActuel.id; }
      else droitId = (await db.prepare("INSERT INTO formation_acces (user_id,formation_id,module_cle,type_acces,statut,montant_paye,commande_id,inscription_id) VALUES (?,?,?,'paye','en_attente',0,?,?)").run(user.id, f.id, cle, commandeId, insc.id)).lastInsertRowid;
      const origin = getOrigin(req);
      const stripeCustomerId = await getOrCreateStripeCustomer(db, user);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: stripeCustomerId,
        line_items: [{ price_data: { currency: "eur", unit_amount: Math.round(montant * 100), product_data: { name: libelle, description: f.organisme || undefined } }, quantity: 1 }],
        metadata: { diaspoactif_formation_commande_id: String(commandeId), consentement_non_remboursable: VERSION_CONSENTEMENT },
        /* Rappel sur la page de paiement elle-même, juste au-dessus du bouton Payer. */
        custom_text: { submit: { message: TEXTE_NON_REMBOURSABLE } },
        success_url: `${origin}/formations.html?paiement=succes&commande=${commandeId}`,
        cancel_url: `${origin}/formations.html?paiement=annule&commande=${commandeId}`,
      });
      await db.prepare("UPDATE formation_commandes SET stripe_session_id=?, consentement_le=? WHERE id=?").run(session.id, `${new Date().toISOString()} v${VERSION_CONSENTEMENT}`, commandeId);
      return sendJSON(res, 201, { checkout_url: session.url, en_attente_paiement: true, commande_id: Number(commandeId), portee });
    } catch (e) {
      /* Retour arrière complet : aucune trace d'un paiement qui n'a pas démarré. */
      try {
        if (commandeId) { await db.prepare("DELETE FROM formation_commande_lignes WHERE commande_id=?").run(commandeId); await db.prepare("DELETE FROM formation_commandes WHERE id=?").run(commandeId); }
        if (droitId && !droitActuel) await db.prepare("DELETE FROM formation_acces WHERE id=?").run(droitId);
        else if (droitId && droitActuel) await db.prepare("UPDATE formation_acces SET statut=?, commande_id=?, motif=? WHERE id=?").run(droitActuel.statut, droitActuel.commande_id || null, droitActuel.motif || null, droitId);
        if (inscCreee) await db.prepare("DELETE FROM formation_inscriptions WHERE id=?").run(inscCreee);
      } catch (_) { /* le nettoyage ne doit pas masquer l'erreur d'origine */ }
      if (/unique|duplicate/i.test(String(e && e.message))) return sendJSON(res, 409, { error: "Une demande est déjà en cours pour cette formation. Réessayez dans un instant." });
      return sendJSON(res, 500, SEC.safeError(e, "formation-checkout"));
    }
  }

  route("POST", "/api/formations/:id/inscrire", (req, res, params, body) => acquerir(req, res, params.id, null, body || {}));
  route("POST", "/api/formations/:id/acquerir", (req, res, params, body) => acquerir(req, res, params.id, body && body.module_id, body || {}));

  /* ── GET /api/formations/:id/offre — ce qu'on peut obtenir (formation complète, modules vendus seuls) et ce que le visiteur détient déjà. Public. ── */
  route("GET", "/api/formations/:id/offre", async (req, res, params) => {
    const lim = SEC.rateLimit(`formation-offre:${SEC.clientIp(req)}`, 200, 600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop de requêtes. Réessayez dans ${lim.retryAfter}s.` });
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
    if (!f || f.statut !== "publiee") return sendJSON(res, 404, { error: "Formation introuvable ou non publiée." });
    const modules = await db.prepare("SELECT id, titre, description, ordre, prix, vendable_seul FROM formation_modules WHERE formation_id=? ORDER BY ordre ASC, id ASC").all(f.id);
    const stats = await db.prepare("SELECT l.module_id, COUNT(*) AS nb, COALESCE(SUM(l.duree_minutes),0) AS minutes FROM formation_lecons l JOIN formation_modules m ON m.id=l.module_id WHERE m.formation_id=? GROUP BY l.module_id").all(f.id);
    const parModule = {}; stats.forEach(s => { parModule[Number(s.module_id)] = s; });
    const gratuite = (f.mode_acces || "gratuit") === "gratuit";
    const user = await getCurrentUser(req);
    const mes = { formation: null, modules: {} };
    if (user) {
      await rattrapageCompte(db, user.id);
      await balayerExpirations(db, { userId: user.id, formationId: f.id });
      for (const a of await db.prepare("SELECT module_cle, statut, date_expiration FROM formation_acces WHERE user_id=? AND formation_id=?").all(user.id, f.id)) {
        if (Number(a.module_cle) === 0) mes.formation = { statut: a.statut, date_expiration: a.date_expiration || null };
        else mes.modules[Number(a.module_cle)] = { statut: a.statut, date_expiration: a.date_expiration || null };
      }
    }
    sendJSON(res, 200, {
      formation: { id: Number(f.id), titre: f.titre, prix: gratuite ? 0 : Finances.prixFormation(f).prix, prix_catalogue: gratuite ? 0 : Finances.prixFormation(f).catalogue, promo_pct: gratuite ? null : Finances.prixFormation(f).promo_pct, promo_date_fin: Finances.prixFormation(f).promo_pct ? (f.promo_date_fin || null) : null, gratuite, mode_acces: f.mode_acces || "gratuit", devise: f.devise || "EUR", duree_acces_jours: f.duree_acces_jours ? Number(f.duree_acces_jours) : null },
      modules: modules.map(m => ({
        id: Number(m.id), titre: m.titre, description: m.description || "", nb_lecons: Number((parModule[Number(m.id)] || {}).nb) || 0, duree_minutes: Number((parModule[Number(m.id)] || {}).minutes) || 0,
        vendable_seul: !!Number(m.vendable_seul), prix: D.prixModule(f, m), gratuit: D.prixModule(f, m) <= 0,
      })),
      mon_acces: user ? mes : null,
    });
  });

  /* ── GET /api/mes-acces — tous les droits de l'apprenant (formations et modules), avec état et échéance ── */
  route("GET", "/api/mes-acces", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    await rattrapageCompte(db, user.id);
    await balayerExpirations(db, { userId: user.id });
    const rows = await db.prepare(`SELECT a.id, a.formation_id, a.module_cle, a.type_acces, a.statut, a.montant_paye, a.date_debut, a.date_expiration, a.created_at, f.titre AS formation_titre, f.image_url, m.titre AS module_titre
      FROM formation_acces a JOIN formations f ON f.id=a.formation_id LEFT JOIN formation_modules m ON m.id=a.module_cle AND a.module_cle<>0
      WHERE a.user_id=? ORDER BY a.id DESC`).all(user.id);
    sendJSON(res, 200, { acces: rows.map(r => ({
      id: Number(r.id), formation_id: Number(r.formation_id), formation_titre: r.formation_titre, image_url: r.image_url || null,
      module_id: Number(r.module_cle) || null, module_titre: Number(r.module_cle) ? (r.module_titre || "Module supprimé") : null,
      portee: Number(r.module_cle) ? "module" : "formation", type_acces: r.type_acces, statut: r.statut, montant_paye: Number(r.montant_paye) || 0,
      date_debut: r.date_debut || null, date_expiration: r.date_expiration || null, achete_le: r.created_at,
    })) });
  });

  /* ── Formateur / administration : voir et gérer les droits de ses apprenants ── */
  route("GET", "/api/formations/:id/acces", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
    if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
    if (!checkFormationOwner(f, user)) return sendJSON(res, 403, { error: "Interdit." });
    await balayerExpirations(db, { formationId: f.id });
    const rows = await db.prepare(`SELECT a.id, a.user_id, a.module_cle, a.type_acces, a.statut, a.montant_paye, a.date_debut, a.date_expiration, a.motif, a.created_at, u.nom, u.prenom, m.titre AS module_titre
      FROM formation_acces a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN formation_modules m ON m.id=a.module_cle AND a.module_cle<>0
      WHERE a.formation_id=? ORDER BY a.id DESC LIMIT 500`).all(f.id);
    sendJSON(res, 200, { acces: rows.map(r => ({
      id: Number(r.id), user_id: Number(r.user_id), apprenant: [r.prenom, r.nom].filter(Boolean).join(" ") || "Compte supprimé",
      module_id: Number(r.module_cle) || null, module_titre: Number(r.module_cle) ? (r.module_titre || "Module supprimé") : null, portee: Number(r.module_cle) ? "module" : "formation",
      type_acces: r.type_acces, statut: r.statut, montant_paye: Number(r.montant_paye) || 0, date_debut: r.date_debut || null, date_expiration: r.date_expiration || null, motif: r.motif || null, achete_le: r.created_at,
    })) });
  });

  /* PATCH /api/formations/:id/acces/:accesId { statut: "revoque" | "actif", motif? } — révoquer, ou rouvrir un droit révoqué / expiré . */
  route("PATCH", "/api/formations/:id/acces/:accesId", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
    if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
    if (!checkFormationOwner(f, user)) return sendJSON(res, 403, { error: "Interdit." });
    const a = await db.prepare("SELECT * FROM formation_acces WHERE id=? AND formation_id=?").get(params.accesId, f.id);
    if (!a) return sendJSON(res, 404, { error: "Accès introuvable." });
    const statut = String((body && body.statut) || "");
    const motif = String((body && body.motif) || "").trim().slice(0, 300) || null;
    if (statut === "revoque") {
      if (!["actif", "en_attente"].includes(a.statut)) return sendJSON(res, 409, { error: "Seul un accès actif ou en attente peut être révoqué." });
      await db.prepare("UPDATE formation_acces SET statut='revoque', motif=? WHERE id=?").run(motif, a.id);
    } else if (statut === "actif") {
      if (!["revoque", "expire"].includes(a.statut)) return sendJSON(res, 409, { error: "Seul un accès révoqué ou expiré peut être rouvert." });
      await db.prepare("UPDATE formation_acces SET statut='actif', motif=?, date_debut=datetime('now'), date_expiration=? WHERE id=?").run(motif, D.dateExpiration(f), a.id);
    } else return sendJSON(res, 400, { error: "Statut demandé inconnu (revoque ou actif)." });
    await D.synchroniserInscription(db, a.user_id, f.id);
    creerNotif(a.user_id, "formation", statut === "revoque" ? "Accès à une formation retiré" : "Accès à une formation rétabli",
      statut === "revoque" ? `Votre accès à « ${f.titre} » a été retiré${motif ? ` (${motif})` : ""}.` : `Votre accès à « ${f.titre} » est de nouveau ouvert.`, { formation_id: f.id });
    sendJSON(res, 200, { ok: true, statut });
  });

  /* Tâche quotidienne (même secret que les autres crons) : expiration des droits arrivés à échéance. */
  route("GET", "/api/cron/formation-acces-expires", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const auth = String(req.headers["authorization"] || "");
    if (!secret || auth !== `Bearer ${secret}`) return sendJSON(res, 401, { error: "Non autorisé." });
    sendJSON(res, 200, { ok: true, expires: await balayerExpirations(db) });
  });
};
