/* ═══════════════════════════════════════════════════════
   server/cr-rappel.js — Cartouche « Faites le compte-rendu de votre événement » à la connexion (2026-11-21, demande explicite)

   « Ne pas faire uniquement une notification : faire réellement apparaître une cartouche, à la prochaine connexion, avec un bouton Ignorer,
     me le rappeler plus tard ou ne plus afficher. Ne plus afficher = plus aucun rappel pour cet événement. »

   Constat à l'origine : la relance du lendemain (notification + e-mail, crRelancerCreateurs dans index.js) n'est pas toujours vue — un créateur
   avait deux notifications « Bravo pour… » jamais ouvertes. La cartouche est le rappel qu'on ne peut pas manquer.

   Qui voit quoi : le CRÉATEUR d'un événement terminé (date de fin, sinon date de début, STRICTEMENT avant aujourd'hui, heure de Paris), terminé à partir
   de CR_LANCEMENT (comme la relance : jamais d'avalanche sur les très vieux événements), ni brouillon ni annulé, dont le compte-rendu n'est pas
   PUBLIÉ (un brouillon commencé reste proposé : « terminer »). Comptes démo : jamais.

   Les trois choix (par événement, mémorisés ici, table cr_rappels) :
   · Ignorer              → côté navigateur seulement (session) : la cartouche revient à la prochaine connexion / nouvelle session ;
   · Me le rappeler plus tard → cr_rappels.etat='report', report_jusqua = maintenant + 3 jours ;
   · Ne plus afficher     → cr_rappels.etat='masque' : plus jamais de cartouche pour cet événement, ET la relance automatique (cron) est
                            aussi coupée (evenements.cr_relance_at renseigné) : « pour cet événement, il n'y aura plus de rappel ».
   Publier le compte-rendu éteint tout, naturellement (la condition « non publié » n'est plus remplie).

   Table cr_rappels (user_id, evenement_id) : créée à la volée (CREATE TABLE IF NOT EXISTS), sans clé étrangère (users.id est du texte sur
   Postgres : voir project_bug_bigserial_types), sans AUTOINCREMENT.
   ═══════════════════════════════════════════════════════ */

const JOUR = 86400000;
const REPORT_JOURS = 3;
const MAX_AFFICHES = 5;
const ACTIONS = new Set(['plus_tard', 'ne_plus_afficher']);

let tablePrete = null;
function preparerTable(db) {
  if (!tablePrete) {
    tablePrete = Promise.resolve(db.prepare(`CREATE TABLE IF NOT EXISTS cr_rappels (
      user_id INTEGER NOT NULL,
      evenement_id INTEGER NOT NULL,
      etat TEXT NOT NULL DEFAULT 'report',
      report_jusqua TEXT,
      updated_at TEXT,
      PRIMARY KEY (user_id, evenement_id)
    )`).run()).catch(e => { tablePrete = null; throw e; });
  }
  return tablePrete;
}

const tempsMs = v => { const t = v ? new Date(v).getTime() : 0; return Number.isFinite(t) ? t : 0; };

/* Événements à proposer à ce créateur maintenant (liste déjà filtrée par ses choix). `auj` = date du jour, heure de Paris (AAAA-MM-JJ). */
async function aProposer(db, { userId, auj, lancement, maintenant = Date.now() }) {
  await preparerTable(db);
  const fin = "SUBSTR(COALESCE(NULLIF(e.date_fin,''), e.date_evt),1,10)";
  const rows = await db.prepare(`SELECT e.id, e.titre, e.date_evt, e.date_fin,
        (SELECT COUNT(*) FROM evenement_comptes_rendus c WHERE c.evenement_id=e.id) AS nb_brouillons
      FROM evenements e
      WHERE e.owner_user_id=? AND ${fin} < ? AND ${fin} >= ? AND ${fin} <> ''
        AND COALESCE(e.statut,'') NOT IN ('brouillon','annule','annulé')
        AND NOT EXISTS (SELECT 1 FROM evenement_comptes_rendus c WHERE c.evenement_id=e.id AND c.statut='publie')
      ORDER BY ${fin} DESC, e.id DESC LIMIT 30`).all(userId, auj, lancement);
  if (!rows.length) return [];
  const choix = await db.prepare("SELECT evenement_id, etat, report_jusqua FROM cr_rappels WHERE user_id=?").all(userId);
  const parEvt = new Map(choix.map(c => [Number(c.evenement_id), c]));
  return rows.filter(r => {
    const c = parEvt.get(Number(r.id));
    if (!c) return true;
    if (c.etat === 'masque') return false;
    return tempsMs(c.report_jusqua) <= maintenant; // « plus tard » : de retour une fois le délai écoulé
  }).slice(0, MAX_AFFICHES).map(r => ({
    id: Number(r.id),
    titre: r.titre || 'Votre événement',
    date: String(r.date_fin || r.date_evt || '').slice(0, 10),
    brouillon: Number(r.nb_brouillons) > 0,
    lien: 'compte-rendu.html?evt=' + Number(r.id)
  }));
}

/* Enregistre le choix pour chaque événement DE CE CRÉATEUR (les autres identifiants sont ignorés). Retourne le nombre d'événements traités. */
async function enregistrerChoix(db, { userId, action, ids, maintenant = Date.now() }) {
  if (!ACTIONS.has(action)) throw new Error('action inconnue');
  await preparerTable(db);
  const propres = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 20);
  const iso = new Date(maintenant).toISOString();
  const jusqua = action === 'plus_tard' ? new Date(maintenant + REPORT_JOURS * JOUR).toISOString() : null;
  const etat = action === 'plus_tard' ? 'report' : 'masque';
  let nb = 0;
  for (const id of propres) {
    const evt = await db.prepare("SELECT id FROM evenements WHERE id=? AND owner_user_id=?").get(id, userId);
    if (!evt) continue;
    const existe = await db.prepare("SELECT 1 AS x FROM cr_rappels WHERE user_id=? AND evenement_id=?").get(userId, id);
    if (existe) await db.prepare("UPDATE cr_rappels SET etat=?, report_jusqua=?, updated_at=? WHERE user_id=? AND evenement_id=?").run(etat, jusqua, iso, userId, id);
    else await db.prepare("INSERT INTO cr_rappels (user_id, evenement_id, etat, report_jusqua, updated_at) VALUES (?,?,?,?,?)").run(userId, id, etat, jusqua, iso);
    /* « Ne plus afficher » coupe aussi la relance automatique du lendemain (une seule relance par événement, déjà conçue ainsi). */
    if (action === 'ne_plus_afficher') await db.prepare("UPDATE evenements SET cr_relance_at=COALESCE(cr_relance_at, ?) WHERE id=?").run(iso, id);
    nb++;
  }
  return nb;
}

function register({ route, db, sendJSON, getCurrentUser, SEC, dateParisISO, lancement }) {
  route("GET", "/api/cr-rappel", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    try {
      const u = await db.prepare("SELECT is_demo FROM users WHERE id=?").get(user.id);
      if (u && u.is_demo && u.is_demo !== '0') return sendJSON(res, 200, { evenements: [] });
      const evenements = await aProposer(db, { userId: user.id, auj: dateParisISO(), lancement });
      sendJSON(res, 200, { evenements, report_jours: REPORT_JOURS });
    } catch (e) { sendJSON(res, 500, SEC.safeError(e, "cr-rappel")); }
  });

  route("POST", "/api/cr-rappel/action", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const action = body && body.action;
    if (!ACTIONS.has(action)) return sendJSON(res, 400, { error: "Choix inconnu." });
    try {
      const nb = await enregistrerChoix(db, { userId: user.id, action, ids: body.evenement_ids });
      sendJSON(res, 200, { ok: true, traites: nb });
    } catch (e) { sendJSON(res, 500, SEC.safeError(e, "cr-rappel-action")); }
  });
}

module.exports = { register, aProposer, enregistrerChoix, REPORT_JOURS, MAX_AFFICHES };
