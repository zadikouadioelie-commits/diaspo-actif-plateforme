/* ============================================================
   Diaspo'Actif — MARACANA TRACKER : séances d'entraînement (routes /api/tracker/seances/*)
   Une séance = les présents du jour + des équipes du même club + un enchaînement de matchs entre ces équipes.
   Branché depuis tracker-routes.js. Règles (décisions de l'utilisateur, 2026-10-17) :
   - seuls les PRÉSENTS peuvent former les équipes, puis être notés ;
   - un retardataire reçoit une équipe PROPOSÉE (celle qui manque de joueurs à son poste), modifiable ;
   - un joueur peut changer d'équipe à tout moment : ses stats restent les siennes, il gagne 1 point de fair-play
     automatique (une fois, sur le prochain match qu'il joue) ;
   - suivi automatique de l'enchaînement : « gagnant reste » ou « gagnant sort » (les deux équipes sortent), ou manuel.
   ============================================================ */
'use strict';

module.exports = function monterSeances({ route, db, sendJSON, acces, journal, poste, txt, entier, dateIso, calcul, pastilles, marquer, cartonsDeLaJournee }) {
  const POSTE_LIB = { gardien: 'gardien', defenseur: 'défenseur', milieu: 'milieu', attaquant: 'attaquant' };
  const parseJSON = (s, def) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : def; } catch (e) { return def; } };
  const parseObj = (s) => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };

  async function chargerSeance(ctx, id) {
    return db.prepare('SELECT * FROM tracker_seances WHERE id=? AND initiative_id=?').get(id, ctx.init.id);
  }
  const jnom = (j) => `${j.prenom || ''} ${j.nom}`.trim();

  /* État complet d'une séance : équipes, présents (avec équipe), matchs dans l'ordre et prochaine affiche proposée. */
  async function detail(ctx, s) {
    const equipes = await db.prepare('SELECT id, nom, ordre FROM tracker_equipes WHERE seance_id=? ORDER BY ordre, id').all(s.id);
    const presents = await db.prepare(`SELECT sp.joueur_id, sp.equipe_id, sp.poste_joue, sp.arrive_en_retard, sp.bonus_transfert, j.nom, j.prenom, j.poste_habituel, j.poste_2, j.user_id
        FROM tracker_seance_presents sp JOIN tracker_joueurs j ON j.id=sp.joueur_id WHERE sp.seance_id=? ORDER BY j.nom, j.prenom`).all(s.id);
    const matchs = await db.prepare(`SELECT m.id, m.ordre_seance, m.equipe_a_id, m.equipe_b_id, m.equipe_a, m.equipe_b, m.score_pour, m.score_contre, m.lieu,
        (SELECT COUNT(*) FROM tracker_notes n WHERE n.match_id=m.id) AS joueurs
        FROM tracker_matchs m WHERE m.seance_id=? ORDER BY m.ordre_seance, m.id`).all(s.id);
    let ordre = parseJSON(s.ordre_json, []).map(Number).filter(id => equipes.some(e => e.id === id));
    equipes.forEach(e => { if (!ordre.includes(e.id)) ordre.push(e.id); });
    const regle = s.suivi_auto ? s.regle : 'manuel';
    const etat = calcul.etatRotation(regle, ordre, matchs.map(m => ({ a: m.equipe_a_id, b: m.equipe_b_id, sp: m.score_pour, sc: m.score_contre })));
    const nomEq = new Map(equipes.map(e => [e.id, e.nom]));
    const pas = await pastilles(ctx);
    presents.forEach(p => marquer(p, pas));
    return {
      seance: { id: s.id, date_seance: s.date_seance, titre: s.titre, regle: s.regle, suivi_auto: !!s.suivi_auto, cartons: calcul.normaliserCartons(parseObj(s.cartons_json)) },
      equipes, ordre, presents, matchs,
      etat: { prochain: etat.prochain ? etat.prochain.map(id => ({ equipe_id: id, nom: nomEq.get(id) })) : null, attente: (etat.attente || []).map(id => ({ equipe_id: id, nom: nomEq.get(id) })),
        attend_score: !!etat.attend_score, raison: etat.raison || null },
    };
  }

  /* Équipes (avec joueurs et postes du jour) pour la suggestion et l'équilibrage. */
  async function equipesAvecJoueurs(s, sauf) {
    const equipes = await db.prepare('SELECT id, nom FROM tracker_equipes WHERE seance_id=? ORDER BY ordre, id').all(s.id);
    const pres = await db.prepare('SELECT joueur_id, equipe_id, poste_joue FROM tracker_seance_presents WHERE seance_id=? AND equipe_id IS NOT NULL').all(s.id);
    return equipes.map(e => ({ id: e.id, nom: e.nom, joueurs: pres.filter(p => Number(p.equipe_id) === Number(e.id) && Number(p.joueur_id) !== Number(sauf)).map(p => ({ poste: p.poste_joue || '' })) }));
  }

  /* Un match d'entraînement non noté (score absent) reflète toujours la composition actuelle des deux équipes. Un match avec score
     garde sa composition d'origine : les buts et stats restent au joueur, même s'il a changé d'équipe depuis. */
  async function resyncMatchsSansScore(s) {
    const ms = await db.prepare('SELECT id, equipe_a_id, equipe_b_id, equipe_a, equipe_b FROM tracker_matchs WHERE seance_id=? AND score_pour IS NULL').all(s.id);
    if (!ms.length) return;
    const pres = await db.prepare('SELECT joueur_id, equipe_id, poste_joue, arrive_en_retard, bonus_transfert FROM tracker_seance_presents WHERE seance_id=?').all(s.id);
    const noms = new Map((await db.prepare('SELECT id, nom FROM tracker_equipes WHERE seance_id=?').all(s.id)).map(e => [Number(e.id), e.nom]));
    for (const m of ms) {
      const voulus = pres.filter(p => p.equipe_id && [Number(m.equipe_a_id), Number(m.equipe_b_id)].includes(Number(p.equipe_id)));
      const notes = await db.prepare('SELECT id, joueur_id, buts, passes, arrets, buts_encaisses, duels_gagnes, interceptions, tacles, note_etoiles, observations, fair_play FROM tracker_notes WHERE match_id=?').all(m.id);
      for (const n of notes) {
        const v = voulus.find(p => Number(p.joueur_id) === Number(n.joueur_id));
        const vide = !n.buts && !n.passes && !n.arrets && !n.buts_encaisses && !n.duels_gagnes && !n.interceptions && !n.tacles && n.note_etoiles == null && !n.observations && n.fair_play == null;
        if (!v && vide) await db.prepare('DELETE FROM tracker_notes WHERE id=?').run(n.id);
        else if (v) await db.prepare('UPDATE tracker_notes SET equipe=?, poste_joue=? WHERE id=?').run(noms.get(Number(v.equipe_id)) || null, v.poste_joue || null, n.id);
      }
      const dejaIds = new Set(notes.map(n => Number(n.joueur_id)));
      for (const v of voulus) {
        if (dejaIds.has(Number(v.joueur_id))) continue;
        await ajouterNote(m.id, v, noms.get(Number(v.equipe_id)), s.id);
      }
    }
  }
  /* Ajoute un joueur à un match et lui accorde le point de fair-play en attente (changement d'équipe), une seule fois. */
  async function ajouterNote(matchId, p, nomEquipe, seanceId) {
    const bonus = Math.min(1, Number(p.bonus_transfert) || 0);
    await db.prepare('INSERT INTO tracker_notes (match_id, joueur_id, equipe, poste_joue, arrive_en_retard, fp_bonus) VALUES (?,?,?,?,?,?)')
      .run(matchId, p.joueur_id, nomEquipe || null, p.poste_joue || null, p.arrive_en_retard ? 1 : 0, bonus);
    if (bonus) await db.prepare('UPDATE tracker_seance_presents SET bonus_transfert=0 WHERE seance_id=? AND joueur_id=?').run(seanceId, p.joueur_id);
  }

  /* ---------- liste + création ---------- */
  route('GET', '/api/tracker/seances', async (req, res) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const rows = await db.prepare(`SELECT s.id, s.date_seance, s.titre, s.regle, s.suivi_auto,
        (SELECT COUNT(*) FROM tracker_equipes e WHERE e.seance_id=s.id) AS nb_equipes,
        (SELECT COUNT(*) FROM tracker_seance_presents p WHERE p.seance_id=s.id) AS nb_presents,
        (SELECT COUNT(*) FROM tracker_matchs m WHERE m.seance_id=s.id) AS nb_matchs
        FROM tracker_seances s WHERE s.initiative_id=? ORDER BY s.date_seance DESC, s.id DESC`).all(ctx.init.id);
    sendJSON(res, 200, { seances: rows });
  });

  route('POST', '/api/tracker/seances', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    body = body || {};
    const date = dateIso(body.date_seance); if (!date) return sendJSON(res, 400, { error: 'Date requise (AAAA-MM-JJ).' });
    const nb = Math.min(8, Math.max(2, entier(body.nb_equipes, 8) || 2));
    const regle = calcul.REGLES_ROTATION.includes(body.regle) ? body.regle : 'gagnant_reste';
    /* Réglage des cartons de la journée : demandé au départ, puis conservé comme réglage par défaut jusqu'à modification. */
    const cartons = await cartonsDeLaJournee(ctx, body.cartons);
    const id = (await db.prepare('INSERT INTO tracker_seances (initiative_id, date_seance, titre, regle, suivi_auto, created_by, cartons_json) VALUES (?,?,?,?,?,?,?)')
      .run(ctx.init.id, date, txt(body.titre, 80) || null, regle, body.suivi_auto === false ? 0 : 1, ctx.user.id, JSON.stringify(cartons))).lastInsertRowid;
    const ids = [];
    for (let i = 1; i <= nb; i++) ids.push((await db.prepare('INSERT INTO tracker_equipes (seance_id, nom, ordre) VALUES (?,?,?)').run(id, `Équipe ${i}`, i)).lastInsertRowid);
    await db.prepare('UPDATE tracker_seances SET ordre_json=? WHERE id=?').run(JSON.stringify(ids), id);
    await journal(ctx, 'seance_creation', date, `${nb} équipes · ${regle}`);
    sendJSON(res, 200, { ok: true, id });
  });

  route('GET', '/api/tracker/seances/:id', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const s = await chargerSeance(ctx, params.id);
    if (!s) return sendJSON(res, 404, { error: 'Séance introuvable.' });
    sendJSON(res, 200, await detail(ctx, s));
  });

  /* Réglages : règle d'enchaînement, suivi automatique, date, ordre d'entrée des équipes, noms des équipes. */
  route('PUT', '/api/tracker/seances/:id', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const s = await chargerSeance(ctx, params.id);
    if (!s) return sendJSON(res, 404, { error: 'Séance introuvable.' });
    body = body || {};
    const equipes = await db.prepare('SELECT id, nom FROM tracker_equipes WHERE seance_id=?').all(s.id);
    if (Array.isArray(body.equipes)) {
      const nouveaux = new Map(equipes.map(e => [Number(e.id), e.nom]));
      for (const x of body.equipes) if (nouveaux.has(Number(x.id)) && txt(x.nom, 40)) nouveaux.set(Number(x.id), txt(x.nom, 40));
      const noms = [...nouveaux.values()].map(v => v.toLowerCase());
      if (new Set(noms).size !== noms.length) return sendJSON(res, 400, { error: 'Deux équipes ne peuvent pas porter le même nom.' });
      for (const [eid, nom] of nouveaux) await db.prepare('UPDATE tracker_equipes SET nom=? WHERE id=? AND seance_id=?').run(nom, eid, s.id);
    }
    const regle = calcul.REGLES_ROTATION.includes(body.regle) ? body.regle : s.regle;
    let ordre = parseJSON(s.ordre_json, []);
    if (Array.isArray(body.ordre)) ordre = body.ordre.map(Number).filter(id => equipes.some(e => Number(e.id) === id));
    equipes.forEach(e => { if (!ordre.includes(Number(e.id))) ordre.push(Number(e.id)); });
    await db.prepare("UPDATE tracker_seances SET regle=?, suivi_auto=?, ordre_json=?, titre=?, date_seance=?, updated_at=datetime('now') WHERE id=?")
      .run(regle, body.suivi_auto === undefined ? s.suivi_auto : (body.suivi_auto ? 1 : 0), JSON.stringify(ordre), body.titre === undefined ? s.titre : (txt(body.titre, 80) || null), dateIso(body.date_seance) || s.date_seance, s.id);
    await journal(ctx, 'seance_modification', s.date_seance, regle);
    sendJSON(res, 200, { ok: true });
  });

  route('DELETE', '/api/tracker/seances/:id', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const s = await chargerSeance(ctx, params.id);
    if (!s) return sendJSON(res, 404, { error: 'Séance introuvable.' });
    const ms = await db.prepare('SELECT id FROM tracker_matchs WHERE seance_id=?').all(s.id);
    for (const m of ms) await db.prepare('DELETE FROM tracker_notes WHERE match_id=?').run(m.id);
    await db.prepare('DELETE FROM tracker_matchs WHERE seance_id=?').run(s.id);
    await db.prepare('DELETE FROM tracker_seance_presents WHERE seance_id=?').run(s.id);
    await db.prepare('DELETE FROM tracker_equipes WHERE seance_id=?').run(s.id);
    await db.prepare('DELETE FROM tracker_seances WHERE id=?').run(s.id);
    await journal(ctx, 'seance_suppression', s.date_seance, `${ms.length} match(s)`);
    sendJSON(res, 200, { ok: true });
  });

  /* ---------- équipes ---------- */
  route('POST', '/api/tracker/seances/:id/equipes', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const s = await chargerSeance(ctx, params.id);
    if (!s) return sendJSON(res, 404, { error: 'Séance introuvable.' });
    const eqs = await db.prepare('SELECT id, nom FROM tracker_equipes WHERE seance_id=?').all(s.id);
    if (eqs.length >= 8) return sendJSON(res, 400, { error: 'Huit équipes au maximum.' });
    let nom = txt(body && body.nom, 40) || `Équipe ${eqs.length + 1}`;
    if (eqs.some(e => String(e.nom).toLowerCase() === nom.toLowerCase())) return sendJSON(res, 400, { error: 'Ce nom d’équipe existe déjà.' });
    const eid = (await db.prepare('INSERT INTO tracker_equipes (seance_id, nom, ordre) VALUES (?,?,?)').run(s.id, nom, eqs.length + 1)).lastInsertRowid;
    const ordre = parseJSON(s.ordre_json, []); ordre.push(eid);
    await db.prepare('UPDATE tracker_seances SET ordre_json=? WHERE id=?').run(JSON.stringify(ordre), s.id);
    sendJSON(res, 200, { ok: true, id: eid });
  });
  route('DELETE', '/api/tracker/seances/:id/equipes/:eid', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const s = await chargerSeance(ctx, params.id);
    if (!s) return sendJSON(res, 404, { error: 'Séance introuvable.' });
    const eqs = await db.prepare('SELECT id FROM tracker_equipes WHERE seance_id=?').all(s.id);
    if (eqs.length <= 2) return sendJSON(res, 400, { error: 'Il faut au moins deux équipes.' });
    const joue = await db.prepare('SELECT 1 AS x FROM tracker_matchs WHERE seance_id=? AND (equipe_a_id=? OR equipe_b_id=?)').get(s.id, params.eid, params.eid);
    if (joue) return sendJSON(res, 409, { error: 'Cette équipe a déjà joué un match : elle ne peut plus être supprimée.' });
    await db.prepare('UPDATE tracker_seance_presents SET equipe_id=NULL WHERE seance_id=? AND equipe_id=?').run(s.id, params.eid);
    await db.prepare('DELETE FROM tracker_equipes WHERE id=? AND seance_id=?').run(params.eid, s.id);
    const ordre = parseJSON(s.ordre_json, []).filter(id => Number(id) !== Number(params.eid));
    await db.prepare('UPDATE tracker_seances SET ordre_json=? WHERE id=?').run(JSON.stringify(ordre), s.id);
    await resyncMatchsSansScore(s);
    sendJSON(res, 200, { ok: true });
  });

  /* ---------- présents de la séance ---------- */
  route('PUT', '/api/tracker/seances/:id/presents', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const s = await chargerSeance(ctx, params.id);
    if (!s) return sendJSON(res, 404, { error: 'Séance introuvable.' });
    const liste = Array.isArray(body && body.presents) ? body.presents : null;
    if (!liste) return sendJSON(res, 400, { error: 'Liste des présents requise.' });
    const valides = new Set((await db.prepare('SELECT id FROM tracker_joueurs WHERE initiative_id=? AND actif=1 AND majeur_atteste=1').all(ctx.init.id)).map(r => Number(r.id)));
    const vus = new Set(), propres = [];
    for (const x of liste) {
      const jid = Number(x.joueur_id);
      if (!valides.has(jid)) return sendJSON(res, 400, { error: 'Un des joueurs n’existe pas dans votre liste (ou n’a pas d’attestation de majorité).' });
      if (vus.has(jid)) return sendJSON(res, 400, { error: 'Un joueur est listé deux fois.' });
      vus.add(jid); propres.push({ jid, poste: poste(x.poste_joue) });
    }
    const existants = await db.prepare('SELECT joueur_id FROM tracker_seance_presents WHERE seance_id=?').all(s.id);
    let retires = 0;
    for (const e of existants) {
      if (vus.has(Number(e.joueur_id))) continue;
      const aJoue = await db.prepare('SELECT 1 AS x FROM tracker_notes n JOIN tracker_matchs m ON m.id=n.match_id WHERE m.seance_id=? AND n.joueur_id=?').get(s.id, e.joueur_id);
      if (aJoue) { const j = await db.prepare('SELECT nom, prenom FROM tracker_joueurs WHERE id=?').get(e.joueur_id); return sendJSON(res, 409, { error: `${jnom(j)} a déjà joué un match de cette séance : il ne peut plus être retiré des présents.` }); }
      await db.prepare('DELETE FROM tracker_seance_presents WHERE seance_id=? AND joueur_id=?').run(s.id, e.joueur_id); retires++;
    }
    const dejaIds = new Set(existants.map(e => Number(e.joueur_id)));
    for (const p of propres) {
      if (dejaIds.has(p.jid)) await db.prepare('UPDATE tracker_seance_presents SET poste_joue=? WHERE seance_id=? AND joueur_id=?').run(p.poste, s.id, p.jid);
      else await db.prepare('INSERT INTO tracker_seance_presents (seance_id, joueur_id, poste_joue) VALUES (?,?,?)').run(s.id, p.jid, p.poste);
    }
    await resyncMatchsSansScore(s);
    await journal(ctx, 'presents_seance', s.date_seance, `${propres.length} présent(s)${retires ? `, ${retires} retiré(s)` : ''}`);
    sendJSON(res, 200, { ok: true, presents: propres.length, retires });
  });

  /* Proposition d'équipe pour un joueur (retardataire) : celle qui manque de joueurs à son poste. */
  route('GET', '/api/tracker/seances/:id/suggestion', async (req, res, params, body, query) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const s = await chargerSeance(ctx, params.id);
    if (!s) return sendJSON(res, 404, { error: 'Séance introuvable.' });
    const j = await db.prepare('SELECT id, poste_habituel FROM tracker_joueurs WHERE id=? AND initiative_id=? AND actif=1').get(query && query.joueur_id, ctx.init.id);
    const p = poste(query && query.poste) || (j && poste(j.poste_habituel)) || '';
    const eqs = await equipesAvecJoueurs(s, j ? j.id : null);
    sendJSON(res, 200, { suggestion: calcul.suggererEquipe(eqs, p), poste: p });
  });

  /* Joueur arrivé en retard : ajouté aux présents avec son poste du jour, équipe choisie (sinon proposée automatiquement). */
  route('POST', '/api/tracker/seances/:id/retardataire', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const s = await chargerSeance(ctx, params.id);
    if (!s) return sendJSON(res, 404, { error: 'Séance introuvable.' });
    body = body || {};
    const j = await db.prepare('SELECT id, nom, prenom, poste_habituel FROM tracker_joueurs WHERE id=? AND initiative_id=? AND actif=1 AND majeur_atteste=1').get(body.joueur_id, ctx.init.id);
    if (!j) return sendJSON(res, 400, { error: 'Joueur introuvable dans votre liste (ou sans attestation de majorité).' });
    if (await db.prepare('SELECT 1 AS x FROM tracker_seance_presents WHERE seance_id=? AND joueur_id=?').get(s.id, j.id)) return sendJSON(res, 409, { error: 'Ce joueur est déjà présent.' });
    const p = poste(body.poste_joue) || poste(j.poste_habituel) || '';
    const eqs = await equipesAvecJoueurs(s, null);
    const sugg = calcul.suggererEquipe(eqs, p);
    let equipeId = body.equipe_id ? Number(body.equipe_id) : (sugg ? sugg.equipe_id : null);
    if (equipeId && !eqs.some(e => Number(e.id) === equipeId)) return sendJSON(res, 400, { error: 'Équipe inconnue.' });
    const nbMatchs = (await db.prepare('SELECT COUNT(*) AS n FROM tracker_matchs WHERE seance_id=?').get(s.id)).n;
    await db.prepare('INSERT INTO tracker_seance_presents (seance_id, joueur_id, equipe_id, poste_joue, arrive_en_retard) VALUES (?,?,?,?,1)').run(s.id, j.id, equipeId, p || null);
    await resyncMatchsSansScore(s);
    await journal(ctx, 'retardataire_seance', jnom(j), `${s.date_seance} · ${sugg && equipeId === sugg.equipe_id ? 'équipe proposée acceptée' : 'équipe choisie'}`);
    sendJSON(res, 200, { ok: true, equipe_id: equipeId, suggestion: sugg, matchs_deja_joues: Number(nbMatchs) });
  });

  /* Répartition des présents : un joueur d'une équipe à l'autre (à tout moment), ou « équilibrer » tout le monde. */
  route('PUT', '/api/tracker/seances/:id/joueurs/:jid/equipe', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const s = await chargerSeance(ctx, params.id);
    if (!s) return sendJSON(res, 404, { error: 'Séance introuvable.' });
    const p = await db.prepare('SELECT joueur_id, equipe_id FROM tracker_seance_presents WHERE seance_id=? AND joueur_id=?').get(s.id, params.jid);
    if (!p) return sendJSON(res, 404, { error: 'Ce joueur n’est pas présent à cette séance.' });
    const cible = body && body.equipe_id ? Number(body.equipe_id) : null;
    if (cible && !(await db.prepare('SELECT 1 AS x FROM tracker_equipes WHERE id=? AND seance_id=?').get(cible, s.id))) return sendJSON(res, 400, { error: 'Équipe inconnue.' });
    if (Number(p.equipe_id || 0) === Number(cible || 0)) return sendJSON(res, 200, { ok: true, inchange: true });
    /* Changement d'équipe APRÈS le début des matchs (hors première affectation) : 1 point de fair-play automatique sur son prochain match. */
    const matchsCommences = Number((await db.prepare('SELECT COUNT(*) AS n FROM tracker_matchs WHERE seance_id=?').get(s.id)).n) > 0;
    const bonus = matchsCommences && p.equipe_id && cible ? 1 : 0;
    await db.prepare('UPDATE tracker_seance_presents SET equipe_id=?, bonus_transfert=bonus_transfert+? WHERE seance_id=? AND joueur_id=?').run(cible, bonus, s.id, params.jid);
    await resyncMatchsSansScore(s);
    const j = await db.prepare('SELECT nom, prenom FROM tracker_joueurs WHERE id=?').get(params.jid);
    await journal(ctx, 'changement_equipe', jnom(j), `${s.date_seance}${bonus ? ' · +1 point de fair-play' : ''}`);
    sendJSON(res, 200, { ok: true, bonus_fair_play: bonus });
  });

  route('POST', '/api/tracker/seances/:id/equilibrer', async (req, res, params) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const s = await chargerSeance(ctx, params.id);
    if (!s) return sendJSON(res, 404, { error: 'Séance introuvable.' });
    if (Number((await db.prepare('SELECT COUNT(*) AS n FROM tracker_matchs WHERE seance_id=?').get(s.id)).n) > 0) return sendJSON(res, 409, { error: 'Les matchs ont commencé : déplacez les joueurs un par un (le point de fair-play automatique s’applique).' });
    const eqs = await db.prepare('SELECT id FROM tracker_equipes WHERE seance_id=? ORDER BY ordre, id').all(s.id);
    const pres = await db.prepare('SELECT joueur_id, poste_joue FROM tracker_seance_presents WHERE seance_id=?').all(s.id);
    if (!pres.length) return sendJSON(res, 400, { error: 'Aucun présent à répartir.' });
    const aff = calcul.equilibrer(pres.map(p => ({ joueur_id: p.joueur_id, poste: p.poste_joue || '' })), eqs.map(e => Number(e.id)));
    for (const [jid, eid] of Object.entries(aff)) await db.prepare('UPDATE tracker_seance_presents SET equipe_id=? WHERE seance_id=? AND joueur_id=?').run(eid, s.id, jid);
    await journal(ctx, 'equipes_equilibrees', s.date_seance, `${pres.length} joueur(s)`);
    sendJSON(res, 200, { ok: true });
  });

  /* ---------- matchs de la séance ---------- */
  route('POST', '/api/tracker/seances/:id/matchs', async (req, res, params, body) => {
    const ctx = await acces(req, res); if (!ctx) return;
    const s = await chargerSeance(ctx, params.id);
    if (!s) return sendJSON(res, 404, { error: 'Séance introuvable.' });
    body = body || {};
    const d = await detail(ctx, s);
    let a = Number(body.equipe_a_id), b = Number(body.equipe_b_id);
    if (body.auto) {
      if (d.etat.attend_score) return sendJSON(res, 409, { error: d.etat.raison });
      if (!d.etat.prochain) return sendJSON(res, 409, { error: d.etat.raison || 'Aucune affiche proposée : choisissez les deux équipes.' });
      a = d.etat.prochain[0].equipe_id; b = d.etat.prochain[1].equipe_id;
    }
    const ea = d.equipes.find(e => Number(e.id) === a), eb = d.equipes.find(e => Number(e.id) === b);
    if (!ea || !eb || a === b) return sendJSON(res, 400, { error: 'Choisissez deux équipes différentes de cette séance.' });
    for (const e of [ea, eb]) if (!d.presents.some(p => Number(p.equipe_id) === Number(e.id))) return sendJSON(res, 400, { error: `${e.nom} n’a aucun joueur : répartissez d’abord les présents.` });
    const ordreSeance = d.matchs.length + 1;
    const mid = (await db.prepare(`INSERT INTO tracker_matchs (initiative_id, date_match, categorie, seance_id, equipe_a_id, equipe_b_id, ordre_seance, equipe_a, equipe_b, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(ctx.init.id, s.date_seance, 'entrainement', s.id, a, b, ordreSeance, ea.nom, eb.nom, ctx.user.id)).lastInsertRowid;
    const pres = await db.prepare('SELECT joueur_id, equipe_id, poste_joue, arrive_en_retard, bonus_transfert FROM tracker_seance_presents WHERE seance_id=?').all(s.id);
    let joueurs = 0;
    for (const p of pres) {
      if (!p.equipe_id || ![a, b].includes(Number(p.equipe_id))) continue;
      await ajouterNote(mid, p, Number(p.equipe_id) === a ? ea.nom : eb.nom, s.id); joueurs++;
    }
    await journal(ctx, 'match_seance', `${ea.nom} contre ${eb.nom}`, `${s.date_seance} · match n°${ordreSeance} · ${joueurs} joueur(s)`);
    sendJSON(res, 200, { ok: true, id: mid, joueurs });
  });
};
