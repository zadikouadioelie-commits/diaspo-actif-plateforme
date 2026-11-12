/* ===========================================================
   server/newsletter-admin.js — Newsletter des initiatives (2026-11-12), étape N5 : suspension et journal pour l'administration
   ===========================================================
   Règles :
   - Réservé aux comptes « administrateur ». Aucune adresse d'abonné n'est jamais renvoyée : journal et signalements sont AGRÉGÉS
     (nombres par newsletter). L'administration lit le texte de la newsletter signalée, qui est le contenu de la boutique, pas une donnée personnelle.
   - Suspendre une boutique bloque ses tests et ses envois (voir newsletter-campagnes.js) ; ses brouillons, ses abonnés et ses statistiques restent intacts.
     Le motif est obligatoire et montré à la boutique. La lever est immédiate.
   - Aucun envoi d'e-mail ici, aucun paiement.
   Lancer les tests : node --test tests/newsletter-admin.test.js
   =========================================================== */
'use strict';

const MOTIF_MIN = 5;
const MOTIF_MAX = 300;
const LIMITE_JOURNAL = 100;

const num = (v) => Number(v) || 0;

/* Suspension en cours d'une boutique (ou null). Partagé avec newsletter-campagnes.js. */
async function suspensionDe(db, initiativeId) {
  const s = await db.prepare('SELECT motif, created_at FROM nl_suspensions WHERE initiative_id=?').get(Number(initiativeId));
  return s ? { motif: s.motif, depuis: s.created_at } : null;
}

function enregistrerAdmin({ route, db, getCurrentUser, sendJSON }) {
  async function admin(req, res) {
    const user = await getCurrentUser(req);
    if (!user || user.role !== 'administrateur') { sendJSON(res, 403, { error: "Réservé à l'administration." }); return null; }
    return user;
  }

  /* Journal : les dernières newsletters de toutes les boutiques, et celles qui ont reçu au moins un signalement. */
  route('GET', '/api/admin/newsletter/journal', async (req, res) => {
    if (!(await admin(req, res))) return;
    const lignes = await db.prepare(`
      SELECT c.id, c.initiative_id, c.sujet, c.statut, c.mode_envoi, c.nb_destinataires, c.envoye_le,
        COALESCE(NULLIF(i.boutique_nom, ''), i.nom) AS boutique,
        (SELECT COUNT(*) FROM nl_envois e WHERE e.campagne_id=c.id AND e.statut='envoye') AS envoyes,
        (SELECT COUNT(*) FROM nl_envois e WHERE e.campagne_id=c.id AND e.statut='echec') AS echecs,
        (SELECT COUNT(*) FROM nl_signalements s WHERE s.campagne_id=c.id) AS signalements,
        (SELECT COUNT(*) FROM nl_suspensions x WHERE x.initiative_id=c.initiative_id) AS suspendue
      FROM nl_campagnes c JOIN initiatives i ON i.id=c.initiative_id
      WHERE c.statut <> 'brouillon'
      ORDER BY c.id DESC LIMIT ?`).all(LIMITE_JOURNAL);
    const campagnes = lignes.map((c) => ({
      id: c.id, initiative_id: c.initiative_id, boutique: c.boutique, sujet: c.sujet, statut: c.statut, mode_envoi: c.mode_envoi,
      destinataires: num(c.nb_destinataires), envoyes: num(c.envoyes), echecs: num(c.echecs), signalements: num(c.signalements),
      envoye_le: c.envoye_le, boutique_suspendue: num(c.suspendue) > 0,
    }));
    const suspensions = (await db.prepare(`SELECT s.initiative_id, s.motif, s.created_at, COALESCE(NULLIF(i.boutique_nom, ''), i.nom) AS boutique
      FROM nl_suspensions s JOIN initiatives i ON i.id=s.initiative_id ORDER BY s.created_at DESC`).all())
      .map((s) => ({ initiative_id: s.initiative_id, boutique: s.boutique, motif: s.motif, depuis: s.created_at }));
    sendJSON(res, 200, { campagnes, signalees: campagnes.filter((c) => c.signalements > 0).sort((a, b) => b.signalements - a.signalements), suspensions });
  });

  /* Lire le texte d'une newsletter signalée, pour décider. */
  route('GET', '/api/admin/newsletter/campagnes/:cid', async (req, res, params) => {
    if (!(await admin(req, res))) return;
    const c = await db.prepare(`SELECT c.id, c.initiative_id, c.sujet, c.texte, c.statut, c.mode_envoi, c.nb_destinataires, c.envoye_le,
      COALESCE(NULLIF(i.boutique_nom, ''), i.nom) AS boutique
      FROM nl_campagnes c JOIN initiatives i ON i.id=c.initiative_id WHERE c.id=?`).get(Number(params.cid));
    if (!c) return sendJSON(res, 404, { error: 'Newsletter introuvable.' });
    const sig = num(((await db.prepare('SELECT COUNT(*) AS n FROM nl_signalements WHERE campagne_id=?').get(c.id)) || {}).n);
    sendJSON(res, 200, { campagne: { id: c.id, initiative_id: c.initiative_id, boutique: c.boutique, sujet: c.sujet, texte: c.texte, statut: c.statut, mode_envoi: c.mode_envoi, destinataires: num(c.nb_destinataires), envoye_le: c.envoye_le, signalements: sig } });
  });

  route('POST', '/api/admin/newsletter/suspensions', async (req, res, params, body) => {
    const user = await admin(req, res); if (!user) return;
    const initId = Number(body && body.initiative_id);
    const motif = String((body && body.motif) || '').replace(/\s+/g, ' ').trim();
    if (!Number.isInteger(initId) || initId <= 0) return sendJSON(res, 400, { error: 'Boutique non précisée.' });
    if (motif.length < MOTIF_MIN) return sendJSON(res, 400, { error: `Indiquez le motif de la suspension (au moins ${MOTIF_MIN} caractères) : il sera montré à la boutique.` });
    if (motif.length > MOTIF_MAX) return sendJSON(res, 400, { error: `Motif trop long (${MOTIF_MAX} caractères au maximum).` });
    const init = await db.prepare('SELECT id, nom, boutique_nom, owner_user_id FROM initiatives WHERE id=?').get(initId);
    if (!init) return sendJSON(res, 404, { error: 'Boutique introuvable.' });
    const deja = await db.prepare('SELECT initiative_id FROM nl_suspensions WHERE initiative_id=?').get(initId);
    if (deja) await db.prepare('UPDATE nl_suspensions SET motif=?, par_user_id=? WHERE initiative_id=?').run(motif, user.id, initId);
    else await db.prepare('INSERT INTO nl_suspensions (initiative_id, motif, par_user_id) VALUES (?,?,?)').run(initId, motif, user.id);
    if (!deja && init.owner_user_id) {
      await db.prepare('INSERT INTO notifications (user_id, type, titre, contenu, data_json) VALUES (?,?,?,?,?)').run(
        init.owner_user_id, 'newsletter_suspendue', 'Votre newsletter est suspendue',
        `L'envoi de newsletters de ${init.boutique_nom || init.nom} est suspendu par l'équipe Diaspo'Actif. Motif : ${motif}`,
        JSON.stringify({ lien: 'dashboard-initiative.html', initiative_id: initId }));
    }
    sendJSON(res, 200, { ok: true, suspension: await suspensionDe(db, initId) });
  });

  route('DELETE', '/api/admin/newsletter/suspensions/:id', async (req, res, params) => {
    if (!(await admin(req, res))) return;
    const initId = Number(params.id);
    const r = await db.prepare('DELETE FROM nl_suspensions WHERE initiative_id=?').run(initId);
    if (!r || !r.changes) return sendJSON(res, 404, { error: "Cette boutique n'est pas suspendue." });
    const init = await db.prepare('SELECT nom, boutique_nom, owner_user_id FROM initiatives WHERE id=?').get(initId);
    if (init && init.owner_user_id) {
      await db.prepare('INSERT INTO notifications (user_id, type, titre, contenu, data_json) VALUES (?,?,?,?,?)').run(
        init.owner_user_id, 'newsletter_retablie', 'Votre newsletter est rétablie',
        `L'envoi de newsletters de ${init.boutique_nom || init.nom} est de nouveau possible.`,
        JSON.stringify({ lien: 'dashboard-initiative.html', initiative_id: initId }));
    }
    sendJSON(res, 200, { ok: true });
  });
}

module.exports = { enregistrerAdmin, suspensionDe, MOTIF_MIN, MOTIF_MAX };
