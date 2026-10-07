/* ============================================================
   Diaspo'Actif — Version téléphone : module « CV, lettres, candidatures »
   Équivalent téléphone de la section « 📄 CV, Lettres, Candidatures » du tableau de bord Utilisateur.

   Routes (hash) :
     #/cvlettres                    accueil du module (3 entrées + compteurs)
     #/cvlettres/cv                 liste de mes CV
     #/cvlettres/cv/12              lecture d'un CV            (+ PDF, partage, impression, suppression)
     #/cvlettres/cv/12-modifier     modification des champs simples
     #/cvlettres/cv/nouveau         création rapide à partir d'un gabarit
     #/cvlettres/lettre[...]        idem pour les lettres de motivation
     #/cvlettres/cand               suivi de mes candidatures
     #/cvlettres/cand/7             détail + historique d'une candidature

   API réellement utilisées (les mêmes que le site) :
     GET /api/cv · GET /api/cv/:id · POST /api/cv (enregistrement par numéro 1|2) · DELETE /api/cv/:id
     GET /api/lettres · GET /api/lettres/:id · POST /api/lettres · DELETE /api/lettres/:id
     GET /api/candidatures/mes · GET /api/candidatures/:id/historique
     GET /api/offres/:id et GET /api/offres (noms d'organismes, lecture seule)

   Les CV et lettres sont stockés EN BASE (compte), pas dans le navigateur : ils sont donc
   les mêmes sur téléphone et sur ordinateur.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, strip, ic, setPane, toast } = A;
  window.MMods = window.MMods || {};

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const BASE = '#/cvlettres';
  const MOD = 'CV, lettres, candidatures';
  const TITRE = 'CV, lettres, candidatures';
  const SK = '<div class="sk skc" style="height:90px"></div><div class="sk skc" style="height:90px"></div><div class="sk skc" style="height:90px"></div>';

  /* Gabarits proposés par le site (assets/cv-templates.js et assets/lettre-templates.js).
     On les liste ici pour ne charger les moteurs de rendu qu'à la demande (téléchargement, impression). */
  const CV_GAB = { moderne: 'Moderne', classique: 'Classique', elegant: 'Élégant', minimaliste: 'Minimaliste', diaspora: 'Diaspora', corporate: 'Corporate', creatif: 'Créatif', international: 'International' };
  const LM_GAB = { classique: 'Classique', moderne: 'Moderne', elegant: 'Élégant', minimaliste: 'Minimaliste' };
  const MAX_DOCS = 2; // le serveur n'accepte que les emplacements 1 et 2

  /* Styles par défaut identiques à ceux des éditeurs du site (cv-builder.js / lettre-builder.html) */
  const CV_STYLE = { couleur1: '#1a3a5c', couleur2: '#4a90d9', couleur3: '#e8f0fe', font: 'Segoe UI', fontSize: 11, spacing: 1.4, margins: { top: 15, bottom: 15, left: 15, right: 15 } };
  const LM_STYLE = { couleur1: '#1a3a5c', couleur2: '#4a90d9', couleur3: '#eef4fb', font: 'Georgia, serif', fontSize: 11 };

  const LM_CORPS_TYPE = 'Madame, Monsieur,\n\nPassionné(e) par [votre domaine], je me permets de vous adresser ma candidature au poste de [poste] au sein de [organisation].\n\n[Votre paragraphe d’accroche et de motivation…]\n\n[Vos compétences et expériences en lien avec le poste…]\n\nDans l’attente d’un entretien que vous voudrez bien m’accorder, je vous adresse mes sincères salutations.';

  /* ---------- statuts de candidature ----------
     Le site utilise deux champs : `statut` (ancien : recu/en_etude/entretien/accepte/refuse) et `statut_detail`
     (« Gestion des candidatures » : nouvelle … embauchee, avec 'envoyee' par défaut). */
  const CAND_LBL = {
    brouillon: 'Brouillon', envoyee: 'Envoyée', recue: 'Reçue', recu: 'Reçue', nouvelle: 'Reçue', consultee: 'Consultée',
    en_etude: 'En cours d’étude', preselectionnee: 'Présélectionnée', entretien_demande: 'Entretien demandé',
    entretien_prevu: 'Entretien prévu', entretien_programme: 'Entretien prévu', entretien: 'Entretien prévu',
    entretien_realise: 'Entretien réalisé', test_demande: 'Test demandé', docs_demandes: 'Documents demandés',
    en_attente: 'En attente', acceptee: 'Acceptée', accepte: 'Acceptée', embauchee: 'Embauchée',
    refusee: 'Refusée', refuse: 'Refusée', cloturee: 'Clôturée'
  };
  const FIN_OK = ['acceptee', 'accepte', 'embauchee'];
  const FIN_KO = ['refusee', 'refuse'];
  const FIN_AUTRE = ['cloturee'];
  const ENTRETIEN = ['entretien', 'entretien_prevu', 'entretien_programme', 'entretien_demande', 'entretien_realise'];
  /* Le statut « réel » : le détail s'il a été modifié par le recruteur, sinon l'ancien statut. */
  const candStatut = c => (c.statut_detail && c.statut_detail !== 'envoyee') ? c.statut_detail : (c.statut || c.statut_detail || 'envoyee');
  const candLabel = s => CAND_LBL[s] || (String(s || '').replace(/_/g, ' ').replace(/^./, m => m.toUpperCase()) || 'En cours');
  const candBadge = s => FIN_OK.includes(s) ? 'g' : FIN_KO.includes(s) ? 'r' : (ENTRETIEN.includes(s) || s === 'test_demande' || s === 'docs_demandes') ? 'o' : '';
  const candEnCours = c => { const s = candStatut(c); return !FIN_OK.includes(s) && !FIN_KO.includes(s) && !FIN_AUTRE.includes(s); };

  /* ---------- CSS (injecté une seule fois) ---------- */
  function css() {
    if (document.getElementById('m-mod-cvlettres-css')) return;
    const s = document.createElement('style'); s.id = 'm-mod-cvlettres-css';
    s.textContent = `
.mcl-f{margin:0 0 12px}
.mcl-f label{display:block;font-size:13px;font-weight:600;color:var(--muted);margin:0 0 4px 2px}
.mcl-f input,.mcl-f textarea,.mcl-f select{width:100%;min-height:46px;border:1px solid var(--border);border-radius:12px;background:var(--card);padding:10px 12px;font-size:16px;color:var(--text);font-family:inherit}
.mcl-f textarea{resize:vertical;line-height:1.45}
.mcl-f input:focus,.mcl-f textarea:focus,.mcl-f select:focus{outline:3px solid var(--sky);outline-offset:1px;border-color:var(--sky)}
.mcl-f.bad input,.mcl-f.bad textarea,.mcl-f.bad select{border-color:var(--red)}
.mcl-h{font-size:12.5px;color:var(--muted);margin:3px 2px 0}
.mcl-e{color:var(--red);font-size:13px;margin:4px 2px 0}
.mcl-e:empty{display:none}
.mcl-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:360px){.mcl-2{grid-template-columns:1fr}}
.mcl-sec{font-size:13px;font-weight:700;color:var(--muted);letter-spacing:.03em;margin:20px 4px 8px}
.mcl-chk{display:flex;align-items:center;gap:10px;min-height:44px;font-size:15px;margin:0 0 8px}
.mcl-chk input{width:22px;height:22px;flex:none}
.mcl-hd{display:flex;gap:14px;align-items:center}
.mcl-it{padding:11px 0;border-bottom:1px solid var(--border);word-break:break-word}
.mcl-it:first-child{padding-top:0}
.mcl-it:last-child{border-bottom:none;padding-bottom:0}
.mcl-it b{display:block}
.mcl-txt{white-space:pre-line;word-break:break-word}
.mcl-paper{background:#fff;border:1px solid var(--border);border-radius:6px;padding:18px 16px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.6;box-shadow:var(--shadow);margin-bottom:12px;word-break:break-word;overflow-wrap:anywhere}
.mcl-paper .r{text-align:right;margin:16px 0}
.mcl-paper .c{white-space:pre-wrap;margin:14px 0}
.mcl-tl{border-left:2px solid var(--border);margin:4px 0 0 6px;padding-left:18px}
.mcl-tl>div{position:relative;padding:0 0 14px}
.mcl-tl>div:last-child{padding-bottom:0}
.mcl-tl>div:before{content:"";position:absolute;left:-25px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--sky);border:2px solid var(--card)}
.mcl-danger{color:var(--red);border-color:#E8B9B5}
.mcl-note{display:flex;gap:10px;align-items:flex-start;background:var(--sky-l);border-radius:12px;padding:12px 14px;font-size:13.5px;color:var(--navy);margin-bottom:12px}
#mcl-print{display:none}
@media print{
  @page{size:A4;margin:0}
  body.mcl-printing{overflow:visible!important;background:#fff!important}
  body.mcl-printing #app,body.mcl-printing #sheet,body.mcl-printing #toast{display:none!important}
  body.mcl-printing #mcl-print{display:block!important;width:210mm;margin:0;background:#fff}
}`;
    document.head.appendChild(s);
  }

  /* ---------- petits outils ---------- */
  let seq = 0; // jeton : ignore la réponse d'un écran que l'utilisateur a déjà quitté
  const here = my => my === seq && location.hash.indexOf(BASE) === 0;
  const MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  /* Les dates de la base sont en UTC, au format « 2026-07-17 05:54:56 » */
  function toDate(s) {
    if (!s) return null; const str = String(s);
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) { const j = new Date(str + 'T12:00:00'); return isNaN(j) ? null : j; } // jour seul : midi local, évite le décalage de fuseau
    const d = new Date(str.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(str) ? '' : 'Z'));
    return isNaN(d) ? null : d;
  }
  const fmtDate = s => { const d = toDate(s); return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
  const fmtDateHeure = s => { const d = toDate(s); return d ? fmtDate(s) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''; };
  const fmtMois = m => { const r = /^(\d{4})-(\d{2})/.exec(String(m || '')); return r ? MOIS_L[+r[2] - 1] + ' ' + r[1] : String(m || ''); };
  const nl = arr => arr.filter(Boolean).map(esc).join('<br>');
  const val = id => { const e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; };
  const plus = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);
  const freeNumero = list => { const used = new Set((list || []).map(x => Number(x.numero))); return [1, 2].find(n => !used.has(n)) || null; };
  const goBack = fallback => { if (history.length > 1) history.back(); else location.replace(fallback || BASE); };
  /* Une adresse de profil renvoyée par l'API est relative ; on n'accepte que les formes connues du site */
  const profilHref = u => /^(profil|initiative)\.html\?id=[\w-]+$/.test(String(u || '')) ? u : '';

  function loginScreen(title) {
    setPane(title || TITRE, A.loginCard('Connectez-vous pour retrouver vos CV, vos lettres de motivation et le suivi de vos candidatures.'));
    const b = $('#go-login'); if (b) b.onclick = () => A.openLogin();
  }
  function showErr(title, e, retry) {
    if (e && e.status === 401) return loginScreen(title);
    if (e && e.status === 402) {
      setPane(title, `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Réservé aux comptes Premium</b>Votre abonnement est arrivé à expiration.</div>`);
      return A.premiumSheet(MOD);
    }
    setPane(title, `<div class="empty"><b>Impossible de charger cet écran</b>${esc((e && e.message) || 'Une erreur est survenue.')}<br><br><button class="btn sm" id="mcl-retry">Réessayer</button> <a class="btn sm out" href="${BASE}">Retour au module</a></div>`);
    const b = $('#mcl-retry'); if (b) b.onclick = retry;
  }
  const notFound = (title, what, listHref) => setPane(title, `<div class="empty"><div class="ei">${ic('doc', 'l')}</div><b>${esc(what)} introuvable</b>Il a peut-être été supprimé depuis un autre appareil.<br><br><a class="btn" href="${listHref}">Voir la liste</a></div>`);

  /* ============================================================
     ACCUEIL
     ============================================================ */
  async function home() {
    const my = ++seq; setPane(TITRE, SK);
    if (!S.me) return loginScreen();
    const res = await Promise.allSettled([api('/api/cv'), api('/api/lettres'), api('/api/candidatures/mes')]);
    if (!here(my)) return;
    const [rc, rl, rk] = res;
    if (res.some(r => r.status === 'rejected' && r.reason && r.reason.status === 401)) return loginScreen();
    if (res.every(r => r.status === 'rejected')) return showErr(TITRE, rc.reason, home);
    const ok = r => r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : null;
    const cvs = ok(rc), lms = ok(rl), cands = ok(rk);
    const dernier = l => l && l.length ? 'modifié le ' + fmtDate(l.slice().sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0].updated_at) : '';
    const entry = (href, icon, titre, detail, n) => `<a class="li" href="${href}"><span class="ic">${ic(icon)}</span><span class="sp"><span class="t">${esc(titre)}</span><br><span class="d">${detail}</span></span>${n != null ? `<span class="badge">${n}</span>` : ''}<span class="ch">${ic('chev', 's')}</span></a>`;
    const KO = 'Indisponible pour le moment';
    const enCours = cands ? cands.filter(candEnCours).length : 0;
    const html = `<p class="muted small" style="margin:2px 4px 12px">Vos CV et vos lettres sont enregistrés sur votre compte Diaspo’Actif : ce sont les mêmes sur téléphone et sur ordinateur.</p>
      <div class="lst">
        ${entry(BASE + '/cv', 'doc', 'Mes CV', cvs ? (cvs.length ? esc(plus(cvs.length, 'CV') + ' sur ' + MAX_DOCS + ' · ' + dernier(cvs)) : 'Aucun CV pour le moment') : KO, cvs ? cvs.length : null)}
        ${entry(BASE + '/lettre', 'file', 'Mes lettres de motivation', lms ? (lms.length ? esc(plus(lms.length, 'lettre') + ' sur ' + MAX_DOCS + ' · ' + dernier(lms)) : 'Aucune lettre pour le moment') : KO, lms ? lms.length : null)}
        ${entry(BASE + '/cand', 'brief', 'Mes candidatures', cands ? (cands.length ? esc(enCours ? plus(enCours, 'candidature') + ' en cours' : 'Aucune candidature en cours') : 'Aucune candidature pour le moment') : KO, cands ? cands.length : null)}
      </div>
      ${(cvs && cvs.length < MAX_DOCS) || (lms && lms.length < MAX_DOCS) ? `<div class="h2">CRÉER RAPIDEMENT</div><div class="row" style="gap:10px;flex-wrap:wrap">${cvs && cvs.length < MAX_DOCS ? `<a class="btn out sp" href="${BASE}/cv/nouveau">${ic('plus', 's')} Un CV</a>` : ''}${lms && lms.length < MAX_DOCS ? `<a class="btn out sp" href="${BASE}/lettre/nouveau">${ic('plus', 's')} Une lettre</a>` : ''}</div>` : ''}
      <div class="h2">TROUVER UNE OFFRE</div>
      <div class="lst"><a class="li" href="emplois-stages.html"><span class="ic">${ic('search')}</span><span class="sp"><span class="t">Offres d’emploi et de stage</span><br><span class="d">Parcourir les offres des organismes (s’ouvre sur le site)</span></span><span class="ch">${ic('out', 's')}</span></a></div>
      <div class="mcl-note" style="margin-top:14px"><span>${ic('desk', 's')}</span><span><b>À finir sur ordinateur :</b> l’éditeur complet (photo, couleurs et mise en page, plusieurs expériences et formations, historique des versions) est sur ordinateur : <a href="cv-builder.html" style="text-decoration:underline">éditeur de CV</a> · <a href="lettre-builder.html" style="text-decoration:underline">éditeur de lettre</a>.</span></div>`;
    setPane(TITRE, html);
  }

  /* ============================================================
     LISTES (CV / lettres) — mêmes écrans, paramétrés
     ============================================================ */
  const KIND = {
    cv: { title: 'Mes CV', one: 'CV', icon: 'doc', apiList: '/api/cv', gab: CV_GAB, gabDef: 'moderne', nouveau: 'Créer un CV', vide: 'Aucun CV pour le moment', videTxt: 'Créez votre premier CV en quelques minutes : choisissez un gabarit et remplissez l’essentiel.', max: 'Vous avez atteint le maximum de 2 CV. Modifiez-en un ou supprimez-en un pour en créer un nouveau.', builder: 'cv-builder.html' },
    lettre: { title: 'Mes lettres', one: 'lettre', icon: 'file', apiList: '/api/lettres', gab: LM_GAB, gabDef: 'classique', nouveau: 'Créer une lettre', vide: 'Aucune lettre pour le moment', videTxt: 'Rédigez une lettre de motivation à partir d’un modèle, puis adaptez-la à chaque offre.', max: 'Vous avez atteint le maximum de 2 lettres. Modifiez-en une ou supprimez-en une pour en créer une nouvelle.', builder: 'lettre-builder.html' }
  };

  async function listDocs(kind) {
    const K = KIND[kind], my = ++seq; setPane(K.title, SK);
    if (!S.me) return loginScreen(K.title);
    let docs;
    try { docs = await api(K.apiList); if (!Array.isArray(docs)) docs = []; } catch (e) { if (!here(my)) return; return showErr(K.title, e, () => listDocs(kind)); }
    if (!here(my)) return;
    /* La liste des lettres ne dit pas quel gabarit est utilisé : on lit les (au plus 2) fiches. */
    let tpl = {};
    if (kind === 'lettre' && docs.length) {
      const r = await Promise.allSettled(docs.map(d => api('/api/lettres/' + d.id)));
      r.forEach((x, i) => { if (x.status === 'fulfilled' && x.value && x.value.data) tpl[docs[i].id] = x.value.data.template; });
      if (!here(my)) return;
    }
    const gabOf = d => { const k = kind === 'cv' ? d.theme : tpl[d.id]; return K.gab[k] ? 'Gabarit ' + K.gab[k] : ''; };
    const plein = docs.length >= MAX_DOCS;
    const body = docs.length
      ? `<div class="lst">${docs.map(d => `<a class="li" href="${BASE}/${kind}/${d.id}"><span class="ic">${ic(K.icon)}</span><span class="sp"><span class="t">${esc(d.titre || 'Sans titre')}</span><br><span class="d">${esc([gabOf(d), d.updated_at ? 'modifié le ' + fmtDate(d.updated_at) : ''].filter(Boolean).join(' · '))}</span></span><span class="ch">${ic('chev', 's')}</span></a>`).join('')}</div>
         <p class="small muted" style="margin:10px 4px">${plein ? esc(K.max) : esc(plus(docs.length, K.one) + ' sur ' + MAX_DOCS + ' possibles.')} Enregistré sur votre compte : disponible aussi sur ordinateur.</p>`
      : `<div class="empty"><div class="ei">${ic(K.icon, 'l')}</div><b>${esc(K.vide)}</b>${esc(K.videTxt)}</div>`;
    setPane(K.title, body, plein ? null : `<a class="btn block" href="${BASE}/${kind}/nouveau">${ic('plus', 's')} ${esc(K.nouveau)}</a>`);
  }

  /* ============================================================
     LECTURE D'UN CV
     ============================================================ */
  async function detailCv(id) {
    const my = ++seq; setPane('CV', SK);
    if (!S.me) return loginScreen('CV');
    let cv;
    try { cv = await api('/api/cv/' + id); } catch (e) { if (!here(my)) return; if (e.status === 404) return notFound('CV', 'CV', BASE + '/cv'); return showErr('CV', e, () => detailCv(id)); }
    if (!here(my)) return;
    const d = cv.data || {}, inf = d.infos || {}, comp = d.competences || {};
    const nom = [inf.prenom, inf.nom].filter(Boolean).join(' ');
    const tpl = (d.meta && CV_GAB[d.meta.template]) ? d.meta.template : (CV_GAB[cv.theme] ? cv.theme : 'moderne');
    const lieu = [inf.ville, inf.pays_residence].filter(Boolean).join(', ');
    const contact = [
      inf.email ? `<div class="meta">${ic('send', 's')}<a href="mailto:${esc(inf.email)}" class="ell">${esc(inf.email)}</a></div>` : '',
      inf.telephone ? `<div class="meta">${ic('chat', 's')}<a href="tel:${esc(String(inf.telephone).replace(/[^\d+]/g, ''))}">${esc(inf.telephone)}</a></div>` : '',
      lieu ? `<div class="meta">${ic('pin', 's')}<span>${esc(lieu)}</span></div>` : '',
      inf.linkedin ? `<div class="meta">${ic('out', 's')}<span class="ell">${esc(inf.linkedin)}</span></div>` : '',
      inf.site ? `<div class="meta">${ic('out', 's')}<span class="ell">${esc(inf.site)}</span></div>` : ''
    ].join('');
    const photo = d.photo && d.photo.show !== false && d.photo.url ? A.attrUrl(d.photo.url) : '';
    const sec = (t, inner) => inner ? `<div class="h2">${esc(t)}</div><div class="card"><div class="pad">${inner}</div></div>` : '';
    const tags = (l, cls) => (l || []).length ? `<div class="tags" style="margin:4px 0 0">${l.map(x => `<span class="badge ${cls || ''}">${esc(x)}</span>`).join('')}</div>` : '';
    const exps = (d.experiences || []).map(e => `<div class="mcl-it"><b>${esc(e.poste || 'Poste')}</b>
      <div class="small muted">${esc([e.entreprise, [e.ville, e.pays].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</div>
      <div class="small muted">${esc([fmtMois(e.date_debut), e.actuel ? 'Présent' : fmtMois(e.date_fin)].filter(Boolean).join(' → '))}</div>
      ${e.description ? `<div class="mcl-txt" style="margin-top:4px">${esc(e.description)}</div>` : ''}</div>`).join('');
    const edus = (d.formations || []).map(e => `<div class="mcl-it"><b>${esc(e.diplome || 'Diplôme')}</b>
      <div class="small muted">${esc([e.etablissement, [e.ville, e.pays].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</div>
      ${e.annee ? `<div class="small muted">${esc(e.annee)}</div>` : ''}${e.description ? `<div class="mcl-txt" style="margin-top:4px">${esc(e.description)}</div>` : ''}</div>`).join('');
    const comps = [['Techniques', comp.tech], ['Métiers', comp.metier], ['Numériques', comp.num]].filter(x => (x[1] || []).length)
      .map(x => `<div class="mcl-it"><div class="small muted">${x[0]}</div>${tags(x[1])}</div>`).join('');
    const langs = (d.langues || []).map(l => `<div class="kv"><span>${esc(l.langue)}</span><span>${esc(l.niveau || '')}</span></div>`).join('');
    const certs = (d.certifications || []).map(c => `<div class="mcl-it"><b>${esc(c.nom)}</b><div class="small muted">${esc([c.organisme, fmtMois(c.date)].filter(Boolean).join(' · '))}</div></div>`).join('');
    const vide = !nom && !d.resume && !exps && !edus;
    const html = `<div class="card"><div class="pad"><div class="mcl-hd">
        <div class="av big">${photo ? `<img src="${photo}" alt="" onerror="this.remove()">` : esc(A.initials(nom || cv.titre))}</div>
        <div class="sp"><div style="font-weight:700;font-size:18px;line-height:1.2">${esc(nom || cv.titre || 'Mon CV')}</div>${inf.titre_pro ? `<div class="muted">${esc(inf.titre_pro)}</div>` : ''}
        <div class="tags" style="margin-top:6px"><span class="badge">Gabarit ${esc(CV_GAB[tpl])}</span></div></div></div>
        ${contact ? `<div style="margin-top:10px">${contact}</div>` : ''}
        <p class="small muted" style="margin:10px 0 0">« ${esc(cv.titre || 'Mon CV')} » · CV n° ${esc(cv.numero)} · modifié le ${esc(fmtDate(cv.updated_at))}</p></div></div>
      ${vide ? `<div class="mcl-note"><span>${ic('doc', 's')}</span><span>Ce CV est encore presque vide. Touchez « Modifier » pour ajouter votre identité, vos coordonnées et un résumé.</span></div>` : ''}
      ${sec('Résumé', d.resume ? `<div class="mcl-txt">${esc(d.resume)}</div>` : '')}
      ${sec('Expériences', exps)}${sec('Formations', edus)}${sec('Compétences', comps)}${sec('Langues', langs)}${sec('Certifications', certs)}
      ${sec('Centres d’intérêt', tags(d.interests))}
      <div class="h2">ACTIONS</div>
      <div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:10px">
        ${navigator.share ? `<button class="btn out sp" id="mcl-share">${ic('share', 's')} Partager</button>` : ''}
        <button class="btn out sp" id="mcl-print-btn">Imprimer</button></div>
      <a class="btn out block" href="cv-builder.html?id=${esc(cv.id)}" style="margin-bottom:10px">${ic('desk', 's')} Éditeur complet (à finir sur ordinateur)</a>
      <button class="btn out block mcl-danger" id="mcl-del">Supprimer ce CV</button>
      <p class="small muted" style="margin:10px 4px 0">Photo, couleurs, mise en page, ajout ou modification des expériences et formations : à faire sur ordinateur.</p>`;
    setPane(cv.titre || 'CV', html,
      `<a class="btn out" style="flex:1" href="${BASE}/cv/${esc(cv.id)}-modifier">Modifier</a><button class="btn" style="flex:1" id="mcl-pdf">Télécharger le PDF</button>`);
    wireDoc('cv', cv, tpl);
  }

  /* ============================================================
     LECTURE D'UNE LETTRE
     ============================================================ */
  async function detailLm(id) {
    const my = ++seq; setPane('Lettre', SK);
    if (!S.me) return loginScreen('Lettre');
    let lm;
    try { lm = await api('/api/lettres/' + id); } catch (e) { if (!here(my)) return; if (e.status === 404) return notFound('Lettre', 'Lettre', BASE + '/lettre'); return showErr('Lettre', e, () => detailLm(id)); }
    if (!here(my)) return;
    const x = lm.data || {};
    const tpl = LM_GAB[x.template] ? x.template : 'classique';
    const expe = [[x.exp_prenom, x.exp_nom].filter(Boolean).join(' '), x.exp_adresse, x.exp_ville, x.exp_tel, x.exp_email];
    const dest = [x.dest_nom, x.dest_fonction, x.dest_entreprise, x.dest_adresse];
    const vide = !x.corps;
    const html = `<div class="row" style="gap:8px;margin:0 2px 10px;flex-wrap:wrap"><span class="badge">Gabarit ${esc(LM_GAB[tpl])}</span><span class="small muted">Lettre n° ${esc(lm.numero)} · modifiée le ${esc(fmtDate(lm.updated_at))}</span></div>
      ${vide ? `<div class="mcl-note"><span>${ic('file', 's')}</span><span>Cette lettre est encore vide. Touchez « Modifier » pour écrire votre texte.</span></div>` : ''}
      <div class="mcl-paper">
        <div>${expe[0] ? '<b>' + esc(expe[0]) + '</b><br>' : ''}${nl(expe.slice(1))}</div>
        ${dest.some(Boolean) ? `<div class="r">${nl(dest)}</div>` : ''}
        ${x.lieu_date ? `<div class="muted" style="font-size:14px;margin-top:10px">${esc(x.lieu_date)}</div>` : ''}
        ${x.objet ? `<div style="margin-top:12px"><b>Objet :</b> ${esc(x.objet)}</div>` : ''}
        <div class="c">${esc(x.corps || '')}</div>
        <div>${esc(x.sig_texte || [x.exp_prenom, x.exp_nom].filter(Boolean).join(' '))}</div>
        ${x.sig_image ? `<img src="${A.attrUrl(x.sig_image)}" alt="Signature" style="max-height:60px;margin-top:8px;display:block">` : ''}
      </div>
      <div class="h2">ACTIONS</div>
      <div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:10px">
        ${navigator.share ? `<button class="btn out sp" id="mcl-share">${ic('share', 's')} Partager</button>` : ''}
        <button class="btn out sp" id="mcl-print-btn">Imprimer</button></div>
      <a class="btn out block" href="lettre-builder.html?id=${esc(lm.id)}" style="margin-bottom:10px">${ic('desk', 's')} Éditeur complet (à finir sur ordinateur)</a>
      <button class="btn out block mcl-danger" id="mcl-del">Supprimer cette lettre</button>
      <p class="small muted" style="margin:10px 4px 0">Mise en page, couleurs, signature manuscrite et QR code : à régler sur ordinateur.</p>`;
    setPane(lm.titre || 'Lettre', html,
      `<a class="btn out" style="flex:1" href="${BASE}/lettre/${esc(lm.id)}-modifier">Modifier</a><button class="btn" style="flex:1" id="mcl-pdf">Télécharger le PDF</button>`);
    wireDoc('lettre', lm, tpl);
  }

  /* ---------- boutons communs d'un document : PDF, partage, impression, suppression ---------- */
  function wireDoc(kind, doc, tpl) {
    const run = (btn, busy, fn) => btn && (btn.onclick = async () => {
      const old = btn.innerHTML; btn.disabled = true; btn.textContent = busy;
      try { await fn(); }
      catch (e) { toast(e && e.userMsg ? e.userMsg : 'Impossible de préparer le document. Vérifiez votre connexion puis réessayez.', true); }
      btn.disabled = false; btn.innerHTML = old;
    });
    run($('#mcl-pdf'), 'Préparation du PDF…', async () => { const p = await makePdf(kind, doc, tpl); download(p.blob, p.name); toast('PDF prêt : consultez vos téléchargements'); });
    run($('#mcl-share'), 'Préparation…', async () => {
      const p = await makePdf(kind, doc, tpl);
      const file = new File([p.blob], p.name, { type: 'application/pdf' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: doc.titre || 'Document' });
        else { download(p.blob, p.name); toast('Partage de fichier indisponible : le PDF a été téléchargé.'); }
      } catch (e) { if (e && e.name !== 'AbortError') throw e; /* partage annulé : rien à faire */ }
    });
    run($('#mcl-print-btn'), 'Préparation…', async () => { await printDoc(kind, doc, tpl); });
    const del = $('#mcl-del');
    if (del) del.onclick = () => supprimer(kind, doc);
  }

  async function supprimer(kind, doc) {
    const K = KIND[kind];
    /* Un CV ou une lettre joint(e) à une candidature est lu(e) par l'organisme : on prévient avant de le/la supprimer. */
    let n = 0;
    try { const c = await api('/api/candidatures/mes'); n = (Array.isArray(c) ? c : []).filter(x => Number(kind === 'cv' ? x.cv_profile_id : x.lettre_id) === Number(doc.id)).length; } catch (e) { /* contrôle facultatif */ }
    const msg = `Supprimer ${kind === 'cv' ? 'ce CV' : 'cette lettre'} « ${doc.titre || ''} » ? Cette action est définitive.` + (n ? `\n\nAttention : ${kind === 'cv' ? 'il' : 'elle'} est joint${kind === 'cv' ? '' : 'e'} à ${plus(n, 'candidature')} déjà envoyée${n > 1 ? 's' : ''} : l’organisme ne pourra plus ${kind === 'cv' ? 'le' : 'la'} consulter.` : '');
    if (!confirm(msg)) return;
    const b = $('#mcl-del'); if (b) { b.disabled = true; b.textContent = 'Suppression…'; }
    try {
      await api(`/api/${kind === 'cv' ? 'cv' : 'lettres'}/${encodeURIComponent(doc.id)}`, { method: 'DELETE' });
      toast(kind === 'cv' ? 'CV supprimé' : 'Lettre supprimée');
      goBack(`${BASE}/${kind}`);
    } catch (e) { toast(e.message, true); if (b) { b.disabled = false; b.textContent = kind === 'cv' ? 'Supprimer ce CV' : 'Supprimer cette lettre'; } }
  }

  /* ============================================================
     PDF / IMPRESSION — réutilise les mêmes moteurs de rendu que l'éditeur du site
     (assets/cv-templates.js, assets/lettre-templates.js, html2pdf.js), chargés à la demande.
     ============================================================ */
  const libs = {};
  function loadScript(src) {
    if (!libs[src]) libs[src] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = res; s.onerror = () => { delete libs[src]; const e = new Error('chargement impossible'); e.userMsg = 'Impossible de charger les outils de création du PDF. Vérifiez votre connexion puis réessayez.'; rej(e); };
      document.head.appendChild(s);
    });
    return libs[src];
  }
  async function ensureLibs(kind, needPdf) {
    const jobs = [loadScript(kind === 'cv' ? 'assets/cv-templates.js' : 'assets/lettre-templates.js')];
    if (needPdf && !window.html2pdf) jobs.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'));
    await Promise.all(jobs);
  }
  /* Le HTML produit par les gabarits provient des données de l'utilisateur : on le passe dans un
     conteneur inerte et on retire scripts et gestionnaires d'événements avant de l'afficher. */
  function inertFragment(html) {
    const t = document.createElement('template'); t.innerHTML = html;
    t.content.querySelectorAll('script,iframe,object,embed,link,meta,base,form').forEach(n => n.remove());
    t.content.querySelectorAll('*').forEach(n => Array.from(n.attributes).forEach(a => {
      if (/^on/i.test(a.name) || (/^(href|src|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
    }));
    return t.content;
  }
  /* Feuille A4 prête à être convertie (même rendu que les boutons « Générer le document PDF » du site) */
  function buildSheet(kind, doc, tpl) {
    const d = doc.data || {}; let html, wrap;
    if (kind === 'cv') {
      const T = window.CV_TEMPLATES && (window.CV_TEMPLATES[tpl] || window.CV_TEMPLATES.moderne);
      if (!T) throw Object.assign(new Error('gabarit'), { userMsg: 'Le gabarit du CV est introuvable.' });
      const style = Object.assign({}, CV_STYLE, d.style);
      html = T.render(Object.assign({}, d, { style, infos: d.infos || {} }), style);
      wrap = 'width:210mm;background:#fff;box-shadow:none;box-sizing:border-box;';
    } else {
      const T = window.LETTRE_TEMPLATES && (window.LETTRE_TEMPLATES[tpl] || window.LETTRE_TEMPLATES.classique);
      if (!T) throw Object.assign(new Error('gabarit'), { userMsg: 'Le gabarit de la lettre est introuvable.' });
      const style = Object.assign({}, LM_STYLE, d.style);
      const m = { prenom: d.exp_prenom, nom: d.exp_nom, adresse: d.exp_adresse, ville: d.exp_ville, tel: d.exp_tel, email: d.exp_email, destNom: d.dest_nom, destFonction: d.dest_fonction, destEntreprise: d.dest_entreprise, destAdresse: d.dest_adresse, lieuDate: d.lieu_date, objet: d.objet, corps: d.corps, sigTexte: d.sig_texte, sigData: d.sig_image, qr: d.qr };
      html = T.render(m, style);
      wrap = `width:210mm;min-height:297mm;background:#fff;padding:30mm 25mm;box-shadow:none;box-sizing:border-box;font-family:${style.font};font-size:${style.fontSize}pt;line-height:1.7;`;
    }
    const el = document.createElement('div'); el.style.cssText = wrap; el.appendChild(inertFragment(html));
    return el;
  }
  const fileName = t => (String(t || 'Document').replace(/[^a-zA-Z0-9À-ÿ_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Document') + '.pdf';
  async function makePdf(kind, doc, tpl) {
    await ensureLibs(kind, true);
    const el = buildSheet(kind, doc, tpl);
    const blob = await window.html2pdf().set({
      margin: 0, filename: fileName(doc.titre), image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    }).from(el).outputPdf('blob');
    return { blob, name: fileName(doc.titre) };
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  async function printDoc(kind, doc, tpl) {
    await ensureLibs(kind, false);
    const host = document.createElement('div'); host.id = 'mcl-print'; host.appendChild(buildSheet(kind, doc, tpl));
    document.body.appendChild(host); document.body.classList.add('mcl-printing');
    const clean = () => { document.body.classList.remove('mcl-printing'); host.remove(); window.removeEventListener('afterprint', clean); };
    window.addEventListener('afterprint', clean);
    setTimeout(() => { if (host.isConnected) clean(); }, 120000); // sécurité si le navigateur n'émet pas « afterprint »
    setTimeout(() => window.print(), 150);
  }

  /* ============================================================
     FORMULAIRES — champs simples (création rapide + modification)
     ============================================================ */
  function fld(id, label, v, o) {
    o = o || {}; v = v == null ? '' : v;
    const c = `id="${id}" name="${id}"${o.max ? ` maxlength="${o.max}"` : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.ac ? ` autocomplete="${o.ac}"` : ''}${o.im ? ` inputmode="${o.im}"` : ''}${o.req ? ' aria-required="true"' : ''}`;
    let inner;
    if (o.area) inner = `<textarea ${c} rows="${o.rows || 4}">\n${esc(v)}</textarea>`;
    else if (o.options) inner = `<select ${c}>${o.options.map(x => `<option value="${esc(x[0])}"${x[0] === v ? ' selected' : ''}>${esc(x[1])}</option>`).join('')}</select>`;
    else inner = `<input ${c} type="${o.type || 'text'}" value="${esc(v)}">`;
    return `<div class="mcl-f" data-f="${id}"><label for="${id}">${esc(label)}${o.req ? ' *' : ''}</label>${inner}${o.hint ? `<div class="mcl-h">${esc(o.hint)}</div>` : ''}<div class="mcl-e" role="alert" id="${id}-e"></div></div>`;
  }
  function clearErrs() { $$('.mcl-f.bad').forEach(f => f.classList.remove('bad')); $$('.mcl-e').forEach(e => { e.textContent = ''; }); const g = $('#mcl-gerr'); if (g) g.textContent = ''; }
  /* Affiche une erreur sous le champ ; renvoie false pour pouvoir chaîner « ok = setErr(...) && ok » */
  function setErr(id, msg) {
    const f = document.querySelector(`.mcl-f[data-f="${id}"]`), e = document.getElementById(id + '-e');
    if (f) f.classList.add('bad'); if (e) e.textContent = msg; return false;
  }
  function focusFirstErr() { const f = $('.mcl-f.bad input,.mcl-f.bad textarea,.mcl-f.bad select'); if (f) { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); f.focus({ preventScroll: true }); } }
  const emailOk = v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const gabOptions = g => Object.keys(g).map(k => [k, g[k]]);

  /* ---------- CV ---------- */
  async function formCv(id) {
    const my = ++seq, edit = !!id, titre = edit ? 'Modifier le CV' : 'Nouveau CV';
    setPane(titre, SK);
    if (!S.me) return loginScreen(titre);
    let cv = null, liste = [];
    try {
      if (edit) cv = await api('/api/cv/' + id); else liste = await api('/api/cv');
    } catch (e) { if (!here(my)) return; if (e.status === 404) return notFound(titre, 'CV', BASE + '/cv'); return showErr(titre, e, () => formCv(id)); }
    if (!here(my)) return;
    if (!edit && !freeNumero(liste)) {
      return setPane(titre, `<div class="empty"><div class="ei">${ic('doc', 'l')}</div><b>2 CV déjà enregistrés</b>${esc(KIND.cv.max)}<br><br><a class="btn" href="${BASE}/cv">Voir mes CV</a></div>`);
    }
    const d = edit ? (cv.data || {}) : {}, inf = d.infos || {}, me = S.me || {};
    const tpl = edit ? ((d.meta && CV_GAB[d.meta.template]) ? d.meta.template : (CV_GAB[cv.theme] ? cv.theme : 'moderne')) : 'moderne';
    const v = (k, fb) => edit ? inf[k] : fb;
    const nbExp = (d.experiences || []).length, nbEdu = (d.formations || []).length;
    const metiers = ((d.competences || {}).metier || []).join(', ');
    const html = `<form id="mcl-form" novalidate autocomplete="on">
      <div class="mcl-sec" style="margin-top:4px">DOCUMENT</div>
      ${fld('cv-titre', 'Nom du CV', edit ? cv.titre : 'Mon CV', { req: 1, max: 120, hint: 'Visible uniquement par vous, pour le retrouver.' })}
      ${fld('cv-gab', 'Gabarit', tpl, { options: gabOptions(CV_GAB) })}
      <div class="mcl-sec">IDENTITÉ</div>
      <div class="mcl-2">${fld('cv-prenom', 'Prénom', v('prenom', me.prenom), { req: !edit, max: 80, ac: 'given-name' })}${fld('cv-nom', 'Nom', v('nom', me.nom), { req: !edit, max: 80, ac: 'family-name' })}</div>
      ${fld('cv-titrepro', 'Titre professionnel', inf.titre_pro, { max: 120, ph: 'Ex. Ingénieur BTP' })}
      <div class="mcl-2">${fld('cv-ville', 'Ville', v('ville', me.ville), { max: 80, ac: 'address-level2' })}${fld('cv-pays', 'Pays de résidence', v('pays_residence', me.pays), { max: 80, ac: 'country-name' })}</div>
      ${fld('cv-nat', 'Nationalité', inf.nationalite, { max: 80 })}
      <div class="mcl-sec">CONTACT</div>
      ${fld('cv-email', 'E-mail', v('email', me.email), { type: 'email', max: 120, ac: 'email', im: 'email' })}
      ${fld('cv-tel', 'Téléphone', v('telephone', me.telephone), { type: 'tel', max: 40, ac: 'tel', im: 'tel' })}
      ${fld('cv-linkedin', 'LinkedIn', inf.linkedin, { max: 200, ph: 'Adresse de votre profil' })}
      ${fld('cv-site', 'Site web', inf.site, { max: 200 })}
      <div class="mcl-sec">PRÉSENTATION</div>
      ${fld('cv-resume', 'Résumé du profil', d.resume, { area: 1, rows: 5, max: 1500, hint: '2 à 4 phrases : qui vous êtes, votre expérience, ce que vous cherchez.' })}
      ${fld('cv-comp', 'Compétences métier', metiers, { max: 400, ph: 'Séparées par des virgules', hint: 'Ex. Gestion de projet, Conduite de travaux, Excel' })}
      <div class="mcl-sec">EXPÉRIENCES ET FORMATIONS</div>
      ${nbExp ? `<div class="mcl-note"><span>${ic('desk', 's')}</span><span>${esc(plus(nbExp, 'expérience'))} enregistrée${nbExp > 1 ? 's' : ''} : à modifier sur ordinateur (elles sont conservées telles quelles).</span></div>` : `
        <p class="small muted" style="margin:0 4px 8px">Première expérience (facultatif)</p>
        ${fld('cv-x-poste', 'Poste', '', { max: 120 })}${fld('cv-x-ent', 'Entreprise', '', { max: 120 })}
        <div class="mcl-2">${fld('cv-x-debut', 'Début', '', { type: 'month' })}${fld('cv-x-fin', 'Fin', '', { type: 'month' })}</div>
        <label class="mcl-chk"><input type="checkbox" id="cv-x-act"> Poste actuel</label>
        ${fld('cv-x-desc', 'Description', '', { area: 1, rows: 3, max: 1500 })}`}
      ${nbEdu ? `<div class="mcl-note"><span>${ic('desk', 's')}</span><span>${esc(plus(nbEdu, 'formation'))} enregistrée${nbEdu > 1 ? 's' : ''} : à modifier sur ordinateur (elles sont conservées telles quelles).</span></div>` : `
        <p class="small muted" style="margin:12px 4px 8px">Dernière formation (facultatif)</p>
        ${fld('cv-f-diplome', 'Diplôme', '', { max: 120 })}${fld('cv-f-etab', 'Établissement', '', { max: 120 })}
        ${fld('cv-f-annee', 'Année', '', { type: 'number', im: 'numeric', ph: '2020' })}`}
      <p class="mcl-e" id="mcl-gerr" role="alert" style="margin:8px 2px"></p>
      <p class="small muted" style="margin:8px 4px 0">Photo, couleurs et mise en page : à finir sur ordinateur.</p>
    </form>`;
    setPane(titre, html, `<button class="btn block" type="submit" form="mcl-form" id="mcl-save">Enregistrer</button>`);
    const act = $('#cv-x-act'); if (act) act.onchange = () => { const f = $('#cv-x-fin'); f.disabled = act.checked; if (act.checked) f.value = ''; };
    $('#mcl-form').onsubmit = async ev => {
      ev.preventDefault(); clearErrs();
      const t = val('cv-titre'), pr = val('cv-prenom'), no = val('cv-nom'), em = val('cv-email');
      let ok = true;
      if (!t) ok = setErr('cv-titre', 'Donnez un nom à ce CV pour le retrouver.') && ok;
      if (!edit && !pr) ok = setErr('cv-prenom', 'Indiquez votre prénom.') && ok;
      if (!edit && !no) ok = setErr('cv-nom', 'Indiquez votre nom.') && ok;
      if (!emailOk(em)) ok = setErr('cv-email', 'Cette adresse e-mail ne semble pas valide (exemple : nom@exemple.com).') && ok;
      const xs = !nbExp && ['cv-x-poste', 'cv-x-ent', 'cv-x-debut', 'cv-x-fin', 'cv-x-desc'].some(k => val(k)) || (!nbExp && act && act.checked);
      if (xs && !val('cv-x-poste')) ok = setErr('cv-x-poste', 'Indiquez l’intitulé du poste.') && ok;
      const fs = !nbEdu && ['cv-f-diplome', 'cv-f-etab', 'cv-f-annee'].some(k => val(k));
      if (fs && !val('cv-f-diplome')) ok = setErr('cv-f-diplome', 'Indiquez le diplôme.') && ok;
      const an = val('cv-f-annee'); if (!nbEdu && an && !/^\d{4}$/.test(an)) ok = setErr('cv-f-annee', 'Saisissez une année sur 4 chiffres (ex. 2020).') && ok;
      if (!ok) { $('#mcl-gerr').textContent = 'Certains champs sont à corriger.'; return focusFirstErr(); }
      const btn = $('#mcl-save'); btn.disabled = true; btn.textContent = 'Enregistrement…';
      try {
        let numero;
        if (edit) numero = cv.numero;
        else {
          /* Re-contrôle juste avant d'écrire : le serveur enregistre « par emplacement » et écraserait un CV existant. */
          const now = await api('/api/cv'); numero = freeNumero(now);
          if (!numero) throw new Error('Vous avez déjà 2 CV. Supprimez-en un pour en créer un nouveau.');
        }
        const gab = val('cv-gab') || tpl;
        const nd = edit ? JSON.parse(JSON.stringify(d)) : { style: Object.assign({}, CV_STYLE), photo: { url: '', shape: 'round', size: 80, show: true }, experiences: [], formations: [], competences: { tech: [], metier: [], num: [] }, langues: [], certifications: [], interests: [], media: { audio: null, video: null, signature: null, qr: { enabled: true, url: location.origin + '/profil.html?id=' + S.me.id } } };
        nd.meta = Object.assign({}, nd.meta, { titre: t, numero, template: gab });
        nd.infos = Object.assign({}, nd.infos, { prenom: pr, nom: no, titre_pro: val('cv-titrepro'), nationalite: val('cv-nat'), pays_residence: val('cv-pays'), ville: val('cv-ville'), telephone: val('cv-tel'), email: em, linkedin: val('cv-linkedin'), site: val('cv-site'), adresse: (nd.infos && nd.infos.adresse) || '' });
        nd.resume = val('cv-resume');
        nd.competences = Object.assign({ tech: [], metier: [], num: [] }, nd.competences, { metier: val('cv-comp').split(',').map(x => x.trim()).filter(Boolean) });
        if (!nbExp && xs) nd.experiences = [{ id: Date.now(), poste: val('cv-x-poste'), entreprise: val('cv-x-ent'), ville: '', pays: '', date_debut: val('cv-x-debut'), date_fin: act && act.checked ? '' : val('cv-x-fin'), actuel: !!(act && act.checked), description: val('cv-x-desc') }];
        if (!nbEdu && fs) nd.formations = [{ id: Date.now() + 1, diplome: val('cv-f-diplome'), etablissement: val('cv-f-etab'), pays: '', ville: '', annee: an, description: '' }];
        const r = await api('/api/cv', { method: 'POST', body: { numero, titre: t, theme: gab, data: nd } });
        toast(edit ? 'CV enregistré ✓' : 'CV créé ✓');
        location.replace(`${BASE}/cv/${r.id || (edit ? cv.id : '')}`);
      } catch (e) {
        if (e.status === 401) return A.openLogin('Votre session a expiré : reconnectez-vous pour enregistrer.');
        $('#mcl-gerr').textContent = e.message || 'L’enregistrement a échoué. Vos saisies sont conservées : réessayez.';
        btn.disabled = false; btn.textContent = 'Enregistrer';
      }
    };
  }

  /* ---------- lettre ---------- */
  async function formLm(id) {
    const my = ++seq, edit = !!id, titre = edit ? 'Modifier la lettre' : 'Nouvelle lettre';
    setPane(titre, SK);
    if (!S.me) return loginScreen(titre);
    let lm = null, liste = [];
    try {
      if (edit) lm = await api('/api/lettres/' + id); else liste = await api('/api/lettres');
    } catch (e) { if (!here(my)) return; if (e.status === 404) return notFound(titre, 'Lettre', BASE + '/lettre'); return showErr(titre, e, () => formLm(id)); }
    if (!here(my)) return;
    if (!edit && !freeNumero(liste)) {
      return setPane(titre, `<div class="empty"><div class="ei">${ic('file', 'l')}</div><b>2 lettres déjà enregistrées</b>${esc(KIND.lettre.max)}<br><br><a class="btn" href="${BASE}/lettre">Voir mes lettres</a></div>`);
    }
    const x = edit ? (lm.data || {}) : {}, me = S.me || {};
    const tpl = LM_GAB[x.template] ? x.template : 'classique';
    const aujd = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const f = (k, fb) => edit ? x[k] : fb;
    const html = `<form id="mcl-form" novalidate autocomplete="on">
      <div class="mcl-sec" style="margin-top:4px">DOCUMENT</div>
      ${fld('lm-titre', 'Nom de la lettre', edit ? lm.titre : 'Ma lettre', { req: 1, max: 120, hint: 'Visible uniquement par vous, pour la retrouver.' })}
      ${fld('lm-gab', 'Gabarit', tpl, { options: gabOptions(LM_GAB) })}
      <div class="mcl-sec">VOS COORDONNÉES</div>
      <div class="mcl-2">${fld('lm-prenom', 'Prénom', f('exp_prenom', me.prenom), { max: 80, ac: 'given-name' })}${fld('lm-nom', 'Nom', f('exp_nom', me.nom), { max: 80, ac: 'family-name' })}</div>
      ${fld('lm-adresse', 'Adresse', f('exp_adresse', me.adresse), { max: 160, ac: 'street-address' })}
      ${fld('lm-ville', 'Ville, code postal', f('exp_ville', [me.code_postal, me.ville].filter(Boolean).join(' ')), { max: 100, ac: 'address-level2' })}
      ${fld('lm-tel', 'Téléphone', f('exp_tel', me.telephone), { type: 'tel', max: 40, ac: 'tel', im: 'tel' })}
      ${fld('lm-email', 'E-mail', f('exp_email', me.email), { type: 'email', max: 120, ac: 'email', im: 'email' })}
      <div class="mcl-sec">DESTINATAIRE</div>
      ${fld('lm-dnom', 'Nom du contact', x.dest_nom, { max: 120, ph: 'Ex. M. Jean Martin' })}
      ${fld('lm-dfonc', 'Fonction', x.dest_fonction, { max: 120, ph: 'Ex. Directeur des ressources humaines' })}
      ${fld('lm-dent', 'Entreprise ou organisme', x.dest_entreprise, { max: 120 })}
      ${fld('lm-dadr', 'Adresse', x.dest_adresse, { max: 160 })}
      <div class="mcl-sec">LA LETTRE</div>
      ${fld('lm-lieu', 'Lieu et date', edit ? x.lieu_date : [me.ville, 'le ' + aujd].filter(Boolean).join(', '), { max: 120 })}
      ${fld('lm-objet', 'Objet', x.objet, { max: 160, ph: 'Ex. Candidature au poste de chargé(e) de projet' })}
      ${fld('lm-corps', 'Texte de la lettre', edit ? x.corps : LM_CORPS_TYPE, { area: 1, rows: 14, max: 8000, req: 1, hint: edit ? '' : 'Modèle à adapter : remplacez les passages entre crochets.' })}
      ${fld('lm-sig', 'Signature (texte)', f('sig_texte', [me.prenom, me.nom].filter(Boolean).join(' ')), { max: 100 })}
      <p class="mcl-e" id="mcl-gerr" role="alert" style="margin:8px 2px"></p>
      <p class="small muted" style="margin:8px 4px 0">Mise en page, couleurs, signature manuscrite et QR code : à finir sur ordinateur.</p>
    </form>`;
    setPane(titre, html, `<button class="btn block" type="submit" form="mcl-form" id="mcl-save">Enregistrer</button>`);
    $('#mcl-form').onsubmit = async ev => {
      ev.preventDefault(); clearErrs();
      const t = val('lm-titre'), corps = val('lm-corps'), em = val('lm-email');
      let ok = true;
      if (!t) ok = setErr('lm-titre', 'Donnez un nom à cette lettre pour la retrouver.') && ok;
      if (!corps) ok = setErr('lm-corps', 'Écrivez le texte de votre lettre.') && ok;
      if (!emailOk(em)) ok = setErr('lm-email', 'Cette adresse e-mail ne semble pas valide (exemple : nom@exemple.com).') && ok;
      if (!ok) { $('#mcl-gerr').textContent = 'Certains champs sont à corriger.'; return focusFirstErr(); }
      if (/\[[^\]\n]{2,}\]/.test(corps) && !confirm('Il reste des passages entre crochets (par exemple [poste]) à compléter dans votre lettre.\n\nEnregistrer quand même ?')) return;
      const btn = $('#mcl-save'); btn.disabled = true; btn.textContent = 'Enregistrement…';
      try {
        let numero;
        if (edit) numero = lm.numero;
        else {
          const now = await api('/api/lettres'); numero = freeNumero(now);
          if (!numero) throw new Error('Vous avez déjà 2 lettres. Supprimez-en une pour en créer une nouvelle.');
        }
        const gab = val('lm-gab') || tpl;
        /* On repart des données existantes : signature image, style et QR définis sur ordinateur sont conservés. */
        const nd = edit ? JSON.parse(JSON.stringify(x)) : { sig_image: '', style: Object.assign({}, LM_STYLE), qr: { enabled: true, url: location.origin + '/profil.html?id=' + S.me.id } };
        Object.assign(nd, { exp_prenom: val('lm-prenom'), exp_nom: val('lm-nom'), exp_adresse: val('lm-adresse'), exp_ville: val('lm-ville'), exp_tel: val('lm-tel'), exp_email: em, dest_nom: val('lm-dnom'), dest_fonction: val('lm-dfonc'), dest_entreprise: val('lm-dent'), dest_adresse: val('lm-dadr'), lieu_date: val('lm-lieu'), objet: val('lm-objet'), corps, sig_texte: val('lm-sig'), template: gab });
        const r = await api('/api/lettres', { method: 'POST', body: { numero, titre: t, data: nd } });
        toast(edit ? 'Lettre enregistrée ✓' : 'Lettre créée ✓');
        location.replace(`${BASE}/lettre/${r.id || (edit ? lm.id : '')}`);
      } catch (e) {
        if (e.status === 401) return A.openLogin('Votre session a expiré : reconnectez-vous pour enregistrer.');
        $('#mcl-gerr').textContent = e.message || 'L’enregistrement a échoué. Vos saisies sont conservées : réessayez.';
        btn.disabled = false; btn.textContent = 'Enregistrer';
      }
    };
  }

  /* ============================================================
     CANDIDATURES — suivi en lecture : seul l'organisme qui a publié l'offre peut changer le statut
     (PATCH /api/candidatures/:id/statut est réservé au recruteur) ; le candidat est prévenu par notification.
     ============================================================ */
  async function listCand() {
    const my = ++seq; setPane('Mes candidatures', SK);
    if (!S.me) return loginScreen('Mes candidatures');
    let cands;
    try { cands = await api('/api/candidatures/mes'); if (!Array.isArray(cands)) cands = []; } catch (e) { if (!here(my)) return; return showErr('Mes candidatures', e, listCand); }
    if (!here(my)) return;
    if (!cands.length) {
      return setPane('Mes candidatures', `<div class="empty"><div class="ei">${ic('brief', 'l')}</div><b>Aucune candidature pour le moment</b>Vos candidatures aux offres apparaîtront ici, avec leur statut et leur historique.<br><br><a class="btn" href="emplois-stages.html">Parcourir les offres</a></div>`);
    }
    const nb = fn => cands.filter(fn).length;
    const FILTRES = [
      ['tous', 'Toutes', cands.length, () => true],
      ['cours', 'En cours', nb(candEnCours), candEnCours],
      ['entretien', 'Entretiens', nb(c => ENTRETIEN.includes(candStatut(c))), c => ENTRETIEN.includes(candStatut(c))],
      ['ok', 'Acceptées', nb(c => FIN_OK.includes(candStatut(c))), c => FIN_OK.includes(candStatut(c))],
      ['ko', 'Refusées', nb(c => FIN_KO.includes(candStatut(c))), c => FIN_KO.includes(candStatut(c))]
    ];
    let filtre = 'tous', orgs = null;
    const draw = () => {
      const F = FILTRES.find(x => x[0] === filtre) || FILTRES[0];
      const l = cands.filter(F[3]);
      const rows = l.length ? `<div class="lst">${l.map(c => {
        const st = candStatut(c), lieu = [c.localisation, c.pays].filter(Boolean).join(', ');
        return `<a class="li" href="${BASE}/cand/${c.id}"><span class="ic">${ic('brief')}</span><span class="sp"><span class="t">${esc(c.offre_titre || 'Offre retirée')}</span><br><span class="d"><span data-o="${esc(c.offre_id)}"></span>${esc([lieu, 'le ' + fmtDate(c.created_at)].filter(Boolean).join(' · '))}</span><br><span class="badge ${candBadge(st)}" style="margin-top:4px">${esc(candLabel(st))}</span></span><span class="ch">${ic('chev', 's')}</span></a>`;
      }).join('')}</div>` : `<div class="empty"><b>Aucune candidature dans cette catégorie</b>Choisissez « Toutes » pour tout revoir.</div>`;
      setPane('Mes candidatures', `<div class="chips" role="tablist">${FILTRES.map(x => `<button class="chip ${x[0] === filtre ? 'on' : ''}" data-f="${x[0]}" role="tab" aria-selected="${x[0] === filtre}">${x[1]} <span class="n">${x[2]}</span></button>`).join('')}</div>${rows}
        <div class="mcl-note" style="margin-top:14px"><span>${ic('bell', 's')}</span><span>Le statut est mis à jour par l’organisme qui a publié l’offre : vous êtes prévenu par une notification à chaque changement.</span></div>
        <a class="btn out block" href="emplois-stages.html">${ic('search', 's')} Chercher d’autres offres</a>`);
      $$('#pane-body .chip').forEach(b => b.onclick = () => { filtre = b.dataset.f; draw(); });
      if (orgs) fillOrgs();
    };
    const fillOrgs = () => $$('#pane-body [data-o]').forEach(e => { const n = orgs[e.dataset.o]; if (n) e.textContent = n + ' · '; });
    draw();
    /* Noms des organismes : la route des candidatures ne les fournit pas, on les complète sans bloquer l'écran. */
    try {
      const r = await api('/api/offres');
      if (!here(my)) return;
      /* Une initiative sans fiche liée est renvoyée sous le nom personnel du responsable : on préfère ne rien afficher. */
      orgs = {}; (r.offres || []).forEach(o => { if (o.organisme_nom && !(o.createur_role === 'initiative' && !o.initiative_id)) orgs[o.id] = o.organisme_nom; });
      fillOrgs();
    } catch (e) { /* facultatif */ }
  }

  async function detailCand(id) {
    const my = ++seq; setPane('Candidature', SK);
    if (!S.me) return loginScreen('Candidature');
    let c;
    try { const l = await api('/api/candidatures/mes'); c = (Array.isArray(l) ? l : []).find(x => String(x.id) === String(id)); } catch (e) { if (!here(my)) return; return showErr('Candidature', e, () => detailCand(id)); }
    if (!here(my)) return;
    if (!c) return setPane('Candidature', `<div class="empty"><div class="ei">${ic('brief', 'l')}</div><b>Candidature introuvable</b>Elle n’existe plus ou ne vous appartient pas.<br><br><a class="btn" href="${BASE}/cand">Voir mes candidatures</a></div>`);
    const [ro, rh] = await Promise.allSettled([c.offre_titre ? api('/api/offres/' + encodeURIComponent(c.offre_id)) : Promise.reject(new Error('offre retirée')), api(`/api/candidatures/${encodeURIComponent(c.id)}/historique`)]);
    if (!here(my)) return;
    const o = ro.status === 'fulfilled' ? (ro.value.offre || null) : null;
    const hist = rh.status === 'fulfilled' && Array.isArray(rh.value) ? rh.value.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) : null;
    /* Offre d'une initiative sans fiche liée : le serveur renvoie le nom du responsable ; on cherche le nom de la structure sur son profil. */
    let orgNom = o ? o.organisme_nom : '';
    if (o && o.createur_role === 'initiative' && !o.initiative_id) {
      orgNom = '';
      try { const p = (await api('/api/profil/' + encodeURIComponent(o.createur_id))).profil; orgNom = (p && p.nom_structure) || ''; } catch (e) { /* nom indisponible : on n'affiche pas le nom personnel */ }
      if (!here(my)) return;
    }
    const st = candStatut(c);
    const lieu = o ? [o.ville, o.region, o.pays].filter(Boolean).join(', ') : [c.localisation, c.pays].filter(Boolean).join(', ');
    const ph = o && profilHref(o.organisme_profil_url);
    const kv = (k, v) => v ? `<div class="kv"><span>${esc(k)}</span><span>${v}</span></div>` : '';
    const html = `<div class="card"><div class="pad">
        <h2 style="margin:0 0 4px;font-size:19px;line-height:1.25">${esc(c.offre_titre || 'Offre retirée')}</h2>
        ${orgNom ? `<div class="muted" style="margin-bottom:8px">${ph ? `<a href="${esc(ph)}" style="text-decoration:underline">${esc(orgNom)}</a>` : esc(orgNom)}${o.organisme_verifie ? ' · ' + ic('check', 's') + ' vérifié' : ''}</div>` : ''}
        <div class="tags" style="margin:0 0 10px"><span class="badge ${candBadge(st)}">${esc(candLabel(st))}</span>${o && o.statut && o.statut !== 'publiee' ? '<span class="badge">Offre clôturée</span>' : ''}${!c.offre_titre ? '<span class="badge r">Offre retirée</span>' : ''}</div>
        ${kv('Envoyée le', esc(fmtDate(c.created_at)))}
        ${kv('Type', o ? esc(o.type === 'stage' ? 'Stage' : o.type === 'emploi' ? 'Emploi' : (o.type || '')) : '')}
        ${kv('Contrat', o && o.contrat ? esc(o.contrat) : '')}
        ${kv('Lieu', lieu ? esc(lieu) : '')}
        ${kv('Date limite', o && o.date_limite ? esc(fmtDate(o.date_limite) || o.date_limite) : '')}
        ${kv('Vue par l’organisme', esc(Number(c.vu_recruteur) ? 'Oui' : 'Pas encore'))}</div></div>
      ${(c.cv_titre || c.lettre_titre) ? `<div class="h2">DOCUMENTS JOINTS</div><div class="lst">
        ${c.cv_titre ? `<a class="li" href="${BASE}/cv/${esc(c.cv_profile_id)}"><span class="ic">${ic('doc')}</span><span class="sp"><span class="t">${esc(c.cv_titre)}</span><br><span class="d">CV</span></span><span class="ch">${ic('chev', 's')}</span></a>` : ''}
        ${c.lettre_titre ? `<a class="li" href="${BASE}/lettre/${esc(c.lettre_id)}"><span class="ic">${ic('file')}</span><span class="sp"><span class="t">${esc(c.lettre_titre)}</span><br><span class="d">Lettre de motivation</span></span><span class="ch">${ic('chev', 's')}</span></a>` : ''}</div>` : ''}
      ${c.message ? `<div class="h2">VOTRE MESSAGE</div><div class="card"><div class="pad mcl-txt">${esc(strip(c.message))}</div></div>` : ''}
      <div class="h2">SUIVI</div>
      <div class="card"><div class="pad">${hist === null ? '<span class="muted small">L’historique est indisponible pour le moment.</span>'
        : hist.length ? `<div class="mcl-tl">${hist.map(h => `<div><b>${esc(candLabel(h.statut))}</b><div class="small muted">${esc(fmtDateHeure(h.created_at))}</div>${h.note ? `<div class="mcl-txt small" style="margin-top:3px">${esc(strip(h.note))}</div>` : ''}</div>`).join('')}</div>`
          : '<span class="muted small">Aucun événement enregistré pour l’instant. Chaque évolution du statut apparaîtra ici.</span>'}</div></div>
      <div class="mcl-note"><span>${ic('bell', 's')}</span><span>Seul l’organisme qui a publié l’offre peut faire évoluer le statut de votre candidature. Vous recevez une notification à chaque changement.</span></div>
      <a class="btn out block" href="emplois-stages.html">${ic('search', 's')} Chercher d’autres offres</a>`;
    setPane('Candidature', html);
  }

  /* ============================================================
     ROUTEUR DU MODULE
     ============================================================ */
  window.MMods.cvlettres = function (b, c) {
    css();
    if (!b) return home();
    const num = /^(\d+)(-modifier)?$/.exec(c || '');
    if (b === 'cv') {
      if (!c) return listDocs('cv');
      if (c === 'nouveau') return formCv(null);
      if (num) return num[2] ? formCv(num[1]) : detailCv(num[1]);
    } else if (b === 'lettre') {
      if (!c) return listDocs('lettre');
      if (c === 'nouveau') return formLm(null);
      if (num) return num[2] ? formLm(num[1]) : detailLm(num[1]);
    } else if (b === 'cand') {
      if (!c) return listCand();
      if (/^\d+$/.test(c)) return detailCand(c);
    }
    location.replace(BASE); // adresse inconnue : retour à l'accueil du module
  };
})();
