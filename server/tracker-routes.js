/* ============================================================
   Diaspo'Actif — MARACANA TRACKER : routes /api/tracker/*
   Module sportif d'association (génériques : tables tracker_*). Branché depuis server/index.js par
   require('./tracker-routes')({ route, db, sendJSON, getCurrentUser, SEC }).

   Accès « bureau » = propriétaire de l'initiative OU membre ajouté dans tracker_bureau.
   Règle : aucune personne mineure (< 18 ans). Une attestation « majeur » est exigée à l'ajout d'un joueur,
   et un adhérent dont la date de naissance connue indique moins de 18 ans est refusé.
   Les observations sur le comportement ne sont JAMAIS renvoyées hors du bureau.
   ============================================================ */
'use strict';
const calcul = require('./tracker-calcul');

module.exports = function monterTracker({ route, db, sendJSON, getCurrentUser, SEC, computeAdhesionStatut, getInitiativeOfficielleId }) {
  const { MODELES, POSTES, classer } = calcul;
  const txt = (v, max) => SEC.sanitizeString(String(v == null ? '' : v), max).replace(/[<>]/g, '').trim();
  const entier = (v, max = 999) => { const x = Math.floor(Number(v)); return Number.isFinite(x) && x >= 0 ? Math.min(x, max) : 0; };
  const dateIso = (v) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v || '')); return m ? m[1] : null; };

  function ageAnnees(dateNaissance) {
    const d = dateIso(dateNaissance); if (!d) return null;
    const [y, m, j] = d.split('-').map(Number);
    const t = new Date();
    let a = t.getUTCFullYear() - y;
    if (t.getUTCMonth() + 1 < m || (t.getUTCMonth() + 1 === m && t.getUTCDate() < j)) a--;
    return a;
  }

  /* Phase de test (2026-10-30, demande explicite) : le module n'est ouvert qu'à l'initiative officielle Diaspo'Actif (son propriétaire
     et son bureau). Retirer cette restriction (TRACKER_RESERVE_OFFICIEL) pour l'ouvrir à toutes les associations. */
  const TRACKER_RESERVE_OFFICIEL = true;
  async function initiativeAutorisee(init) {
    if (!TRACKER_RESERVE_OFFICIEL) return true;
    if (!init) return false;
    let officielle = null;
    try { officielle = getInitiativeOfficielleId ? await getInitiativeOfficielleId() : null; } catch (e) { officielle = null; }
    return officielle != null && Number(init.id) === Number(officielle);
  }
  async function initiativeDe(user) {
    let init = null;
    if (user.role === 'initiative') init = await db.prepare('SELECT id, nom, owner_user_id FROM initiatives WHERE owner_user_id=?').get(user.id);
    if (!init) {
      const b = await db.prepare('SELECT initiative_id FROM tracker_bureau WHERE user_id=? ORDER BY id').get(user.id);
      if (b) init = await db.prepare('SELECT id, nom, owner_user_id FROM initiatives WHERE id=?').get(b.initiative_id);
    }
    return init;
  }
  /* Vrai si ce compte voit le module (menu du site et du téléphone) — lu par /api/auth/me. */
  async function disponible(user) {
    if (!user) return false;
    try { return await initiativeAutorisee(await initiativeDe(user)); } catch (e) { return false; }
  }

  /* Bureau : propriétaire d'une initiative, sinon membre du bureau d'une initiative. */
  async function acces(req, res) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: 'Connexion requise.' }); return null; }
    let init = null, estProprietaire = false;
    if (user.role === 'initiative') {
      init = await db.prepare('SELECT id, nom, owner_user_id FROM initiatives WHERE owner_user_id=?').get(user.id);
      if (init) estProprietaire = true;
    }
    if (!init) {
      const b = await db.prepare('SELECT initiative_id FROM tracker_bureau WHERE user_id=? ORDER BY id').get(user.id);
      if (b) init = await db.prepare('SELECT id, nom, owner_user_id FROM initiatives WHERE id=?').get(b.initiative_id);
    }
    if (!init) { sendJSON(res, 403, { error: 'Réservé au bureau de l’association (compte Initiative ou membre du bureau).' }); return null; }
    if (!(await initiativeAutorisee(init))) { sendJSON(res, 403, { error: 'Le Maracana Tracker est en phase de test : il n’est pas encore ouvert à votre association.' }); return null; }
    return { user, init, estProprietaire };
  }
  async function journal(ctx, action, cible, detail) {
    try { await db.prepare('INSERT INTO tracker_historique (initiative_id, user_id, action, cible, detail) VALUES (?,?,?,?,?)').run(ctx.init.id, ctx.user.id, action, cible || null, detail ? String(detail).slice(0, 500) : null); } catch (e) { /* journal best-effort */ }
  }
  const poste = (v) => { const p = String(v || '').toLowerCase(); return POSTES.includes(p) ? p : null; };

  /* Pastille d'adhésion de chaque joueur (module Cotisations & Adhésions de l'initiative) :
       vert  = adhérent À JOUR de sa cotisation ;
       jaune = répertorié (registre d'adhésions ou affilié) mais PAS À JOUR (expirée, en attente, suspendue, radiée, ou affilié sans cotisation) ;
       rouge = répertorié NULLE PART. Rapprochement par fiche d'adhésion, compte Diaspo'Actif lié, ou même e-mail. */
  const PASTILLES = { a_jour: ['vert', 'Cotisation à jour'], non_a_jour: ['jaune', 'Répertorié, cotisation pas à jour'], inconnu: ['rouge', 'Non répertorié dans les adhésions'] };
  async function pastilles(ctx) {
    const joueurs = await db.prepare('SELECT id, user_id, adhesion_membre_id, email FROM tracker_joueurs WHERE initiative_id=? AND actif=1').all(ctx.init.id);
    const adh = await db.prepare('SELECT id, linked_user_id, email, statut, date_expiration FROM adhesion_membres WHERE initiative_id=?').all(ctx.init.id);
    const aff = new Set((await db.prepare("SELECT user_id FROM initiative_membres WHERE initiative_id=? AND statut='accepte'").all(ctx.init.id)).map(r => Number(r.user_id)));
    const out = new Map();
    for (const j of joueurs) {
      const email = j.email ? String(j.email).toLowerCase() : null;
      const trouves = adh.filter(m => (j.adhesion_membre_id && Number(m.id) === Number(j.adhesion_membre_id)) || (j.user_id && m.linked_user_id && Number(m.linked_user_id) === Number(j.user_id)) || (email && m.email && String(m.email).toLowerCase() === email));
      let st = 'inconnu';
      if (trouves.length) st = trouves.some(m => computeAdhesionStatut(m) === 'a_jour') ? 'a_jour' : 'non_a_jour';
      else if (j.user_id && aff.has(Number(j.user_id))) st = 'non_a_jour';
      out.set(Number(j.id), { statut: st, pastille: PASTILLES[st][0], libelle: PASTILLES[st][1] });
    }
    return out;
  }
  const marquer = (obj, map, cle) => { const p = map.get(Number(obj[cle || 'joueur_id'])); obj.pastille = p ? p.pastille : 'rouge'; obj.pastille_libelle = p ? p.libelle : PASTILLES.inconnu[1]; return obj; };

  /* ---------- cartons : réglage conservé jusqu'à modification, recopié dans chaque journée ---------- */
  const lireJSON = (s) => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
  async function reglagesCartons(ctx) {
    const r = await db.prepare('SELECT cartons_json FROM tracker_reglages WHERE initiative_id=?').get(ctx.init.id);
    return calcul.normaliserCartons(lireJSON(r && r.cartons_json));
  }
  async function enregistrerReglagesCartons(ctx, cartons) {
    const json = JSON.stringify(cartons);
    const ex = await db.prepare('SELECT id FROM tracker_reglages WHERE initiative_id=?').get(ctx.init.id);
    if (ex) await db.prepare("UPDATE tracker_reglages SET cartons_json=?, updated_at=datetime('now') WHERE initiative_id=?").run(json, ctx.init.id);
    else await db.prepare('INSERT INTO tracker_reglages (initiative_id, cartons_json) VALUES (?,?)').run(ctx.init.id, json);
  }
  /* Réglage d'une nouvelle journée : celui envoyé par le formulaire (il devient le nouveau réglage par défaut) ou, sinon, le réglage enregistré. */
  async function cartonsDeLaJournee(ctx, brut) {
    if (brut && typeof brut === 'object') { const c = calcul.normaliserCartons(brut); await enregistrerReglagesCartons(ctx, c); return c; }
    return reglagesCartons(ctx);
  }
  route('GET', '/api/tracker/reglages', async (req, res) => {
    const ctx = await acces(req, res); if (!ctx) return;
    sendJSON(res, 200, { cartons: await reglagesCartons(ctx), defaut: calcul.CARTONS_DEFAUT, portees: [{ cle: 'tous', nom: 'Entraînements et rencontres' }, { cle: 'entrainement', nom: 'Entraînements seulement' }, { cle: 'match', nom: 'Rencontres seulement' }] });
  });
  route('PUT', '/api/tracker/reglages', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const c = calcul.normaliserCartons(body && body.cartons);
    await enregistrerReglagesCartons(ctx, c);
    await journal(ctx, 'reglage_cartons', Object.entries(c).map(([k, v]) => `${k} −${v.malus}`).join(' · '), null);
    sendJSON(res, 200, { ok: true, cartons: c });
  });

  /* Niveau de fair-play de chaque présence (note), calculé match après match sur tout l'historique du joueur (voir calcul.historiqueFairPlay). */
  async function niveauxFairPlay(ctx) {
    const rows = await db.prepare(`SELECT n.id AS note_id, n.joueur_id, n.carton_rouge, n.carton_jaune, n.carton_vert, n.carton_blanc, n.fp_points, n.fp_bonus,
        m.id AS match_id, m.date_match, m.categorie, COALESCE(m.cartons_json, s.cartons_json) AS cartons_json
        FROM tracker_notes n JOIN tracker_matchs m ON m.id=n.match_id LEFT JOIN tracker_seances s ON s.id=m.seance_id
        WHERE m.initiative_id=? ORDER BY m.date_match, m.id`).all(ctx.init.id);
    const parJoueur = new Map();
    rows.forEach(r => { const k = Number(r.joueur_id); if (!parJoueur.has(k)) parJoueur.set(k, []); parJoueur.get(k).push(r); });
    const out = new Map();
    for (const lst of parJoueur.values()) {
      const h = calcul.historiqueFairPlay(lst.map(r => ({ cle: r.note_id, date: r.date_match, categorie: r.categorie, points: Number(r.fp_points || 0) + Number(r.fp_bonus || 0), reglage: lireJSON(r.cartons_json),
        cartons: { rouge: r.carton_rouge, jaune: r.carton_jaune, vert: r.carton_vert, blanc: r.carton_blanc } })));
      h.forEach(x => out.set(Number(x.cle), x));
    }
    return out;
  }

  /* Points rapides pendant un match : un appui = +1 (ou −1 pour annuler) sur un compteur du joueur. */
  const COMPTEURS = { but: ['buts', 30], passe: ['passes', 30], fair_play: ['fp_points', 10], joga: ['joga_bonito', 10], rouge: ['carton_rouge', 9], jaune: ['carton_jaune', 9], vert: ['carton_vert', 9], blanc: ['carton_blanc', 9] };
  route('POST', '/api/tracker/matchs/:id/joueurs/:jid/action', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const m = await db.prepare('SELECT id, seance_id FROM tracker_matchs WHERE id=? AND initiative_id=?').get(params.id, ctx.init.id);
    if (!m) return sendJSON(res, 404, { error: 'Match introuvable.' });
    const def = COMPTEURS[body && body.action];
    if (!def) return sendJSON(res, 400, { error: 'Action inconnue.' });
    const note = await db.prepare('SELECT id, buts, passes, fp_points, joga_bonito, carton_rouge, carton_jaune, carton_vert, carton_blanc FROM tracker_notes WHERE match_id=? AND joueur_id=?').get(m.id, params.jid);
    if (!note) return sendJSON(res, 404, { error: 'Ce joueur ne joue pas ce match.' });
    const delta = Math.max(-1, Math.min(3, Math.round(Number(body.delta) || 1)));
    const [col, max] = def;
    const nv = Math.max(0, Math.min(max, Number(note[col] || 0) + delta));
    await db.prepare(`UPDATE tracker_notes SET ${col}=?, updated_at=datetime('now') WHERE id=?`).run(nv, note.id);
    const niveaux = await niveauxFairPlay(ctx), n2 = niveaux.get(Number(note.id));
    sendJSON(res, 200, { ok: true, action: body.action, valeur: nv, fair_play: n2 ? { niveau: n2.niveau, score: n2.score, sanction: n2.sanction } : null });
  });

  /* ---------- contexte + bureau ---------- */
  route('GET', '/api/tracker/contexte', async (req, res) => {
    const ctx = await acces(req, res); if (!ctx) return;
    sendJSON(res, 200, { initiative: { id: ctx.init.id, nom: ctx.init.nom }, estProprietaire: ctx.estProprietaire, postes: POSTES,
      fair_play: { defaut: calcul.FAIR_PLAY_DEFAUT, bonus: calcul.FAIR_PLAY_BONUS, max: 10 },
      categories: [{ cle: 'match', nom: 'Match' }, { cle: 'entrainement', nom: 'Entraînement (entre équipes du club)' }],
      cartons: calcul.CARTONS,
      modeles: Object.values(MODELES).map(m => ({ cle: m.cle, nom: m.nom, emoji: m.emoji, dore: !!m.dore, description: m.description, regle_defaut: m.regle_defaut })) });
  });

  route('GET', '/api/tracker/bureau', async (req, res) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const rows = await db.prepare('SELECT b.id, b.user_id, u.nom, u.prenom, u.email FROM tracker_bureau b JOIN users u ON u.id=b.user_id WHERE b.initiative_id=? ORDER BY b.id').all(ctx.init.id);
    sendJSON(res, 200, { bureau: rows });
  });
  route('POST', '/api/tracker/bureau', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    if (!ctx.estProprietaire) return sendJSON(res, 403, { error: 'Seul le propriétaire du compte peut gérer le bureau.' });
    const email = SEC.normalizeEmail(body && body.email);
    if (!email) return sendJSON(res, 400, { error: 'Adresse e-mail requise.' });
    const u = await db.prepare('SELECT id, nom, prenom FROM users WHERE LOWER(email)=?').get(email);
    if (!u) return sendJSON(res, 404, { error: 'Aucun compte Diaspo’Actif avec cette adresse.' });
    if (Number(u.id) === Number(ctx.user.id)) return sendJSON(res, 400, { error: 'Vous êtes déjà propriétaire.' });
    const deja = await db.prepare('SELECT id FROM tracker_bureau WHERE initiative_id=? AND user_id=?').get(ctx.init.id, u.id);
    if (deja) return sendJSON(res, 409, { error: 'Cette personne fait déjà partie du bureau.' });
    await db.prepare('INSERT INTO tracker_bureau (initiative_id, user_id, ajoute_par) VALUES (?,?,?)').run(ctx.init.id, u.id, ctx.user.id);
    await journal(ctx, 'bureau_ajout', `${u.prenom || ''} ${u.nom}`.trim(), null);
    sendJSON(res, 200, { ok: true });
  });
  route('DELETE', '/api/tracker/bureau/:id', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    if (!ctx.estProprietaire) return sendJSON(res, 403, { error: 'Seul le propriétaire du compte peut gérer le bureau.' });
    await db.prepare('DELETE FROM tracker_bureau WHERE id=? AND initiative_id=?').run(params.id, ctx.init.id);
    await journal(ctx, 'bureau_retrait', String(params.id), null);
    sendJSON(res, 200, { ok: true });
  });

  /* ---------- joueurs ---------- */
  route('GET', '/api/tracker/joueurs', async (req, res) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const rows = await db.prepare(`
      SELECT j.id, j.user_id, j.adhesion_membre_id, j.nom, j.prenom, j.email, j.poste_habituel, j.poste_2, j.majeur_atteste_le,
             COUNT(n.id) AS matchs, COALESCE(SUM(n.buts),0) AS buts, COALESCE(SUM(n.passes),0) AS passes
        FROM tracker_joueurs j LEFT JOIN tracker_notes n ON n.joueur_id=j.id
       WHERE j.initiative_id=? AND j.actif=1
       GROUP BY j.id, j.user_id, j.adhesion_membre_id, j.nom, j.prenom, j.email, j.poste_habituel, j.poste_2, j.majeur_atteste_le
       ORDER BY j.nom, j.prenom`).all(ctx.init.id);
    const pas = await pastilles(ctx);
    sendJSON(res, 200, { joueurs: rows.map(r => marquer(r, pas, 'id')) });
  });

  /* Adhérents proposables (registre d'adhésions + affiliés avec compte). Jamais de date de naissance renvoyée. */
  route('GET', '/api/tracker/adherents', async (req, res) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const id = ctx.init.id;
    const adh = await db.prepare(`SELECT m.id AS adhesion_membre_id, m.linked_user_id AS user_id, m.nom, m.prenom, m.email, m.statut, m.date_expiration, u.date_naissance
        FROM adhesion_membres m LEFT JOIN users u ON u.id=m.linked_user_id WHERE m.initiative_id=?`).all(id);
    const aff = await db.prepare(`SELECT im.user_id, u.nom, u.prenom, u.email, u.date_naissance
        FROM initiative_membres im JOIN users u ON u.id=im.user_id WHERE im.initiative_id=? AND im.statut='accepte'`).all(id);
    const deja = await db.prepare('SELECT user_id, adhesion_membre_id, email FROM tracker_joueurs WHERE initiative_id=? AND actif=1').all(id);
    const dejaU = new Set(deja.filter(d => d.user_id).map(d => Number(d.user_id)));
    const dejaA = new Set(deja.filter(d => d.adhesion_membre_id).map(d => Number(d.adhesion_membre_id)));
    const dejaE = new Set(deja.filter(d => d.email).map(d => String(d.email).toLowerCase()));
    const vus = new Set(), out = [];
    const ajouter = (r) => {
      const cle = r.user_id ? 'u' + r.user_id : (r.adhesion_membre_id ? 'a' + r.adhesion_membre_id : null);
      if (cle && vus.has(cle)) return; if (cle) vus.add(cle);
      const age = ageAnnees(r.date_naissance);
      const aJour = r.adhesion_membre_id ? computeAdhesionStatut(r) === 'a_jour' : false;   // affilié sans fiche d'adhésion = jaune
      out.push({ adhesion_membre_id: r.adhesion_membre_id || null, user_id: r.user_id || null, nom: r.nom, prenom: r.prenom, email: r.email || null,
        pastille: aJour ? 'vert' : 'jaune', pastille_libelle: aJour ? PASTILLES.a_jour[1] : PASTILLES.non_a_jour[1],
        mineur: age !== null && age < 18, age_inconnu: age === null,
        deja_ajoute: (r.user_id && dejaU.has(Number(r.user_id))) || (r.adhesion_membre_id && dejaA.has(Number(r.adhesion_membre_id))) || (r.email && dejaE.has(String(r.email).toLowerCase())) });
    };
    adh.forEach(ajouter); aff.forEach(ajouter);
    out.sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'));
    sendJSON(res, 200, { adherents: out });
  });

  route('POST', '/api/tracker/joueurs', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    body = body || {};
    if (body.majeur_atteste !== true) return sendJSON(res, 400, { error: 'Attestez que cette personne est majeure (18 ans ou plus) : le Tracker ne concerne pas les mineurs.' });
    const id = ctx.init.id;
    let userId = body.user_id ? Number(body.user_id) : null, adhId = body.adhesion_membre_id ? Number(body.adhesion_membre_id) : null;
    let nom = txt(body.nom, 80), prenom = txt(body.prenom, 80), email = SEC.normalizeEmail(body.email) || null, dn = null;
    if (adhId) {
      const m = await db.prepare('SELECT id, linked_user_id, nom, prenom, email FROM adhesion_membres WHERE id=? AND initiative_id=?').get(adhId, id);
      if (!m) return sendJSON(res, 404, { error: 'Adhérent introuvable dans votre registre.' });
      nom = m.nom || nom; prenom = m.prenom || prenom; email = m.email ? String(m.email).toLowerCase() : email;
      if (m.linked_user_id) userId = Number(m.linked_user_id);
    }
    if (userId) {
      const u = await db.prepare('SELECT id, nom, prenom, email, date_naissance FROM users WHERE id=?').get(userId);
      if (!u) return sendJSON(res, 404, { error: 'Compte introuvable.' });
      const lie = await db.prepare("SELECT 1 AS x FROM initiative_membres WHERE initiative_id=? AND user_id=? AND statut='accepte'").get(id, userId)
        || await db.prepare('SELECT 1 AS x FROM adhesion_membres WHERE initiative_id=? AND linked_user_id=?').get(id, userId);
      if (!lie) return sendJSON(res, 403, { error: 'Cette personne n’est pas adhérente de votre association.' });
      if (!nom) { nom = u.nom; prenom = u.prenom || prenom; }
      if (!email && u.email) email = String(u.email).toLowerCase();
      dn = u.date_naissance;
    }
    if (!nom) return sendJSON(res, 400, { error: 'Nom requis.' });
    const age = ageAnnees(dn);
    if (age !== null && age < 18) {
      await journal(ctx, 'joueur_refuse_mineur', `${prenom || ''} ${nom}`.trim(), 'date de naissance indiquant moins de 18 ans');
      return sendJSON(res, 403, { error: 'Refusé : d’après sa date de naissance, cette personne est mineure. Le Tracker ne concerne que les personnes majeures.' });
    }
    if (!userId && !adhId && !email) return sendJSON(res, 400, { error: 'Pour une personne sans compte, indiquez son adresse e-mail (nécessaire pour lui envoyer ses statistiques).' });
    const dup = await db.prepare('SELECT id FROM tracker_joueurs WHERE initiative_id=? AND actif=1 AND ((? IS NOT NULL AND user_id=?) OR (? IS NOT NULL AND adhesion_membre_id=?) OR (? IS NOT NULL AND LOWER(email)=?))')
      .get(id, userId, userId, adhId, adhId, email, email);
    if (dup) return sendJSON(res, 409, { error: 'Cette personne est déjà dans la liste des joueurs.' });
    const p1 = poste(body.poste_habituel), p2 = poste(body.poste_2);
    const jid = (await db.prepare(`INSERT INTO tracker_joueurs (initiative_id, user_id, adhesion_membre_id, nom, prenom, email, poste_habituel, poste_2, majeur_atteste, majeur_atteste_par, majeur_atteste_le)
        VALUES (?,?,?,?,?,?,?,?,1,?,datetime('now'))`).run(id, userId, adhId, nom, prenom || null, email, p1, p2 && p2 !== p1 ? p2 : null, ctx.user.id)).lastInsertRowid;
    await journal(ctx, 'joueur_ajout', `${prenom || ''} ${nom}`.trim(), 'majorité attestée');
    sendJSON(res, 200, { ok: true, id: jid });
  });

  /* Fiche joueur : poste 1 et poste 2 modifiables pour tous ; nom, prénom et e-mail seulement pour une personne SANS compte
     (pour un adhérent avec compte, ces informations viennent de son compte). */
  route('PUT', '/api/tracker/joueurs/:id', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    body = body || {};
    const j = await db.prepare('SELECT id, user_id, nom, prenom, email FROM tracker_joueurs WHERE id=? AND initiative_id=? AND actif=1').get(params.id, ctx.init.id);
    if (!j) return sendJSON(res, 404, { error: 'Joueur introuvable.' });
    const p1 = poste(body.poste_habituel), p2 = poste(body.poste_2);
    let nom = j.nom, prenom = j.prenom, email = j.email;
    if (!j.user_id) {
      nom = txt(body.nom, 80) || j.nom; prenom = txt(body.prenom, 80) || null;
      email = body.email === undefined ? j.email : (SEC.normalizeEmail(body.email) || null);
      if (!email) return sendJSON(res, 400, { error: 'L’adresse e-mail est nécessaire pour envoyer ses statistiques à une personne sans compte.' });
      const dup = await db.prepare('SELECT id FROM tracker_joueurs WHERE initiative_id=? AND actif=1 AND id<>? AND LOWER(email)=?').get(ctx.init.id, j.id, email);
      if (dup) return sendJSON(res, 409, { error: 'Cette adresse e-mail est déjà utilisée par un autre joueur.' });
    }
    await db.prepare('UPDATE tracker_joueurs SET nom=?, prenom=?, email=?, poste_habituel=?, poste_2=? WHERE id=?').run(nom, prenom, email, p1, p2 && p2 !== p1 ? p2 : null, j.id);
    await journal(ctx, 'joueur_modification', `${prenom || ''} ${nom}`.trim(), null);
    sendJSON(res, 200, { ok: true });
  });

  /* Retrait : supprime la personne ET toutes ses notes/statistiques (cas d'une personne mineure saisie par erreur). */
  route('DELETE', '/api/tracker/joueurs/:id', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const j = await db.prepare('SELECT id, nom, prenom FROM tracker_joueurs WHERE id=? AND initiative_id=?').get(params.id, ctx.init.id);
    if (!j) return sendJSON(res, 404, { error: 'Joueur introuvable.' });
    await db.prepare('DELETE FROM tracker_notes WHERE joueur_id=?').run(j.id);
    await db.prepare('DELETE FROM tracker_seance_presents WHERE joueur_id=?').run(j.id);
    await db.prepare('UPDATE tracker_prix SET laureat_joueur_id=NULL WHERE initiative_id=? AND laureat_joueur_id=?').run(ctx.init.id, j.id);
    await db.prepare('DELETE FROM tracker_joueurs WHERE id=?').run(j.id);
    await journal(ctx, 'joueur_retrait', `${j.prenom || ''} ${j.nom}`.trim(), 'notes et statistiques supprimées');
    sendJSON(res, 200, { ok: true });
  });

  /* ---------- matchs ---------- */
  route('GET', '/api/tracker/matchs', async (req, res) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const rows = await db.prepare(`SELECT m.id, m.date_match, m.categorie, m.seance_id, m.ordre_seance, m.equipe_a, m.equipe_b, m.adversaire, m.lieu, m.score_pour, m.score_contre, COUNT(n.id) AS joueurs
        FROM tracker_matchs m LEFT JOIN tracker_notes n ON n.match_id=m.id WHERE m.initiative_id=?
        GROUP BY m.id, m.date_match, m.categorie, m.seance_id, m.ordre_seance, m.equipe_a, m.equipe_b, m.adversaire, m.lieu, m.score_pour, m.score_contre ORDER BY m.date_match DESC, m.id DESC`).all(ctx.init.id);
    sendJSON(res, 200, { matchs: rows });
  });
  /* Deux catégories : « match » (contre un adversaire extérieur au club, créé ici) et « entrainement » (équipes du MÊME club : ses matchs
     naissent dans une SÉANCE d'entraînement, voir tracker-seances.js). Aucune limite au nombre de rencontres par journée.
     Score : « pour » = notre équipe / équipe 1, « contre » = adversaire / équipe 2. */
  const libelleMatch = (m) => m.categorie === 'entrainement' ? `${m.equipe_a || 'Équipe 1'} contre ${m.equipe_b || 'Équipe 2'}` : (m.adversaire || 'Match');
  const champsMatch = (b) => ({
    cat: 'match', ea: null, eb: null, date: dateIso(b.date_match), adv: txt(b.adversaire, 120) || null, lieu: txt(b.lieu, 120) || null,
    sp: b.score_pour === '' || b.score_pour == null ? null : entier(b.score_pour, 99), sc: b.score_contre === '' || b.score_contre == null ? null : entier(b.score_contre, 99),
    note: txt(b.note_bureau, 1000) || null });
  route('POST', '/api/tracker/matchs', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    body = body || {};
    if (body.categorie === 'entrainement') return sendJSON(res, 400, { error: 'Un entraînement se crée avec « Nouvel entraînement » (séance : présents, équipes, enchaînement de matchs).' });
    const c = champsMatch(body);
    if (!c.date) return sendJSON(res, 400, { error: 'Date requise (AAAA-MM-JJ).' });
    const cartons = await cartonsDeLaJournee(ctx, body.cartons);
    const mid = (await db.prepare('INSERT INTO tracker_matchs (initiative_id, date_match, categorie, equipe_a, equipe_b, adversaire, lieu, score_pour, score_contre, note_bureau, created_by, cartons_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(ctx.init.id, c.date, c.cat, c.ea, c.eb, c.adv, c.lieu, c.sp, c.sc, c.note, ctx.user.id, JSON.stringify(cartons))).lastInsertRowid;
    /* Plusieurs rencontres le même jour : on peut reprendre les présents de la rencontre précédente de la journée (statistiques remises à zéro,
       équipes et postes conservés, modifiables ensuite). Les présents restent toujours à déclarer avant de noter. */
    let repris = 0;
    if (body.reprendre_presents) {
      const prec = await db.prepare('SELECT id FROM tracker_matchs WHERE initiative_id=? AND date_match=? AND id<>? ORDER BY id DESC').get(ctx.init.id, c.date, mid);
      if (prec) {
        const anciens = await db.prepare('SELECT joueur_id, equipe, poste_joue FROM tracker_notes WHERE match_id=?').all(prec.id);
        for (const a of anciens) { await db.prepare('INSERT INTO tracker_notes (match_id, joueur_id, equipe, poste_joue) VALUES (?,?,?,?)').run(mid, a.joueur_id, null, a.poste_joue); repris++; }
      }
    }
    await journal(ctx, 'match_creation', `${c.date} ${libelleMatch({ categorie: c.cat, adversaire: c.adv })}`.trim(), repris ? `${repris} présent(s) repris` : null);
    sendJSON(res, 200, { ok: true, id: mid, presents_repris: repris });
  });
  async function chargerMatch(ctx, id) {
    return db.prepare('SELECT * FROM tracker_matchs WHERE id=? AND initiative_id=?').get(id, ctx.init.id);
  }
  route('GET', '/api/tracker/matchs/:id', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const m = await chargerMatch(ctx, params.id);
    if (!m) return sendJSON(res, 404, { error: 'Match introuvable.' });
    const notes = await db.prepare(`SELECT n.*, j.nom, j.prenom FROM tracker_notes n JOIN tracker_joueurs j ON j.id=n.joueur_id WHERE n.match_id=? ORDER BY n.equipe, j.nom`).all(m.id);
    const pas = await pastilles(ctx), niveaux = await niveauxFairPlay(ctx);
    notes.forEach(n => {
      try { n.competences = n.competences_json ? JSON.parse(n.competences_json) : null; } catch (e) { n.competences = null; } delete n.competences_json; marquer(n, pas);
      const f = niveaux.get(Number(n.id)); n.fp_niveau = f ? f.niveau : calcul.FAIR_PLAY_DEFAUT; n.fp_score = f ? f.score : calcul.FAIR_PLAY_DEFAUT; n.fp_sanction = !!(f && f.sanction);
    });
    const cartons = calcul.normaliserCartons(lireJSON(m.cartons_json) || lireJSON(m.seance_id ? (await db.prepare('SELECT cartons_json FROM tracker_seances WHERE id=?').get(m.seance_id) || {}).cartons_json : null));
    sendJSON(res, 200, { match: m, notes, cartons });
  });
  route('PUT', '/api/tracker/matchs/:id', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const m = await chargerMatch(ctx, params.id);
    if (!m) return sendJSON(res, 404, { error: 'Match introuvable.' });
    body = body || {};
    const sp = body.score_pour === '' || body.score_pour == null ? null : entier(body.score_pour, 99), sc = body.score_contre === '' || body.score_contre == null ? null : entier(body.score_contre, 99);
    /* Match d'une séance d'entraînement : seuls le score et le lieu se modifient (équipes et date viennent de la séance). */
    if (m.seance_id) {
      if ((sp === null) !== (sc === null)) return sendJSON(res, 400, { error: 'Saisissez les deux scores (ou aucun).' });
      await db.prepare("UPDATE tracker_matchs SET score_pour=?, score_contre=?, lieu=?, updated_at=datetime('now') WHERE id=?").run(sp, sc, txt(body.lieu, 120) || null, m.id);
      await journal(ctx, 'score_seance', libelleMatch(m), sp === null ? 'score effacé' : `${sp} - ${sc}`);
      return sendJSON(res, 200, { ok: true });
    }
    const c = champsMatch(body);
    if (!c.date) return sendJSON(res, 400, { error: 'Date requise (AAAA-MM-JJ).' });
    await db.prepare("UPDATE tracker_matchs SET date_match=?, categorie=?, equipe_a=?, equipe_b=?, adversaire=?, lieu=?, score_pour=?, score_contre=?, note_bureau=?, updated_at=datetime('now') WHERE id=?")
      .run(c.date, c.cat, c.ea, c.eb, c.adv, c.lieu, c.sp, c.sc, c.note, m.id);
    await journal(ctx, 'match_modification', `${c.date} ${libelleMatch({ categorie: c.cat, adversaire: c.adv })}`.trim(), null);
    sendJSON(res, 200, { ok: true });
  });
  route('DELETE', '/api/tracker/matchs/:id', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const m = await chargerMatch(ctx, params.id);
    if (!m) return sendJSON(res, 404, { error: 'Match introuvable.' });
    await db.prepare('DELETE FROM tracker_notes WHERE match_id=?').run(m.id);
    await db.prepare('DELETE FROM tracker_matchs WHERE id=?').run(m.id);
    await journal(ctx, 'match_suppression', `${m.date_match} ${m.adversaire || ''}`.trim(), null);
    sendJSON(res, 200, { ok: true });
  });

  /* Équipe d'un présent : pour un entraînement, uniquement l'une des deux équipes du match (sinon vide = pas encore répartie). */
  function equipeValide(m, brut) {
    const e = txt(brut, 40);
    if (m.categorie !== 'entrainement') return e || null;
    const a = String(m.equipe_a || 'Équipe 1'), b = String(m.equipe_b || 'Équipe 2');
    if (e.toLowerCase() === a.toLowerCase()) return a;
    if (e.toLowerCase() === b.toLowerCase()) return b;
    return null;
  }

  /* Joueur arrivé en RETARD : ajouté aux présents sans toucher aux autres. `aussi_journee` l'ajoute aussi aux autres rencontres du même jour
     où il n'est pas encore présent (utile lors d'un entraînement avec plusieurs matchs). Il peut ensuite être noté comme les autres. */
  route('POST', '/api/tracker/matchs/:id/retardataire', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const m = await chargerMatch(ctx, params.id);
    if (!m) return sendJSON(res, 404, { error: 'Match introuvable.' });
    body = body || {};
    const j = await db.prepare('SELECT id, nom, prenom FROM tracker_joueurs WHERE id=? AND initiative_id=? AND actif=1 AND majeur_atteste=1').get(body.joueur_id, ctx.init.id);
    if (!j) return sendJSON(res, 400, { error: 'Joueur introuvable dans votre liste (ou sans attestation de majorité).' });
    const cibles = [m];
    if (body.aussi_journee) {
      const autres = await db.prepare('SELECT * FROM tracker_matchs WHERE initiative_id=? AND date_match=? AND id<>?').all(ctx.init.id, m.date_match, m.id);
      cibles.push(...autres);
    }
    let ajoutes = 0;
    for (const c of cibles) {
      const deja = await db.prepare('SELECT 1 AS x FROM tracker_notes WHERE match_id=? AND joueur_id=?').get(c.id, j.id);
      if (deja) continue;
      const eq = c.id === m.id ? equipeValide(c, body.equipe) : null;
      await db.prepare('INSERT INTO tracker_notes (match_id, joueur_id, equipe, poste_joue, arrive_en_retard) VALUES (?,?,?,?,1)').run(c.id, j.id, eq, poste(body.poste_joue));
      ajoutes++;
    }
    if (!ajoutes) return sendJSON(res, 409, { error: 'Ce joueur est déjà présent.' });
    await journal(ctx, 'retardataire_ajoute', `${j.prenom || ''} ${j.nom}`.trim(), `${m.date_match} · ${ajoutes} rencontre(s)`);
    sendJSON(res, 200, { ok: true, ajoutes });
  });

  /* ÉTAPE 1 — présents du jour : seuls les joueurs déclarés présents (avec leur équipe et leur poste ce jour-là)
     peuvent ensuite être notés. Une ligne tracker_notes = une présence. Retirer un présent supprime sa note du jour. */
  route('PUT', '/api/tracker/matchs/:id/presents', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const m = await chargerMatch(ctx, params.id);
    if (!m) return sendJSON(res, 404, { error: 'Match introuvable.' });
    const liste = Array.isArray(body && body.presents) ? body.presents : null;
    if (!liste) return sendJSON(res, 400, { error: 'Liste des présents requise.' });
    const valides = new Set((await db.prepare('SELECT id FROM tracker_joueurs WHERE initiative_id=? AND actif=1 AND majeur_atteste=1').all(ctx.init.id)).map(r => Number(r.id)));
    const vus = new Set(), propres = [];
    for (const x of liste) {
      const jid = Number(x.joueur_id);
      if (!valides.has(jid)) return sendJSON(res, 400, { error: 'Un des joueurs n’existe pas dans votre liste (ou n’a pas d’attestation de majorité).' });
      if (vus.has(jid)) return sendJSON(res, 400, { error: 'Un joueur est listé deux fois.' });
      vus.add(jid);
      propres.push({ jid, equipe: equipeValide(m, x.equipe), poste: poste(x.poste_joue) });
    }
    const existants = await db.prepare('SELECT joueur_id FROM tracker_notes WHERE match_id=?').all(m.id);
    const dejaIds = new Set(existants.map(e => Number(e.joueur_id)));
    let retires = 0;
    for (const e of existants) if (!vus.has(Number(e.joueur_id))) { await db.prepare('DELETE FROM tracker_notes WHERE match_id=? AND joueur_id=?').run(m.id, e.joueur_id); retires++; }
    for (const p of propres) {
      if (dejaIds.has(p.jid)) await db.prepare("UPDATE tracker_notes SET equipe=?, poste_joue=?, updated_at=datetime('now') WHERE match_id=? AND joueur_id=?").run(p.equipe, p.poste, m.id, p.jid);
      else await db.prepare('INSERT INTO tracker_notes (match_id, joueur_id, equipe, poste_joue) VALUES (?,?,?,?)').run(m.id, p.jid, p.equipe, p.poste);
    }
    await journal(ctx, 'presents_enregistres', `${m.date_match} ${m.adversaire || ''}`.trim(), `${propres.length} présent(s)${retires ? `, ${retires} retiré(s)` : ''}`);
    sendJSON(res, 200, { ok: true, presents: propres.length, retires });
  });

  /* Historique des présences, jour après jour : une ligne par joueur, une colonne par match. */
  route('GET', '/api/tracker/presences', async (req, res) => {
    const ctx = await acces(req, res); if (!ctx) return;
    /* Une colonne par JOURNÉE de présence : chaque rencontre contre un adversaire (clé « m12 ») et chaque séance d'entraînement (clé « s4 »,
       les matchs d'une séance comptent pour une seule présence : celle de la séance). */
    const rencontres = await db.prepare("SELECT id, date_match, adversaire FROM tracker_matchs WHERE initiative_id=? AND seance_id IS NULL AND categorie='match'").all(ctx.init.id);
    const seances = await db.prepare('SELECT id, date_seance, titre FROM tracker_seances WHERE initiative_id=?').all(ctx.init.id);
    const colonnes = [
      ...rencontres.map(m => ({ cle: 'm' + m.id, date: m.date_match, categorie: 'match', libelle: m.adversaire || 'Match', ordre: Number(m.id) })),
      ...seances.map(s => ({ cle: 's' + s.id, date: s.date_seance, categorie: 'entrainement', libelle: s.titre || 'Entraînement', ordre: Number(s.id) })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ordre - b.ordre));
    const joueurs = await db.prepare('SELECT id, nom, prenom FROM tracker_joueurs WHERE initiative_id=? AND actif=1 ORDER BY nom, prenom').all(ctx.init.id);
    const presM = await db.prepare("SELECT n.match_id, n.joueur_id FROM tracker_notes n JOIN tracker_matchs m ON m.id=n.match_id WHERE m.initiative_id=? AND m.seance_id IS NULL").all(ctx.init.id);
    const presS = await db.prepare('SELECT p.seance_id, p.joueur_id FROM tracker_seance_presents p JOIN tracker_seances s ON s.id=p.seance_id WHERE s.initiative_id=?').all(ctx.init.id);
    const parJoueur = new Map(), parCol = {};
    const ajout = (cle, jid) => { const k = Number(jid); if (!parJoueur.has(k)) parJoueur.set(k, []); parJoueur.get(k).push(cle); parCol[cle] = (parCol[cle] || 0) + 1; };
    presM.forEach(p => ajout('m' + p.match_id, p.joueur_id));
    presS.forEach(p => ajout('s' + p.seance_id, p.joueur_id));
    /* Plusieurs séances/rencontres le même jour portant le même libellé : numérotées pour les distinguer. */
    const tot = {}, vu = {};
    colonnes.forEach(c => { const k = c.date + '|' + c.libelle; tot[k] = (tot[k] || 0) + 1; });
    colonnes.forEach(c => { const k = c.date + '|' + c.libelle; if (tot[k] > 1) { vu[k] = (vu[k] || 0) + 1; c.libelle += ` n°${vu[k]}`; } delete c.ordre; c.nb_presents = parCol[c.cle] || 0; });
    const pas = await pastilles(ctx);
    const lignes = joueurs.map(j => {
      const cles = parJoueur.get(Number(j.id)) || [];
      return marquer({ joueur_id: j.id, nom: `${j.prenom || ''} ${j.nom}`.trim(), presents: cles, nb_presents: cles.length, nb_matchs: colonnes.length,
        taux_pct: colonnes.length ? Math.round((cles.length / colonnes.length) * 100) : 0 }, pas);
    });
    sendJSON(res, 200, { colonnes, joueurs: lignes });
  });

  /* ÉTAPE 2 — notes : uniquement pour les joueurs déjà déclarés présents à ce match (composition inchangée ici). */
  route('PUT', '/api/tracker/matchs/:id/notes', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const m = await chargerMatch(ctx, params.id);
    if (!m) return sendJSON(res, 404, { error: 'Match introuvable.' });
    const liste = Array.isArray(body && body.notes) ? body.notes : null;
    if (!liste) return sendJSON(res, 400, { error: 'Liste de notes requise.' });
    const valides = new Map((await db.prepare('SELECT joueur_id FROM tracker_notes WHERE match_id=?').all(m.id)).map(r => [Number(r.joueur_id), true]));
    const propres = [];
    for (const x of liste) {
      const jid = Number(x.joueur_id);
      if (!valides.has(jid)) return sendJSON(res, 400, { error: 'Seuls les joueurs présents ce jour-là peuvent être notés : déclarez-le d’abord présent à ce match.' });
      if (propres.some(p => p.jid === jid)) return sendJSON(res, 400, { error: 'Un joueur est listé deux fois dans ce match.' });
      const brutJoga = x.joga_bonito === '' || x.joga_bonito == null ? 0 : Number(x.joga_bonito);
      if (!Number.isFinite(brutJoga) || brutJoga < 0 || brutJoga > 10) return sendJSON(res, 400, { error: 'Le Joga Bonito se note de 0 à 10.' });
      let et = x.note_etoiles === '' || x.note_etoiles == null ? null : Number(x.note_etoiles);
      if (et !== null && (!Number.isFinite(et) || et < 0 || et > 5)) return sendJSON(res, 400, { error: 'La note à l’étoile va de 0 à 5.' });
      const comp = x.competences && typeof x.competences === 'object' ? JSON.stringify(x.competences).slice(0, 1000) : null;
      propres.push({ jid, buts: entier(x.buts, 30), passes: entier(x.passes, 30), fpp: entier(x.fp_points, 10), joga: Math.round(brutJoga),
        cr: entier(x.carton_rouge, 9), cj: entier(x.carton_jaune, 9), cv: entier(x.carton_vert, 9), cb: entier(x.carton_blanc, 9),
        obs: txt(x.observations, 2000) || null, arrets: entier(x.arrets, 60), enc: entier(x.buts_encaisses, 60), et, comp,
        duels: entier(x.duels_gagnes, 99), inter: entier(x.interceptions, 99), tacles: entier(x.tacles, 99) });
    }
    for (const p of propres) {
      await db.prepare("UPDATE tracker_notes SET buts=?, passes=?, fp_points=?, joga_bonito=?, carton_rouge=?, carton_jaune=?, carton_vert=?, carton_blanc=?, observations=?, arrets=?, buts_encaisses=?, note_etoiles=?, competences_json=?, duels_gagnes=?, interceptions=?, tacles=?, updated_at=datetime('now') WHERE match_id=? AND joueur_id=?")
        .run(p.buts, p.passes, p.fpp, p.joga, p.cr, p.cj, p.cv, p.cb, p.obs, p.arrets, p.enc, p.et, p.comp, p.duels, p.inter, p.tacles, m.id, p.jid);
    }
    await journal(ctx, 'notes_enregistrees', `${m.date_match} ${m.adversaire || ''}`.trim(), `${propres.length} joueur(s)`);
    sendJSON(res, 200, { ok: true, joueurs: propres.length });
  });

  /* ---------- lots ---------- */
  route('GET', '/api/tracker/lots', async (req, res) => {
    const ctx = await acces(req, res); if (!ctx) return;
    sendJSON(res, 200, { lots: await db.prepare('SELECT id, nom, description FROM tracker_lots WHERE initiative_id=? ORDER BY id DESC').all(ctx.init.id) });
  });
  route('POST', '/api/tracker/lots', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const nom = txt(body && body.nom, 120); if (!nom) return sendJSON(res, 400, { error: 'Nom du lot requis.' });
    const id = (await db.prepare('INSERT INTO tracker_lots (initiative_id, nom, description) VALUES (?,?,?)').run(ctx.init.id, nom, txt(body.description, 500) || null)).lastInsertRowid;
    await journal(ctx, 'lot_creation', nom, null);
    sendJSON(res, 200, { ok: true, id });
  });
  route('PUT', '/api/tracker/lots/:id', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const nom = txt(body && body.nom, 120); if (!nom) return sendJSON(res, 400, { error: 'Nom du lot requis.' });
    await db.prepare('UPDATE tracker_lots SET nom=?, description=? WHERE id=? AND initiative_id=?').run(nom, txt(body.description, 500) || null, params.id, ctx.init.id);
    sendJSON(res, 200, { ok: true });
  });
  route('DELETE', '/api/tracker/lots/:id', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    await db.prepare('UPDATE tracker_prix SET lot_id=NULL WHERE lot_id=? AND initiative_id=?').run(params.id, ctx.init.id);
    await db.prepare('DELETE FROM tracker_lots WHERE id=? AND initiative_id=?').run(params.id, ctx.init.id);
    sendJSON(res, 200, { ok: true });
  });

  /* ---------- prix + classements ---------- */
  async function calculerPrix(ctx, prix) {
    const debut = dateIso(prix.periode_debut), fin = dateIso(prix.periode_fin);
    let regle = null; try { regle = prix.regle_json ? JSON.parse(prix.regle_json) : null; } catch (e) { regle = null; }
    const cats = calcul.normaliserRegle(prix.modele, regle).categories;
    let sql = `SELECT n.id AS note_id, n.joueur_id, n.match_id, n.poste_joue, n.buts, n.passes, n.fp_points, n.fp_bonus, n.joga_bonito, n.carton_rouge, n.carton_jaune, n.carton_vert, n.carton_blanc, n.arrets, n.buts_encaisses, n.note_etoiles, n.duels_gagnes, n.interceptions, n.tacles
        FROM tracker_notes n JOIN tracker_matchs m ON m.id=n.match_id JOIN tracker_joueurs j ON j.id=n.joueur_id
       WHERE m.initiative_id=? AND j.actif=1 AND j.majeur_atteste=1`;
    const args = [ctx.init.id];
    sql += ` AND m.categorie IN (${cats.map(() => '?').join(',')})`; args.push(...cats);
    if (debut) { sql += ' AND m.date_match >= ?'; args.push(debut); }
    if (fin) { sql += ' AND m.date_match <= ?'; args.push(fin); }
    let notes = await db.prepare(sql).all(...args);
    /* Le niveau de fair-play dépend de TOUT l'historique du joueur (cartons passés, sanction), pas seulement de la période du prix. */
    const niveaux = await niveauxFairPlay(ctx);
    notes.forEach(n => { const f = niveaux.get(Number(n.note_id)); if (f) n.fp_match = f.score; });
    const pas = await pastilles(ctx);
    /* Option « membres à jour » : seuls les adhérents à jour de leur cotisation comptent (classement, lauréat, trophée). Les autres sont listés à part. */
    const exclus = [];
    const aJourSeul = calcul.normaliserRegle(prix.modele, regle).membres_a_jour;
    if (aJourSeul) {
      const ecartes = new Set();
      notes = notes.filter(n => { const p = pas.get(Number(n.joueur_id)); if (p && p.statut === 'a_jour') return true; ecartes.add(Number(n.joueur_id)); return false; });
      ecartes.forEach(id => exclus.push(id));
    }
    const res = classer(prix.modele, notes, regle);
    const noms = new Map((await db.prepare('SELECT id, nom, prenom FROM tracker_joueurs WHERE initiative_id=?').all(ctx.init.id)).map(j => [Number(j.id), `${j.prenom || ''} ${j.nom}`.trim()]));
    res.classement.forEach(c => { c.nom = noms.get(Number(c.joueur_id)) || '—'; marquer(c, pas); });
    res.ecartes.forEach(c => { c.nom = noms.get(Number(c.joueur_id)) || '—'; marquer(c, pas); });
    return { ...res, exclus_cotisation: exclus.map(id => ({ joueur_id: id, nom: noms.get(id) || '—', pastille: (pas.get(id) || {}).pastille || 'rouge' })), matchs_pris_en_compte: new Set(notes.map(x => x.match_id)).size };
  }
  const presenterPrix = async (ctx, p) => {
    const lot = p.lot_id ? await db.prepare('SELECT id, nom FROM tracker_lots WHERE id=? AND initiative_id=?').get(p.lot_id, ctx.init.id) : null;
    let regle = null; try { regle = p.regle_json ? JSON.parse(p.regle_json) : null; } catch (e) { regle = null; }
    return { id: p.id, nom: p.nom, modele: p.modele, modele_nom: (MODELES[p.modele] || {}).nom, emoji: (MODELES[p.modele] || {}).emoji, lot, periode_debut: p.periode_debut, periode_fin: p.periode_fin,
      regle: calcul.normaliserRegle(p.modele, regle), vote_actif: !!p.vote_actif, poids_vote: p.poids_vote, statut: p.statut, laureat_joueur_id: p.laureat_joueur_id };
  };
  route('GET', '/api/tracker/prix', async (req, res) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const rows = await db.prepare('SELECT * FROM tracker_prix WHERE initiative_id=? ORDER BY id DESC').all(ctx.init.id);
    const out = [];
    for (const p of rows) {
      const c = await calculerPrix(ctx, p);
      const base = await presenterPrix(ctx, p);
      base.podium = c.classement.slice(0, 3).map(x => ({ rang: x.rang, nom: x.nom, score: x.score, egalite: x.egalite }));
      out.push(base);
    }
    sendJSON(res, 200, { prix: out });
  });
  route('GET', '/api/tracker/prix/:id', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const p = await db.prepare('SELECT * FROM tracker_prix WHERE id=? AND initiative_id=?').get(params.id, ctx.init.id);
    if (!p) return sendJSON(res, 404, { error: 'Prix introuvable.' });
    const c = await calculerPrix(ctx, p);
    sendJSON(res, 200, { prix: await presenterPrix(ctx, p), classement: c.classement, ecartes: c.ecartes, exclus_cotisation: c.exclus_cotisation, matchs_pris_en_compte: c.matchs_pris_en_compte });
  });
  async function lirePrix(ctx, b, res, ancien) {
    const modele = ancien ? ancien.modele : String(b.modele || '');
    if (!MODELES[modele]) { sendJSON(res, 400, { error: 'Modèle de prix inconnu.' }); return null; }
    const nom = txt(b.nom, 120) || (ancien ? ancien.nom : MODELES[modele].nom);
    let lotId = b.lot_id ? Number(b.lot_id) : null;
    if (lotId) { const l = await db.prepare('SELECT id FROM tracker_lots WHERE id=? AND initiative_id=?').get(lotId, ctx.init.id); if (!l) lotId = null; }
    const regle = calcul.normaliserRegle(modele, b.regle);
    const pv = Math.min(100, Math.max(0, Number(b.poids_vote) || 0));
    return { modele, nom, lotId, debut: dateIso(b.periode_debut), fin: dateIso(b.periode_fin), regle: JSON.stringify(regle), vote: b.vote_actif ? 1 : 0, pv };
  }
  route('POST', '/api/tracker/prix', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const d = await lirePrix(ctx, body || {}, res, null); if (!d) return;
    const id = (await db.prepare('INSERT INTO tracker_prix (initiative_id, nom, modele, lot_id, periode_debut, periode_fin, regle_json, vote_actif, poids_vote) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(ctx.init.id, d.nom, d.modele, d.lotId, d.debut, d.fin, d.regle, d.vote, d.pv)).lastInsertRowid;
    await journal(ctx, 'prix_creation', d.nom, d.modele);
    sendJSON(res, 200, { ok: true, id });
  });
  route('PUT', '/api/tracker/prix/:id', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const p = await db.prepare('SELECT * FROM tracker_prix WHERE id=? AND initiative_id=?').get(params.id, ctx.init.id);
    if (!p) return sendJSON(res, 404, { error: 'Prix introuvable.' });
    const d = await lirePrix(ctx, body || {}, res, p); if (!d) return;
    await db.prepare('UPDATE tracker_prix SET nom=?, lot_id=?, periode_debut=?, periode_fin=?, regle_json=?, vote_actif=?, poids_vote=? WHERE id=?').run(d.nom, d.lotId, d.debut, d.fin, d.regle, d.vote, d.pv, p.id);
    await journal(ctx, 'prix_modification', d.nom, null);
    sendJSON(res, 200, { ok: true });
  });
  route('DELETE', '/api/tracker/prix/:id', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    await db.prepare('DELETE FROM tracker_prix WHERE id=? AND initiative_id=?').run(params.id, ctx.init.id);
    await journal(ctx, 'prix_suppression', String(params.id), null);
    sendJSON(res, 200, { ok: true });
  });
  /* Désigne le lauréat (le bureau tranche, notamment en cas d'égalité) et clôt le prix. */
  route('POST', '/api/tracker/prix/:id/laureat', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const p = await db.prepare('SELECT * FROM tracker_prix WHERE id=? AND initiative_id=?').get(params.id, ctx.init.id);
    if (!p) return sendJSON(res, 404, { error: 'Prix introuvable.' });
    const j = await db.prepare('SELECT id, nom, prenom FROM tracker_joueurs WHERE id=? AND initiative_id=? AND actif=1').get(body && body.joueur_id, ctx.init.id);
    if (!j) return sendJSON(res, 400, { error: 'Joueur introuvable.' });
    let regleP = null; try { regleP = p.regle_json ? JSON.parse(p.regle_json) : null; } catch (e) { regleP = null; }
    if (calcul.normaliserRegle(p.modele, regleP).membres_a_jour) {
      const st = (await pastilles(ctx)).get(Number(j.id));
      if (!st || st.statut !== 'a_jour') return sendJSON(res, 409, { error: 'Ce prix est réservé aux membres à jour de leur cotisation : cette personne ne peut pas être désignée lauréate.' });
    }
    await db.prepare("UPDATE tracker_prix SET laureat_joueur_id=?, statut='clos' WHERE id=?").run(j.id, p.id);
    await journal(ctx, 'prix_laureat', p.nom, `${j.prenom || ''} ${j.nom}`.trim());
    sendJSON(res, 200, { ok: true });
  });
  route('POST', '/api/tracker/prix/:id/rouvrir', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    await db.prepare("UPDATE tracker_prix SET laureat_joueur_id=NULL, statut='ouvert' WHERE id=? AND initiative_id=?").run(params.id, ctx.init.id);
    sendJSON(res, 200, { ok: true });
  });

  route('GET', '/api/tracker/historique', async (req, res) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const rows = await db.prepare(`SELECT h.action, h.cible, h.detail, h.created_at, u.nom, u.prenom FROM tracker_historique h LEFT JOIN users u ON u.id=h.user_id
        WHERE h.initiative_id=? ORDER BY h.id DESC LIMIT 100`).all(ctx.init.id);
    sendJSON(res, 200, { historique: rows });
  });

  /* ---------- espace du membre (compte lié à un joueur) : ses statistiques, SANS observations ---------- */
  route('GET', '/api/tracker/mes-stats', async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
    const js = await db.prepare('SELECT j.id, j.initiative_id, i.nom AS association FROM tracker_joueurs j JOIN initiatives i ON i.id=j.initiative_id WHERE j.user_id=? AND j.actif=1').all(user.id);
    const out = [];
    for (const j of js) {
      const t = await db.prepare(`SELECT COUNT(*) AS matchs, COALESCE(SUM(buts),0) AS buts, COALESCE(SUM(passes),0) AS passes,
          COALESCE(SUM(arrets),0) AS arrets, COALESCE(SUM(buts_encaisses),0) AS buts_encaisses, AVG(note_etoiles) AS etoiles_moyenne,
          COALESCE(SUM(carton_rouge),0) AS carton_rouge, COALESCE(SUM(carton_jaune),0) AS carton_jaune, COALESCE(SUM(carton_vert),0) AS carton_vert, COALESCE(SUM(carton_blanc),0) AS carton_blanc
          FROM tracker_notes WHERE joueur_id=?`).get(j.id);
      const niveaux = await niveauxFairPlay({ init: { id: j.initiative_id } });
      const sc = (await db.prepare('SELECT id FROM tracker_notes WHERE joueur_id=?').all(j.id)).map(r => niveaux.get(Number(r.id))).filter(Boolean);
      t.fair_play_moyenne = sc.length ? sc.reduce((s, x) => s + x.score, 0) / sc.length : calcul.FAIR_PLAY_DEFAUT;
      const prix = await db.prepare("SELECT p.nom, p.modele, l.nom AS lot FROM tracker_prix p LEFT JOIN tracker_lots l ON l.id=p.lot_id WHERE p.initiative_id=? AND p.laureat_joueur_id=?").all(j.initiative_id, j.id);
      out.push({ association: j.association, stats: t, prix_remportes: prix });
    }
    sendJSON(res, 200, { joueurs: out });
  });

  /* Mini-fiche d'un joueur (clic sur son nom dans la liste des présents) : coordonnées, postes, pastille d'adhésion, statistiques cumulées. */
  route('GET', '/api/tracker/joueurs/:id', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const j = await db.prepare('SELECT id, user_id, nom, prenom, email, poste_habituel, poste_2 FROM tracker_joueurs WHERE id=? AND initiative_id=? AND actif=1').get(params.id, ctx.init.id);
    if (!j) return sendJSON(res, 404, { error: 'Joueur introuvable.' });
    const t = await db.prepare(`SELECT COUNT(*) AS matchs, COALESCE(SUM(buts),0) AS buts, COALESCE(SUM(passes),0) AS passes,
        COALESCE(SUM(arrets),0) AS arrets, COALESCE(SUM(buts_encaisses),0) AS buts_encaisses, COALESCE(SUM(joga_bonito),0) AS joga_total,
        COALESCE(SUM(carton_rouge),0) AS carton_rouge, COALESCE(SUM(carton_jaune),0) AS carton_jaune, COALESCE(SUM(carton_vert),0) AS carton_vert, COALESCE(SUM(carton_blanc),0) AS carton_blanc
        FROM tracker_notes WHERE joueur_id=?`).get(j.id);
    const niveaux = await niveauxFairPlay(ctx);
    const mesNotes = await db.prepare('SELECT n.id FROM tracker_notes n JOIN tracker_matchs m ON m.id=n.match_id WHERE n.joueur_id=? ORDER BY m.date_match DESC, m.id DESC').all(j.id);
    const scores = (await db.prepare('SELECT n.id FROM tracker_notes n WHERE n.joueur_id=?').all(j.id)).map(r => niveaux.get(Number(r.id))).filter(Boolean);
    t.fair_play_moyenne = scores.length ? scores.reduce((s, x) => s + x.score, 0) / scores.length : calcul.FAIR_PLAY_DEFAUT;
    const dernier = mesNotes.length ? niveaux.get(Number(mesNotes[0].id)) : null;
    t.fair_play_actuel = dernier ? dernier.niveau : calcul.FAIR_PLAY_DEFAUT; t.en_sanction = !!(dernier && dernier.sanction);
    t.joga_moyen = t.matchs ? t.joga_total / t.matchs : 0;
    const seances = (await db.prepare('SELECT COUNT(*) AS n FROM tracker_seance_presents WHERE joueur_id=?').get(j.id)).n;
    sendJSON(res, 200, { joueur: marquer({ ...j, joueur_id: j.id }, await pastilles(ctx)), stats: t, seances: Number(seances) });
  });

  require('./tracker-seances')({ route, db, sendJSON, acces, journal, poste, txt, entier, dateIso, calcul, pastilles, marquer, cartonsDeLaJournee });
  return { disponible };
};
