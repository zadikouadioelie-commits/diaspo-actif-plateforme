"use strict";
/* ===========================================================
   server/sondage-portefeuilles.js — PORTEFEUILLES DE SONDAGES (2026-11-10, demande explicite)
   ===========================================================
   Un portefeuille = un ensemble de sondages d'un même créateur, avec un titre, une description et une image de couverture.
   Il s'affiche aux mêmes endroits qu'un sondage (onglet Sondages, fil d'actualité, profil public, boutique) et peut être lié à des
   événements du créateur (bloc « Sondage en cours » de la page de l'événement).
   Règles :
   - créer / gérer : mêmes comptes que pour créer un sondage ; un portefeuille ne contient que les sondages de son créateur (hors archivés) ;
   - un portefeuille est BROUILLON (visible de son créateur seul) ou PUBLIÉ ; publier exige au moins un lieu d'affichage et un sondage ;
   - un visiteur ne voit dans un portefeuille que les sondages en cours ou terminés : un brouillon de sondage n'est jamais exposé par le portefeuille ;
   - publier un portefeuille ne publie PAS ses sondages (chacun garde son statut) ; en revanche un portefeuille publié compte comme un lieu
     d'affichage pour les sondages qu'il contient (voir sondageNbLieux dans index.js) : on ne peut donc pas le dépublier, le supprimer ou en retirer
     un sondage en cours si ce sondage n'aurait alors plus aucun lieu.
   Routes : GET/POST /api/sondage-portefeuilles, GET /api/sondage-portefeuilles/mes, GET|PUT|DELETE /api/sondage-portefeuilles/:id,
   PUT /:id/sondages (liste ordonnée), POST /:id/sondages (ajout d'un sondage), DELETE /:id/sondages/:sid, PUT /:id/diffusion, POST /:id/publier|depublier.
   =========================================================== */
let C = null; /* { db, route, sendJSON, getCurrentUser, sondagePeutCreer, sondageAutoCloture, nomCompteAffichage, sondageDiffusionLue } */

const MAX_SONDAGES = 40;
const MAX_EVENEMENTS = 50;
const urlCouvertureOk = u => /^(https:\/\/|\/(?!\/))/.test(String(u || "")) && String(u).length <= 500;
const texte = (v, max) => String(v === null || v === undefined ? "" : v).trim().slice(0, max);
const entiersUniques = (a, max) => [...new Set((Array.isArray(a) ? a : []).map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, max);
const couvertureDe = p => { try { const a = JSON.parse(p.photos_json || "[]"); const u = Array.isArray(a) ? a[0] : ""; return urlCouvertureOk(u) ? u : ""; } catch (_) { return ""; } };
const lieuxDe = p => { try { const d = JSON.parse(p.diffusion_json || "{}"); return { onglet: !!d.onglet, fil: !!d.fil, profil: !!d.profil, boutique: !!d.boutique }; } catch (_) { return { onglet: false, fil: false, profil: false, boutique: false }; } };
const aDroit = (me, p) => !!me && !!p && (Number(p.createur_id) === Number(me.id) || me.role === "administrateur");

async function nbEvenements(pid) { return Number(((await C.db.prepare("SELECT COUNT(*) n FROM sondage_portefeuille_evenements WHERE portefeuille_id=?").get(pid)) || {}).n) || 0; }
async function nbLieux(p, diffusion, nbEvt) {
  const d = diffusion || lieuxDe(p), ev = nbEvt !== undefined ? nbEvt : await nbEvenements(p.id);
  return (d.onglet ? 1 : 0) + (d.fil ? 1 : 0) + (d.profil ? 1 : 0) + (d.boutique ? 1 : 0) + (ev > 0 ? 1 : 0);
}
/* Nombre de portefeuilles PUBLIÉS contenant ce sondage (sans compter `sauf`) : utilisé par la règle « un sondage en cours a au moins un lieu ». */
async function nbPortefeuillesPublies(sondageId, sauf) {
  return Number(((await C.db.prepare(`SELECT COUNT(*) n FROM sondage_portefeuille_items i JOIN sondage_portefeuilles p ON p.id=i.portefeuille_id
    WHERE i.sondage_id=? AND p.statut='publie' AND p.id<>?`).get(sondageId, Number(sauf) || 0)) || {}).n) || 0;
}
/* Sondages EN COURS de ce portefeuille qui n'auraient plus aucun lieu d'affichage si le portefeuille cessait d'en être un (ou s'ils en sortaient). */
async function sondagesOrphelins(pid, seulement) {
  const lignes = await C.db.prepare(`SELECT s.* FROM sondage_portefeuille_items i JOIN sondages s ON s.id=i.sondage_id WHERE i.portefeuille_id=? AND s.statut='ouvert'`).all(pid);
  const out = [];
  for (const s of lignes) {
    if (seulement && !seulement.includes(Number(s.id))) continue;
    const d = C.sondageDiffusionLue(s);
    const ev = Number(((await C.db.prepare("SELECT COUNT(*) n FROM sondage_evenements WHERE sondage_id=?").get(s.id)) || {}).n) || 0;
    const propres = (d.fil ? 1 : 0) + (d.profil ? 1 : 0) + (d.onglet ? 1 : 0) + (d.boutique ? 1 : 0) + (ev > 0 ? 1 : 0);
    if (propres + ((await nbPortefeuillesPublies(s.id, pid)) > 0 ? 1 : 0) === 0) out.push(s);
  }
  return out;
}
const msgOrphelins = o => `Le sondage « ${o[0].titre} »${o.length > 1 ? " (et " + (o.length - 1) + " autre" + (o.length > 2 ? "s" : "") + ")" : ""} n'aurait plus aucun lieu d'affichage. Choisissez d'abord un lieu pour ce sondage, ou clôturez-le.`;

async function chargerSondages(pid, proprietaire) {
  const statuts = proprietaire ? "('brouillon','ouvert','cloture')" : "('ouvert','cloture')";
  const l = await C.db.prepare(`SELECT s.id, s.titre, s.description, s.statut, s.date_cloture, s.nb_reponses, s.photos_json, i.ordre
    FROM sondage_portefeuille_items i JOIN sondages s ON s.id=i.sondage_id WHERE i.portefeuille_id=? AND s.statut IN ${statuts} ORDER BY i.ordre, i.id`).all(pid);
  return l.map(s => ({ id: Number(s.id), titre: s.titre, description: texte(s.description, 200), statut: s.statut, date_cloture: s.date_cloture || null, nb_reponses: Number(s.nb_reponses) || 0, couverture: couvertureDe(s), lien: `sondage.html?id=${s.id}` }));
}
async function fiche(p, proprietaire) {
  const sondages = await chargerSondages(p.id, proprietaire);
  const out = { id: Number(p.id), titre: p.titre, description: p.description || "", couverture: couvertureDe(p), statut: p.statut, nb_sondages: sondages.length, nb_en_cours: sondages.filter(s => s.statut === "ouvert").length, lien: `portefeuille-sondages.html?id=${p.id}`, sondages };
  if (proprietaire) {
    const evts = (await C.db.prepare("SELECT evenement_id FROM sondage_portefeuille_evenements WHERE portefeuille_id=?").all(p.id)).map(r => Number(r.evenement_id));
    out.diffusion = lieuxDe(p); out.evenement_ids = evts; out.createur_id = Number(p.createur_id);
  } else {
    const u = await C.db.prepare("SELECT nom FROM users WHERE id=?").get(p.createur_id);
    out.organisateur = u && u.nom ? u.nom : "";
  }
  return out;
}

/* Portefeuilles PUBLIÉS à afficher à un emplacement : { onglet:1 } | { profil:UID } | { boutique:UID } | { evenement:ID }. Utilisé aussi par /api/sondages-en-cours. */
async function pourEmplacement(q) {
  await C.sondageAutoCloture();
  const col = `p.id, p.titre, p.description, p.photos_json, p.createur_id`;
  let l = [];
  if (q.evenement) l = await C.db.prepare(`SELECT ${col} FROM sondage_portefeuille_evenements pe JOIN sondage_portefeuilles p ON p.id=pe.portefeuille_id WHERE pe.evenement_id=? AND p.statut='publie' ORDER BY p.created_at DESC LIMIT 6`).all(parseInt(q.evenement, 10) || 0);
  else if (q.profil) l = await C.db.prepare(`SELECT ${col} FROM sondage_portefeuilles p WHERE p.createur_id=? AND p.statut='publie' AND p.diffusion_json LIKE '%"profil":true%' ORDER BY p.created_at DESC LIMIT 6`).all(parseInt(q.profil, 10) || 0);
  else if (q.boutique) l = await C.db.prepare(`SELECT ${col} FROM sondage_portefeuilles p WHERE p.createur_id=? AND p.statut='publie' AND p.diffusion_json LIKE '%"boutique":true%' ORDER BY p.created_at DESC LIMIT 6`).all(parseInt(q.boutique, 10) || 0);
  else if (q.onglet) l = await C.db.prepare(`SELECT ${col} FROM sondage_portefeuilles p WHERE p.statut='publie' AND p.diffusion_json LIKE '%"onglet":true%' ORDER BY p.created_at DESC LIMIT 60`).all();
  const out = [];
  for (const p of l) {
    const s = await chargerSondages(p.id, false);
    const visibles = q.onglet ? s : s.filter(x => x.statut === "ouvert");
    if (!visibles.length) continue; /* un portefeuille sans sondage à montrer n'apparaît pas */
    out.push({ id: Number(p.id), titre: p.titre, description: texte(p.description, 200), couverture: couvertureDe(p), nb_sondages: s.length, nb_en_cours: s.filter(x => x.statut === "ouvert").length, lien: `portefeuille-sondages.html?id=${p.id}` });
  }
  return out;
}

async function sondagesValides(createurId, ids) {
  const ok = [];
  for (const id of ids) {
    const s = await C.db.prepare("SELECT id, createur_id, statut FROM sondages WHERE id=?").get(id);
    if (!s || Number(s.createur_id) !== Number(createurId) || s.statut === "archive") return { erreur: "Un portefeuille ne peut contenir que vos propres sondages (hors archivés)." };
    ok.push(id);
  }
  return { ids: ok };
}
async function remplacerItems(pid, ids) {
  await C.db.prepare("DELETE FROM sondage_portefeuille_items WHERE portefeuille_id=?").run(pid);
  let o = 0; for (const id of ids) await C.db.prepare("INSERT INTO sondage_portefeuille_items(portefeuille_id,sondage_id,ordre) VALUES(?,?,?)").run(pid, id, o++);
}

function register(ctx) {
  C = ctx; const { route, sendJSON, getCurrentUser, db } = C;
  const moi = async (req, res) => { const me = await getCurrentUser(req); if (!me) { sendJSON(res, 401, { error: "Connexion requise." }); return null; } return me; };
  const mien = async (req, res, params) => {
    const me = await moi(req, res); if (!me) return null;
    const p = await db.prepare("SELECT * FROM sondage_portefeuilles WHERE id=?").get(parseInt(params.id, 10) || 0);
    if (!p || !aDroit(me, p)) { sendJSON(res, 403, { error: "Accès refusé." }); return null; }
    return { me, p };
  };

  /* Liste publique (onglet Sondages) ou par emplacement. */
  route("GET", "/api/sondage-portefeuilles", async (req, res, params, body, query) => sendJSON(res, 200, { portefeuilles: await pourEmplacement(query || {}) }));

  /* Mes portefeuilles (créateur) : fiche complète + liste de mes sondages pour l'ajout. */
  route("GET", "/api/sondage-portefeuilles/mes", async (req, res) => {
    const me = await moi(req, res); if (!me) return;
    const l = await db.prepare("SELECT * FROM sondage_portefeuilles WHERE createur_id=? ORDER BY updated_at DESC, id DESC").all(me.id);
    const portefeuilles = []; for (const p of l) portefeuilles.push(await fiche(p, true));
    /* Pour le choix des événements à lier et l'ajout de sondages : mes événements et mes sondages (hors archivés). */
    const mes_evenements = await db.prepare("SELECT id, titre, date_evt FROM evenements WHERE owner_user_id=? ORDER BY date_evt DESC LIMIT 100").all(me.id);
    const mes_sondages = (await db.prepare("SELECT id, titre, statut FROM sondages WHERE createur_id=? AND statut<>'archive' ORDER BY created_at DESC LIMIT 300").all(me.id)).map(x => ({ id: Number(x.id), titre: x.titre, statut: x.statut }));
    sendJSON(res, 200, { portefeuilles, mes_evenements, mes_sondages });
  });

  route("POST", "/api/sondage-portefeuilles", async (req, res, params, body) => {
    const me = await moi(req, res); if (!me) return;
    if (!(await C.sondagePeutCreer(me))) return sendJSON(res, 403, { error: "Créer un portefeuille de sondages est réservé aux comptes qui peuvent créer des sondages." });
    body = body && typeof body === "object" ? body : {};
    const titre = texte(body.titre, 150); if (!titre) return sendJSON(res, 400, { error: "Titre du portefeuille requis." });
    const ids = entiersUniques(body.sondage_ids, MAX_SONDAGES);
    const v = await sondagesValides(me.id, ids); if (v.erreur) return sendJSON(res, 400, { error: v.erreur });
    const couv = body.couverture && urlCouvertureOk(body.couverture) ? [String(body.couverture)] : [];
    const r = await db.prepare("INSERT INTO sondage_portefeuilles(createur_id,titre,description,photos_json,statut,diffusion_json) VALUES(?,?,?,?, 'brouillon','{}')").run(me.id, titre, texte(body.description, 1000) || null, JSON.stringify(couv));
    const pid = Number(r.lastInsertRowid); await remplacerItems(pid, v.ids);
    sendJSON(res, 201, { id: pid, statut: "brouillon" });
  });

  /* Détail : public si publié ; sinon créateur / administrateur seulement. */
  route("GET", "/api/sondage-portefeuilles/:id", async (req, res, params) => {
    await C.sondageAutoCloture();
    const me = await getCurrentUser(req);
    const p = await db.prepare("SELECT * FROM sondage_portefeuilles WHERE id=?").get(parseInt(params.id, 10) || 0);
    if (!p) return sendJSON(res, 404, { error: "Portefeuille introuvable." });
    const droit = aDroit(me, p);
    if (p.statut !== "publie" && !droit) return sendJSON(res, 404, { error: "Portefeuille introuvable." });
    sendJSON(res, 200, { portefeuille: await fiche(p, droit), proprietaire: droit });
  });

  route("PUT", "/api/sondage-portefeuilles/:id", async (req, res, params, body) => {
    const x = await mien(req, res, params); if (!x) return; body = body && typeof body === "object" ? body : {};
    const set = [], args = [];
    if (body.titre !== undefined) { const t = texte(body.titre, 150); if (!t) return sendJSON(res, 400, { error: "Titre du portefeuille requis." }); set.push("titre=?"); args.push(t); }
    if (body.description !== undefined) { set.push("description=?"); args.push(texte(body.description, 1000) || null); }
    if (body.couverture !== undefined) { if (body.couverture && !urlCouvertureOk(body.couverture)) return sendJSON(res, 400, { error: "Image de couverture invalide." }); set.push("photos_json=?"); args.push(JSON.stringify(body.couverture ? [String(body.couverture)] : [])); }
    if (set.length) { set.push("updated_at=datetime('now')"); await db.prepare(`UPDATE sondage_portefeuilles SET ${set.join(",")} WHERE id=?`).run(...args, x.p.id); }
    sendJSON(res, 200, { message: "Portefeuille enregistré." });
  });

  route("DELETE", "/api/sondage-portefeuilles/:id", async (req, res, params) => {
    const x = await mien(req, res, params); if (!x) return;
    if (x.p.statut === "publie") { const o = await sondagesOrphelins(x.p.id); if (o.length) return sendJSON(res, 400, { error: msgOrphelins(o), code: "sondage_sans_lieu" }); }
    await db.prepare("DELETE FROM sondage_portefeuille_items WHERE portefeuille_id=?").run(x.p.id);
    await db.prepare("DELETE FROM sondage_portefeuille_evenements WHERE portefeuille_id=?").run(x.p.id);
    await db.prepare("DELETE FROM sondage_portefeuilles WHERE id=?").run(x.p.id);
    sendJSON(res, 200, { message: "Portefeuille supprimé. Ses sondages sont conservés." });
  });

  /* Remplace la liste (ordre compris). */
  route("PUT", "/api/sondage-portefeuilles/:id/sondages", async (req, res, params, body) => {
    const x = await mien(req, res, params); if (!x) return;
    const ids = entiersUniques(body && body.sondage_ids, MAX_SONDAGES);
    const v = await sondagesValides(x.p.createur_id, ids); if (v.erreur) return sendJSON(res, 400, { error: v.erreur });
    if (x.p.statut === "publie") {
      if (!ids.length) return sendJSON(res, 400, { error: "Un portefeuille publié doit garder au moins un sondage : dépubliez-le d'abord." });
      const retires = (await db.prepare("SELECT sondage_id FROM sondage_portefeuille_items WHERE portefeuille_id=?").all(x.p.id)).map(r => Number(r.sondage_id)).filter(i => !ids.includes(i));
      const o = await sondagesOrphelins(x.p.id, retires); if (o.length) return sendJSON(res, 400, { error: msgOrphelins(o), code: "sondage_sans_lieu" });
    }
    await remplacerItems(x.p.id, v.ids); await db.prepare("UPDATE sondage_portefeuilles SET updated_at=datetime('now') WHERE id=?").run(x.p.id);
    sendJSON(res, 200, { message: "Sondages du portefeuille enregistrés.", nb_sondages: v.ids.length });
  });
  /* Ajoute UN sondage (bouton « Ajouter à un portefeuille »). */
  route("POST", "/api/sondage-portefeuilles/:id/sondages", async (req, res, params, body) => {
    const x = await mien(req, res, params); if (!x) return;
    const sid = parseInt(body && body.sondage_id, 10) || 0;
    const v = await sondagesValides(x.p.createur_id, [sid]); if (v.erreur) return sendJSON(res, 400, { error: v.erreur });
    const deja = await db.prepare("SELECT id FROM sondage_portefeuille_items WHERE portefeuille_id=? AND sondage_id=?").get(x.p.id, sid);
    if (deja) return sendJSON(res, 200, { message: "Ce sondage est déjà dans ce portefeuille." });
    const n = Number(((await db.prepare("SELECT COUNT(*) n FROM sondage_portefeuille_items WHERE portefeuille_id=?").get(x.p.id)) || {}).n) || 0;
    if (n >= MAX_SONDAGES) return sendJSON(res, 400, { error: `Un portefeuille contient ${MAX_SONDAGES} sondages au plus.` });
    await db.prepare("INSERT INTO sondage_portefeuille_items(portefeuille_id,sondage_id,ordre) VALUES(?,?,?)").run(x.p.id, sid, n);
    await db.prepare("UPDATE sondage_portefeuilles SET updated_at=datetime('now') WHERE id=?").run(x.p.id);
    sendJSON(res, 200, { message: "Sondage ajouté au portefeuille." });
  });
  route("DELETE", "/api/sondage-portefeuilles/:id/sondages/:sid", async (req, res, params) => {
    const x = await mien(req, res, params); if (!x) return; const sid = parseInt(params.sid, 10) || 0;
    if (x.p.statut === "publie") {
      const reste = Number(((await db.prepare("SELECT COUNT(*) n FROM sondage_portefeuille_items WHERE portefeuille_id=? AND sondage_id<>?").get(x.p.id, sid)) || {}).n) || 0;
      if (!reste) return sendJSON(res, 400, { error: "Un portefeuille publié doit garder au moins un sondage : dépubliez-le d'abord." });
      const o = await sondagesOrphelins(x.p.id, [sid]); if (o.length) return sendJSON(res, 400, { error: msgOrphelins(o), code: "sondage_sans_lieu" });
    }
    await db.prepare("DELETE FROM sondage_portefeuille_items WHERE portefeuille_id=? AND sondage_id=?").run(x.p.id, sid);
    sendJSON(res, 200, { message: "Sondage retiré du portefeuille." });
  });

  /* Lieux d'affichage et événements liés. */
  route("PUT", "/api/sondage-portefeuilles/:id/diffusion", async (req, res, params, body) => {
    const x = await mien(req, res, params); if (!x) return; body = body && typeof body === "object" ? body : {};
    const avant = lieuxDe(x.p);
    const apres = { onglet: body.onglet === undefined ? avant.onglet : !!body.onglet, fil: body.fil === undefined ? avant.fil : !!body.fil, profil: body.profil === undefined ? avant.profil : !!body.profil, boutique: body.boutique === undefined ? avant.boutique : !!body.boutique };
    let idsEvt = null;
    if (Array.isArray(body.evenement_ids)) {
      idsEvt = entiersUniques(body.evenement_ids, MAX_EVENEMENTS);
      const permis = new Set((await db.prepare("SELECT id FROM evenements WHERE owner_user_id=?").all(x.p.createur_id)).map(r => Number(r.id)));
      if (idsEvt.some(i => !permis.has(i))) return sendJSON(res, 400, { error: "Vous ne pouvez lier un portefeuille qu'à vos propres événements." });
    }
    if (x.p.statut === "publie") {
      if ((await nbLieux(x.p, apres, idsEvt ? idsEvt.length : undefined)) === 0) return sendJSON(res, 400, { error: "Un portefeuille publié doit avoir au moins un lieu d'affichage." });
    }
    await db.prepare("UPDATE sondage_portefeuilles SET diffusion_json=?, updated_at=datetime('now') WHERE id=?").run(JSON.stringify(apres), x.p.id);
    if (idsEvt) {
      await db.prepare("DELETE FROM sondage_portefeuille_evenements WHERE portefeuille_id=?").run(x.p.id);
      for (const i of idsEvt) await db.prepare("INSERT INTO sondage_portefeuille_evenements(portefeuille_id,evenement_id) VALUES(?,?)").run(x.p.id, i);
    }
    let filPost = x.p.fil_post_id || null;
    if (apres.fil && !avant.fil && x.p.statut === "publie") filPost = await annoncerSurFil(x.p);
    sendJSON(res, 200, { message: "Lieux d'affichage enregistrés.", diffusion: apres, fil_post_id: filPost });
  });

  route("POST", "/api/sondage-portefeuilles/:id/publier", async (req, res, params) => {
    const x = await mien(req, res, params); if (!x) return;
    const nb = Number(((await db.prepare("SELECT COUNT(*) n FROM sondage_portefeuille_items WHERE portefeuille_id=?").get(x.p.id)) || {}).n) || 0;
    if (!nb) return sendJSON(res, 400, { error: "Ajoutez au moins un sondage avant de publier le portefeuille." });
    if ((await nbLieux(x.p)) === 0) return sendJSON(res, 400, { error: "Choisissez au moins un lieu d'affichage (ou un événement) avant de publier.", code: "aucun_lieu" });
    await db.prepare("UPDATE sondage_portefeuilles SET statut='publie', updated_at=datetime('now') WHERE id=?").run(x.p.id);
    let filPost = x.p.fil_post_id || null;
    if (lieuxDe(x.p).fil && !filPost) filPost = await annoncerSurFil(x.p);
    const brouillons = Number(((await db.prepare(`SELECT COUNT(*) n FROM sondage_portefeuille_items i JOIN sondages s ON s.id=i.sondage_id WHERE i.portefeuille_id=? AND s.statut='brouillon'`).get(x.p.id)) || {}).n) || 0;
    sendJSON(res, 200, { message: brouillons ? `Portefeuille publié. ${brouillons} sondage${brouillons > 1 ? "s" : ""} encore en brouillon ne ser${brouillons > 1 ? "ont" : "a"} visible${brouillons > 1 ? "s" : ""} qu'une fois publié${brouillons > 1 ? "s" : ""}.` : "Portefeuille publié.", statut: "publie", fil_post_id: filPost, brouillons });
  });
  route("POST", "/api/sondage-portefeuilles/:id/depublier", async (req, res, params) => {
    const x = await mien(req, res, params); if (!x) return;
    const o = await sondagesOrphelins(x.p.id); if (o.length) return sendJSON(res, 400, { error: msgOrphelins(o), code: "sondage_sans_lieu" });
    await db.prepare("UPDATE sondage_portefeuilles SET statut='brouillon', updated_at=datetime('now') WHERE id=?").run(x.p.id);
    sendJSON(res, 200, { message: "Portefeuille retiré de l'affichage.", statut: "brouillon" });
  });
}

/* Annonce dans le fil d'actualité, au nom du créateur (une seule fois : fil_post_id). */
async function annoncerSurFil(p) {
  try {
    const nom = (await C.nomCompteAffichage(p.createur_id)) || "Diaspo'Actif";
    const desc = texte(p.description, 220);
    const lien = `${process.env.PUBLIC_BASE_URL || "https://diaspoactif.com"}/portefeuille-sondages.html?id=${p.id}`;
    const contenu = `🗂️ Portefeuille de sondages : « ${p.titre} »\n\n${desc ? desc + "\n\n" : ""}👉 Découvrir et répondre (sans compte) : ${lien}`;
    const r = await C.db.prepare(`INSERT INTO fil_posts (auteur_id, auteur_nom, type, pub_type, categorie, contenu, visibilite, medias, hashtags, statut)
      VALUES (?, ?, 'texte', 'texte', 'Sondage', ?, 'public', '[]', '[]', 'publie')`).run(p.createur_id, nom, contenu);
    const id = Number(r.lastInsertRowid);
    await C.db.prepare("UPDATE sondage_portefeuilles SET fil_post_id=? WHERE id=?").run(id, p.id);
    return id;
  } catch (e) { console.error("[sondage-portefeuilles/fil]", e.message); return null; }
}

module.exports = { register, pourEmplacement, nbPortefeuillesPublies, sondagesOrphelins };
