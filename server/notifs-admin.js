/* ============================================================
   Diaspo'Actif — Notifications d'administration (2026-10-13, demande explicite)
   L'administrateur choisit qui est concerné (type de compte, domaine d'activité, pays de résidence ou un compte précis),
   rédige la notification — souvent liée à une publication, une vidéo ou une annonce — et l'envoie. Chaque compte ciblé la
   reçoit dans sa cloche ; ceux qui ont activé les notifications sur leur appareil la reçoivent aussi sur l'écran.

   Garde-fous : comptes masqués / supprimés / démo / suspendus exclus ; plafond d'UNE notification d'administration par
   compte et par 24 h (sauf envoi à un compte précis) ; envoi par lots sans jamais doubler (clé primaire notif+compte) ;
   historique conservé (qui, quoi, à combien) ; avertissement si le même contenu a déjà été notifié.
   ============================================================ */
const { envoyerPush } = require("./push");

const ROLES = ["utilisateur", "initiative", "collectivite"];
const PLAFOND_HEURES = 24;
const LOT = 200;
const sqlDate = d => d.toISOString().slice(0, 19).replace("T", " ");

/* Mêmes exclusions que les envois d'annonces officielles (annonceNotifierTous) et que l'audience publicitaire. */
const BASE_COMPTES = "u.role != 'administrateur' AND (u.compte_masque IS NULL OR u.compte_masque=0) AND (u.is_demo IS NULL OR u.is_demo=FALSE) AND COALESCE(u.suspendu_definitif,0)=0 AND u.nom != 'Compte supprimé'";
const DOMAINE_COMPTE = "COALESCE(NULLIF((SELECT i.domaine_principal FROM initiatives i WHERE i.owner_user_id=u.id AND i.domaine_principal IS NOT NULL AND i.domaine_principal<>'' ORDER BY i.id DESC LIMIT 1),''), u.domaine_principal)";

module.exports = function creerNotifsAdmin(deps) {
  const { db, logError } = deps;
  const txt = (v, max) => { const s = String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max); return s || null; };

  /* Un lien interne seulement : chemin relatif (« fil-actualite.html?post=12 »), jamais une adresse externe ni un script. */
  function lienSur(v, max) {
    const s = String(v == null ? "" : v).trim().slice(0, max || 200);
    if (!s) return null;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(s)) return null;
    if (/[\s<>"'`]/.test(s)) return null;
    return s;
  }

  function nettoyerCible(c) {
    c = c || {};
    const roles = (Array.isArray(c.roles) ? c.roles : []).map(String).filter(r => ROLES.includes(r));
    const domaines = (Array.isArray(c.domaines) ? c.domaines : []).map(String).filter(d => /^[a-z0-9_]{2,60}$/.test(d)).slice(0, 40);
    const pays = txt(c.pays, 80);
    const userId = Number(c.user_id) > 0 ? Number(c.user_id) : null;
    return { roles: [...new Set(roles)], domaines: [...new Set(domaines)], pays, user_id: userId };
  }

  /* Clause WHERE du ciblage. `options.apresPlafond` ajoute l'exclusion des comptes déjà notifiés dans les 24 h ;
     `options.notifId` exclut ceux qui ont déjà reçu CETTE notification (reprise d'un envoi sans doublon). */
  function ou(cible, options) {
    const o = options || {}, p = [], w = [BASE_COMPTES];
    if (cible.user_id) { w.push("u.id=?"); p.push(cible.user_id); }
    else {
      if (cible.roles.length) { w.push(`u.role IN (${cible.roles.map(() => "?").join(",")})`); p.push(...cible.roles); }
      if (cible.domaines.length) { w.push(`${DOMAINE_COMPTE} IN (${cible.domaines.map(() => "?").join(",")})`); p.push(...cible.domaines); }
      if (cible.pays) { w.push("LOWER(TRIM(u.pays))=LOWER(TRIM(?))"); p.push(cible.pays); }
    }
    if (o.notifId) { w.push("NOT EXISTS (SELECT 1 FROM notifications_admin_envois e0 WHERE e0.notif_admin_id=? AND e0.user_id=u.id)"); p.push(o.notifId); }
    if (o.apresPlafond && !cible.user_id) {
      w.push("NOT EXISTS (SELECT 1 FROM notifications_admin_envois e1 WHERE e1.user_id=u.id AND e1.envoye_le > ? AND e1.notif_admin_id <> ?)");
      p.push(sqlDate(new Date(Date.now() - PLAFOND_HEURES * 3600 * 1000)), o.notifId || 0);
    }
    return { where: w.join(" AND "), params: p };
  }
  const compter = async clause => Number((await db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE ${clause.where}`).get(...clause.params)).n || 0);

  async function apercu(cibleBrute) {
    const cible = nettoyerCible(cibleBrute);
    const tous = await compter(ou(cible, {}));
    const envoyables = await compter(ou(cible, { apresPlafond: true }));
    const c = ou(cible, { apresPlafond: true });
    const surTelephone = Number((await db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE ${c.where} AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id=u.id)`).get(...c.params)).n || 0);
    return { cible, cibles: tous, envoyables, ignores_plafond: Math.max(0, tous - envoyables), sur_telephone: surTelephone };
  }

  async function dejaNotifie(sourceType, sourceId) {
    if (!sourceType || !sourceId) return null;
    return (await db.prepare("SELECT id, created_at, nb_envoyes FROM notifications_admin WHERE source_type=? AND source_id=? ORDER BY id DESC LIMIT 1").get(sourceType, Number(sourceId))) || null;
  }

  async function creer(adminId, b) {
    const titre = txt(b.titre, 80), contenu = txt(b.contenu, 240);
    if (!titre) return { erreur: "Le titre de la notification est obligatoire." };
    if (!contenu) return { erreur: "Le message de la notification est obligatoire." };
    const cible = nettoyerCible(b.cible);
    if (!cible.user_id && !cible.roles.length) return { erreur: "Choisissez au moins un type de compte (ou un compte précis)." };
    const sourceType = txt(b.source_type, 40), sourceId = Number(b.source_id) > 0 ? Number(b.source_id) : null;
    const a = await apercu(cible);
    if (!a.envoyables) return { erreur: a.cibles ? "Tous les comptes ciblés ont déjà reçu une notification d'administration ces dernières 24 h. Réessayez demain ou changez le ciblage." : "Aucun compte ne correspond à ce ciblage." };
    if (!b.confirmer_doublon) {
      const d = await dejaNotifie(sourceType, sourceId);
      if (d) return { doublon: d };
    }
    const r = await db.prepare("INSERT INTO notifications_admin (admin_id, titre, contenu, lien, lien_m, source_type, source_id, cible_json, statut) VALUES (?,?,?,?,?,?,?,?, 'en_cours')")
      .run(adminId, titre, contenu, lienSur(b.lien), lienSur(b.lien_m), sourceType, sourceId, JSON.stringify(cible));
    const n = await db.prepare("SELECT * FROM notifications_admin WHERE id=?").get(Number(r.lastInsertRowid));
    return { notif: n };
  }

  /* Envoie par lots jusqu'au budget de temps ; renvoie ce qui reste (l'administration relance tant que `restants` > 0). */
  async function envoyerLots(notifId, budgetMs) {
    const debut = Date.now(), n = await db.prepare("SELECT * FROM notifications_admin WHERE id=?").get(notifId);
    if (!n) return { erreur: "Notification introuvable." };
    let cible; try { cible = nettoyerCible(JSON.parse(n.cible_json || "{}")); } catch (e) { cible = nettoyerCible({}); }
    const data = JSON.stringify({ notif_admin_id: Number(n.id), lien: n.lien || undefined, lien_m: n.lien_m || undefined });
    let envoyes = 0, push = 0;
    while (Date.now() - debut < (budgetMs || 20000)) {
      const c = ou(cible, { apresPlafond: true, notifId: Number(n.id) });
      const ids = (await db.prepare(`SELECT u.id FROM users u WHERE ${c.where} ORDER BY u.id LIMIT ${LOT}`).all(...c.params)).map(r => Number(r.id));
      if (!ids.length) break;
      const maintenant = sqlDate(new Date());
      try {
        await db.prepare(`INSERT INTO notifications_admin_envois (notif_admin_id, user_id, envoye_le) VALUES ${ids.map(() => "(?,?,?)").join(",")}`).run(...ids.flatMap(uid => [n.id, uid, maintenant]));
      } catch (e) { logError && logError(e, "notifs-admin envois (lot déjà traité ?)"); break; }
      await db.prepare(`INSERT INTO notifications (user_id,type,titre,contenu,data_json) VALUES ${ids.map(() => "(?,?,?,?,?)").join(",")}`).run(...ids.flatMap(uid => [uid, "info_admin", n.titre, n.contenu, data]));
      envoyes += ids.length;
      /* Notification sur l'écran : seulement pour les comptes qui ont un appareil abonné. */
      try {
        const abonnes = (await db.prepare(`SELECT DISTINCT user_id FROM push_subscriptions WHERE user_id IN (${ids.map(() => "?").join(",")})`).all(...ids)).map(r => Number(r.user_id));
        for (let i = 0; i < abonnes.length; i += 10) {
          await Promise.all(abonnes.slice(i, i + 10).map(uid => envoyerPush(uid, { titre: n.titre, contenu: n.contenu, data: { lien: n.lien || undefined, lien_m: n.lien_m || undefined, notif_admin_id: Number(n.id) } })));
        }
        push += abonnes.length;
      } catch (e) { logError && logError(e, "notifs-admin push"); }
    }
    const cr = ou(cible, { apresPlafond: true, notifId: Number(n.id) });
    const restants = await compter(cr);
    const total = await compter(ou(cible, {}));
    const envoyesTotal = Number((await db.prepare("SELECT COUNT(*) AS n FROM notifications_admin_envois WHERE notif_admin_id=?").get(n.id)).n || 0);
    await db.prepare("UPDATE notifications_admin SET nb_cibles=?, nb_envoyes=?, nb_push=COALESCE(nb_push,0)+?, nb_ignores_plafond=?, statut=? WHERE id=?")
      .run(total, envoyesTotal, push, Math.max(0, total - envoyesTotal - restants), restants ? "en_cours" : "termine", n.id);
    return { id: Number(n.id), envoyes, restants, total_envoyes: envoyesTotal, push };
  }

  async function historique() {
    return db.prepare("SELECT h.id, h.titre, h.contenu, h.lien, h.source_type, h.source_id, h.cible_json, h.nb_cibles, h.nb_envoyes, h.nb_push, h.nb_ignores_plafond, h.statut, h.created_at, u.prenom, u.nom FROM notifications_admin h LEFT JOIN users u ON u.id=h.admin_id ORDER BY h.id DESC LIMIT 50").all();
  }

  /* Part des comptes réels qui ont activé les notifications sur au moins un appareil, par type de compte. */
  async function statsActivation() {
    const par = {};
    for (const role of ROLES) {
      const t = await db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE ${BASE_COMPTES} AND u.role=?`).get(role);
      const a = await db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE ${BASE_COMPTES} AND u.role=? AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id=u.id)`).get(role);
      par[role] = { comptes: Number(t.n || 0), actives: Number(a.n || 0) };
    }
    const comptes = ROLES.reduce((s, r) => s + par[r].comptes, 0), actives = ROLES.reduce((s, r) => s + par[r].actives, 0);
    return { comptes, actives, pourcentage: comptes ? Math.round(actives * 1000 / comptes) / 10 : 0, par_type: par };
  }

  async function chercherComptes(q) {
    const s = String(q || "").trim().slice(0, 60); if (s.length < 2) return [];
    const like = `%${s.toLowerCase()}%`;
    return db.prepare(`SELECT u.id, u.prenom, u.nom, u.email, u.role FROM users u WHERE ${BASE_COMPTES} AND (LOWER(u.nom) LIKE ? OR LOWER(u.prenom) LIKE ? OR LOWER(u.email) LIKE ?) ORDER BY u.nom LIMIT 8`).all(like, like, like);
  }

  return { ROLES, PLAFOND_HEURES, apercu, creer, envoyerLots, historique, statsActivation, chercherComptes, nettoyerCible, lienSur };
};
