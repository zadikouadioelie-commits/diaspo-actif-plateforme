/* ═════════════════════════════════════════════════════════════════
   Documents légaux, preuve d'acceptation, droits des personnes, registre des incidents (2026-10-12, demande explicite)
   • Versions des documents (CGU, confidentialité, charte, CGV) : valeurs par défaut ici, historique et publication d'une
     nouvelle version dans la table legal_versions (administration).
   • Preuve d'acceptation : une ligne par compte, document ET version (table legal_acceptations).
   • Droits des personnes (RGPD) : demandes d'accès, portabilité, rectification, opposition, limitation, retrait d'un
     consentement — table demandes_donnees, délai légal de réponse d'un mois.
   • Registre des incidents de sécurité (RGPD art. 33) : table incidents_securite, tenu par l'administration.
   Rien n'est jamais supprimé : l'historique des versions et des acceptations est conservé comme preuve.
   ═════════════════════════════════════════════════════════════════ */
const DOCUMENTS = [
  { cle: 'cgu', titre: "Conditions générales d'utilisation", url: 'cgu.html', version: '2026-10-12' },
  { cle: 'confidentialite', titre: 'Politique de confidentialité', url: 'politique-confidentialite.html', version: '2026-10-12' },
  { cle: 'charte', titre: 'Charte institutionnelle', url: 'charte.html', version: '2026-10-12' },
  { cle: 'cgv', titre: 'Conditions générales de vente', url: 'cgv.html', version: '2026-10-12' }
];
/* Acceptés à la création du compte. Les CGV s'acceptent à l'achat, pas à l'inscription. */
const A_L_INSCRIPTION = ['cgu', 'confidentialite', 'charte'];
const TYPES_DROITS = {
  acces: "Accès à mes données (copie)",
  portabilite: 'Portabilité (fichier réutilisable)',
  rectification: 'Rectification de mes données',
  opposition: 'Opposition à un traitement',
  limitation: "Limitation d'un traitement",
  retrait_consentement: "Retrait d'un consentement facultatif"
};
const STATUTS_DEMANDE = ['nouvelle', 'en_cours', 'traitee', 'refusee'];
const DELAI_REPONSE_JOURS = 30;
const GRAVITES = ['faible', 'moyenne', 'elevee', 'critique'];
const STATUTS_INCIDENT = ['ouvert', 'en_cours', 'clos'];

module.exports = function creerLegal(deps) {
  const { db, logError } = deps;
  let cache = null, cacheAt = 0;
  const txt = (v, max) => { const s = String(v == null ? '' : v).trim().slice(0, max || 2000); return s || null; };
  const bool = v => (v === true || v === 1 || v === '1' || v === 'true') ? 1 : 0;
  const jour = v => { const s = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
  const ajouterJours = (iso, n) => { const d = new Date(String(iso).replace(' ', 'T')); if (isNaN(d.getTime())) return null; d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  /* ── Versions ── */
  async function versionsCourantes() {
    if (cache && Date.now() - cacheAt < 60000) return cache;
    let rows = [];
    try { rows = await db.prepare("SELECT id, document, version, publiee_le, note, reacceptation FROM legal_versions ORDER BY id DESC").all(); } catch (e) { logError && logError(e, 'legal versions'); }
    const parDoc = {}; rows.forEach(r => { if (!parDoc[r.document]) parDoc[r.document] = r; });
    cache = DOCUMENTS.map(d => {
      const r = parDoc[d.cle];
      return { cle: d.cle, titre: d.titre, url: d.url, version: r ? r.version : d.version, publiee_le: r ? (r.publiee_le || d.version) : d.version, note: r ? (r.note || null) : null,
        reacceptation: r ? !!Number(r.reacceptation) : false, a_l_inscription: A_L_INSCRIPTION.includes(d.cle) };
    });
    cacheAt = Date.now(); return cache;
  }
  const viderCache = () => { cache = null; };

  async function publierVersion(document, version, note, reacceptation, adminId) {
    const d = DOCUMENTS.find(x => x.cle === document);
    if (!d) return { erreur: 'Document inconnu.' };
    const v = txt(version, 40); if (!v) return { erreur: 'La version est obligatoire (par exemple 2026-11-05).' };
    const actuelle = (await versionsCourantes()).find(x => x.cle === document);
    if (actuelle && actuelle.version === v) return { erreur: 'Cette version est déjà la version en vigueur.' };
    const deja = await db.prepare("SELECT id FROM legal_versions WHERE document=? AND version=?").get(document, v);
    if (deja) return { erreur: 'Cette version a déjà été publiée.' };
    await db.prepare("INSERT INTO legal_versions (document, version, publiee_le, note, reacceptation, publiee_par) VALUES (?,?,?,?,?,?)")
      .run(document, v, new Date().toISOString().slice(0, 10), txt(note, 1000), bool(reacceptation), adminId || null);
    viderCache(); return { ok: true };
  }
  async function historiqueVersions() { return db.prepare("SELECT v.id, v.document, v.version, v.publiee_le, v.note, v.reacceptation, u.nom AS par_nom FROM legal_versions v LEFT JOIN users u ON u.id=v.publiee_par ORDER BY v.id DESC").all(); }

  /* ── Acceptations ── */
  async function enregistrer(userId, cles, contexte) {
    const cur = await versionsCourantes(), faites = [];
    for (const cle of (cles || [])) {
      const d = cur.find(x => x.cle === cle); if (!d) continue;
      const deja = await db.prepare("SELECT id FROM legal_acceptations WHERE user_id=? AND document=? AND version=?").get(userId, cle, d.version);
      if (!deja) { await db.prepare("INSERT INTO legal_acceptations (user_id, document, version, contexte) VALUES (?,?,?,?)").run(userId, cle, d.version, txt(contexte, 80)); faites.push(cle); }
    }
    return faites;
  }
  async function mesAcceptations(userId) { return db.prepare("SELECT document, version, accepted_at, contexte FROM legal_acceptations WHERE user_id=? ORDER BY id DESC").all(userId); }
  /* Documents dont la version courante exige une nouvelle acceptation et que ce compte n'a pas encore acceptée. */
  async function aAccepter(userId) {
    const requis = (await versionsCourantes()).filter(d => d.reacceptation);
    if (!requis.length) return [];
    const res = [];
    for (const d of requis) {
      const ok = await db.prepare("SELECT id FROM legal_acceptations WHERE user_id=? AND document=? AND version=?").get(userId, d.cle, d.version);
      if (!ok) res.push({ cle: d.cle, titre: d.titre, url: d.url, version: d.version });
    }
    return res;
  }
  async function statsAcceptations() {
    const cur = await versionsCourantes(), out = {};
    for (const d of cur) { out[d.cle] = Number((await db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM legal_acceptations WHERE document=? AND version=?").get(d.cle, d.version))?.n || 0); }
    return out;
  }

  /* ── Droits des personnes ── */
  async function creerDemande(userId, type, message) {
    if (!TYPES_DROITS[type]) return { erreur: 'Type de demande inconnu.' };
    const ouverte = await db.prepare("SELECT id FROM demandes_donnees WHERE user_id=? AND type=? AND statut IN ('nouvelle','en_cours')").get(userId, type);
    if (ouverte) return { erreur: 'Une demande de ce type est déjà en cours de traitement.' };
    const id = Number((await db.prepare("INSERT INTO demandes_donnees (user_id, type, message) VALUES (?,?,?)").run(userId, type, txt(message, 2000))).lastInsertRowid);
    return { ok: true, id };
  }
  async function mesDemandes(userId) {
    const rows = await db.prepare("SELECT id, type, message, statut, reponse, created_at, traitee_at FROM demandes_donnees WHERE user_id=? ORDER BY id DESC").all(userId);
    return rows.map(r => ({ ...r, libelle: TYPES_DROITS[r.type] || r.type, echeance: ajouterJours(r.created_at, DELAI_REPONSE_JOURS) }));
  }
  async function listerDemandes(statut) {
    const rows = await db.prepare(`SELECT d.id, d.user_id, d.type, d.message, d.statut, d.reponse, d.created_at, d.traitee_at, u.nom, u.prenom, u.email, u.role
      FROM demandes_donnees d LEFT JOIN users u ON u.id=d.user_id ORDER BY d.id DESC LIMIT 500`).all();
    const auj = new Date().toISOString().slice(0, 10);
    return rows.filter(r => !statut || r.statut === statut).map(r => {
      const ech = ajouterJours(r.created_at, DELAI_REPONSE_JOURS);
      return { ...r, libelle: TYPES_DROITS[r.type] || r.type, echeance: ech, en_retard: !!ech && ech < auj && !['traitee', 'refusee'].includes(r.statut) };
    });
  }
  async function traiterDemande(id, statut, reponse, adminId) {
    if (!STATUTS_DEMANDE.includes(statut)) return { erreur: 'Statut invalide.' };
    const d = await db.prepare("SELECT id, user_id, statut FROM demandes_donnees WHERE id=?").get(id);
    if (!d) return { erreur: 'Demande introuvable.', code: 404 };
    const termine = ['traitee', 'refusee'].includes(statut);
    await db.prepare("UPDATE demandes_donnees SET statut=?, reponse=COALESCE(?, reponse), traitee_at=?, traitee_par=? WHERE id=?")
      .run(statut, txt(reponse, 2000), termine ? new Date().toISOString() : null, termine ? (adminId || null) : null, id);
    return { ok: true, user_id: d.user_id };
  }

  /* ── Registre des incidents de sécurité ── */
  async function listerIncidents() { return db.prepare("SELECT * FROM incidents_securite ORDER BY id DESC LIMIT 500").all(); }
  function champsIncident(b) {
    return {
      titre: txt(b.titre, 200), description: txt(b.description, 4000), date_detection: jour(b.date_detection),
      gravite: GRAVITES.includes(b.gravite) ? b.gravite : null, donnees_perso: bool(b.donnees_perso),
      cnil_notifiee: bool(b.cnil_notifiee), cnil_date: jour(b.cnil_date), personnes_informees: bool(b.personnes_informees),
      mesures: txt(b.mesures, 4000), statut: STATUTS_INCIDENT.includes(b.statut) ? b.statut : null
    };
  }
  async function creerIncident(b, adminId) {
    const c = champsIncident(b || {});
    if (!c.titre) return { erreur: "Le titre de l'incident est obligatoire." };
    if (!c.date_detection) return { erreur: 'La date de détection est obligatoire (AAAA-MM-JJ).' };
    const id = Number((await db.prepare(`INSERT INTO incidents_securite (titre, description, date_detection, gravite, donnees_perso, cnil_notifiee, cnil_date, personnes_informees, mesures, statut, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(c.titre, c.description, c.date_detection, c.gravite || 'faible', c.donnees_perso, c.cnil_notifiee, c.cnil_date, c.personnes_informees, c.mesures, c.statut || 'ouvert', adminId || null)).lastInsertRowid);
    return { ok: true, id };
  }
  async function majIncident(id, b) {
    const ex = await db.prepare("SELECT * FROM incidents_securite WHERE id=?").get(id);
    if (!ex) return { erreur: 'Incident introuvable.', code: 404 };
    const c = champsIncident({ ...ex, ...(b || {}) });
    if (!c.titre) return { erreur: "Le titre de l'incident est obligatoire." };
    await db.prepare(`UPDATE incidents_securite SET titre=?, description=?, date_detection=?, gravite=?, donnees_perso=?, cnil_notifiee=?, cnil_date=?, personnes_informees=?, mesures=?, statut=?, updated_at=? WHERE id=?`)
      .run(c.titre, c.description, c.date_detection || ex.date_detection, c.gravite || ex.gravite, c.donnees_perso, c.cnil_notifiee, c.cnil_date, c.personnes_informees, c.mesures, c.statut || ex.statut, new Date().toISOString(), id);
    return { ok: true };
  }

  return { DOCUMENTS, A_L_INSCRIPTION, TYPES_DROITS, STATUTS_DEMANDE, DELAI_REPONSE_JOURS, GRAVITES, STATUTS_INCIDENT,
    versionsCourantes, viderCache, publierVersion, historiqueVersions, enregistrer, mesAcceptations, aAccepter, statsAcceptations,
    creerDemande, mesDemandes, listerDemandes, traiterDemande, listerIncidents, creerIncident, majIncident };
};
module.exports.A_L_INSCRIPTION = A_L_INSCRIPTION;
module.exports.TYPES_DROITS = TYPES_DROITS;
