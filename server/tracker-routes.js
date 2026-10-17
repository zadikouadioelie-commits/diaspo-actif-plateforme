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

module.exports = function monterTracker({ route, db, sendJSON, getCurrentUser, SEC }) {
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
    return { user, init, estProprietaire };
  }
  async function journal(ctx, action, cible, detail) {
    try { await db.prepare('INSERT INTO tracker_historique (initiative_id, user_id, action, cible, detail) VALUES (?,?,?,?,?)').run(ctx.init.id, ctx.user.id, action, cible || null, detail ? String(detail).slice(0, 500) : null); } catch (e) { /* journal best-effort */ }
  }
  const poste = (v) => { const p = String(v || '').toLowerCase(); return POSTES.includes(p) ? p : null; };

  /* ---------- contexte + bureau ---------- */
  route('GET', '/api/tracker/contexte', async (req, res) => {
    const ctx = await acces(req, res); if (!ctx) return;
    sendJSON(res, 200, { initiative: { id: ctx.init.id, nom: ctx.init.nom }, estProprietaire: ctx.estProprietaire, postes: POSTES,
      fair_play: { defaut: calcul.FAIR_PLAY_DEFAUT, bonus: calcul.FAIR_PLAY_BONUS, max: 10 },
      modeles: Object.values(MODELES).map(m => ({ cle: m.cle, nom: m.nom, emoji: m.emoji, description: m.description, regle_defaut: m.regle_defaut })) });
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
      SELECT j.id, j.user_id, j.adhesion_membre_id, j.nom, j.prenom, j.email, j.poste_habituel, j.majeur_atteste_le,
             COUNT(n.id) AS matchs, COALESCE(SUM(n.buts),0) AS buts, COALESCE(SUM(n.passes),0) AS passes
        FROM tracker_joueurs j LEFT JOIN tracker_notes n ON n.joueur_id=j.id
       WHERE j.initiative_id=? AND j.actif=1
       GROUP BY j.id, j.user_id, j.adhesion_membre_id, j.nom, j.prenom, j.email, j.poste_habituel, j.majeur_atteste_le
       ORDER BY j.nom, j.prenom`).all(ctx.init.id);
    sendJSON(res, 200, { joueurs: rows });
  });

  /* Adhérents proposables (registre d'adhésions + affiliés avec compte). Jamais de date de naissance renvoyée. */
  route('GET', '/api/tracker/adherents', async (req, res) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const id = ctx.init.id;
    const adh = await db.prepare(`SELECT m.id AS adhesion_membre_id, m.linked_user_id AS user_id, m.nom, m.prenom, m.email, u.date_naissance
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
      out.push({ adhesion_membre_id: r.adhesion_membre_id || null, user_id: r.user_id || null, nom: r.nom, prenom: r.prenom, email: r.email || null,
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
    const jid = (await db.prepare(`INSERT INTO tracker_joueurs (initiative_id, user_id, adhesion_membre_id, nom, prenom, email, poste_habituel, majeur_atteste, majeur_atteste_par, majeur_atteste_le)
        VALUES (?,?,?,?,?,?,?,1,?,datetime('now'))`).run(id, userId, adhId, nom, prenom || null, email, poste(body.poste_habituel), ctx.user.id)).lastInsertRowid;
    await journal(ctx, 'joueur_ajout', `${prenom || ''} ${nom}`.trim(), 'majorité attestée');
    sendJSON(res, 200, { ok: true, id: jid });
  });

  route('PUT', '/api/tracker/joueurs/:id', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const j = await db.prepare('SELECT id FROM tracker_joueurs WHERE id=? AND initiative_id=? AND actif=1').get(params.id, ctx.init.id);
    if (!j) return sendJSON(res, 404, { error: 'Joueur introuvable.' });
    await db.prepare('UPDATE tracker_joueurs SET poste_habituel=? WHERE id=?').run(poste(body && body.poste_habituel), params.id);
    sendJSON(res, 200, { ok: true });
  });

  /* Retrait : supprime la personne ET toutes ses notes/statistiques (cas d'une personne mineure saisie par erreur). */
  route('DELETE', '/api/tracker/joueurs/:id', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const j = await db.prepare('SELECT id, nom, prenom FROM tracker_joueurs WHERE id=? AND initiative_id=?').get(params.id, ctx.init.id);
    if (!j) return sendJSON(res, 404, { error: 'Joueur introuvable.' });
    await db.prepare('DELETE FROM tracker_notes WHERE joueur_id=?').run(j.id);
    await db.prepare('UPDATE tracker_prix SET laureat_joueur_id=NULL WHERE initiative_id=? AND laureat_joueur_id=?').run(ctx.init.id, j.id);
    await db.prepare('DELETE FROM tracker_joueurs WHERE id=?').run(j.id);
    await journal(ctx, 'joueur_retrait', `${j.prenom || ''} ${j.nom}`.trim(), 'notes et statistiques supprimées');
    sendJSON(res, 200, { ok: true });
  });

  /* ---------- matchs ---------- */
  route('GET', '/api/tracker/matchs', async (req, res) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const rows = await db.prepare(`SELECT m.id, m.date_match, m.adversaire, m.lieu, m.score_pour, m.score_contre, COUNT(n.id) AS joueurs
        FROM tracker_matchs m LEFT JOIN tracker_notes n ON n.match_id=m.id WHERE m.initiative_id=?
        GROUP BY m.id, m.date_match, m.adversaire, m.lieu, m.score_pour, m.score_contre ORDER BY m.date_match DESC, m.id DESC`).all(ctx.init.id);
    sendJSON(res, 200, { matchs: rows });
  });
  const champsMatch = (b) => ({
    date: dateIso(b.date_match), adv: txt(b.adversaire, 120) || null, lieu: txt(b.lieu, 120) || null,
    sp: b.score_pour === '' || b.score_pour == null ? null : entier(b.score_pour, 99), sc: b.score_contre === '' || b.score_contre == null ? null : entier(b.score_contre, 99),
    note: txt(b.note_bureau, 1000) || null });
  route('POST', '/api/tracker/matchs', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const c = champsMatch(body || {});
    if (!c.date) return sendJSON(res, 400, { error: 'Date du match requise (AAAA-MM-JJ).' });
    const mid = (await db.prepare('INSERT INTO tracker_matchs (initiative_id, date_match, adversaire, lieu, score_pour, score_contre, note_bureau, created_by) VALUES (?,?,?,?,?,?,?,?)')
      .run(ctx.init.id, c.date, c.adv, c.lieu, c.sp, c.sc, c.note, ctx.user.id)).lastInsertRowid;
    await journal(ctx, 'match_creation', `${c.date} ${c.adv || ''}`.trim(), null);
    sendJSON(res, 200, { ok: true, id: mid });
  });
  async function chargerMatch(ctx, id) {
    return db.prepare('SELECT * FROM tracker_matchs WHERE id=? AND initiative_id=?').get(id, ctx.init.id);
  }
  route('GET', '/api/tracker/matchs/:id', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const m = await chargerMatch(ctx, params.id);
    if (!m) return sendJSON(res, 404, { error: 'Match introuvable.' });
    const notes = await db.prepare(`SELECT n.*, j.nom, j.prenom FROM tracker_notes n JOIN tracker_joueurs j ON j.id=n.joueur_id WHERE n.match_id=? ORDER BY n.equipe, j.nom`).all(m.id);
    notes.forEach(n => { try { n.competences = n.competences_json ? JSON.parse(n.competences_json) : null; } catch (e) { n.competences = null; } delete n.competences_json; });
    sendJSON(res, 200, { match: m, notes });
  });
  route('PUT', '/api/tracker/matchs/:id', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const m = await chargerMatch(ctx, params.id);
    if (!m) return sendJSON(res, 404, { error: 'Match introuvable.' });
    const c = champsMatch(body || {});
    if (!c.date) return sendJSON(res, 400, { error: 'Date du match requise (AAAA-MM-JJ).' });
    await db.prepare("UPDATE tracker_matchs SET date_match=?, adversaire=?, lieu=?, score_pour=?, score_contre=?, note_bureau=?, updated_at=datetime('now') WHERE id=?")
      .run(c.date, c.adv, c.lieu, c.sp, c.sc, c.note, m.id);
    await journal(ctx, 'match_modification', `${c.date} ${c.adv || ''}`.trim(), null);
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
      propres.push({ jid, equipe: txt(x.equipe, 40) || null, poste: poste(x.poste_joue) });
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
    const matchs = await db.prepare('SELECT id, date_match, adversaire FROM tracker_matchs WHERE initiative_id=? ORDER BY date_match, id').all(ctx.init.id);
    const joueurs = await db.prepare('SELECT id, nom, prenom FROM tracker_joueurs WHERE initiative_id=? AND actif=1 ORDER BY nom, prenom').all(ctx.init.id);
    const pres = await db.prepare('SELECT n.match_id, n.joueur_id FROM tracker_notes n JOIN tracker_matchs m ON m.id=n.match_id WHERE m.initiative_id=?').all(ctx.init.id);
    const parJoueur = new Map();
    pres.forEach(p => { const k = Number(p.joueur_id); if (!parJoueur.has(k)) parJoueur.set(k, []); parJoueur.get(k).push(Number(p.match_id)); });
    const parMatch = {};
    pres.forEach(p => { parMatch[p.match_id] = (parMatch[p.match_id] || 0) + 1; });
    const lignes = joueurs.map(j => {
      const ids = parJoueur.get(Number(j.id)) || [];
      return { joueur_id: j.id, nom: `${j.prenom || ''} ${j.nom}`.trim(), presents: ids, nb_presents: ids.length, nb_matchs: matchs.length,
        taux_pct: matchs.length ? Math.round((ids.length / matchs.length) * 100) : 0 };
    });
    sendJSON(res, 200, { matchs: matchs.map(m => ({ ...m, nb_presents: parMatch[m.id] || 0 })), joueurs: lignes });
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
      let fp = x.fair_play === '' || x.fair_play == null ? null : Number(x.fair_play);
      if (fp !== null && (!Number.isFinite(fp) || fp < 0 || fp > 10)) return sendJSON(res, 400, { error: 'Le fair-play se note de 0 à 10.' });
      let et = x.note_etoiles === '' || x.note_etoiles == null ? null : Number(x.note_etoiles);
      if (et !== null && (!Number.isFinite(et) || et < 0 || et > 5)) return sendJSON(res, 400, { error: 'La note à l’étoile va de 0 à 5.' });
      const comp = x.competences && typeof x.competences === 'object' ? JSON.stringify(x.competences).slice(0, 1000) : null;
      propres.push({ jid, buts: entier(x.buts, 30), passes: entier(x.passes, 30),
        fp, obs: txt(x.observations, 2000) || null, arrets: entier(x.arrets, 60), enc: entier(x.buts_encaisses, 60), et, comp,
        duels: entier(x.duels_gagnes, 99), inter: entier(x.interceptions, 99), tacles: entier(x.tacles, 99) });
    }
    for (const p of propres) {
      await db.prepare("UPDATE tracker_notes SET buts=?, passes=?, fair_play=?, observations=?, arrets=?, buts_encaisses=?, note_etoiles=?, competences_json=?, duels_gagnes=?, interceptions=?, tacles=?, updated_at=datetime('now') WHERE match_id=? AND joueur_id=?")
        .run(p.buts, p.passes, p.fp, p.obs, p.arrets, p.enc, p.et, p.comp, p.duels, p.inter, p.tacles, m.id, p.jid);
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
    let sql = `SELECT n.joueur_id, n.match_id, n.poste_joue, n.buts, n.passes, n.fair_play, n.arrets, n.buts_encaisses, n.note_etoiles, n.duels_gagnes, n.interceptions, n.tacles
        FROM tracker_notes n JOIN tracker_matchs m ON m.id=n.match_id JOIN tracker_joueurs j ON j.id=n.joueur_id
       WHERE m.initiative_id=? AND j.actif=1 AND j.majeur_atteste=1`;
    const args = [ctx.init.id];
    if (debut) { sql += ' AND m.date_match >= ?'; args.push(debut); }
    if (fin) { sql += ' AND m.date_match <= ?'; args.push(fin); }
    const notes = await db.prepare(sql).all(...args);
    let regle = null; try { regle = prix.regle_json ? JSON.parse(prix.regle_json) : null; } catch (e) { regle = null; }
    const res = classer(prix.modele, notes, regle);
    const noms = new Map((await db.prepare('SELECT id, nom, prenom FROM tracker_joueurs WHERE initiative_id=?').all(ctx.init.id)).map(j => [Number(j.id), `${j.prenom || ''} ${j.nom}`.trim()]));
    res.classement.forEach(c => { c.nom = noms.get(Number(c.joueur_id)) || '—'; });
    res.ecartes.forEach(c => { c.nom = noms.get(Number(c.joueur_id)) || '—'; });
    return { ...res, matchs_pris_en_compte: new Set(notes.map(x => x.match_id)).size };
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
    sendJSON(res, 200, { prix: await presenterPrix(ctx, p), classement: c.classement, ecartes: c.ecartes, matchs_pris_en_compte: c.matchs_pris_en_compte });
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
      const t = await db.prepare(`SELECT COUNT(*) AS matchs, COALESCE(SUM(buts),0) AS buts, COALESCE(SUM(passes),0) AS passes, AVG(COALESCE(fair_play, ${calcul.FAIR_PLAY_DEFAUT})) AS fair_play_moyenne,
          COALESCE(SUM(arrets),0) AS arrets, COALESCE(SUM(buts_encaisses),0) AS buts_encaisses, AVG(note_etoiles) AS etoiles_moyenne FROM tracker_notes WHERE joueur_id=?`).get(j.id);
      const prix = await db.prepare("SELECT p.nom, p.modele, l.nom AS lot FROM tracker_prix p LEFT JOIN tracker_lots l ON l.id=p.lot_id WHERE p.initiative_id=? AND p.laureat_joueur_id=?").all(j.initiative_id, j.id);
      out.push({ association: j.association, stats: t, prix_remportes: prix });
    }
    sendJSON(res, 200, { joueurs: out });
  });
};
