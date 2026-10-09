/* ═══════════════════════════════════════════════════════════════════════════
   PROFIL PUBLIC OBLIGATOIRE (2026-10-09, demande explicite)
   « Dès qu'un compte s'inscrit, oriente-le sans possibilité de refuser pour qu'il remplisse son profil
   public : au moins 50 % ; pour les comptes utilisateurs, 100 %. » Et : « les comptes déjà créés qui n'ont
   rien mis dans leur profil public, obligés à la prochaine connexion de remplir ces informations ».

   · Comptes concernés : utilisateur (seuil 100 %), initiative et collectivité (seuil 50 %).
     Exemptés : administrateurs, juniors, partenaires, institutions officielles, comptes démo/masqués.
   · Nouveau compte (créé à partir de DEPUIS) : obligation dès l'inscription.
     Compte plus ancien : obligation seulement si son profil public est VIDE (aucun des champs de
     server/completude.js n'est rempli) — décidé à sa première connexion après la mise en ligne.
   · L'obligation dure jusqu'au seuil, puis s'éteint (état « termine ») : on ne redemande jamais.
   · Pour un utilisateur, « profil public » = ce que sa fiche lui permet réellement de remplir
     (photo, biographie, compétences, résidence, origine, domaine d'activité). Aucune publication
     n'est exigée.
   Le serveur calcule tout ; le navigateur (assets/app.js) n'affiche que ce qu'il reçoit via GET /api/auth/me.
   ═══════════════════════════════════════════════════════════════════════════ */
const Completude = require('./completude');

const SEUIL_UTILISATEUR = 100;
const SEUIL_AUTRES = 50;
const DEPUIS_MS = new Date('2026-10-09T00:00:00+02:00').getTime();
const ROLES = ['utilisateur', 'initiative', 'collectivite'];

const rempli = v => Completude.champRempli(v);
const majuscule = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

function ms(v) {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const s = String(v);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z').getTime() || 0;
}

/* Liste des points du profil public pour ce compte : [{cle, libelle, lien, rempli}] + seuil. */
async function points(db, user) {
  const role = user.role;
  const ligne = await db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
  if (!ligne) return null;

  if (role === 'utilisateur') {
    const items = [
      { cle: 'photo', libelle: 'Votre photo de profil', ok: rempli(ligne.photo_url) },
      { cle: 'bio', libelle: 'Votre biographie', ok: rempli(ligne.bio) },
      { cle: 'competences', libelle: 'Vos compétences', ok: rempli(ligne.competences) },
      { cle: 'residence', libelle: 'Votre ville et votre pays de résidence', ok: rempli(ligne.ville) && rempli(ligne.pays) },
      { cle: 'origine', libelle: "Votre pays d'origine", ok: rempli(ligne.origine1) || rempli(ligne.origine2) },
      { cle: 'domaine', libelle: "Votre domaine d'activité", ok: rempli(ligne.domaine_principal) },
    ].map(i => ({ ...i, lien: `profil.html?completer=${i.cle}` }));
    return { seuil: SEUIL_UTILISATEUR, items, completude: Completude.evaluer('utilisateur', ligne) };
  }

  if (role === 'initiative') {
    const ini = await db.prepare('SELECT * FROM initiatives WHERE owner_user_id=? ORDER BY created_at DESC LIMIT 1').get(user.id);
    if (!ini) return null;
    const ref = encodeURIComponent(ini.slug || ini.id);
    const items = Completude.CRITERES.initiative.map(c => ({
      cle: c.cles[0], libelle: majuscule(c.label),
      ok: c.cles.some(k => rempli(ini[k])),
      lien: `profil.html?completer=champ&champ=${encodeURIComponent(c.cles[0])}&label=${encodeURIComponent(c.label)}`,
    }));
    items.push({ cle: 'origine', libelle: "Le pays d'origine", ok: rempli(ini.origine1) || rempli(ini.origine2) || rempli(ini.pays_origine) || rempli(ligne.origine1) || rempli(ligne.origine2),
      lien: `initiative.html?id=${ref}&completer=origines&version=ordinateur` });
    items.push({ cle: 'domaine', libelle: "Le domaine d'activité", ok: rempli(ini.domaine_principal), lien: 'profil.html?completer=domaine' });
    return { seuil: SEUIL_AUTRES, items, completude: Completude.evaluer('initiative', ini) };
  }

  if (role === 'collectivite') {
    const lien = `profil-collectivite.html?id=${encodeURIComponent(user.id)}&completer=profil`;
    const items = Completude.CRITERES.collectivite.map(c => ({
      cle: c.cles[0], libelle: majuscule(c.label), ok: c.cles.some(k => rempli(ligne[k])), lien,
    }));
    items.push({ cle: 'origine', libelle: "Le pays d'origine", ok: rempli(ligne.pays_origine_institution) || rempli(ligne.origine1), lien: 'confidentialite.html?completer=origine' });
    return { seuil: SEUIL_AUTRES, items, completude: Completude.evaluer('collectivite', ligne) };
  }
  return null;
}

function resume(p) {
  const total = p.items.length;
  const remplis = p.items.filter(i => i.ok).length;
  return {
    seuil: p.seuil, total, remplis,
    pct: total ? Math.round((remplis / total) * 100) : 100,
    points: p.items.map(i => ({ cle: i.cle, libelle: i.libelle, lien: i.lien, ok: !!i.ok })),
  };
}

/* État de l'obligation pour ce compte :
   null                      → rien à faire (non concerné, déjà fait, ou exempté)
   { actif:true, ... }       → obligation en cours (pourcentage, seuil, points)
   { termine:true }          → le seuil vient d'être atteint (renvoyé UNE fois, pour dire merci) */
async function etat(db, userBrut) {
  if (!userBrut || !ROLES.includes(userBrut.role)) return null;
  /* L'objet reçu de la session n'a pas toutes les colonnes (date de création, démo, masqué) : on relit la ligne
     complète — sans quoi un NOUVEAU compte serait pris pour un ancien compte et exempté à tort. */
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(userBrut.id);
  if (!user) return null;
  if (Number(user.is_demo) === 1 || user.is_demo === true || Number(user.compte_masque) === 1) return null;
  const ligne = await db.prepare('SELECT etat FROM profil_obligatoire WHERE user_id=?').get(user.id);
  if (ligne && ligne.etat !== 'requis') return null;

  const p = await points(db, user);
  if (!p) return null;
  const r = resume(p);

  if (!ligne) {
    const nouveau = ms(user.created_at) >= DEPUIS_MS;
    const vide = !p.completude || p.completude.remplis === 0;
    if (!nouveau && !vide) {
      await db.prepare("INSERT INTO profil_obligatoire (user_id, etat) VALUES (?, 'exempt')").run(user.id);
      return null;
    }
    if (r.pct >= r.seuil) {
      await db.prepare("INSERT INTO profil_obligatoire (user_id, etat, termine_at) VALUES (?, 'termine', datetime('now'))").run(user.id);
      return null;
    }
    await db.prepare("INSERT INTO profil_obligatoire (user_id, etat) VALUES (?, 'requis')").run(user.id);
    return { actif: true, ...r };
  }

  if (r.pct >= r.seuil) {
    await db.prepare("UPDATE profil_obligatoire SET etat='termine', termine_at=datetime('now') WHERE user_id=? AND etat='requis'").run(user.id);
    return { termine: true, pct: r.pct, seuil: r.seuil };
  }
  return { actif: true, ...r };
}

module.exports = { etat, points, resume, SEUIL_UTILISATEUR, SEUIL_AUTRES, DEPUIS_MS };
