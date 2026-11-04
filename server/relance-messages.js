/* ═══════════════════════════════════════════════════════════════════════════
   RELANCE PAR E-MAIL D'UN MESSAGE NON LU (2026-11-04, demande explicite)
   « Les gens n'ont pas encore le réflexe d'aller sur Diaspo'Actif regarder leurs messages » :
   quand un message reste NON LU depuis 3 jours, la personne reçoit un e-mail pour l'en avertir.

   Règles :
   - uniquement les messages NON LUS (jamais « lus mais sans réponse »), écrits par une vraie personne :
     ni compte officiel / administrateur, ni message envoyé par une réponse automatique d'initiative ;
   - fenêtre de 3 à 14 jours : à la mise en service, les très vieux messages non lus ne déclenchent pas
     une avalanche d'e-mails ;
   - un seul e-mail par personne et par jour, qui regroupe toutes ses conversations en attente ;
   - jamais deux fois pour le même message (journal messages_relances_email) ;
   - respecte « E-mails non essentiels » (Paramètres) et propose un lien de désabonnement dans l'e-mail ;
   - le TEXTE du message n'apparaît jamais dans l'e-mail (confidentialité) : seulement qui, et depuis quand ;
   - conversations supprimées ou archivées par la personne : ignorées ; comptes supprimés/masqués/démo/suspendus : ignorés.

   Interrupteur : l'envoi réel n'a lieu que si MESSAGES_RELANCES_EMAIL=1 (sinon « à blanc » : on compte, on
   n'envoie rien et on ne consigne rien). Exécuté une fois par jour par /api/cron/messages-relances.
   ═══════════════════════════════════════════════════════════════════════════ */

const JOUR = 86400000;
const DELAI_MS = 3 * JOUR;          // un message non lu depuis 3 jours déclenche la relance
const FENETRE_MAX_MS = 14 * JOUR;   // au-delà, on n'ose plus relancer (pas d'avalanche à l'activation)
const ANTI_DOUBLE_MS = 20 * 3600 * 1000; // une personne ne reçoit pas deux e-mails en moins de 20 h

const sqlDate = t => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function ms(v) {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const s = String(v);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z').getTime() || 0;
}

function depuis(t, maintenant) {
  const j = Math.max(1, Math.floor((maintenant - ms(t)) / JOUR));
  return j <= 1 ? 'hier' : `il y a ${j} jours`;
}

function lienDesinscription(origine, signAuthToken, userId) {
  const t = signAuthToken({ k: 'messages_mail_off', u: Number(userId), exp: Math.floor(Date.now() / 1000) + 400 * 86400 });
  return `${origine}/api/relances-messages/stop?t=${encodeURIComponent(t)}`;
}

/* Sujet + corps de l'e-mail. `convs` = [{ id, nom, depuis }] (une ligne par conversation en attente). */
function composer({ prenom, convs, origine, stop }) {
  const un = convs.length === 1;
  const objet = un ? `${convs[0].nom} vous a écrit sur Diaspo'Actif` : `Vous avez ${convs.length} messages en attente sur Diaspo'Actif`;
  const lien = un ? `${origine}/messagerie.html?conv=${convs[0].id}` : `${origine}/messagerie.html`;
  const lignes = convs.slice(0, 8).map(c => `<li style="margin:0 0 6px;"><strong>${esc(c.nom)}</strong> — ${esc(c.depuis)}</li>`).join('');
  const reste = convs.length > 8 ? `<p style="margin:0 0 14px;color:#64748b;">… et ${convs.length - 8} autre${convs.length - 8 > 1 ? 's' : ''}.</p>` : '';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#0B1A33;color:#E3C06E;padding:16px 22px;font-weight:800;letter-spacing:.06em;">DIASPO'ACTIF · MESSAGERIE</div>
    <div style="padding:22px;color:#1e293b;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 14px;">Bonjour${prenom ? ' ' + esc(prenom) : ''},</p>
      <p style="margin:0 0 14px;">${un ? 'Un message vous attend' : 'Des messages vous attendent'} sur Diaspo'Actif et ${un ? "n'a" : "n'ont"} pas encore été lu${un ? '' : 's'} :</p>
      <ul style="margin:0 0 14px;padding-left:20px;">${lignes}</ul>${reste}
      <p style="margin:22px 0;"><a href="${esc(lien)}" style="background:#E3C06E;color:#1a1202;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:10px;display:inline-block;">Lire ${un ? 'mon message' : 'mes messages'}</a></p>
      <p style="margin:0;color:#64748b;font-size:13px;">Une réponse rapide fait souvent la différence : la personne qui vous a écrit attend de vos nouvelles.</p>
    </div>
    <div style="padding:14px 22px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.5;">Vous recevez cet e-mail parce que des messages sont restés sans lecture sur votre compte Diaspo'Actif.
      <a href="${esc(stop)}" style="color:#64748b;">Ne plus recevoir ces rappels</a></div></div>`;
  return { objet, html, lien };
}

/* `nomAffichage(userId)` = nomCompteAffichage de server/index.js ; `maintenant` ne sert qu'aux tests ;
   `envoiReel` force l'interrupteur (tests) — sinon MESSAGES_RELANCES_EMAIL=1. */
async function relancerMessagesNonLus({ db, sendEmail, signAuthToken, nomAffichage, origine, maintenant = Date.now(), envoiReel }) {
  const reel = envoiReel !== undefined ? !!envoiReel : process.env.MESSAGES_RELANCES_EMAIL === '1';
  const bilan = { a_blanc: !reel, messages: 0, personnes: 0, emails: 0, ignores: 0, deja_relances: 0, echecs: 0 };

  const apres = sqlDate(maintenant - FENETRE_MAX_MS), avant = sqlDate(maintenant - DELAI_MS);
  const lignes = await db.prepare(
    `SELECT m.id, m.conversation_id, m.sender_id, m.created_at, c.user1_id, c.user2_id,
            c.deleted_u1, c.deleted_u2, c.archive_u1, c.archive_u2
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
       JOIN users s ON s.id = m.sender_id
      WHERE m.lu = 0 AND m.created_at <= ? AND m.created_at >= ?
        AND COALESCE(s.is_official, 0) = 0 AND s.role != 'administrateur' AND s.nom != 'Compte supprimé'
        AND m.id NOT IN (SELECT message_id FROM messages_auto_envois WHERE message_id IS NOT NULL)
      ORDER BY m.id`
  ).all(avant, apres);

  /* Regroupement : personne destinataire → conversation → messages non lus de l'autre. */
  const parPersonne = new Map();
  for (const l of lignes) {
    const u1 = Number(l.user1_id), u2 = Number(l.user2_id), exp = Number(l.sender_id);
    if (exp !== u1 && exp !== u2) continue;
    const dest = exp === u1 ? u2 : u1;
    const sens1 = dest === u1;
    if (Number(sens1 ? l.deleted_u1 : l.deleted_u2) || Number(sens1 ? l.archive_u1 : l.archive_u2)) continue;
    bilan.messages++;
    if (!parPersonne.has(dest)) parPersonne.set(dest, new Map());
    const convs = parPersonne.get(dest), cid = Number(l.conversation_id);
    const c = convs.get(cid) || { id: cid, expediteur: exp, premier: l.created_at, dernierId: 0 };
    c.dernierId = Math.max(c.dernierId, Number(l.id));
    convs.set(cid, c);
  }

  for (const [uid, convs] of parPersonne) {
    const u = await db.prepare(
      `SELECT id, prenom, email, notif_emails_non_essentiels FROM users
        WHERE id = ? AND (is_demo IS NULL OR is_demo = FALSE) AND nom != 'Compte supprimé'
          AND (compte_masque IS NULL OR compte_masque = 0) AND COALESCE(suspendu_definitif, 0) = 0`
    ).get(uid);
    if (!u) continue;

    /* Jamais deux fois pour le même message : on ne garde que les conversations dont un message plus récent
       que le dernier consigné attend encore. */
    const neuves = [];
    for (const c of convs.values()) {
      const dejaFait = await db.prepare('SELECT MAX(message_id) AS m FROM messages_relances_email WHERE user_id = ? AND conversation_id = ?').get(uid, c.id);
      if (dejaFait && Number(dejaFait.m) >= c.dernierId) { bilan.deja_relances++; continue; }
      neuves.push(c);
    }
    if (!neuves.length) continue;
    bilan.personnes++;
    if (!reel) continue;

    const prefOff = u.notif_emails_non_essentiels != null && !Number(u.notif_emails_non_essentiels);
    const consigner = async (c, statut) => db.prepare('INSERT INTO messages_relances_email (user_id, conversation_id, message_id, statut) VALUES (?,?,?,?)').run(uid, c.id, c.dernierId, statut);
    if (prefOff || !u.email) { for (const c of neuves) await consigner(c, 'ignore'); bilan.ignores++; continue; }

    const recent = await db.prepare("SELECT 1 AS x FROM messages_relances_email WHERE user_id = ? AND statut = 'envoye' AND created_at >= ? LIMIT 1").get(uid, sqlDate(maintenant - ANTI_DOUBLE_MS));
    if (recent) continue; // déjà relancé aujourd'hui : on reprendra demain

    const affichees = [];
    for (const c of neuves) affichees.push({ id: c.id, nom: (await nomAffichage(c.expediteur)) || 'Un membre', depuis: depuis(c.premier, maintenant) });
    const { objet, html } = composer({ prenom: u.prenom, convs: affichees, origine, stop: lienDesinscription(origine, signAuthToken, uid) });

    /* Verrou d'abord (les lignes disent « déjà fait »), envoi ensuite ; en cas d'échec on retire les lignes pour réessayer demain. */
    for (const c of neuves) await consigner(c, 'envoye');
    let r;
    try { r = await sendEmail({ to: u.email, subject: objet.slice(0, 150), html }); } catch (e) { r = { ok: false, error: e.message }; }
    if (r && r.ok) bilan.emails++;
    else {
      for (const c of neuves) await db.prepare("DELETE FROM messages_relances_email WHERE user_id = ? AND conversation_id = ? AND message_id = ? AND statut = 'envoye'").run(uid, c.id, c.dernierId);
      bilan.echecs++;
    }
  }
  return bilan;
}

module.exports = { relancerMessagesNonLus, composer, lienDesinscription, DELAI_MS, FENETRE_MAX_MS };
