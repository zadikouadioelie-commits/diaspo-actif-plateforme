/* ═══════════════════════════════════════════════════════════════
   server/avantages-premium.js — Registre de fournisseurs d'avantages Premium
   ═══════════════════════════════════════════════════════════════
   calculerTarifPremium() (server/index.js) ne connaît aucun détail des
   mécanismes de réduction ci-dessous : il appelle resoudreAvantagesPremium()
   puis appliquerAvantages(), qui bouclent sur AVANTAGES_PREMIUM. Un futur
   second mécanisme d'avantage (autre que les Codes Adhésion D'A) s'ajoute
   comme un nouvel objet dans ce tableau, sans toucher au moteur central.

   Chaque fournisseur expose :
     resoudre(db, user, def, options)   — lecture seule, jamais d'effet de bord
                                           (safe à appeler sur la route catalogue)
     appliquer(montants, avantage)      — pure, ne touche jamais la base
     stripeDiscount(stripe, avantage, interval) — résout un coupon Stripe réutilisable
     consommer(db, avantage, user, ctx) — réservation atomique, appelée UNE fois
                                           au moment réel du paiement

   Toutes les dates futures sont calculées en JavaScript, jamais en SQL
   (server/db-pg.js:toPg() ne traduit pas les décalages positifs de date). */

async function parametrePlateforme(db, cle, defaut) {
  const row = await db.prepare("SELECT valeur FROM parametres_plateforme WHERE cle=?").get(cle);
  return row?.valeur ?? defaut;
}

/* Résout le compte qui bénéficierait effectivement de Premium pour cet utilisateur
   connecté : pour une Initiative, l'accréditation vit sur le compte propriétaire mais
   le compte "public" est l'initiative elle-même (da_id propre) ; pour un Utilisateur
   ou une Collectivité (ligne users, role='collectivite' — pas de table dédiée), c'est
   directement le compte connecté. Adressé par (da_id, source) car da_id est le seul
   identifiant partagé par un compteur global unique entre users et initiatives. */
async function resoudreCompteBeneficiaire(db, user) {
  if (user.role === 'initiative') {
    const init = await db.prepare("SELECT id, da_id FROM initiatives WHERE owner_user_id=?").get(user.id);
    if (!init?.da_id) return null;
    return { da_id: init.da_id, source: 'initiative', user_id: user.id, role: user.role };
  }
  const u = await db.prepare("SELECT id, da_id FROM users WHERE id=?").get(user.id);
  if (!u?.da_id) return null;
  return { da_id: u.da_id, source: 'user', user_id: u.id, role: user.role };
}

/* ── Fournisseur : Codes Adhésion D'A ──
   Chaîne de validation à 7 contrôles (cahier des charges §4.1), chacun avec un code
   de raison distinct — jamais d'information sur le propriétaire du code en cas d'échec. */
const fournisseurCodeAdhesionDA = {
  id: 'code_adhesion_da',

  async resoudre(db, user, def, options) {
    const codeSaisi = (options?.code_da || '').trim().toUpperCase();
    if (!codeSaisi) return null; // aucun code proposé : ce fournisseur ne s'applique pas

    const beneficiaire = await resoudreCompteBeneficiaire(db, user);
    if (!beneficiaire) return { valide: false, raison: 'compte_non_identifiable' };

    const code = await db.prepare("SELECT * FROM da_codes_adhesion WHERE code=?").get(codeSaisi);
    if (!code) return { valide: false, raison: 'inconnu' };
    if (code.statut === 'suspendu') return { valide: false, raison: 'suspendu' };
    if (code.statut === 'expire') return { valide: false, raison: 'expire' };
    if (code.date_fin_avantage && new Date(code.date_fin_avantage + 'Z') <= new Date()) {
      return { valide: false, raison: 'expire' };
    }

    const dejaUtilise = await db.prepare(
      "SELECT * FROM da_codes_utilisations WHERE code_id=? AND beneficiaire_da_id=?"
    ).get(code.id, beneficiaire.da_id);
    if (!dejaUtilise && code.nb_utilisations >= code.nb_max_utilisations) {
      return { valide: false, raison: 'epuise' };
    }

    const membre = await db.prepare("SELECT * FROM adhesion_membres WHERE id=?").get(code.adhesion_membre_id);
    if (!membre || membre.statut !== 'a_jour') return { valide: false, raison: 'adhesion_non_a_jour' };

    if (!dejaUtilise && membre.linked_user_id && Number(membre.linked_user_id) === Number(beneficiaire.user_id)) {
      const autoOk = await parametrePlateforme(db, 'da_code_auto_utilisation_autorisee', '1');
      if (autoOk !== '1') return { valide: false, raison: 'auto_utilisation_non_autorisee' };
    }

    return {
      valide: true,
      fournisseur: this.id,
      code: code.code,
      code_id: code.id,
      reduction_pct: Number(code.reduction_pct),
      duree_mois: code.duree_mois,
      date_premiere_utilisation: code.date_premiere_utilisation,
      date_fin_avantage: code.date_fin_avantage,
      beneficiaire,
      deja_utilise: !!dejaUtilise,
    };
  },

  appliquer(montants, avantage) {
    if (!avantage?.valide) return montants;
    const pct = Number(avantage.reduction_pct) / 100;
    return {
      ...montants,
      montant_mensuel_avant: montants.montant_mensuel,
      montant_annuel_avant: montants.montant_annuel,
      montant_mensuel: Math.round(montants.montant_mensuel * (1 - pct) * 100) / 100,
      montant_annuel: Math.round(montants.montant_annuel * (1 - pct) * 100) / 100,
    };
  },

  async stripeDiscount(stripe, avantage, interval) {
    if (!avantage?.valide) return null;
    return obtenirCouponDA(stripe, { pct: avantage.reduction_pct, dureeMois: avantage.duree_mois, interval });
  },

  /* Réservation atomique : perd la course => retourne null (l'appelant continue au prix
     plein plutôt que de bloquer un client payant). Idempotent si le compte a déjà une
     ligne d'utilisation (rechargement de page, nouvelle tentative après échec Stripe) —
     dans ce cas `fraichementReserve` vaut false, pour que l'appelant sache qu'un échec de
     paiement ne doit PAS décrémenter un compteur qui n'a pas été incrémenté cette fois-ci. */
  async consommer(db, avantage, user, ctx) {
    if (!avantage?.valide) return null;
    const { beneficiaire } = avantage;

    const existante = await db.prepare(
      "SELECT * FROM da_codes_utilisations WHERE code_id=? AND beneficiaire_da_id=?"
    ).get(avantage.code_id, beneficiaire.da_id);

    if (!existante) {
      const r = await db.prepare(`
        UPDATE da_codes_adhesion SET nb_utilisations = nb_utilisations + 1, updated_at = datetime('now')
        WHERE id=? AND nb_utilisations + 1 <= nb_max_utilisations AND statut NOT IN ('suspendu','expire')
      `).run(avantage.code_id);
      if (r.changes === 0) return null; // course perdue entre la résolution et la réservation
    }

    let utilisationId;
    if (existante) {
      utilisationId = existante.id;
      await db.prepare(`
        UPDATE da_codes_utilisations SET statut='en_attente', type_tarif=?, montant_avant=?, montant_apres=?,
          reduction_pct=?, accred_id=?, updated_at=datetime('now') WHERE id=?
      `).run(ctx.type_tarif, ctx.montant_avant, ctx.montant_apres, avantage.reduction_pct, ctx.accred_id || null, utilisationId);
    } else {
      const ins = await db.prepare(`
        INSERT INTO da_codes_utilisations
          (code_id, beneficiaire_da_id, beneficiaire_source, beneficiaire_user_id, beneficiaire_role,
           accred_id, type_tarif, montant_avant, montant_apres, reduction_pct, statut)
        VALUES (?,?,?,?,?,?,?,?,?,?,'en_attente')
      `).run(
        avantage.code_id, beneficiaire.da_id, beneficiaire.source, beneficiaire.user_id, beneficiaire.role,
        ctx.accred_id || null, ctx.type_tarif, ctx.montant_avant, ctx.montant_apres, avantage.reduction_pct
      );
      utilisationId = Number(ins.lastInsertRowid);
    }
    return { utilisationId, fraichementReserve: !existante };
  },
};

/* ── Fournisseur : Parrainage Initiative -50% ──
   Un compte de référence (role='initiative', accréditation initiative_abonne active, payée
   à 100% — jamais elle-même réduite, cf. reduction_pct_appliquee, la règle anti-chaîne)
   transmet -50% à un AUTRE compte du MÊME propriétaire (même comptes_lies_membres.groupe_id
   — système déjà existant, jamais un parrainage ouvert entre inconnus), uniquement sur un
   Premium ANNUEL. La durée est la durée restante du Premium de la référence AU MOMENT de la
   réservation (interrogation Stripe current_period_end — aucune date de fin n'est stockée
   localement pour un abonnement Premium classique, contrairement aux Codes Adhésion D'A qui
   ont duree_mois en base) : figée dans duree_jours_reservee, jamais recalculée ensuite même
   si la référence se réabonne. Chaîne de contrôle à 10 étapes, chacune avec un code de
   raison distinct — jamais d'information sur le propriétaire du DS-ID en cas d'échec. */
const fournisseurParrainageInitiative = {
  id: 'parrainage_initiative',

  async resoudre(db, user, def, options) {
    const dsIdSaisi = (options?.parrainage_ds_id || '').trim().toUpperCase();
    if (!dsIdSaisi) return null; // aucun DS-ID proposé : ce fournisseur ne s'applique pas
    // -50% uniquement sur un Premium annuel — un achat mensuel ne doit jamais consommer la
    // réservation ni afficher de réduction, quel que soit le DS-ID par ailleurs valide.
    if (options?.type_tarif !== 'annuel') return null;

    const beneficiaire = await resoudreCompteBeneficiaire(db, user);
    if (!beneficiaire) return { valide: false, raison: 'compte_non_identifiable' };

    const refUser = await db.prepare("SELECT * FROM users WHERE ds_id=?").get(dsIdSaisi);
    if (!refUser) return { valide: false, raison: 'ds_id_introuvable' };
    if (refUser.id === user.id) return { valide: false, raison: 'compte_actuel' };
    if (refUser.role !== 'initiative') return { valide: false, raison: 'role_non_eligible' };

    // Même groupe "comptes liés" — jamais de faux positif si l'un des deux (ou les deux)
    // n'a AUCUNE ligne dans comptes_lies_membres (deux groupe_id NULL ne doivent jamais
    // être considérés comme égaux).
    const membreBeneficiaire = await db.prepare("SELECT groupe_id FROM comptes_lies_membres WHERE user_id=?").get(user.id);
    const membreReference    = await db.prepare("SELECT groupe_id FROM comptes_lies_membres WHERE user_id=?").get(refUser.id);
    if (!membreBeneficiaire || !membreReference || membreBeneficiaire.groupe_id !== membreReference.groupe_id) {
      return { valide: false, raison: 'comptes_non_lies' };
    }

    const defInitiative = await db.prepare("SELECT id FROM accred_definitions WHERE type='initiative_abonne'").get();
    if (!defInitiative) return { valide: false, raison: 'offre_indisponible' };

    const refAccred = await db.prepare(
      "SELECT * FROM user_accreditations WHERE user_id=? AND accred_id=? AND statut='active'"
    ).get(refUser.id, defInitiative.id);
    if (!refAccred) return { valide: false, raison: 'reference_non_active' };
    if (refAccred.date_expiration && new Date(refAccred.date_expiration + 'Z') <= new Date()) {
      return { valide: false, raison: 'reference_non_active' };
    }
    // Règle anti-chaîne : la référence ne doit JAMAIS avoir elle-même bénéficié d'une
    // réduction, quel que soit le mécanisme (D'A ou parrainage) — reduction_pct_appliquee
    // est la source de vérité générique, écrite par le webhook pour tout fournisseur.
    if (Number(refAccred.reduction_pct_appliquee) > 0) return { valide: false, raison: 'reference_deja_reduite' };
    if (!refAccred.stripe_subscription_id) return { valide: false, raison: 'duree_indeterminee' };

    // Durée restante réelle : nécessite un client Stripe explicite passé par l'appelant.
    // Jamais d'avantage "par défaut" sans durée réellement vérifiée — échec fermé sinon.
    const stripeClient = options?.stripeClient;
    if (!stripeClient) return { valide: false, raison: 'verification_indisponible' };
    let dureeJours;
    try {
      const sub = await stripeClient.subscriptions.retrieve(refAccred.stripe_subscription_id);
      if (!sub || !['active', 'trialing'].includes(sub.status) || !sub.current_period_end) {
        return { valide: false, raison: 'reference_non_active' };
      }
      dureeJours = Math.floor((sub.current_period_end * 1000 - Date.now()) / 86400000);
      if (dureeJours <= 0) return { valide: false, raison: 'duree_indeterminee' };
    } catch (e) {
      return { valide: false, raison: 'verification_indisponible' };
    }

    return {
      valide: true,
      fournisseur: this.id,
      reduction_pct: 50,
      duree_jours: dureeJours,
      reference_user_id: refUser.id,
      reference_da_id: refUser.da_id,
      reference_accred_id: defInitiative.id,
      beneficiaire,
    };
  },

  appliquer(montants, avantage) {
    if (!avantage?.valide) return montants;
    const pct = Number(avantage.reduction_pct) / 100;
    // Uniquement l'annuel — resoudre() n'atteint jamais "valide:true" hors annuel, donc le
    // mensuel n'est jamais touché ici par construction, pas besoin de le revérifier.
    return {
      ...montants,
      montant_annuel_avant: montants.montant_annuel,
      montant_annuel: Math.round(montants.montant_annuel * (1 - pct) * 100) / 100,
    };
  },

  async stripeDiscount(stripe, avantage, interval) {
    if (!avantage?.valide || interval !== 'year') return null;
    return obtenirCouponParrainage(stripe, { pct: avantage.reduction_pct, dureeJours: avantage.duree_jours });
  },

  /* Réservation atomique, idempotente si une ligne "en_attente" existe déjà pour ce couple
     référence/bénéficiaire (rechargement de page, nouvelle tentative après échec Stripe).
     Illimité en nombre de bénéficiaires par référence (pas de compteur à faire concurrencer
     ici, contrairement aux Codes D'A) : la portée est déjà bornée par la taille du groupe de
     comptes liés du propriétaire. */
  async consommer(db, avantage, user, ctx) {
    if (!avantage?.valide) return null;
    const { beneficiaire } = avantage;
    const existante = await db.prepare(
      "SELECT * FROM parrainage_initiative_utilisations WHERE reference_user_id=? AND beneficiaire_da_id=?"
    ).get(avantage.reference_user_id, beneficiaire.da_id);

    let utilisationId;
    if (existante) {
      utilisationId = existante.id;
      await db.prepare(`
        UPDATE parrainage_initiative_utilisations SET statut='en_attente', type_tarif=?, montant_avant=?,
          montant_apres=?, reduction_pct=?, duree_jours_reservee=?, accred_id=?, updated_at=datetime('now') WHERE id=?
      `).run(ctx.type_tarif, ctx.montant_avant, ctx.montant_apres, avantage.reduction_pct, avantage.duree_jours, ctx.accred_id || null, utilisationId);
    } else {
      const ins = await db.prepare(`
        INSERT INTO parrainage_initiative_utilisations
          (reference_user_id, reference_da_id, reference_accred_id, beneficiaire_da_id, beneficiaire_source,
           beneficiaire_user_id, beneficiaire_role, accred_id, type_tarif, montant_avant, montant_apres,
           reduction_pct, duree_jours_reservee, statut)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'en_attente')
      `).run(
        avantage.reference_user_id, avantage.reference_da_id, avantage.reference_accred_id,
        beneficiaire.da_id, beneficiaire.source, beneficiaire.user_id, beneficiaire.role,
        ctx.accred_id || null, ctx.type_tarif, ctx.montant_avant, ctx.montant_apres,
        avantage.reduction_pct, avantage.duree_jours
      );
      utilisationId = Number(ins.lastInsertRowid);
    }
    return { utilisationId, fraichementReserve: !existante };
  },
};

const AVANTAGES_PREMIUM = [fournisseurCodeAdhesionDA, fournisseurParrainageInitiative];

function trouverFournisseur(avantage) {
  return AVANTAGES_PREMIUM.find(f => f.id === avantage?.fournisseur) || null;
}

async function resoudreAvantagesPremium(db, user, def, options) {
  for (const f of AVANTAGES_PREMIUM) {
    const res = await f.resoudre(db, user, def, options || {});
    if (res) return { fournisseur: f.id, ...res };
  }
  return null;
}

function appliquerAvantages(montants, avantage) {
  const f = trouverFournisseur(avantage);
  return f ? f.appliquer(montants, avantage) : montants;
}

async function stripeDiscountPourAvantage(stripe, avantage, interval) {
  const f = trouverFournisseur(avantage);
  return f ? f.stripeDiscount(stripe, avantage, interval) : null;
}

async function consommerAvantage(db, avantage, user, ctx) {
  const f = trouverFournisseur(avantage);
  return f ? f.consommer(db, avantage, user, ctx) : null;
}

/* ── Coupon Stripe partagé par triplet (percent_off, duration_in_months, interval) ──
   Un seul objet Stripe par combinaison, jamais un par code (jusqu'à ~24 000 codes sinon).
   Retrieve-or-create, résistant aux courses de création concurrente. */
async function obtenirCouponDA(stripe, { pct, dureeMois, interval }) {
  const pctInt = Math.round(Number(pct));
  const isAnnuel = interval === 'annuel' || interval === 'year';
  const shape = isAnnuel
    ? (dureeMois <= 12 ? { duration: 'once' } : { duration: 'repeating', duration_in_months: Math.ceil(dureeMois / 12) })
    : { duration: 'repeating', duration_in_months: dureeMois };
  const couponId = `da_adh_${pctInt}_${dureeMois}m_${isAnnuel ? 'y' : 'm'}`;

  try {
    await stripe.coupons.retrieve(couponId);
    return couponId;
  } catch (e) { /* n'existe pas encore : on le crée ci-dessous */ }

  try {
    await stripe.coupons.create({
      id: couponId, percent_off: pctInt, name: `Adhésion D'A -${pctInt}%`,
      metadata: { source: 'codes_adhesion_da' }, ...shape,
    });
    return couponId;
  } catch (e) {
    // Deux requêtes concurrentes ont pu tenter de créer le même coupon — on re-vérifie avant d'échouer.
    try { await stripe.coupons.retrieve(couponId); return couponId; } catch (e2) { throw e; }
  }
}

/* ── Coupon Stripe partagé par (pourcentage, durée en jours) — parrainage ──
   duration:'once' : s'applique à la 1ère facture de l'abonnement annuel seulement (une
   seule facture par an) — l'abonnement suivant revient au plein tarif automatiquement côté
   Stripe, sans action serveur, cohérent avec la règle "durée figée, jamais prolongée". */
async function obtenirCouponParrainage(stripe, { pct, dureeJours }) {
  const pctInt = Math.round(Number(pct));
  const couponId = `parrainage_${pctInt}_${dureeJours}j`;

  try {
    await stripe.coupons.retrieve(couponId);
    return couponId;
  } catch (e) { /* n'existe pas encore : on le crée ci-dessous */ }

  try {
    await stripe.coupons.create({
      id: couponId, percent_off: pctInt, duration: 'once',
      name: `Parrainage Initiative -${pctInt}%`, metadata: { source: 'parrainage_initiative' },
    });
    return couponId;
  } catch (e) {
    try { await stripe.coupons.retrieve(couponId); return couponId; } catch (e2) { throw e; }
  }
}

module.exports = {
  AVANTAGES_PREMIUM,
  resoudreAvantagesPremium,
  appliquerAvantages,
  stripeDiscountPourAvantage,
  consommerAvantage,
  obtenirCouponDA,
  obtenirCouponParrainage,
  resoudreCompteBeneficiaire,
  parametrePlateforme,
  fournisseurParrainageInitiative,
  fournisseurCodeAdhesionDA,
};
