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

const AVANTAGES_PREMIUM = [fournisseurCodeAdhesionDA];

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

module.exports = {
  AVANTAGES_PREMIUM,
  resoudreAvantagesPremium,
  appliquerAvantages,
  stripeDiscountPourAvantage,
  consommerAvantage,
  obtenirCouponDA,
  resoudreCompteBeneficiaire,
  parametrePlateforme,
};
