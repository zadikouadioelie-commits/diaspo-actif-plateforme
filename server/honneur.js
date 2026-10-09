/* ══════════════════════════════════════════════════════════════════════════
   server/honneur.js — « Comptes à l'honneur » / Trophée de la Diaspora (2026-10-05)

   Règles (décidées avec l'utilisateur) :
   • Calendrier COMMUN à tous, cycles de 3 mois à partir de la date de lancement (parametre 'honneur_debut',
     1er janvier 2027 par défaut) : mois 1 et 2 MESURÉS, mois 3 offert aux lauréats / payant pour les autres,
     non mesuré pour personne (il laisse la place aux autres comptes).
   • Score = % d'un barème de base (100 % = activité régulière et saine) sur 8 paramètres pondérés ; chaque
     paramètre compte jusqu'à 2× son seuil (max 200 %). ≥ 100 % éligible ; les lauréats sont choisis parmi les
     comptes STRICTEMENT AU-DESSUS de 100 %, classés sur le cumul des deux mois.
   • Lauréats : 2 par tranche de 100 comptes de la catégorie (utilisateurs et initiatives comptés séparément,
     tranche entamée comprise). Égalité : activité brute la plus élevée, puis compte le plus ancien.
   • Coup de pouce administrateur : +10…55 points de pourcentage au total (secret : jamais affiché).
   • Éligibilité : comptes Premium réellement PAYANTS ; tant qu'aucun compte n'a payé, tous les Premium actifs.
   Rien de privé (points, pourcentages, coups de pouce) n'est jamais exposé publiquement.
   ══════════════════════════════════════════════════════════════════════════ */

const BAREME_DEFAUT = [
  { k: 'pub', titre: 'Publications', desc: 'Régularité : 3 publications par jour comptées au maximum', poids: 15, seuil: 8 },
  { k: 'eng', titre: 'Engagement reçu', desc: 'Réactions et commentaires reçus de comptes différents', poids: 20, seuil: 40 },
  { k: 'com', titre: 'Participation à la communauté', desc: 'Commentaires et réactions donnés aux autres comptes', poids: 15, seuil: 25 },
  { k: 'evt', titre: 'Événements et comptes-rendus', desc: 'Événements organisés, comptes-rendus publiés', poids: 15, seuil: 2 },
  { k: 'res', titre: 'Réseau', desc: 'Nouveaux abonnés', poids: 10, seuil: 10 },
  { k: 'pro', titre: 'Profil et vitrine', desc: 'Complétude et mise à jour du profil', poids: 10, seuil: 90, unite: ' %' },
  { k: 'fia', titre: 'Fiabilité', desc: 'Compte vérifié, aucune sanction', poids: 10, seuil: 80, unite: ' %' },
  { k: 'uti', titre: 'Utilité concrète', desc: 'Commandes honorées, offres et annonces publiées', poids: 5, seuil: 3 },
];
const COUP_DE_POUCE_MAX = 55;
const COUP_DE_POUCE_PALIERS = [10, 15, 20, 30, 40, 50, 55];
const TYPES_POSTS_EXCLUS = ['annonce_officielle', 'evenement_promo', 'compte_rendu', 'carte_vitrine'];

/* ── Calendrier : dates 'YYYY-MM-DD' manipulées en pur calcul (jamais de SQL de date, voir db-pg.js:toPg) ── */
function ajouterMois(iso, n) {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(j, 28)).padStart(2, '0')}`;
}
function moisEntre(a, b) { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); }

/* Cycle contenant la date (null avant le lancement). */
function cycleContenant(debutProgramme, dateISO) {
  const debut = debutProgramme.slice(0, 7) + '-01';
  const jour = dateISO.slice(0, 7) + '-01';
  const m = moisEntre(debut, jour);
  if (m < 0) return null;
  const idx = Math.floor(m / 3);
  const cDebut = ajouterMois(debut, idx * 3).slice(0, 7) + '-01';
  return cycleDepuisDebut(cDebut);
}
function cycleDepuisDebut(cDebut) {
  const d = cDebut.slice(0, 7) + '-01';
  return { cle: d.slice(0, 7), debut: d, fin_mesure: ajouterMois(d, 2).slice(0, 7) + '-01', fin: ajouterMois(d, 3).slice(0, 7) + '-01' };
}
/* Cycles dont la mesure est terminée à cette date (à clôturer), du premier au dernier. */
function cyclesAClore(debutProgramme, dateISO) {
  const out = []; let c = cycleDepuisDebut(debutProgramme);
  while (c.fin_mesure <= dateISO) { out.push(c); c = cycleDepuisDebut(ajouterMois(c.debut, 3)); if (out.length > 200) break; }
  return out;
}
/* Nombre de lauréats : 2 par tranche de 100 comptes de la catégorie, tranche entamée comprise (minimum 2). */
function nbLaureats(nbComptes) { return 2 * Math.max(1, Math.ceil(nbComptes / 100)); }

/* ── Score ── */
function scorer(valeurs, bareme) {
  const lignes = bareme.map(p => {
    const v = Number(valeurs[p.k] || 0);
    const ratio = Math.min(v / p.seuil, 2);
    return { k: p.k, titre: p.titre, desc: p.desc, poids: p.poids, seuil: p.seuil, unite: p.unite || '', valeur: Math.round(v * 10) / 10, pct: Math.round(ratio * 100), contrib: p.poids * ratio };
  });
  return { lignes, pct_base: lignes.reduce((s, l) => s + l.contrib, 0) };
}

module.exports = function creerMoteurHonneur(deps) {
  const { db, dateParisISO, nomCompteAffichage, creerNotif, getStripe, logError } = deps;

  async function parametre(cle, defaut) {
    try { const r = await db.prepare("SELECT valeur FROM parametres_plateforme WHERE cle=?").get(cle); return r && r.valeur != null ? r.valeur : defaut; } catch (_) { return defaut; }
  }
  async function debutProgramme() { return String(await parametre('honneur_debut', '2027-01-01')).slice(0, 10); }
  async function bareme() {
    try {
      const j = JSON.parse(await parametre('honneur_bareme', 'null'));
      if (Array.isArray(j) && j.length) return BAREME_DEFAUT.map(p => { const o = j.find(x => x.k === p.k); return o ? { ...p, poids: Number(o.poids) || p.poids, seuil: Number(o.seuil) || p.seuil } : p; });
    } catch (_) {}
    return BAREME_DEFAUT;
  }

  /* ── Origine du Premium : payant / accordé / promotion (distinction demandée) ── */
  async function premiumOrigine(userId) {
    const rows = await db.prepare(`SELECT ua.*, ad.type AS accred_type FROM user_accreditations ua JOIN accred_definitions ad ON ad.id=ua.accred_id
        WHERE ua.user_id=? AND ad.type IN ('initiative_abonne','utilisateur_abonne') AND ua.statut='active'`).all(userId);
    const maintenant = Date.now();
    const ua = rows.find(r => !r.date_expiration || new Date(r.date_expiration).getTime() >= maintenant);
    if (!ua) return { actif: false, origine: null, sous_type: null, libelle: 'Aucun Premium actif' };
    const tarif = ua.type_tarif || '';
    if (tarif === 'honneur') return { actif: true, origine: 'honneur', sous_type: 'honneur', libelle: "Offert par l'honneur", ua };
    if (tarif === 'decouverte') return { actif: true, origine: 'promotion', sous_type: 'decouverte', libelle: 'Promotion : période de découverte', ua };
    if (tarif === 'lien_adherent') return { actif: true, origine: 'promotion', sous_type: 'lien_adherent', libelle: "Promotion : lien d'adhérent", ua };
    let aPaye = !!ua.stripe_subscription_id;
    if (!aPaye) { try { aPaye = !!(await db.prepare("SELECT id FROM accred_paiements WHERE user_id=? AND accred_id=? AND statut='paye' LIMIT 1").get(userId, ua.accred_id)); } catch (_) {} }
    if (aPaye) {
      const reduit = Number(ua.reduction_pct_appliquee || 0) > 0;
      return { actif: true, origine: 'payant', sous_type: reduit ? 'avec_reduction' : 'plein_tarif', libelle: reduit ? 'Payant, avec réduction' : 'Payant, plein tarif', ua };
    }
    if (ua.admin_id) {
      if (Number(ua.montant_paye || 0) > 0) return { actif: true, origine: 'payant', sous_type: 'hors_ligne', libelle: 'Payant, enregistré hors ligne', ua };
      return { actif: true, origine: 'accorde', sous_type: 'admin', libelle: 'Accordé par un administrateur', ua };
    }
    if (Number(ua.montant_paye || 0) > 0) return { actif: true, origine: 'payant', sous_type: 'hors_ligne', libelle: 'Payant, enregistré hors ligne', ua };
    return { actif: true, origine: 'promotion', sous_type: 'autre', libelle: 'Promotion', ua };
  }
  /* 'payants' dès qu'un compte a réellement payé ; sinon tous les Premium actifs (transition). Forçable par l'administrateur. */
  /* Date à partir de laquelle la condition Premium s'applique à nouveau (2026-10-09, demande explicite) : le Premium est gratuit
     (gratuité commune jusqu'au 3 janvier 2027) ; le Trophée prend le Premium en compte dès J-3 semaines, le 13 décembre 2026 ; d'ici là le statut Premium n'est PAS pris en compte, tout le monde peut concourir. */
  async function premiumRequisDes() { return String(await parametre('honneur_premium_requis_des', '2026-12-13')).slice(0, 10); }
  async function modeEligibilite() {
    const force = String(await parametre('honneur_eligibilite', 'auto'));
    if (force === 'payants' || force === 'tous_premium' || force === 'aucun') return force;
    if (dateParisISO() < await premiumRequisDes()) return 'aucun';
    try {
      const n = Number((await db.prepare(`SELECT COUNT(*) AS n FROM user_accreditations ua JOIN accred_definitions ad ON ad.id=ua.accred_id
          WHERE ad.type IN ('initiative_abonne','utilisateur_abonne') AND ua.statut='active' AND COALESCE(ua.type_tarif,'') NOT IN ('decouverte','lien_adherent','honneur')
            AND (ua.stripe_subscription_id IS NOT NULL OR COALESCE(ua.montant_paye,0)>0)`).get()).n || 0);
      return n > 0 ? 'payants' : 'tous_premium';
    } catch (_) { return 'tous_premium'; }
  }
  async function eligiblePremium(userId, mode) {
    const o = await premiumOrigine(userId);
    if (mode === 'aucun') return { ok: true, origine: o };
    if (!o.actif) return { ok: false, origine: o };
    const ok = mode === 'tous_premium' ? true : (o.origine === 'payant' || o.origine === 'honneur');
    return { ok, origine: o };
  }

  /* ── Mesure d'un compte sur [debut, fin) — dates 'YYYY-MM-DD', fin exclue ── */
  const plafond = (lignes, cle, max) => lignes.reduce((s, r) => s + Math.min(Number(r.n || 0), max), 0);
  async function mesurer(user, debut, fin) {
    const d0 = debut + ' 00:00:00', d1 = fin + ' 00:00:00', uid = user.id;
    const v = { pub: 0, eng: 0, com: 0, evt: 0, res: 0, pro: 0, fia: 0, uti: 0 };
    const sur = async (f) => { try { return await f(); } catch (e) { if (logError) logError(e, 'honneur-mesure'); return null; } };
    const exclus = TYPES_POSTS_EXCLUS.map(() => '?').join(',');
    const pubs = await sur(() => db.prepare(`SELECT SUBSTR(created_at,1,10) AS j, COUNT(*) AS n FROM fil_posts WHERE auteur_id=? AND created_at>=? AND created_at<? AND COALESCE(statut,'publie') NOT IN ('archive','brouillon') AND COALESCE(type,'') NOT IN (${exclus}) GROUP BY 1`).all(uid, d0, d1, ...TYPES_POSTS_EXCLUS));
    if (pubs) v.pub = plafond(pubs, 'j', 3);
    const reacRecues = await sur(() => db.prepare(`SELECT r.user_id AS a, COUNT(*) AS n FROM fil_reactions r JOIN fil_posts p ON p.id=r.post_id WHERE p.auteur_id=? AND r.user_id<>? AND r.created_at>=? AND r.created_at<? GROUP BY r.user_id`).all(uid, uid, d0, d1));
    const comRecus = await sur(() => db.prepare(`SELECT c.auteur_id AS a, COUNT(*) AS n FROM fil_commentaires c JOIN fil_posts p ON p.id=c.post_id WHERE p.auteur_id=? AND c.auteur_id<>? AND c.created_at>=? AND c.created_at<? GROUP BY c.auteur_id`).all(uid, uid, d0, d1));
    if (reacRecues || comRecus) { const par = {}; [...(reacRecues || []), ...(comRecus || [])].forEach(r => { par[r.a] = (par[r.a] || 0) + Number(r.n); }); v.eng = plafond(Object.values(par).map(n => ({ n })), 'n', 2); }
    const reacDonnees = await sur(() => db.prepare(`SELECT SUBSTR(r.created_at,1,10) AS j, COUNT(*) AS n FROM fil_reactions r JOIN fil_posts p ON p.id=r.post_id WHERE r.user_id=? AND p.auteur_id<>? AND r.created_at>=? AND r.created_at<? GROUP BY 1`).all(uid, uid, d0, d1));
    const comDonnes = await sur(() => db.prepare(`SELECT SUBSTR(c.created_at,1,10) AS j, COUNT(*) AS n FROM fil_commentaires c JOIN fil_posts p ON p.id=c.post_id WHERE c.auteur_id=? AND p.auteur_id<>? AND c.created_at>=? AND c.created_at<? GROUP BY 1`).all(uid, uid, d0, d1));
    if (reacDonnees || comDonnes) { const par = {}; [...(reacDonnees || []), ...(comDonnes || [])].forEach(r => { par[r.j] = (par[r.j] || 0) + Number(r.n); }); v.com = plafond(Object.values(par).map(n => ({ n })), 'n', 5); }
    const evts = await sur(() => db.prepare(`SELECT COUNT(*) AS n FROM evenements WHERE owner_user_id=? AND COALESCE(statut,'') NOT IN ('brouillon','annule','annulé','ferme') AND SUBSTR(date_evt,1,10)>=? AND SUBSTR(date_evt,1,10)<? AND COALESCE(type_evt,'')<>'trophee_diaspora'`).get(uid, debut, fin));
    const crs = await sur(() => db.prepare(`SELECT COUNT(*) AS n FROM evenement_comptes_rendus WHERE auteur_id=? AND statut='publie' AND published_at>=? AND published_at<?`).get(uid, d0.replace(' ', 'T'), d1.replace(' ', 'T')));
    v.evt = Number(evts?.n || 0) + Number(crs?.n || 0);
    const init = user.role === 'initiative' ? await sur(() => db.prepare("SELECT * FROM initiatives WHERE owner_user_id=?").get(uid)) : null;
    const abos = await sur(() => db.prepare(`SELECT COUNT(*) AS n FROM user_follows uf JOIN users u2 ON u2.id=uf.follower_id WHERE uf.followed_id=? AND uf.created_at>=? AND uf.created_at<? AND u2.nom<>'Compte supprimé' AND (u2.is_demo IS NULL OR u2.is_demo=FALSE)`).get(uid, d0, d1));
    const abosInit = init ? await sur(() => db.prepare(`SELECT COUNT(*) AS n FROM abonnements WHERE initiative_id=? AND created_at>=? AND created_at<?`).get(init.id, d0, d1)) : null;
    v.res = Number(abos?.n || 0) + Number(abosInit?.n || 0);
    /* Profil / vitrine : part des champs renseignés. */
    const rempli = x => x != null && String(x).trim() !== '' && String(x) !== '[]' && String(x) !== '{}';
    const champs = init ? ['description', 'mission', 'logo_url', 'site_web', 'reseaux_sociaux', 'ville', 'domaine', 'objectifs', 'services', 'langues', 'annee_creation', 'galerie_json'].map(c => init[c])
      : ['bio', 'titre_pro', 'photo_url', 'competences', 'experiences', 'centres_interet', 'publics_json', 'besoins_json', 'realisations_json', 'services_perso', 'reseaux_json', 'annee_debut'].map(c => user[c]);
    v.pro = Math.round(champs.filter(rempli).length / champs.length * 100);
    /* Fiabilité : e-mail vérifié (40), identité/compte vérifié (30), aucune sanction (30). */
    const sanction = Number(user.suspendu_definitif || 0) === 1 || (user.suspendu_jusqu_au && new Date(user.suspendu_jusqu_au) > new Date()) || Number(init?.signalements_confirmes || 0) > 0;
    v.fia = (Number(user.email_verifie) ? 40 : 0) + ((Number(user.identite_verifiee) || Number(user.is_verified)) ? 30 : 0) + (sanction ? 0 : 30);
    const cmd = init ? await sur(() => db.prepare(`SELECT COUNT(*) AS n FROM commandes_vitrine WHERE initiative_id=? AND paiement_statut='paye' AND created_at>=? AND created_at<?`).get(init.id, d0, d1)) : null;
    const off = await sur(() => db.prepare(`SELECT COUNT(*) AS n FROM offres WHERE createur_id=? AND created_at>=? AND created_at<?`).get(uid, d0, d1));
    const ann = await sur(() => db.prepare(`SELECT COUNT(*) AS n FROM associe_annonces WHERE auteur_id=? AND created_at>=? AND created_at<?`).get(uid, d0, d1));
    v.uti = Number(cmd?.n || 0) + Number(off?.n || 0) + Number(ann?.n || 0);
    return v;
  }
  /* Activité brute (départage des égalités) : on ignore profil et fiabilité, qui sont des taux et non des actions. */
  const activiteBrute = v => (v.pub || 0) + (v.eng || 0) + (v.com || 0) + (v.evt || 0) + (v.res || 0) + (v.uti || 0);

  async function boostCycle(userId, cle) {
    try { const r = await db.prepare("SELECT COALESCE(SUM(pct),0) AS s FROM honneur_coups_de_pouce WHERE user_id=? AND cycle_cle=?").get(userId, cle); return Math.min(COUP_DE_POUCE_MAX, Number(r?.s || 0)); } catch (_) { return 0; }
  }
  function categorieDe(role) { return role === 'initiative' ? 'initiative' : (role === 'utilisateur' ? 'utilisateur' : null); }
  async function nbComptesCategorie(cat) {
    const role = cat === 'initiative' ? 'initiative' : 'utilisateur';
    return Number((await db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE u.role=? AND (u.compte_masque IS NULL OR u.compte_masque=0) AND (u.is_demo IS NULL OR u.is_demo=FALSE) AND COALESCE(u.suspendu_definitif,0)=0 AND u.nom<>'Compte supprimé'`).get(role)).n || 0);
  }

  /* ── Classement d'un cycle : calcule sans écrire ── */
  async function classerCycle(cycle) {
    const mode = await modeEligibilite(); const bar = await bareme();
    const comptes = await db.prepare(`SELECT u.* FROM users u WHERE u.role IN ('utilisateur','initiative') AND (u.compte_masque IS NULL OR u.compte_masque=0) AND (u.is_demo IS NULL OR u.is_demo=FALSE)
        AND COALESCE(u.suspendu_definitif,0)=0 AND u.nom<>'Compte supprimé' ${mode === 'aucun' ? '' : "AND EXISTS (SELECT 1 FROM user_accreditations ua JOIN accred_definitions ad ON ad.id=ua.accred_id WHERE ua.user_id=u.id AND ad.type IN ('initiative_abonne','utilisateur_abonne') AND ua.statut='active')"}`).all();
    const lignes = [];
    for (const u of comptes) {
      const el = await eligiblePremium(u.id, mode);
      if (!el.ok) continue;
      const valeurs = await mesurer(u, cycle.debut, cycle.fin_mesure);
      const s = scorer(valeurs, bar); const boost = await boostCycle(u.id, cycle.cle);
      lignes.push({ user_id: Number(u.id), role: u.role, categorie: categorieDe(u.role), created_at: u.created_at || '', origine: el.origine.origine, sous_type: el.origine.sous_type, valeurs, pct_base: s.pct_base, boost, total: s.pct_base + boost, activite: activiteBrute(valeurs) });
    }
    const cmp = (a, b) => (b.total - a.total) || (b.activite - a.activite) || String(a.created_at).localeCompare(String(b.created_at));
    const laureats = [];
    for (const cat of ['utilisateur', 'initiative']) {
      const dedans = lignes.filter(l => l.categorie === cat).sort(cmp);
      dedans.forEach((l, i) => { l.rang_cat = i + 1; });
      const n = nbLaureats(await nbComptesCategorie(cat));
      const gagnants = dedans.filter(l => l.total > 100).slice(0, n);
      gagnants.forEach((g, i) => { g.laureat = true; g.rang_laureat = i + 1; laureats.push(g); });
    }
    return { cycle, mode_eligibilite: mode, candidats: lignes.length, eligibles: lignes.filter(l => l.total >= 100).length, lignes, laureats };
  }

  /* ── Mois offert : Stripe (prochaine échéance à 100 %) ou prolongation de la date d'expiration ── */
  async function appliquerMoisOffert(laureat) {
    const o = await premiumOrigine(laureat.user_id);
    if (!o.actif) return { statut: 'sans_premium', detail: "Aucun Premium actif au moment de l'attribution." };
    const ua = o.ua;
    const auto = String(await parametre('honneur_mois_offert_auto', 'actif')) !== 'inactif';
    if (!auto) return { statut: 'a_traiter', detail: 'Application automatique désactivée : à traiter par un administrateur.' };
    if (ua.stripe_subscription_id) {
      const stripe = getStripe && getStripe();
      if (!stripe) return { statut: 'a_traiter', detail: 'Stripe indisponible : prochaine échéance à offrir manuellement.' };
      try {
        let coupon;
        try { coupon = await stripe.coupons.retrieve('honneur-mois-offert'); }
        catch (_) { coupon = await stripe.coupons.create({ id: 'honneur-mois-offert', percent_off: 100, duration: 'once', name: "Mois offert — Comptes à l'honneur" }); }
        const sub = await stripe.subscriptions.retrieve(ua.stripe_subscription_id);
        const existants = (sub.discounts || []).map(d => (typeof d === 'string' ? null : (d.coupon && d.coupon.id ? { coupon: d.coupon.id } : null))).filter(Boolean);
        await stripe.subscriptions.update(ua.stripe_subscription_id, { discounts: [...existants, { coupon: coupon.id }] });
        return { statut: 'applique', detail: 'Prochaine échéance Stripe offerte (coupon 100 %).' };
      } catch (e) { if (logError) logError(e, 'honneur-stripe'); return { statut: 'echec', detail: 'Stripe : ' + (e.message || 'erreur').slice(0, 160) }; }
    }
    const base = ua.date_expiration && new Date(ua.date_expiration).getTime() > Date.now() ? new Date(ua.date_expiration) : new Date();
    const fin = new Date(base.getTime()); fin.setUTCMonth(fin.getUTCMonth() + 1);
    await db.prepare("UPDATE user_accreditations SET date_expiration=?, notes=COALESCE(notes||' · ','') || ?, updated_at=? WHERE id=?")
      .run(fin.toISOString(), `Mois offert — Comptes à l'honneur ${laureat.cycle_cle}`, new Date().toISOString(), ua.id);
    return { statut: 'applique', detail: "Date d'expiration du Premium prolongée d'un mois." };
  }

  /* ── Clôture d'un cycle : écrit scores, lauréats, mois offert, notifications. Idempotent (statut 'clos'). ── */
  async function cloturerCycle(cycle, { notifier = true } = {}) {
    const deja = await db.prepare("SELECT id, statut FROM honneur_cycles WHERE cle=?").get(cycle.cle);
    if (deja && deja.statut === 'clos') return { deja: true };
    const claim = deja
      ? await db.prepare("UPDATE honneur_cycles SET statut='en_cloture' WHERE cle=? AND statut<>'clos'").run(cycle.cle)
      : await db.prepare("INSERT INTO honneur_cycles (cle, debut, fin_mesure, fin, statut) VALUES (?,?,?,?, 'en_cloture')").run(cycle.cle, cycle.debut, cycle.fin_mesure, cycle.fin);
    if (deja && !claim.changes) return { deja: true };
    try {
      const res = await classerCycle(cycle);
      await db.prepare("DELETE FROM honneur_scores WHERE cycle_cle=?").run(cycle.cle);
      await db.prepare("DELETE FROM honneur_laureats WHERE cycle_cle=?").run(cycle.cle);
      for (const l of res.lignes) {
        await db.prepare(`INSERT INTO honneur_scores (cycle_cle,user_id,categorie,origine_premium,valeurs_json,pct_base,boost_pct,total,rang_cat,laureat) VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .run(cycle.cle, l.user_id, l.categorie, l.origine, JSON.stringify(l.valeurs), l.pct_base, l.boost, l.total, l.rang_cat || null, l.laureat ? 1 : 0);
      }
      for (const g of res.laureats) {
        const init = g.role === 'initiative' ? await db.prepare("SELECT id FROM initiatives WHERE owner_user_id=?").get(g.user_id) : null;
        const nom = await nomCompteAffichage(g.user_id);
        const id = (await db.prepare(`INSERT INTO honneur_laureats (cycle_cle,user_id,initiative_id,categorie,rang,nom_snapshot,origine_premium) VALUES (?,?,?,?,?,?,?)`)
          .run(cycle.cle, g.user_id, init ? init.id : null, g.categorie, g.rang_laureat, nom, g.origine)).lastInsertRowid;
        const mo = await appliquerMoisOffert({ user_id: g.user_id, cycle_cle: cycle.cle });
        await db.prepare("UPDATE honneur_laureats SET mois_offert_statut=?, mois_offert_detail=? WHERE id=?").run(mo.statut, mo.detail, id);
        if (notifier) {
          creerNotif(g.user_id, 'honneur_laureat', '🏆 Vous êtes à l\'honneur !',
            `Félicitations : votre compte est à l'honneur pour le cycle ${cycle.cle}. ${mo.statut === 'applique' ? 'Votre mois offert est appliqué.' : 'Votre mois offert est en cours de traitement.'}`,
            { lien: 'parametres-compte.html#honneur', cycle: cycle.cle });
        }
      }
      await db.prepare("UPDATE honneur_cycles SET statut='clos', cloture_at=?, nb_candidats=?, nb_eligibles=?, mode_eligibilite=? WHERE cle=?")
        .run(new Date().toISOString(), res.candidats, res.eligibles, res.mode_eligibilite, cycle.cle);
      return { deja: false, candidats: res.candidats, eligibles: res.eligibles, laureats: res.laureats.length, mode_eligibilite: res.mode_eligibilite };
    } catch (e) {
      try { await db.prepare("UPDATE honneur_cycles SET statut='erreur' WHERE cle=?").run(cycle.cle); } catch (_) {}
      throw e;
    }
  }

  /* Cron quotidien : clôt tous les cycles dont la mesure est terminée (rattrape un jour manqué). */
  async function cronQuotidien() {
    const aujourdhui = dateParisISO(); const debut = await debutProgramme();
    const out = [];
    for (const c of cyclesAClore(debut, aujourdhui)) {
      const r = await cloturerCycle(c); out.push({ cle: c.cle, ...r });
    }
    return { debut_programme: debut, aujourdhui, cycles: out };
  }

  /* Comptes actuellement à l'honneur : du jour de clôture jusqu'à la clôture du cycle suivant (couverture continue). */
  async function laureatsAffiches() {
    const aujourdhui = dateParisISO();
    const cycles = await db.prepare("SELECT * FROM honneur_cycles WHERE statut='clos' ORDER BY fin_mesure DESC LIMIT 4").all();
    const actif = cycles.find(c => c.fin_mesure <= aujourdhui && aujourdhui < ajouterMois(c.fin_mesure, 3).slice(0, 7) + '-01');
    if (!actif) return { cycle: null, laureats: [] };
    const rows = await db.prepare(`SELECT l.*, u.role, u.photo_url, u.ville, u.pays, i.logo_url, i.slug AS init_slug, i.nom AS init_nom
        FROM honneur_laureats l JOIN users u ON u.id=l.user_id LEFT JOIN initiatives i ON i.id=l.initiative_id WHERE l.cycle_cle=? ORDER BY l.categorie, l.nom_snapshot`).all(actif.cle);
    return { cycle: { cle: actif.cle, debut: actif.debut, fin_mesure: actif.fin_mesure, fin: actif.fin, affiche_jusqu_au: ajouterMois(actif.fin_mesure, 3).slice(0, 7) + '-01' }, laureats: rows };
  }

  return { BAREME_DEFAUT, COUP_DE_POUCE_MAX, COUP_DE_POUCE_PALIERS, cycleContenant, cycleDepuisDebut, cyclesAClore, nbLaureats, scorer, ajouterMois,
    parametre, debutProgramme, premiumRequisDes, bareme, premiumOrigine, modeEligibilite, eligiblePremium, mesurer, activiteBrute, boostCycle, categorieDe, nbComptesCategorie,
    classerCycle, appliquerMoisOffert, cloturerCycle, cronQuotidien, laureatsAffiches };
};
module.exports.ajouterMois = ajouterMois;
module.exports.cycleContenant = cycleContenant;
module.exports.cycleDepuisDebut = cycleDepuisDebut;
module.exports.cyclesAClore = cyclesAClore;
module.exports.nbLaureats = nbLaureats;
module.exports.scorer = scorer;
module.exports.BAREME_DEFAUT = BAREME_DEFAUT;
