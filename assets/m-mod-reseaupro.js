/* ============================================================
   Diaspo'Actif — Version téléphone : « Mon Réseau Pro »
   Équivalent téléphone de reseau.html : annuaire des initiatives immatriculées, mon réseau
   (affiliations), demandes reçues, abonnés / abonnements, listes de diffusion, contacts établis,
   statistiques et profil réseau. Mêmes routes API et mêmes règles que le site.

   Routes de hash :
     #/reseaupro                    → annuaire (rubrique par défaut)
     #/reseaupro/<rubrique>         → annuaire · reseau · demandes · abonnes · abonnements ·
                                      listes · contacts · stats · profil
     #/reseaupro/<id>               → fiche d'une initiative (id numérique)
     #/reseaupro/liste/<id>         → une liste de diffusion (contacts, statistiques, actions)

   Règles d'accès : compte Utilisateur = module Premium (le serveur répond 402 sur /api/reseau*),
   compte Initiative = libre. Le serveur reste le seul verrou : on ne devine rien, on affiche ce
   qu'il répond.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, strip, ic, setPane, toast } = A;
  window.MMods = window.MMods || {};

  const NOM = 'Mon Réseau Pro';
  const SITE = 'reseau.html';

  /* Listes de valeurs reprises telles quelles de reseau.html (le serveur compare en égalité stricte). */
  const TYPES_ORG = ['Association', 'Entreprise', 'Fédération', 'ONG', 'Institution', 'Coopérative', 'Entrepreneur individuel', 'Fondation', 'Collectif', 'Réseau'];
  const SECTEURS = ['Action Sociale', 'Agriculture', 'Santé', 'Éducation', 'Technologie', 'Culture', 'Économie', 'Finance', 'Droit', 'Environnement', 'Commerce', 'Immobilier', 'Transport', 'Tourisme', 'Médias', 'Sport', 'Énergie', 'Mode', 'Alimentation', 'Sécurité'];
  const PAYS_IMMAT = { FR: 'France — SIRET', BE: 'Belgique — BCE', CI: 'Côte d’Ivoire — RCCM/IF', SN: 'Sénégal — NINEA', CA: 'Canada — Numéro d’entreprise', MA: 'Maroc — ICE', TN: 'Tunisie — MF', CM: 'Cameroun — RCCM', ML: 'Mali — RCCM', BF: 'Burkina Faso — IFU', MG: 'Madagascar — NIF', GA: 'Gabon — NIF', CG: 'Congo — RCCM', CD: 'RDC — ID Nat.', DE: 'Allemagne — HRB', GB: 'Royaume-Uni — Companies House', US: 'États-Unis — EIN', CH: 'Suisse — IDE' };
  const TAILLES = ['1 (auto-entrepreneur)', '2-10 personnes', '11-50 personnes', '51-200 personnes', '201-500 personnes', '500+ personnes'];
  const FORMES = ['Association loi 1901', 'ONG', 'Fondation', 'SARL', 'SAS', 'SASU', 'EURL', 'SA', 'Société civile', 'Coopérative (SCOP/SCIC)', 'GIE', 'Entreprise individuelle / Auto-entrepreneur'];
  const ICONES_LISTE = ['📋', '⭐', '🏆', '💼', '🌍', '🤝', '💎', '🎯', '📢', '🏛', '✈️', '🌱', '💡', '🔑', '📰', '👥', '🎓', '🏥', '🌐', '❤️'];
  const COULEURS_LISTE = ['#1B3A6B', '#e0760a', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#06b6d4', '#64748b', '#ec4899', '#84cc16'];
  const STATUT_AFFIL = { en_attente: ['En attente', 'o'], accepte: ['Acceptée', 'g'], refuse: ['Refusée', 'r'], suspendu: ['Suspendue', 'r'], info_demandee: ['Infos demandées', 'o'] };

  /* Rubriques : [clé, libellé, nécessite une initiative rattachée au compte] */
  const SECS = [
    ['annuaire', 'Annuaire', false], ['reseau', 'Mon réseau', true], ['demandes', 'Demandes', true],
    ['abonnes', 'Abonnés', false], ['abonnements', 'Abonnements', false], ['listes', 'Listes', false],
    ['contacts', 'Contacts', false], ['stats', 'Statistiques', true], ['profil', 'Profil réseau', true]
  ];

  /* ---------- styles (injectés une seule fois) ---------- */
  (function css() {
    if (document.getElementById('m-mod-reseaupro-css')) return;
    const st = document.createElement('style'); st.id = 'm-mod-reseaupro-css';
    st.textContent = `
.rp-tabs{position:sticky;top:-12px;z-index:6;background:var(--bg);margin:-12px -12px 4px;padding:12px 12px 0}
.rp-card{display:block;padding:14px}
.rp-head{display:flex;gap:12px;align-items:center}
.rp-logo{position:relative;width:52px;height:52px;border-radius:14px;background:var(--navy2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:19px;overflow:hidden;flex:none}
.rp-logo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#fff}
.rp-logo.big{width:68px;height:68px;font-size:25px;border-radius:18px}
.rp-nm{font-weight:700;font-size:16px;line-height:1.2;word-break:break-word}
.rp-desc{font-size:13.5px;color:var(--muted);margin:8px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line}
.rp-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.rp-acts .btn{flex:1 1 auto;min-width:96px}
.rp-quote{margin:10px 0 0;padding:9px 12px;border-left:3px solid var(--sky);background:var(--sky-l);border-radius:0 10px 10px 0;font-size:13.5px;word-break:break-word;white-space:pre-line}
.rp-in{width:100%;min-width:0;min-height:46px;border:1px solid var(--border);border-radius:12px;padding:10px 14px;font-size:16px;background:#fff;color:var(--text);font-family:inherit;line-height:1.3}
textarea.rp-in{min-height:96px;resize:vertical}
.rp-lab{display:block;font-size:13px;font-weight:600;color:var(--muted);margin:14px 2px 5px}
.rp-err{color:var(--red);font-size:13px;min-height:18px;margin:6px 2px 0}
.rp-ico{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:21px;flex:none}
.rp-pick{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 8px;scrollbar-width:none}
.rp-pick::-webkit-scrollbar{display:none}
.rp-pick button{flex:none;width:46px;height:46px;border-radius:12px;border:2px solid var(--border);font-size:22px;background:#fff;display:flex;align-items:center;justify-content:center}
.rp-pick button.on{border-color:var(--navy);background:var(--sky-l)}
.rp-pick.sw button{border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px var(--border)}
.rp-pick.sw button.on{box-shadow:0 0 0 3px var(--navy)}
.rp-opt{display:flex;gap:12px;align-items:flex-start;padding:12px;border:1px solid var(--border);border-radius:12px;background:#fff;margin-bottom:8px;min-height:56px;cursor:pointer}
.rp-opt input{width:22px;height:22px;margin-top:2px;flex:none}
.rp-opt b{display:block;font-size:14.5px}
.rp-opt span{font-size:12.5px;color:var(--muted)}
.rp-note{margin:14px 0 4px;padding:12px 14px;border:1.5px dashed #B8C4D6;border-radius:var(--r);font-size:13.5px;color:var(--muted)}
.rp-note b{color:var(--text)}
.rp-note a{color:var(--navy2);font-weight:700;text-decoration:underline}
.rp-warn{margin-bottom:12px;padding:12px 14px;border-radius:var(--r);background:var(--orange-l);border:1px solid #fed7aa;font-size:14px}
.rp-warn b{display:block;margin-bottom:2px;color:var(--orange-d)}
.rp-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.rp-tile{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px;box-shadow:var(--shadow)}
.rp-tile b{display:block;font-size:26px;line-height:1.1;color:var(--navy)}
.rp-tile span{font-size:12.5px;color:var(--muted)}
.rp-bar{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:13.5px}
.rp-bar .l{flex:0 0 38%;min-width:0}
.rp-bar .bar{flex:1}
.rp-bar .c{flex:0 0 28px;text-align:right;font-weight:700}
.rp-sub{display:flex;gap:8px;margin:0 0 12px}
.rp-sub .chip{flex:1;justify-content:center}
.rp-actbtn{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;padding:8px 14px;border-bottom:1px solid var(--border);text-align:left;font-weight:600}
.rp-actbtn:last-child{border-bottom:none}
.rp-actbtn:active{background:rgba(13,43,78,.05)}
.rp-actbtn.danger{color:var(--red)}
.rp-actbtn .ic{width:36px;height:36px;border-radius:10px;background:var(--sky-l);color:var(--navy2);display:flex;align-items:center;justify-content:center;flex:none}
.rp-actbtn.danger .ic{background:var(--red-l);color:var(--red)}
.btn.rp-t{min-height:44px}
.rp-star{width:44px;min-width:44px!important;flex:0 0 44px!important;padding:0!important}
.rp-star.on{background:#fff6da;border-color:#f59e0b;color:#854d0e}
`;
    document.head.appendChild(st);
  })();

  /* ---------- état du module ---------- */
  const R = {
    tok: 0, uid: null, last: [], ctx: null,
    an: { q: '', secteur: '', type: '', pays: '', ville: '', items: null, shown: 20, seq: 0 },
    paysOpts: [], listArch: false, names: new Map(),
    scrollMem: 0, restoreFor: null
  };
  /* L'écran affiché est-il toujours celui de cette navigation ? Évite qu'une réponse tardive
     écrase un autre écran (retour arrière, autre module ouvert entre-temps). */
  const alive = tok => tok === R.tok && !!S.pane && S.pane.k === 'reseaupro';
  const $p = s => document.querySelector('#pane-body ' + s);
  const skel = (n, h) => '<div class="sk skc" style="height:' + (h || 96) + 'px"></div>'.repeat(n || 2);
  const loc = x => [x.ville, x.pays].filter(Boolean).join(', ');
  const okColor = c => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '#1B3A6B');
  const arr = v => (Array.isArray(v) ? v : []);
  const plural = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);
  const roleLabel = r => A.ROLE_LABEL[r] || (r === 'individu' ? 'Membre' : (r || 'Membre'));
  const initialOf = n => (String(n || '?').trim()[0] || '?').toUpperCase();
  const photo = (u, nom, extraAttr) => '<div class="av" ' + (extraAttr || '') + '>' + (u ? '<img src="' + A.attrUrl(u) + '" alt="" loading="lazy" onerror="this.remove()">' : '<span data-rp-ini>' + esc(A.initials(nom)) + '</span>') + '</div>';
  const logo = (x, big) => '<div class="rp-logo' + (big ? ' big' : '') + '"><span>' + esc(initialOf(x.nom)) + '</span>' + (x.logo_url ? '<img src="' + A.attrUrl(x.logo_url) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</div>';
  const domaineOf = x => x.domaine || x.domaine_principal || '';
  const isVerifiee = x => !!x.organisation_verifiee || arr(x.accreditations).some(a => a === 'verifie' || a === 'initiative_verifiee');
  const isPartenaire = x => arr(x.accreditations).some(a => a === 'partenaire' || a === 'partenaire_officiel');
  const bust = () => { R.ctx = null; };
  /* « il y a 2 h » / « le 25 juil. » à partir de A.ago(), qui ne renvoie que « 2 h » ou « 25 juil. ». */
  const since = d => { const s = A.ago(d); if (!s) return ''; if (s === "à l'instant") return 'à l’instant'; return /^d+ (min|h|j)$/.test(s) ? 'il y a ' + s : 'le ' + s; };

  /* Retour à l'écran précédent ; si l'on est arrivé directement ici (lien profond), on va à la rubrique. */
  const goBack = fb => { if (history.length > 1) history.back(); else location.hash = fb; };

  /* Recharge l'écran courant en gardant la position de défilement (après une action). */
  function reload() {
    const b = document.getElementById('pane-body');
    R.scrollMem = b ? b.scrollTop : 0; R.restoreFor = R.last[0] || 'annuaire';
    bust(); window.MMods.reseaupro(R.last[0], R.last[1]);
  }

  /* ---------- erreurs, connexion, accès ---------- */
  function lockedHtml() {
    return '<div class="empty"><div class="ei">' + ic('lock', 'l') + '</div><b>Module Premium 👑</b>Mon Réseau Pro fait partie de l’abonnement Premium.<br><br><a class="btn" href="mon-abonnement.html">Voir mon abonnement</a></div>';
  }
  function wireLogin(el) { const g = (el || document).querySelector('#go-login'); if (g) g.onclick = () => A.openLogin(); }
  function errInto(el, e, retry) {
    if (!el) return;
    if (e.status === 402) { el.innerHTML = lockedHtml(); A.premiumSheet(NOM); return; }
    if (e.status === 401) { el.innerHTML = A.loginCard('Votre session a expiré. Reconnectez-vous pour continuer.'); wireLogin(el); return; }
    el.innerHTML = '<div class="empty"><div class="ei">' + ic('close', 'l') + '</div><b>Impossible de charger</b>' + esc(e.message || 'Une erreur est survenue.') + '<br><br><button class="btn sm rp-t" data-rp-retry>Réessayer</button></div>';
    const b = el.querySelector('[data-rp-retry]'); if (b) b.onclick = retry;
  }
  function fail(e, titre) {
    setPane(titre, '<div id="rp-fail"></div>');
    errInto(document.getElementById('rp-fail'), e, () => window.MMods.reseaupro(R.last[0], R.last[1]));
  }

  async function loadCtx(force) {
    if (!force && R.ctx && R.ctx.uid === S.me.id && Date.now() - R.ctx.t < 30000) return R.ctx;
    const c = { t: Date.now(), uid: S.me.id, moi: null, monReseau: [], membreDe: [], demandes: [], envoyees: new Map(), contactsAttente: 0 };
    try {
      const r = await api('/api/reseau/me');
      c.moi = r.moi || null; c.monReseau = arr(r.mon_reseau); c.membreDe = arr(r.membre_de);
    } catch (e) { if (e.status !== 404) throw e; /* 404 = aucune initiative rattachée : cas normal d'un compte Utilisateur */ }
    if (c.moi) {
      const [d, v] = await Promise.all([api('/api/reseau/me/demandes').catch(() => ({})), api('/api/reseau/me/envoyees').catch(() => ({}))]);
      c.demandes = arr(d.demandes);
      arr(v.envoyees).forEach(x => c.envoyees.set(Number(x.destinataire_id), x));
    }
    try { const r = await api('/api/demandes-contact?direction=recues&statut=en_attente'); c.contactsAttente = Number(r.en_attente) || 0; } catch (e) { /* le badge est facultatif */ }
    R.ctx = c; return c;
  }

  /* Porte d'entrée de chaque écran : connexion, type de compte, Premium. Renvoie le contexte ou null
     (dans ce cas l'écran d'explication est déjà affiché). */
  async function enter(tok, titre) {
    titre = titre || NOM;
    if (!S.me) {
      setPane(titre, A.loginCard('Connectez-vous pour retrouver votre réseau professionnel.')); wireLogin(); return null;
    }
    if (R.uid !== S.me.id) { /* autre compte (liaison de comptes) : on repart de zéro */
      R.uid = S.me.id; R.ctx = null; R.names = new Map(); R.paysOpts = [];
      R.an = { q: '', secteur: '', type: '', pays: '', ville: '', items: null, shown: 20, seq: 0 };
    }
    if (S.me.role !== 'utilisateur' && S.me.role !== 'initiative') {
      setPane(titre, '<div class="empty"><div class="ei">' + ic('desk', 'l') + '</div><b>À faire sur ordinateur</b>Ce type de compte retrouve son réseau professionnel complet sur le site.<br><br><a class="btn" href="' + SITE + '">Ouvrir sur le site ' + ic('out', 's') + '</a></div>');
      return null;
    }
    setPane(titre, skel(3));
    try { const c = await loadCtx(); return alive(tok) ? c : null; }
    catch (e) { if (alive(tok)) fail(e, titre); return null; }
  }

  /* ---------- actions communes ---------- */
  /* Ouvre (ou crée) la conversation. Une conversation neuve exige un contact établi : dans ce cas
     le serveur répond « contact_requis » et on propose d'envoyer la demande — jamais d'impasse. */
  async function writeTo(uid, nom) {
    if (!(await A.needLogin('Connectez-vous pour écrire à ce compte.'))) return;
    try {
      const r = await api('/api/conversations', { method: 'POST', body: { user_id: Number(uid) } });
      location.hash = '#/conv/' + r.conversation_id;
    } catch (e) {
      if (e.data && e.data.code === 'contact_requis') askContact(uid, nom);
      else toast(e.message, true);
    }
  }
  function askContact(uid, nom) {
    const close = A.openSheet('<h2 style="margin:4px 0 6px;font-size:19px">Établir le contact</h2><p class="muted" style="margin:0 0 14px">Pour écrire à <b style="color:var(--text)">' + esc(nom || 'ce compte') + '</b>, envoyez-lui d’abord une demande de contact. Vous pourrez échanger dès qu’elle sera acceptée.</p><button class="btn block" id="rp-ask-go">Envoyer la demande de contact</button><button class="btn out block" id="rp-ask-no" style="margin-top:10px">Plus tard</button>');
    document.getElementById('rp-ask-no').onclick = close;
    const go = document.getElementById('rp-ask-go');
    go.onclick = async () => {
      go.disabled = true; go.textContent = 'Envoi…';
      try { await api('/api/demandes-contact', { method: 'POST', body: { destinataire_id: Number(uid) } }); close(); toast('Demande de contact envoyée ✓'); }
      catch (e) {
        if (e.data && e.data.code === 'deja_en_attente') { close(); toast('Une demande est déjà en attente auprès de ce compte.'); }
        else if (e.data && e.data.code === 'deja_contacts') { close(); toast('Vous êtes déjà en contact : ouvrez la conversation depuis « Contacts ».'); }
        else { toast(e.message, true); go.disabled = false; go.textContent = 'Envoyer la demande de contact'; }
      }
    };
  }

  /* Le serveur renvoie, pour les comptes non Utilisateur, le nom du RESPONSABLE dans nom/prenom.
     Le nom du compte (initiative, institution) se lit sur la fiche : on le charge à la demande
     pour les seules lignes affichées, 3 appels à la fois. */
  async function fillNames(root, tok) {
    const els = Array.from(root.querySelectorAll('[data-rp-nm]'));
    let i = 0;
    const worker = async () => {
      while (i < els.length) {
        const el = els[i++]; const id = el.dataset.rpNm;
        let n = R.names.get(id);
        if (n == null) {
          /* Si le serveur ne connaît pas de nom de structure, sa propre règle retombe sur le nom enregistré
             du compte (ex. une collectivité sans nom d'institution) : on fait de même. */
          try { const r = await api('/api/profil/' + encodeURIComponent(id)); n = (r.profil && r.profil.nom_structure) || el.dataset.rpFb || ''; R.names.set(id, n); } catch (e) { n = ''; }
        }
        if (!alive(tok)) return;
        if (n && el.isConnected) {
          el.textContent = n;
          const w = el.closest('[data-rp-wrap]'); const av = w && w.querySelector('[data-rp-ini]');
          if (av) av.textContent = A.initials(n);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }
  /* Nom d'une personne ou d'un compte à afficher dans une liste. Pour un compte non Utilisateur,
     on affiche un libellé neutre le temps de charger le vrai nom (jamais le nom du responsable). */
  function nameSpan(x, id) {
    const fb = [x.prenom, x.nom].filter(Boolean).join(' ') || x.nom || 'Compte';
    if (!x.role || x.role === 'utilisateur') return '<span>' + esc(fb) + '</span>';
    return '<span data-rp-nm="' + Number(id) + '" data-rp-fb="' + esc(fb) + '">' + esc(roleLabel(x.role)) + '</span>';
  }
  /* Texte servant à calculer les initiales de l'avatar : pour un compte non Utilisateur, jamais celles du responsable. */
  const avName = x => ((!x.role || x.role === 'utilisateur') ? ([x.prenom, x.nom].filter(Boolean).join(' ') || x.nom || '?') : roleLabel(x.role));

  /* ============================================================
     ROUTEUR
     ============================================================ */
  window.MMods.reseaupro = function (b, c) {
    const tok = ++R.tok; R.last = [b, c];
    if (b && /^\d+$/.test(b)) return paneFiche(Number(b), tok);
    if (b === 'liste' && c && /^\d+$/.test(c)) return paneListe(Number(c), tok);
    return home(SECS.some(s => s[0] === b) ? b : 'annuaire', tok);
  };

  /* ============================================================
     ÉCRAN D'ACCUEIL À RUBRIQUES
     ============================================================ */
  async function home(sec, tok) {
    const ctx = await enter(tok); if (!ctx) return;
    const hasInit = !!ctx.moi;
    const def = SECS.find(s => s[0] === sec);
    const pend = ctx.demandes.filter(d => d.statut === 'en_attente' || d.statut === 'info_demandee').length;
    const chips = SECS.filter(s => !s[2] || hasInit).map(([k, l]) => {
      const n = k === 'demandes' ? pend : (k === 'contacts' ? ctx.contactsAttente : 0);
      return '<a class="chip ' + (k === sec ? 'on' : '') + '" href="#/reseaupro/' + k + '" data-rp-sec="' + k + '" role="tab" aria-selected="' + (k === sec) + '">' + l + (n ? ' <span class="badge o" style="padding:0 7px">' + n + '</span>' : '') + '</a>';
    }).join('');
    setPane(NOM, '<div class="rp-tabs"><div class="chips" role="tablist" aria-label="Rubriques">' + chips + '</div></div><div id="rp-body"></div>');
    document.querySelectorAll('#pane-body [data-rp-sec]').forEach(a => a.onclick = e => {
      e.preventDefault(); R.restoreFor = null;
      /* replace : les rubriques ne polluent pas l'historique ; toucher la rubrique déjà ouverte la recharge. */
      if (a.dataset.rpSec !== sec) location.replace('#/reseaupro/' + a.dataset.rpSec); else { R.scrollMem = 0; R.restoreFor = null; bust(); if (sec === 'annuaire') R.an.items = null; window.MMods.reseaupro(R.last[0], R.last[1]); }
    });
    const on = $p('.chip.on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
    const body = document.getElementById('rp-body');
    if (def[2] && !hasInit) {
      body.innerHTML = '<div class="empty"><div class="ei">' + ic('brief', 'l') + '</div><b>Réservé aux comptes avec une initiative</b>Cette rubrique concerne les initiatives immatriculées qui tiennent un réseau professionnel. Vous pouvez consulter l’annuaire, vos abonnements et vos listes.<br><br><a class="btn" href="#/reseaupro/annuaire">Voir l’annuaire</a></div>';
      return;
    }
    const fn = { annuaire: secAnnuaire, reseau: secReseau, demandes: secDemandes, abonnes: (b2, c2, t2) => secFollow('abonnes', b2, c2, t2), abonnements: (b2, c2, t2) => secFollow('suivis', b2, c2, t2), listes: secListes, contacts: secContacts, stats: secStats, profil: secProfil }[sec];
    await fn(body, ctx, tok);
    if (alive(tok) && R.restoreFor === sec) {
      R.restoreFor = null; const pb = document.getElementById('pane-body'); if (pb) pb.scrollTop = R.scrollMem;
    }
  }
  /* Mémorise la position avant d'ouvrir une fiche, pour la retrouver au retour. */
  function rememberScroll(sec) { const pb = document.getElementById('pane-body'); R.scrollMem = pb ? pb.scrollTop : 0; R.restoreFor = sec; }

  /* ============================================================
     ANNUAIRE DES INITIATIVES IMMATRICULÉES  (GET /api/reseau)
     ============================================================ */
  function initState(i, ctx) {
    if (ctx.moi && Number(ctx.moi.id) === Number(i.id)) return ['Votre initiative', ''];
    const e = ctx.envoyees.get(Number(i.id));
    if (!e) return null;
    if (e.statut === 'accepte') return ['✓ Membre de son réseau', 'g'];
    if (e.statut === 'en_attente') return ['Demande envoyée', 'o'];
    if (e.statut === 'info_demandee') return ['Infos demandées', 'o'];
    return null;
  }
  function initCard(i, ctx) {
    const dom = domaineOf(i), st = initState(i, ctx), desc = strip(i.description || '');
    const tags = [];
    if (isVerifiee(i)) tags.push('<span class="badge g">✓ Vérifiée</span>');
    if (isPartenaire(i)) tags.push('<span class="badge o">⭐ Partenaire</span>');
    if (st) tags.push('<span class="badge ' + st[1] + '">' + esc(st[0]) + '</span>');
    if (i.nb_recommandations) tags.push('<span class="badge">👍 ' + Number(i.nb_recommandations) + '</span>');
    if (i.nb_affiliations) tags.push('<span class="badge">🔗 ' + plural(Number(i.nb_affiliations), 'membre') + '</span>');
    return '<a class="card rp-card" href="#/reseaupro/' + Number(i.id) + '"><div class="rp-head">' + logo(i) +
      '<div class="sp"><div class="rp-nm">' + esc(i.nom) + '</div><div class="small muted ell">' + esc([i.type, dom].filter(Boolean).join(' · ') || 'Initiative') + '</div>' +
      '<div class="meta">' + ic('pin', 's') + '<span class="ell">' + esc(loc(i) || 'Lieu non précisé') + '</span></div></div>' + ic('chev', 's') + '</div>' +
      (desc ? '<p class="rp-desc">' + esc(desc) + '</p>' : '') + (tags.length ? '<div class="tags">' + tags.join('') + '</div>' : '') + '</a>';
  }

  async function secAnnuaire(body, ctx, tok) {
    const f = R.an;
    const nFilt = () => ['secteur', 'type', 'pays', 'ville'].filter(k => f[k]).length;
    body.innerHTML = '<div class="search">' + ic('search', 's') + '<input id="rp-q" type="search" placeholder="Nom, description, secteur…" aria-label="Rechercher une initiative" value="' + esc(f.q) + '"></div>' +
      '<div class="row" style="margin:-2px 0 10px"><button class="btn out sm rp-t" id="rp-filt"></button><span class="sp small muted" id="rp-count" aria-live="polite"></span></div>' +
      '<div id="rp-list"></div><div id="rp-more"></div>';
    const setFiltBtn = () => { document.getElementById('rp-filt').textContent = 'Filtres' + (nFilt() ? ' (' + nFilt() + ')' : ''); };
    setFiltBtn();

    const paint = () => {
      const list = document.getElementById('rp-list'), more = document.getElementById('rp-more'), cnt = document.getElementById('rp-count');
      if (!list) return;
      const a = f.items || [];
      cnt.textContent = a.length ? plural(a.length, 'initiative') + (a.length >= 100 ? ' ou plus' : '') : '';
      if (!a.length) {
        const filtered = f.q || nFilt();
        list.innerHTML = '<div class="empty"><div class="ei">' + ic('search', 'l') + '</div><b>' + (filtered ? 'Aucune initiative trouvée' : 'Aucune initiative pour le moment') + '</b>' +
          (filtered ? 'Modifiez votre recherche ou vos filtres.<br><br><button class="btn sm rp-t" id="rp-reset">Tout réinitialiser</button>' : 'Seules les initiatives immatriculées et visibles dans l’annuaire apparaissent ici.') + '</div>';
        more.innerHTML = '';
        const r = document.getElementById('rp-reset');
        if (r) r.onclick = () => { Object.assign(f, { q: '', secteur: '', type: '', pays: '', ville: '' }); secAnnuaire(body, ctx, tok); };
        return;
      }
      list.innerHTML = a.slice(0, f.shown).map(i => initCard(i, ctx)).join('');
      more.innerHTML = a.length > f.shown ? '<button class="btn out block" id="rp-next">Voir plus (' + (a.length - f.shown) + ')</button>'
        : (a.length >= 100 ? '<p class="small muted" style="text-align:center">Affinez votre recherche pour voir d’autres initiatives.</p>' : '');
      const n = document.getElementById('rp-next'); if (n) n.onclick = () => { f.shown += 20; paint(); };
      list.onclick = e => { if (e.target.closest('a.rp-card')) rememberScroll('annuaire'); };
    };
    const load = async () => {
      const my = ++f.seq, list = document.getElementById('rp-list'); if (list) list.innerHTML = skel(3);
      const p = new URLSearchParams({ limit: '100' });
      ['q', 'secteur', 'type', 'pays', 'ville'].forEach(k => { if (f[k]) p.set(k, f[k]); });
      try {
        const r = await api('/api/reseau?' + p);
        if (!alive(tok) || my !== f.seq) return;
        f.items = arr(r.initiatives); f.shown = 20;
        if (!f.q && !nFilt()) R.paysOpts = Array.from(new Set(f.items.map(i => i.pays).filter(Boolean))).sort((x, y) => x.localeCompare(y, 'fr'));
        paint();
      } catch (e) { if (alive(tok) && my === f.seq) errInto(document.getElementById('rp-list'), e, load); }
    };

    let t; const q = document.getElementById('rp-q');
    q.oninput = () => { clearTimeout(t); t = setTimeout(() => { f.q = q.value.trim(); load(); }, 350); };
    q.onkeydown = e => { if (e.key === 'Enter') q.blur(); };
    document.getElementById('rp-filt').onclick = () => {
      const pays = R.paysOpts.length ? R.paysOpts : Array.from(new Set((f.items || []).map(i => i.pays).filter(Boolean))).sort();
      const opt = (list, cur) => '<option value="">Tous</option>' + list.map(v => '<option ' + (v === cur ? 'selected' : '') + ' value="' + esc(v) + '">' + esc(v) + '</option>').join('');
      const close = A.openSheet('<h2 style="margin:4px 0 0;font-size:19px">Filtrer l’annuaire</h2>' +
        '<label class="rp-lab" for="rp-f-sec">Secteur</label><select class="rp-in" id="rp-f-sec">' + opt(SECTEURS, f.secteur) + '</select>' +
        '<label class="rp-lab" for="rp-f-typ">Type de structure</label><select class="rp-in" id="rp-f-typ">' + opt(TYPES_ORG, f.type) + '</select>' +
        '<label class="rp-lab" for="rp-f-pay">Pays</label><select class="rp-in" id="rp-f-pay">' + opt(pays, f.pays) + '</select>' +
        '<label class="rp-lab" for="rp-f-vil">Ville</label><input class="rp-in" id="rp-f-vil" type="text" autocomplete="off" value="' + esc(f.ville) + '" placeholder="Ex. Lyon">' +
        '<div class="row" style="margin-top:18px"><button class="btn out sp" id="rp-f-raz">Réinitialiser</button><button class="btn sp" id="rp-f-ok">Appliquer</button></div>');
      document.getElementById('rp-f-ok').onclick = () => {
        f.secteur = document.getElementById('rp-f-sec').value; f.type = document.getElementById('rp-f-typ').value;
        f.pays = document.getElementById('rp-f-pay').value; f.ville = document.getElementById('rp-f-vil').value.trim();
        close(); setFiltBtn(); load();
      };
      document.getElementById('rp-f-raz').onclick = () => { f.secteur = f.type = f.pays = f.ville = ''; close(); setFiltBtn(); load(); };
    };
    if (f.items) paint(); else await load();
  }

  /* ============================================================
     FICHE D'UNE INITIATIVE  (GET /api/reseau/:id, /api/reseau/:id/membres)
     ============================================================ */
  async function paneFiche(id, tok) {
    const ctx = await enter(tok, 'Initiative'); if (!ctx) return;
    let r;
    try { r = await api('/api/reseau/' + id); }
    catch (e) {
      if (!alive(tok)) return;
      if (e.status === 404) return setPane('Initiative', '<div class="empty"><div class="ei">' + ic('search', 'l') + '</div><b>Initiative introuvable</b>' + esc(e.message) + '<br><br><a class="btn" href="#/reseaupro/annuaire">Retour à l’annuaire</a></div>');
      return fail(e, 'Initiative');
    }
    if (!alive(tok)) return;
    const i = r.initiative, recos = arr(r.recommandations);
    const isMe = !!(ctx.moi && Number(ctx.moi.id) === Number(i.id));
    const hasImmat = !!(ctx.moi && ctx.moi.numero_immatriculation);
    const env = ctx.envoyees.get(Number(i.id));
    const dom = domaineOf(i), desc = i.description ? A.richHtml(i.description) : '';
    const tags = [];
    if (isVerifiee(i)) tags.push('<span class="badge g">✓ Vérifiée</span>');
    if (isPartenaire(i)) tags.push('<span class="badge o">⭐ Partenaire</span>');
    const facts = [['Fondée en', i.annee_creation], ['Taille', i.taille_structure], ['Type de structure', i.forme_juridique],
      ['Pays d’immatriculation', i.pays_immatriculation ? (PAYS_IMMAT[i.pays_immatriculation] ? PAYS_IMMAT[i.pays_immatriculation].split(' — ')[0] : i.pays_immatriculation) : ''],
      ['Recommandations', i.nb_recommandations || 0], ['Membres du réseau', i.nb_affiliations || 0]].filter(x => x[1] !== '' && x[1] != null);

    let etat = '';
    if (isMe) etat = '<div class="rp-warn" style="background:var(--sky-l);border-color:var(--border)"><b style="color:var(--navy2)">C’est votre initiative</b>Voici comment elle apparaît dans l’annuaire du réseau.</div>';
    else if (env) {
      const lib = { accepte: ['✓ Vous faites partie de son réseau.', 'g'], en_attente: ['Demande envoyée : elle attend la réponse de cette initiative.', 'o'], info_demandee: ['Cette initiative vous demande des informations : écrivez-lui pour les lui transmettre.', 'o'], refuse: ['Votre demande a été refusée.', 'r'], suspendu: ['Votre affiliation a été suspendue.', 'r'] }[env.statut];
      if (lib) etat = '<div class="card pad"><span class="badge ' + lib[1] + '">' + esc(lib[0]) + '</span>' + (env.reponse ? '<div class="rp-quote">' + esc(env.reponse) + '</div>' : '') + '</div>';
    }

    const actions = [];
    if (!isMe && !env && ctx.moi) actions.push('<button class="btn block" id="rp-join">' + ic('plus', 's') + ' Rejoindre son réseau</button>');
    if (!isMe && ctx.moi) actions.push('<button class="btn out block" id="rp-reco">👍 Recommander cette initiative</button>');
    if (!isMe && i.owner_user_id) actions.push('<button class="btn out block" id="rp-addl">' + ic('doc', 's') + ' Ajouter à une liste</button>');
    const noInitNote = !isMe && !ctx.moi ? '<p class="small muted" style="margin:6px 4px 0">Pour rejoindre le réseau d’une initiative ou la recommander, votre compte doit être rattaché à une initiative immatriculée.</p>' : '';

    const html = '<div class="card pad"><div class="rp-head">' + logo(i, true) + '<div class="sp"><h2 style="margin:0 0 2px;font-size:19px;line-height:1.2;word-break:break-word">' + esc(i.nom) + '</h2>' +
      '<div class="small muted">' + esc([i.type, dom].filter(Boolean).join(' · ') || 'Initiative') + '</div>' +
      '<div class="meta">' + ic('pin', 's') + '<span>' + esc(loc(i) || 'Lieu non précisé') + '</span></div></div></div>' +
      (tags.length ? '<div class="tags">' + tags.join('') + '</div>' : '') + '</div>' + etat +
      (desc ? '<div class="card pad rich">' + desc + '</div>' : '') +
      (facts.length ? '<div class="card pad">' + facts.map(([k, v]) => '<div class="kv"><span>' + esc(k) + '</span><span>' + esc(v) + '</span></div>').join('') + '</div>' : '') +
      (arr(i.services).length ? '<div class="h2">SERVICES PROPOSÉS</div><div class="card pad"><div class="tags" style="margin:0">' + arr(i.services).map(s => '<span class="badge">' + esc(s) + '</span>').join('') + '</div></div>' : '') +
      (arr(i.langues).length ? '<div class="h2">LANGUES</div><div class="card pad">' + esc(arr(i.langues).join(', ')) + '</div>' : '') +
      (recos.length ? '<div class="h2">RECOMMANDÉE PAR</div><div class="card pad">' + recos.map(x => '<div class="kv" style="display:block"><b>' + esc(x.nom) + '</b>' + (x.contenu ? '<div class="small muted" style="font-weight:400;text-align:left">« ' + esc(x.contenu) + ' »</div>' : '') + '</div>').join('') + '</div>' : '') +
      '<div id="rp-membres"></div>' +
      (actions.length ? '<div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">' + actions.join('') + '</div>' + noInitNote : noInitNote);
    const foot = !isMe && i.owner_user_id ? '<button class="btn block" id="rp-write">' + ic('chat', 's') + ' Écrire à cette initiative</button>' : '';
    setPane(i.nom, html, foot);

    const w = document.getElementById('rp-write'); if (w) w.onclick = () => writeTo(i.owner_user_id, i.nom);
    const al = document.getElementById('rp-addl'); if (al) al.onclick = () => addToListSheet(i.owner_user_id, i.nom);
    const rc = document.getElementById('rp-reco'); if (rc) rc.onclick = async () => {
      if (!hasImmat) return needImmat('recommander une initiative');
      if (!confirm('Recommander « ' + i.nom + ' » sur Diaspo’Actif ?')) return;
      rc.disabled = true;
      try { await api('/api/reseau/' + i.id + '/recommander', { method: 'POST', body: {} }); toast('Recommandation envoyée ✓'); reload(); }
      catch (e) { toast(e.message, true); rc.disabled = false; }
    };
    const jn = document.getElementById('rp-join'); if (jn) jn.onclick = () => {
      if (!hasImmat) return needImmat('rejoindre un réseau');
      const close = A.openSheet('<h2 style="margin:4px 0 6px;font-size:19px">Rejoindre le réseau</h2><p class="muted" style="margin:0">Réseau de <b style="color:var(--text)">' + esc(i.nom) + '</b>. Votre demande lui sera transmise pour acceptation.</p>' +
        '<label class="rp-lab" for="rp-j-msg">Message de présentation (facultatif)</label><textarea class="rp-in" id="rp-j-msg" maxlength="600" placeholder="Bonjour, nous souhaitons rejoindre votre réseau afin de…"></textarea>' +
        '<button class="btn block" id="rp-j-go" style="margin-top:14px">Envoyer la demande</button>');
      const go = document.getElementById('rp-j-go');
      go.onclick = async () => {
        go.disabled = true; go.textContent = 'Envoi…';
        try { await api('/api/reseau/' + i.id + '/affiliation', { method: 'POST', body: { message: document.getElementById('rp-j-msg').value.trim() || null } }); close(); toast('Demande envoyée ✓'); reload(); }
        catch (e) { toast(e.message, true); go.disabled = false; go.textContent = 'Envoyer la demande'; }
      };
    };

    /* Réseau professionnel de cette initiative : visibilité réglée par son propriétaire. */
    const mem = document.getElementById('rp-membres');
    try {
      const m = await api('/api/reseau/' + id + '/membres');
      if (!alive(tok) || !mem) return;
      const l = arr(m.membres);
      if (l.length) mem.innerHTML = '<div class="h2">RÉSEAU PROFESSIONNEL (' + l.length + ')</div><div class="card pad"><div class="tags" style="margin:0">' + l.map(x => '<a class="badge" style="min-height:32px" href="#/reseaupro/' + Number(x.id) + '">' + esc(x.nom) + '</a>').join('') + '</div></div>';
    } catch (e) {
      if (!alive(tok) || !mem) return;
      if (e.status === 403) mem.innerHTML = '<div class="small muted" style="margin:0 4px 12px">' + ic('lock', 's') + ' ' + (e.data && e.data.visibilite === 'abonnes' ? 'Réseau visible aux abonnés uniquement : abonnez-vous à cette initiative pour le consulter.' : 'Réseau professionnel privé.') + '</div>';
    }
  }
  function needImmat(action) {
    const close = A.openSheet('<div style="text-align:center;padding:4px 4px 8px"><h2 style="margin:4px 0 6px;font-size:19px">Immatriculation requise</h2><p class="muted" style="margin:0 0 14px">Pour ' + esc(action) + ', votre initiative doit avoir un numéro d’immatriculation officiel. Renseignez-le dans votre profil réseau.</p><a class="btn block" id="rp-ni-go" href="#/reseaupro/profil">Compléter mon profil réseau</a><button class="btn out block" id="rp-ni-no" style="margin-top:10px">Plus tard</button></div>');
    document.getElementById('rp-ni-no').onclick = close; document.getElementById('rp-ni-go').onclick = close;
  }

  /* ============================================================
     MON RÉSEAU  (GET /api/reseau/me + demandes pour retrouver les identifiants d'affiliation)
     ============================================================ */
  async function secReseau(body, ctx, tok) {
    const m = ctx.moi;
    const affId = id => { const d = ctx.demandes.find(x => Number(x.demandeur_id) === Number(id) && x.statut === 'accepte'); return d ? d.id : null; };
    const memberCard = (i, own) => {
      const aid = own ? affId(i.id) : null, dom = domaineOf(i);
      return '<div class="card rp-card"><a class="rp-head" href="#/reseaupro/' + Number(i.id) + '" data-rp-fiche>' + logo(i) + '<div class="sp"><div class="rp-nm">' + esc(i.nom) + (i.mise_en_avant ? ' ⭐' : '') + '</div>' +
        '<div class="small muted ell">' + esc([i.type, dom].filter(Boolean).join(' · ') || 'Initiative') + '</div><div class="meta">' + ic('pin', 's') + '<span class="ell">' + esc(loc(i) || 'Lieu non précisé') + '</span></div></div>' + ic('chev', 's') + '</a>' +
        '<div class="rp-acts">' +
        (own && aid ? '<button class="btn out sm rp-t rp-star ' + (i.mise_en_avant ? 'on' : '') + '" data-rp-star="' + aid + '" data-v="' + (i.mise_en_avant ? 0 : 1) + '" aria-pressed="' + (i.mise_en_avant ? 'true' : 'false') + '" aria-label="' + (i.mise_en_avant ? 'Ne plus mettre en avant' : 'Mettre en avant') + ' ' + esc(i.nom) + '">⭐</button>' : '') +
        (i.owner_user_id ? '<button class="btn sm rp-t" data-rp-w="' + Number(i.owner_user_id) + '" data-n="' + esc(i.nom) + '">' + ic('chat', 's') + ' Écrire</button>' : '') +
        (own && aid ? '<button class="btn out sm rp-t" data-rp-ret="' + aid + '" data-n="' + esc(i.nom) + '" style="color:var(--red)">Retirer</button>' : '') + '</div></div>';
    };
    const nMembres = ctx.monReseau.length;
    body.innerHTML =
      (!m.numero_immatriculation ? '<div class="rp-warn"><b>Immatriculation requise</b>Votre initiative doit avoir un numéro d’immatriculation officiel pour apparaître dans les réseaux. <a href="#/reseaupro/profil" style="text-decoration:underline;font-weight:700">Compléter mon profil réseau</a></div>' : '') +
      '<div class="card pad"><div class="rp-head">' + logo(m) + '<div class="sp"><div class="rp-nm">' + esc(m.nom) + '</div><div class="small muted">' + plural(nMembres, 'membre') + ' dans votre réseau · membre de ' + plural(ctx.membreDe.length, 'réseau', 'réseaux') + '</div></div></div></div>' +
      '<div class="h2">MEMBRES DE MON RÉSEAU (' + nMembres + ')</div>' +
      (nMembres ? ctx.monReseau.map(i => memberCard(i, true)).join('') : '<div class="empty"><div class="ei">' + ic('people', 'l') + '</div><b>Votre réseau est vide</b>Les initiatives dont vous acceptez la demande d’affiliation rejoignent ici votre réseau professionnel.<br><br><a class="btn" href="#/reseaupro/demandes">Voir les demandes</a></div>') +
      (ctx.membreDe.length ? '<div class="h2">JE SUIS MEMBRE DE (' + ctx.membreDe.length + ')</div>' + ctx.membreDe.map(i => memberCard(i, false)).join('') : '') +
      '<div class="h2">VISIBILITÉ</div><a class="lst li" href="#/reseaupro/profil"><span class="ic">' + ic('lock') + '</span><span class="sp"><span class="t">Qui voit mon réseau ?</span><br><span class="d">Privé, abonnés ou tous les membres</span></span><span class="ch">' + ic('chev', 's') + '</span></a>';

    body.onclick = async e => {
      if (e.target.closest('[data-rp-fiche]')) { rememberScroll('reseau'); return; }
      const w = e.target.closest('[data-rp-w]'); if (w) { writeTo(w.dataset.rpW, w.dataset.n); return; }
      const s = e.target.closest('[data-rp-star]');
      if (s) {
        s.disabled = true;
        try { await api('/api/reseau/affiliations/' + s.dataset.rpStar, { method: 'PATCH', body: { mise_en_avant: s.dataset.v === '1' } }); toast(s.dataset.v === '1' ? 'Mis en avant sur votre fiche ✓' : 'Retiré de la mise en avant'); reload(); }
        catch (er) { toast(er.message, true); s.disabled = false; }
        return;
      }
      const r = e.target.closest('[data-rp-ret]');
      if (r) {
        if (!confirm('Retirer « ' + r.dataset.n + ' » de votre réseau ? Cette initiative ne fera plus partie de votre réseau professionnel.')) return;
        r.disabled = true;
        try { await api('/api/reseau/affiliations/' + r.dataset.rpRet, { method: 'DELETE' }); toast('Retirée de votre réseau'); reload(); }
        catch (er) { toast(er.message, true); r.disabled = false; }
      }
    };
  }

  /* ============================================================
     DEMANDES D'AFFILIATION REÇUES  (GET /api/reseau/me/demandes, PATCH /api/reseau/affiliations/:id)
     ============================================================ */
  async function secDemandes(body, ctx, tok) {
    const dem = ctx.demandes, env = Array.from(ctx.envoyees.values());
    const badge = s => { const x = STATUT_AFFIL[s] || [s, '']; return '<span class="badge ' + x[1] + '">' + esc(x[0]) + '</span>'; };
    const card = d => {
      const open = d.statut === 'en_attente' || d.statut === 'info_demandee';
      return '<div class="card rp-card"><a class="rp-head" href="#/reseaupro/' + Number(d.demandeur_id) + '" data-rp-fiche>' + logo(d) + '<div class="sp"><div class="rp-nm">' + esc(d.nom) + '</div>' +
        '<div class="small muted">' + esc([d.type, d.domaine].filter(Boolean).join(' · ') || 'Initiative') + '</div><div class="meta">' + ic('pin', 's') + '<span class="ell">' + esc(loc(d) || 'Lieu non précisé') + '</span></div></div>' + ic('chev', 's') + '</a>' +
        '<div class="tags">' + badge(d.statut) + (d.updated_at ? '<span class="badge">' + esc(since(d.updated_at)) + '</span>' : '') + '</div>' +
        (d.numero_immatriculation ? '<div class="small muted" style="margin-top:8px">N° d’immatriculation : ' + esc(d.numero_immatriculation) + '</div>' : '') +
        (d.message ? '<div class="rp-quote">« ' + esc(d.message) + ' »</div>' : '') +
        (d.reponse && !open ? '<div class="small muted" style="margin-top:8px">Votre réponse : « ' + esc(d.reponse) + ' »</div>' : '') +
        (open ? '<div class="rp-acts"><button class="btn" data-rp-rep="' + d.id + '" data-n="' + esc(d.nom) + '">Répondre</button></div>'
          : (d.statut === 'accepte' ? '<div class="rp-acts"><button class="btn out" data-rp-susp="' + d.id + '">Suspendre l’affiliation</button></div>' : '')) + '</div>';
    };
    body.innerHTML = (dem.length ? dem.map(card).join('') : '<div class="empty"><div class="ei">' + ic('bell', 'l') + '</div><b>Aucune demande</b>Les demandes d’affiliation à votre réseau apparaîtront ici.</div>') +
      (env.length ? '<div class="h2">MES DEMANDES ENVOYÉES</div><div class="lst">' + env.map(x => '<a class="li" href="#/reseaupro/' + Number(x.destinataire_id) + '" data-rp-fiche><span class="ic">' + ic('send') + '</span><span class="sp"><span class="t">' + esc(x.nom) + '</span><br><span class="d">' + esc((STATUT_AFFIL[x.statut] || [x.statut])[0]) + (x.reponse ? ' · « ' + esc(strip(x.reponse).slice(0, 80)) + ' »' : '') + '</span></span><span class="ch">' + ic('chev', 's') + '</span></a>').join('') + '</div>' : '');

    body.onclick = e => {
      if (e.target.closest('[data-rp-fiche]')) { rememberScroll('demandes'); return; }
      const rep = e.target.closest('[data-rp-rep]');
      if (rep) { respondSheet(Number(rep.dataset.rpRep), rep.dataset.n); return; }
      const su = e.target.closest('[data-rp-susp]');
      if (su) {
        if (!confirm('Suspendre cette affiliation ? L’initiative sera prévenue.')) return;
        su.disabled = true;
        api('/api/reseau/affiliations/' + su.dataset.rpSusp, { method: 'PATCH', body: { statut: 'suspendu' } })
          .then(() => { toast('Affiliation suspendue'); reload(); }).catch(er => { toast(er.message, true); su.disabled = false; });
      }
    };
  }
  function respondSheet(affId, nom) {
    const close = A.openSheet('<h2 style="margin:4px 0 4px;font-size:19px">Répondre à la demande</h2><p class="muted" style="margin:0">De <b style="color:var(--text)">' + esc(nom) + '</b></p>' +
      '<label class="rp-lab" for="rp-r-msg">Message de réponse (facultatif)</label><textarea class="rp-in" id="rp-r-msg" maxlength="600" placeholder="Votre réponse…"></textarea>' +
      '<div style="display:flex;flex-direction:column;gap:10px;margin-top:14px"><button class="btn block" id="rp-r-ok" style="background:var(--green);border-color:var(--green)">✓ Accepter</button>' +
      '<button class="btn out block" id="rp-r-info">Demander des informations</button><button class="btn out block" id="rp-r-no" style="color:var(--red)">Refuser</button></div>');
    const send = async (statut, btn, okMsg) => {
      const all = ['rp-r-ok', 'rp-r-info', 'rp-r-no'].map(i => document.getElementById(i)); all.forEach(b => b.disabled = true);
      try { await api('/api/reseau/affiliations/' + affId, { method: 'PATCH', body: { statut, reponse: document.getElementById('rp-r-msg').value.trim() || null } }); close(); toast(okMsg); reload(); }
      catch (e) { toast(e.message, true); all.forEach(b => b.disabled = false); }
    };
    document.getElementById('rp-r-ok').onclick = () => send('accepte', null, 'Affiliation acceptée ✓');
    document.getElementById('rp-r-info').onclick = () => send('info_demandee', null, 'Demande d’informations envoyée');
    document.getElementById('rp-r-no').onclick = () => { if (confirm('Refuser cette demande d’affiliation ?')) send('refuse', null, 'Demande refusée'); };
  }

  /* ============================================================
     ABONNÉS / ABONNEMENTS  (GET /api/profil/:id/abonnes | suivis)
     ============================================================ */
  async function secFollow(type, body, ctx, tok) {
    const isAbo = type === 'abonnes';
    const st = { items: [], page: 0, pages: 1, total: 0 };
    body.innerHTML = '<p class="small muted" style="margin:0 4px 12px">' + (isAbo ? 'Un compte abonné à vous peut vous écrire directement, sans demande préalable.' : 'Écrire à un compte que vous suivez, sans qu’il vous suive en retour, demande d’abord une demande de contact.') + '</p><div id="rp-fl"></div><div id="rp-fm"></div>';
    const card = x => {
      const nm = [x.prenom, x.nom].filter(Boolean).join(' ') || x.nom || 'Compte';
      return '<div class="card rp-card" data-rp-wrap><div class="rp-head">' + photo(x.photo_url, avName(x)) + '<div class="sp"><div class="rp-nm">' + nameSpan(x, x.id) + '</div>' +
        '<div class="small muted">' + esc(roleLabel(x.role)) + (x.titre_pro ? ' · ' + esc(x.titre_pro) : '') + '</div>' +
        (loc(x) ? '<div class="meta">' + ic('pin', 's') + '<span class="ell">' + esc(loc(x)) + '</span></div>' : '') + '</div></div>' +
        '<div class="rp-acts"><a class="btn out sm rp-t" href="profil.html?id=' + encodeURIComponent(x.id) + '">Voir le profil</a><button class="btn sm rp-t" data-rp-w="' + Number(x.id) + '" data-n="' + esc(x.role === 'utilisateur' ? nm : 'ce compte') + '">' + ic('chat', 's') + ' Écrire</button></div></div>';
    };
    const paint = (append) => {
      const l = document.getElementById('rp-fl'), m = document.getElementById('rp-fm');
      if (!st.items.length) {
        l.innerHTML = '<div class="empty"><div class="ei">' + ic(isAbo ? 'heart' : 'people', 'l') + '</div><b>Aucun compte pour l’instant</b>' + (isAbo ? 'Les comptes qui s’abonnent à vous apparaîtront ici : vous pourrez leur écrire directement.' : 'Les comptes auxquels vous vous abonnez (initiatives, collectivités, institutions…) apparaîtront ici.<br><br><a class="btn" href="#/annuaire">Explorer l’annuaire</a>') + '</div>';
        m.innerHTML = ''; return;
      }
      const fresh = st.items.slice(append || 0);
      if (!append) l.innerHTML = '<div class="h2" style="margin-top:0">' + (isAbo ? 'ABONNÉS' : 'ABONNEMENTS') + ' (' + st.total + ')</div>';
      l.insertAdjacentHTML('beforeend', fresh.map(card).join(''));
      m.innerHTML = st.page < st.pages ? '<button class="btn out block" id="rp-fmore">Voir plus</button>' : '';
      const mb = document.getElementById('rp-fmore'); if (mb) mb.onclick = () => loadPage(mb);
      fillNames(l, tok);
    };
    const loadPage = async btn => {
      if (btn) { btn.disabled = true; btn.textContent = 'Chargement…'; }
      try {
        const r = await api('/api/profil/' + S.me.id + '/' + type + '?page=' + (st.page + 1));
        if (!alive(tok)) return;
        const before = st.items.length;
        st.items = st.items.concat(arr(r[type])); st.page = r.page || st.page + 1; st.pages = r.pages || 1; st.total = r.total != null ? r.total : st.items.length;
        paint(before);
      } catch (e) {
        if (!alive(tok)) return;
        if (!st.items.length) errInto(document.getElementById('rp-fl'), e, () => secFollow(type, body, ctx, tok)); else { toast(e.message, true); if (btn) { btn.disabled = false; btn.textContent = 'Voir plus'; } }
      }
    };
    body.onclick = e => { const w = e.target.closest('[data-rp-w]'); if (w) writeTo(w.dataset.rpW, R.names.get(String(w.dataset.rpW)) || w.dataset.n); };
    document.getElementById('rp-fl').innerHTML = skel(3);
    await loadPage(null);
  }

  /* ============================================================
     LISTES DE DIFFUSION  (/api/listes-diffusion…)
     ============================================================ */
  const DESKTOP_LISTES = '<div class="rp-note"><b>À faire sur ordinateur</b><br>Créer une liste par critères (pays, profession, compétence…), fusionner des listes, exporter en CSV, joindre un fichier à un message de liste.<br><a href="' + SITE + '?tab=listes">Ouvrir mes listes sur le site ' + '↗</a></div>';

  async function secListes(body, ctx, tok) {
    body.innerHTML = skel(3, 72);
    let l;
    try { l = arr((await api('/api/listes-diffusion' + (R.listArch ? '?archived=1' : ''))).listes); }
    catch (e) { if (alive(tok)) errInto(body, e, () => secListes(body, ctx, tok)); return; }
    if (!alive(tok)) return;
    const nb = l.reduce((s, x) => s + (Number(x.nb_contacts) || 0), 0);
    body.innerHTML = '<div class="row" style="margin-bottom:12px"><div class="sp"><b style="font-size:17px">' + (R.listArch ? 'Listes archivées' : 'Mes listes') + '</b><div class="small muted">' + plural(l.length, 'liste') + ' · ' + plural(nb, 'contact') + '</div></div>' +
      (R.listArch ? '' : '<button class="btn sm rp-t" id="rp-newl">' + ic('plus', 's') + ' Nouvelle liste</button>') + '</div>' +
      '<div class="rp-sub"><button class="chip ' + (R.listArch ? '' : 'on') + '" data-rp-arch="0">Actives</button><button class="chip ' + (R.listArch ? 'on' : '') + '" data-rp-arch="1">Archivées</button></div>' +
      (l.length ? '<div class="lst">' + l.map(x => {
        const c = okColor(x.couleur);
        return '<a class="li" href="#/reseaupro/liste/' + Number(x.id) + '"><span class="ic rp-ico" style="background:' + c + '22;color:' + c + '">' + esc(x.icone || '📋') + '</span><span class="sp"><span class="t">' + esc(x.nom) + '</span><br><span class="d">' + plural(Number(x.nb_contacts) || 0, 'contact') + ' · ' + (x.mode === 'dynamique' ? '🔄 Dynamique' : '📌 Figée') + '</span></span><span class="ch">' + ic('chev', 's') + '</span></a>';
      }).join('') + '</div>' : '<div class="empty"><div class="ei">' + ic('doc', 'l') + '</div><b>' + (R.listArch ? 'Aucune liste archivée' : 'Aucune liste') + '</b>' + (R.listArch ? 'Les listes que vous archivez sont rangées ici.' : 'Créez votre première liste pour organiser vos contacts : adhérents, partenaires, investisseurs…') + '</div>') +
      DESKTOP_LISTES;
    body.querySelectorAll('[data-rp-arch]').forEach(b => b.onclick = () => { R.listArch = b.dataset.rpArch === '1'; secListes(body, ctx, tok); });
    const nw = document.getElementById('rp-newl'); if (nw) nw.onclick = () => listForm(null, id => { location.hash = '#/reseaupro/liste/' + id; });
    body.querySelectorAll('a.li').forEach(a => a.onclick = () => rememberScroll('listes'));
  }

  /* Formulaire de liste (création manuelle / modification) en feuille du bas. */
  function listForm(l, done) {
    let ico = (l && l.icone) || '📋', col = okColor(l && l.couleur);
    const close = A.openSheet('<h2 style="margin:4px 0 0;font-size:19px">' + (l ? 'Modifier la liste' : 'Nouvelle liste') + '</h2>' +
      '<label class="rp-lab" for="rp-l-nom">Nom de la liste *</label><input class="rp-in" id="rp-l-nom" maxlength="80" value="' + esc(l ? l.nom : '') + '" placeholder="Ex. Adhérents 2026">' +
      '<label class="rp-lab" for="rp-l-desc">Description</label><textarea class="rp-in" id="rp-l-desc" maxlength="300" style="min-height:70px">' + esc(l && l.description ? l.description : '') + '</textarea>' +
      '<label class="rp-lab" for="rp-l-notes">Notes personnelles</label><textarea class="rp-in" id="rp-l-notes" maxlength="500" style="min-height:70px">' + esc(l && l.notes ? l.notes : '') + '</textarea>' +
      '<span class="rp-lab">Icône</span><div class="rp-pick" id="rp-l-ico">' + ICONES_LISTE.map(x => '<button type="button" data-v="' + x + '" aria-label="Icône ' + x + '" class="' + (x === ico ? 'on' : '') + '">' + x + '</button>').join('') + '</div>' +
      '<span class="rp-lab">Couleur</span><div class="rp-pick sw" id="rp-l-col">' + COULEURS_LISTE.map(x => '<button type="button" data-v="' + x + '" aria-label="Couleur ' + x + '" style="background:' + x + '" class="' + (x === col ? 'on' : '') + '"></button>').join('') + '</div>' +
      '<p class="rp-err" id="rp-l-err" role="alert"></p><button class="btn block" id="rp-l-go">' + (l ? 'Enregistrer' : 'Créer la liste') + '</button>' +
      (l ? '' : '<p class="small muted" style="margin:10px 2px 0">La liste est créée vide : ajoutez-y des membres depuis les fiches de l’annuaire ou par e-mail.</p>'));
    const pick = (id, set) => document.querySelectorAll('#' + id + ' button').forEach(b => b.onclick = () => { set(b.dataset.v); document.querySelectorAll('#' + id + ' button').forEach(x => x.classList.toggle('on', x === b)); });
    pick('rp-l-ico', v => { ico = v; }); pick('rp-l-col', v => { col = v; });
    const go = document.getElementById('rp-l-go'), err = document.getElementById('rp-l-err');
    go.onclick = async () => {
      const nom = document.getElementById('rp-l-nom').value.trim();
      if (!nom) { err.textContent = 'Donnez un nom à la liste.'; document.getElementById('rp-l-nom').focus(); return; }
      err.textContent = ''; go.disabled = true; go.textContent = 'Enregistrement…';
      /* Chaînes vides (et non null) : à la modification, le serveur garde l'ancienne valeur si on lui envoie null,
         ce qui empêcherait d'effacer une description ou des notes. */
      const data = { nom, description: document.getElementById('rp-l-desc').value.trim(), notes: document.getElementById('rp-l-notes').value.trim(), icone: ico, couleur: col };
      try {
        let id = l && l.id;
        if (l) { await api('/api/listes-diffusion/' + l.id, { method: 'PUT', body: data }); toast('Liste modifiée ✓'); }
        else { id = (await api('/api/listes-diffusion', { method: 'POST', body: data })).id; toast('Liste créée ✓'); }
        close(); done(id);
      } catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = l ? 'Enregistrer' : 'Créer la liste'; }
    };
  }

  /* Ajouter une personne de la plateforme à une de mes listes (ou à une nouvelle). */
  async function addToListSheet(userId, nom) {
    if (!(await A.needLogin('Connectez-vous pour gérer vos listes.'))) return;
    const close = A.openSheet('<h2 style="margin:4px 0 4px;font-size:19px">Ajouter à une liste</h2><p class="muted" style="margin:0 0 10px">' + esc(nom) + '</p><div id="rp-al-l">' + skel(2, 56) + '</div>');
    const box = () => document.getElementById('rp-al-l');
    const add = async (lid, btn) => {
      btn.disabled = true;
      try { await api('/api/listes-diffusion/' + lid + '/contacts', { method: 'POST', body: { user_id: Number(userId) } }); toast('Ajouté à la liste ✓'); close(); }
      catch (e) { toast(e.message, true); btn.disabled = false; }
    };
    try {
      const [ls, chk] = await Promise.all([api('/api/listes-diffusion'), api('/api/listes-diffusion/check-user', { method: 'POST', body: { user_id: Number(userId) } })]);
      const dans = new Set(arr(chk.liste_ids).map(Number)), l = arr(ls.listes);
      if (!box()) return;
      box().innerHTML = (l.length ? '<div class="lst">' + l.map(x => '<div class="li" style="cursor:default"><span class="ic rp-ico" style="background:' + okColor(x.couleur) + '22;color:' + okColor(x.couleur) + '">' + esc(x.icone || '📋') + '</span><span class="sp"><span class="t">' + esc(x.nom) + '</span><br><span class="d">' + plural(Number(x.nb_contacts) || 0, 'contact') + '</span></span>' +
        (dans.has(Number(x.id)) ? '<span class="badge g">✓ Présent</span>' : '<button class="btn sm rp-t" data-rp-add="' + Number(x.id) + '">Ajouter</button>') + '</div>').join('') + '</div>' : '<p class="muted small">Vous n’avez pas encore de liste : créez-en une ci-dessous.</p>') +
        '<label class="rp-lab" for="rp-al-new">Ou créer une nouvelle liste</label><div class="row"><input class="rp-in" id="rp-al-new" maxlength="80" placeholder="Nom de la liste"><button class="btn sm rp-t" id="rp-al-mk" style="flex:none">Créer et ajouter</button></div>';
      box().onclick = e => { const b = e.target.closest('[data-rp-add]'); if (b) add(b.dataset.rpAdd, b); };
      document.getElementById('rp-al-mk').onclick = async e => {
        const n = document.getElementById('rp-al-new').value.trim(); if (!n) { toast('Donnez un nom à la nouvelle liste.', true); return; }
        const b = e.currentTarget; b.disabled = true;
        try { const r = await api('/api/listes-diffusion', { method: 'POST', body: { nom: n } }); await api('/api/listes-diffusion/' + r.id + '/contacts', { method: 'POST', body: { user_id: Number(userId) } }); toast('Liste créée et contact ajouté ✓'); close(); }
        catch (er) { toast(er.message, true); b.disabled = false; }
      };
    } catch (e) { if (box()) box().innerHTML = '<p class="small" style="color:var(--red)">' + esc(e.message) + '</p>'; }
  }

  /* ---------- une liste : contacts, statistiques, actions ---------- */
  async function paneListe(id, tok) {
    const ctx = await enter(tok, 'Liste'); if (!ctx) return;
    let l = null, contacts = [];
    try {
      for (const q of ['', '?archived=1']) {
        l = arr((await api('/api/listes-diffusion' + q)).listes).find(x => Number(x.id) === id);
        if (l) break;
      }
      if (!l) { if (alive(tok)) setPane('Liste', '<div class="empty"><div class="ei">' + ic('doc', 'l') + '</div><b>Liste introuvable</b>Elle a peut-être été supprimée.<br><br><a class="btn" href="#/reseaupro/listes">Mes listes</a></div>'); return; }
      contacts = arr((await api('/api/listes-diffusion/' + id + '/contacts')).contacts);
    } catch (e) { if (alive(tok)) fail(e, 'Liste'); return; }
    if (!alive(tok)) return;

    const st = { tab: 'contacts', q: '', shown: 30 };
    const col = okColor(l.couleur), archived = Number(l.archived) === 1;
    const nbPlat = contacts.filter(c => c.user_id).length;
    setPane(l.nom,
      '<div class="card pad"><div class="rp-head"><span class="rp-ico" style="background:' + col + '22;color:' + col + ';width:52px;height:52px;font-size:26px;border-radius:14px">' + esc(l.icone || '📋') + '</span><div class="sp"><h2 style="margin:0;font-size:19px;line-height:1.2;word-break:break-word">' + esc(l.nom) + '</h2><div class="small muted">' + plural(contacts.length, 'contact') + ' · ' + (l.mode === 'dynamique' ? '🔄 Dynamique' : '📌 Figée') + (archived ? ' · archivée' : '') + '</div></div></div>' +
      (l.description ? '<p style="margin:10px 0 0">' + esc(l.description) + '</p>' : '') +
      (l.notes ? '<div class="rp-quote" style="border-color:#f59e0b;background:#fff8e1">📝 ' + esc(l.notes) + '</div>' : '') +
      '<div class="rp-acts"><button class="btn" id="rp-lw">' + ic('send', 's') + ' Écrire à la liste</button></div>' +
      '<div class="rp-acts" style="margin-top:8px"><button class="btn out sm rp-t" id="rp-le">Modifier</button>' + (l.mode === 'dynamique' ? '<button class="btn out sm rp-t" id="rp-lr">Actualiser</button>' : '') + '<button class="btn out sm rp-t" id="rp-ld">Dupliquer</button><button class="btn out sm rp-t" id="rp-la">' + (archived ? 'Désarchiver' : 'Archiver') + '</button><button class="btn out sm rp-t" id="rp-lx" style="color:var(--red)">Supprimer</button></div></div>' +
      '<div class="rp-sub"><button class="chip on" data-rp-t="contacts">Contacts</button><button class="chip" data-rp-t="stats">Statistiques</button></div><div id="rp-lb"></div>' + DESKTOP_LISTES);

    const lb = () => document.getElementById('rp-lb');
    const paintContacts = () => {
      const q = st.q.toLowerCase();
      const a = q ? contacts.filter(c => [c.nom_plateforme || c.nom, c.email && !c.user_id ? c.email : '', c.pays, c.ville, roleLabel(c.role)].join(' ').toLowerCase().includes(q)) : contacts;
      const box = document.getElementById('rp-lc'); if (!box) return;
      if (!a.length) { box.innerHTML = '<div class="empty"><div class="ei">' + ic('people', 'l') + '</div><b>' + (q ? 'Aucun résultat' : 'Aucun contact dans cette liste') + '</b>' + (q ? 'Essayez un autre mot.' : 'Ajoutez des membres depuis l’annuaire ou les fiches du réseau, ou un contact par e-mail.') + '</div>'; document.getElementById('rp-lm').innerHTML = ''; return; }
      box.innerHTML = '<div class="lst">' + a.slice(0, st.shown).map(c => {
        const nm = c.nom_plateforme || c.nom || c.email || 'Contact';
        const sub = c.user_id ? [roleLabel(c.role), loc(c)].filter(Boolean).join(' · ') : (c.email || '') + ' · hors plateforme';
        const nmHtml = c.user_id ? nameSpan({ role: c.role, nom: c.nom_plateforme || c.nom, prenom: null }, c.user_id) : '<span>' + esc(nm) + '</span>';
        return '<button class="li" data-rp-c="' + Number(c.id) + '" data-rp-wrap>' + photo(c.photo_url, c.user_id ? avName({ role: c.role, nom: nm }) : nm) + '<span class="sp"><span class="t">' + nmHtml + '</span><br><span class="d">' + esc(sub) + '</span></span><span class="ch">' + ic('chev', 's') + '</span></button>';
      }).join('') + '</div>';
      document.getElementById('rp-lm').innerHTML = a.length > st.shown ? '<button class="btn out block" id="rp-lmore" style="margin-top:12px">Voir plus (' + (a.length - st.shown) + ')</button>' : '';
      const mb = document.getElementById('rp-lmore'); if (mb) mb.onclick = () => { st.shown += 30; paintContacts(); };
      fillNames(box, tok);
    };
    const showContacts = () => {
      lb().innerHTML = '<div class="row" style="margin-bottom:10px"><div class="search sp" style="margin:0">' + ic('search', 's') + '<input id="rp-lq" type="search" placeholder="Rechercher dans la liste…" aria-label="Rechercher dans la liste"></div><button class="btn sm rp-t" id="rp-lad" aria-label="Ajouter un contact par e-mail" style="flex:none;min-width:46px;padding:0 12px">' + ic('plus', 's') + ' E-mail</button></div><div id="rp-lc"></div><div id="rp-lm"></div>';
      const qi = document.getElementById('rp-lq'); let t; qi.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = qi.value.trim(); st.shown = 30; paintContacts(); }, 200); };
      document.getElementById('rp-lad').onclick = () => emailSheet(id, () => reload());
      document.getElementById('rp-lc').onclick = e => { const b = e.target.closest('[data-rp-c]'); if (b) contactSheet(contacts.find(c => Number(c.id) === Number(b.dataset.rpC)), l); };
      paintContacts();
    };
    const showStats = async () => {
      lb().innerHTML = skel(2, 80);
      try {
        const s = (await api('/api/listes-diffusion/' + id + '/stats')).stats;
        if (!alive(tok) || st.tab !== 'stats' || !lb()) return;
        const bloc = (titre, obj) => {
          const e = Object.entries(obj || {}).sort((x, y) => y[1] - x[1]).slice(0, 8); if (!e.length) return '';
          const max = e[0][1] || 1;
          return '<div class="h2">' + titre + '</div><div class="card pad">' + e.map(([k, v]) => '<div class="rp-bar"><span class="l ell">' + esc(k === 'utilisateur' || k === 'initiative' || k === 'collectivite' || k === 'administrateur' ? roleLabel(k) : k) + '</span><span class="bar"><i style="width:' + Math.round(v / max * 100) + '%"></i></span><span class="c">' + v + '</span></div>').join('') + '</div>';
        };
        lb().innerHTML = '<div class="rp-tiles"><div class="rp-tile"><b>' + Number(s.total) + '</b><span>membres au total</span></div><div class="rp-tile"><b>' + nbPlat + '</b><span>sur la plateforme</span></div></div>' +
          bloc('RÉPARTITION PAR PAYS', s.par_pays) + bloc('PAR TYPE DE COMPTE', s.par_type_compte) + bloc('PAR SECTEUR', s.par_secteur) + bloc('PAR PROFESSION', s.par_profession) +
          (arr(s.evolution).length ? '<div class="h2">ÉVOLUTION</div><div class="card pad">' + s.evolution.map(x => '<div class="kv"><span>' + esc(x.mois) + '</span><span>+' + Number(x.n) + '</span></div>').join('') + '</div>' : '');
      } catch (e) { if (alive(tok) && lb()) errInto(lb(), e, showStats); }
    };
    document.querySelectorAll('#pane-body [data-rp-t]').forEach(b => b.onclick = () => {
      st.tab = b.dataset.rpT; document.querySelectorAll('#pane-body [data-rp-t]').forEach(x => x.classList.toggle('on', x === b));
      if (st.tab === 'stats') showStats(); else showContacts();
    });
    showContacts();

    document.getElementById('rp-lw').onclick = () => writeListSheet(l, nbPlat);
    document.getElementById('rp-le').onclick = () => listForm(l, () => reload());
    const lr = document.getElementById('rp-lr'); if (lr) lr.onclick = async () => {
      lr.disabled = true;
      try { const r = await api('/api/listes-diffusion/' + id + '/refresh', { method: 'POST', body: {} }); toast('Liste actualisée : ' + plural(r.total, 'membre') + ' ✓'); reload(); }
      catch (e) { toast(e.message, true); lr.disabled = false; }
    };
    document.getElementById('rp-ld').onclick = async e => {
      const b = e.currentTarget; b.disabled = true;
      try { const r = await api('/api/listes-diffusion/' + id + '/duplicate', { method: 'POST', body: {} }); toast('Liste dupliquée ✓'); location.hash = '#/reseaupro/liste/' + r.id; }
      catch (er) { toast(er.message, true); b.disabled = false; }
    };
    document.getElementById('rp-la').onclick = async e => {
      const b = e.currentTarget; b.disabled = true;
      try { await api('/api/listes-diffusion/' + id + '/archive', { method: 'POST', body: { archived: !archived } }); toast(archived ? 'Liste désarchivée ✓' : 'Liste archivée ✓'); R.listArch = false; goBack('#/reseaupro/listes'); }
      catch (er) { toast(er.message, true); b.disabled = false; }
    };
    document.getElementById('rp-lx').onclick = async e => {
      if (!confirm('Supprimer la liste « ' + l.nom + ' » et tous ses contacts ? Cette action est définitive.')) return;
      const b = e.currentTarget; b.disabled = true;
      try { await api('/api/listes-diffusion/' + id, { method: 'DELETE' }); toast('Liste supprimée'); goBack('#/reseaupro/listes'); }
      catch (er) { toast(er.message, true); b.disabled = false; }
    };
  }

  /* Écrire le même message à toute la liste (texte seul sur téléphone). */
  function writeListSheet(l, nbPlat) {
    const close = A.openSheet('<h2 style="margin:4px 0 4px;font-size:19px">Écrire à la liste</h2><p class="muted" style="margin:0">« ' + esc(l.nom) + ' »</p>' +
      '<p class="small muted" style="margin:8px 0 0">Le message part en conversation privée, uniquement vers les membres de la plateforme avec qui vous avez déjà une conversation (' + plural(nbPlat, 'membre') + ' sur la plateforme dans cette liste). Les autres sont ignorés : le consentement mutuel est toujours respecté.</p>' +
      '<label class="rp-lab" for="rp-w-msg">Votre message</label><textarea class="rp-in" id="rp-w-msg" maxlength="2000" style="min-height:130px" placeholder="Votre message…"></textarea>' +
      '<p class="small muted" style="margin:6px 2px 0">Pour joindre une photo, une vidéo ou un document : à faire sur ordinateur.</p>' +
      '<p class="rp-err" id="rp-w-err" role="alert"></p><button class="btn block" id="rp-w-go">Envoyer à la liste</button>');
    const go = document.getElementById('rp-w-go'), err = document.getElementById('rp-w-err');
    go.onclick = async () => {
      const txt = document.getElementById('rp-w-msg').value.trim();
      if (!txt) { err.textContent = 'Écrivez votre message avant de l’envoyer.'; return; }
      if (!confirm('Envoyer ce message à la liste « ' + l.nom + ' » ?')) return;
      err.textContent = ''; go.disabled = true; go.textContent = 'Envoi…';
      try {
        const r = await api('/api/listes-diffusion/' + l.id + '/message-groupe', { method: 'POST', body: { contenu: txt } });
        close(); toast('Message envoyé à ' + plural(r.envoyes, 'contact') + (r.ignores ? ' · ' + r.ignores + ' ignoré' + (r.ignores > 1 ? 's' : '') + ' (aucune conversation)' : ''));
      } catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = 'Envoyer à la liste'; }
    };
  }

  /* Ajout rapide d'un contact hors plateforme : champs réels de l'API = e-mail + nom. */
  function emailSheet(lid, done) {
    const close = A.openSheet('<h2 style="margin:4px 0 0;font-size:19px">Ajouter un contact par e-mail</h2>' +
      '<label class="rp-lab" for="rp-e-nom">Nom (facultatif)</label><input class="rp-in" id="rp-e-nom" maxlength="80" autocomplete="off" placeholder="Prénom Nom">' +
      '<label class="rp-lab" for="rp-e-mail">Adresse e-mail *</label><input class="rp-in" id="rp-e-mail" type="email" inputmode="email" autocapitalize="off" autocomplete="off" placeholder="nom@exemple.com">' +
      '<p class="small muted" style="margin:8px 2px 0">Ce contact est rangé dans votre liste pour votre organisation. Il ne reçoit aucun message de la plateforme.</p>' +
      '<p class="rp-err" id="rp-e-err" role="alert"></p><button class="btn block" id="rp-e-go">Ajouter le contact</button>');
    const go = document.getElementById('rp-e-go'), err = document.getElementById('rp-e-err');
    go.onclick = async () => {
      const email = document.getElementById('rp-e-mail').value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Saisissez une adresse e-mail valide (ex. nom@exemple.com).'; document.getElementById('rp-e-mail').focus(); return; }
      err.textContent = ''; go.disabled = true; go.textContent = 'Ajout…';
      try {
        const r = await api('/api/listes-diffusion/' + lid + '/contacts', { method: 'POST', body: { contacts: [{ email, nom: document.getElementById('rp-e-nom').value.trim() || null }] } });
        if (!r.added) { err.textContent = 'Ce contact n’a pas pu être ajouté : l’adresse est peut-être déjà dans la liste.'; go.disabled = false; go.textContent = 'Ajouter le contact'; return; }
        close(); toast('Contact ajouté ✓'); done();
      } catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = 'Ajouter le contact'; }
    };
  }

  /* Actions sur un contact de liste. */
  function contactSheet(c, l) {
    if (!c) return;
    const nm = c.nom_plateforme || c.nom || c.email || 'Contact';
    const btns = [];
    if (c.user_id) {
      btns.push(['w', 'chat', 'Écrire un message']);
      btns.push(['p', 'user', 'Voir le profil']);
    } else if (c.email) btns.push(['m', 'send', 'Envoyer un e-mail']);
    btns.push(['mv', 'swap', 'Déplacer vers une autre liste'], ['cp', 'doc', 'Copier vers une autre liste'], ['rm', 'close', 'Retirer de cette liste']);
    const close = A.openSheet('<h2 style="margin:4px 0 2px;font-size:19px;word-break:break-word">' + esc(c.user_id && c.role !== 'utilisateur' ? (R.names.get(String(c.user_id)) || roleLabel(c.role)) : nm) + '</h2>' +
      '<p class="small muted" style="margin:0 0 10px">' + esc(c.user_id ? [roleLabel(c.role), loc(c)].filter(Boolean).join(' · ') : 'Hors plateforme') + '</p><div class="lst">' +
      btns.map(([k, i, t]) => k === 'm' ? '<a class="rp-actbtn" href="mailto:' + esc(c.email) + '"><span class="ic">' + ic(i, 's') + '</span>' + t + '</a>'
        : (k === 'p' ? '<a class="rp-actbtn" href="profil.html?id=' + encodeURIComponent(c.user_id) + '"><span class="ic">' + ic(i, 's') + '</span>' + t + '</a>'
          : '<button class="rp-actbtn ' + (k === 'rm' ? 'danger' : '') + '" data-k="' + k + '"><span class="ic">' + ic(i, 's') + '</span>' + t + '</button>')).join('') + '</div>');
    /* Pour un compte non Utilisateur, le nom du responsable n'est jamais utilisé : on prend le nom du
       compte s'il a déjà été chargé, sinon un libellé neutre. */
    document.querySelectorAll('#sheet [data-k]').forEach(b => b.onclick = async () => {
      const k = b.dataset.k;
      if (k === 'w') { close(); writeTo(c.user_id, c.role === 'utilisateur' ? nm : (R.names.get(String(c.user_id)) || 'ce compte')); }
      else if (k === 'mv' || k === 'cp') { close(); moveSheet(c, l, k === 'mv'); }
      else if (k === 'rm') {
        if (!confirm('Retirer ce contact de la liste « ' + l.nom + ' » ?')) return;
        b.disabled = true;
        try { await api('/api/listes-diffusion/' + l.id + '/contacts/' + c.id, { method: 'DELETE' }); close(); toast('Contact retiré de la liste'); reload(); }
        catch (e) { toast(e.message, true); b.disabled = false; }
      }
    });
  }
  async function moveSheet(c, l, move) {
    const close = A.openSheet('<h2 style="margin:4px 0 10px;font-size:19px">' + (move ? 'Déplacer vers…' : 'Copier vers…') + '</h2><div id="rp-mv">' + skel(2, 56) + '</div>');
    const box = () => document.getElementById('rp-mv');
    try {
      const o = arr((await api('/api/listes-diffusion')).listes).filter(x => Number(x.id) !== Number(l.id));
      if (!box()) return;
      if (!o.length) { box().innerHTML = '<p class="muted">Vous n’avez pas d’autre liste. Créez-en une depuis « Mes listes » pour y ranger ce contact.</p>'; return; }
      box().innerHTML = '<div class="lst">' + o.map(x => '<button class="li" data-id="' + Number(x.id) + '"><span class="ic rp-ico" style="background:' + okColor(x.couleur) + '22;color:' + okColor(x.couleur) + '">' + esc(x.icone || '📋') + '</span><span class="sp"><span class="t">' + esc(x.nom) + '</span></span></button>').join('') + '</div>';
      box().onclick = async e => {
        const b = e.target.closest('[data-id]'); if (!b) return; b.disabled = true;
        try {
          if (move) await api('/api/listes-diffusion/' + l.id + '/deplacer-membre', { method: 'POST', body: { contact_id: c.id, vers_liste_id: Number(b.dataset.id) } });
          else await api('/api/listes-diffusion/' + l.id + '/copier-membre', { method: 'POST', body: { contact_id: c.id, vers_liste_ids: [Number(b.dataset.id)] } });
          close(); toast(move ? 'Contact déplacé ✓' : 'Contact copié ✓'); if (move) reload();
        } catch (er) { toast(er.message, true); b.disabled = false; }
      };
    } catch (e) { if (box()) box().innerHTML = '<p class="small" style="color:var(--red)">' + esc(e.message) + '</p>'; }
  }

  /* ============================================================
     CONTACTS ÉTABLIS ET DEMANDES DE CONTACT  (/api/contacts, /api/demandes-contact)
     ============================================================ */
  async function secContacts(body, ctx, tok) {
    body.innerHTML = skel(3, 80);
    let rec, env, cts;
    try {
      [rec, env, cts] = await Promise.all([api('/api/demandes-contact?direction=recues&statut=en_attente'), api('/api/demandes-contact?direction=envoyees&statut=en_attente'), api('/api/contacts')]);
    } catch (e) { if (alive(tok)) errInto(body, e, () => secContacts(body, ctx, tok)); return; }
    if (!alive(tok)) return;
    const recues = arr(rec.demandes), envoyees = arr(env.demandes), contacts = arr(cts.contacts);
    const who = (x, p) => [x[p + 'prenom'], x[p + 'nom']].filter(Boolean).join(' ') || 'Compte';
    body.innerHTML =
      (recues.length ? '<div class="h2" style="margin-top:0">DEMANDES DE CONTACT REÇUES (' + recues.length + ')</div>' + recues.map(d => {
        const nm = who(d, 'autre_'), a = d.activite;
        return '<div class="card rp-card"><div class="rp-head">' + photo(d.autre_photo, nm) + '<div class="sp"><div class="rp-nm">' + esc(nm) + '</div><div class="small muted">' + esc(roleLabel(d.autre_role)) + (d.autre_titre ? ' · ' + esc(d.autre_titre) : '') + '</div>' +
          (loc({ ville: d.autre_ville, pays: d.autre_pays }) ? '<div class="meta">' + ic('pin', 's') + '<span class="ell">' + esc(loc({ ville: d.autre_ville, pays: d.autre_pays })) + '</span></div>' : '') + '</div></div>' +
          (d.autre_bio ? '<p class="rp-desc">' + esc(strip(d.autre_bio)) + '</p>' : '') +
          '<div class="small muted" style="margin-top:8px">Demande reçue ' + esc(since(d.created_at)) + (a ? ' · ' + plural(a.publications, 'publication') + ' · ' + plural(a.abonnes, 'abonné') : '') + '</div>' +
          '<div class="rp-acts"><button class="btn" data-rp-do="accepter" data-id="' + d.id + '">Accepter</button><button class="btn out" data-rp-do="refuser" data-id="' + d.id + '">Refuser</button></div>' +
          '<div class="rp-acts" style="margin-top:8px"><a class="btn out sm rp-t" href="profil.html?id=' + encodeURIComponent(d.autre_id) + '">Voir son profil</a><button class="btn out sm rp-t" style="color:var(--red)" data-rp-do="bloquer" data-id="' + d.id + '">Bloquer</button></div></div>';
      }).join('') : '') +
      '<div class="h2"' + (recues.length ? '' : ' style="margin-top:0"') + '>MES CONTACTS (' + contacts.length + ')</div>' +
      (contacts.length ? '<div class="lst">' + contacts.map(c => {
        const nm = who(c, '');
        return '<button class="li" data-rp-ct="' + Number(c.id) + '">' + photo(c.photo_url, nm) + '<span class="sp"><span class="t">' + esc(nm) + '</span><br><span class="d">' + esc(roleLabel(c.role)) + (c.depuis ? ' · ' + (since(c.depuis) === 'à l’instant' ? 'nouveau contact' : 'en contact depuis ' + (/^il y a /.test(since(c.depuis)) ? esc(since(c.depuis).slice(7)) : esc(since(c.depuis)))) : '') + '</span></span><span class="ch">' + ic('chev', 's') + '</span></button>';
      }).join('') + '</div>' : '<div class="empty"><div class="ei">' + ic('people', 'l') + '</div><b>Aucun contact pour l’instant</b>Les comptes dont la demande de contact est acceptée apparaissent ici. Vous pouvez en envoyer depuis l’annuaire ou une fiche.<br><br><a class="btn" href="#/reseaupro/annuaire">Voir l’annuaire</a></div>') +
      (envoyees.length ? '<div class="h2">DEMANDES ENVOYÉES EN ATTENTE (' + envoyees.length + ')</div><div class="lst">' + envoyees.map(d => '<div class="li" style="cursor:default">' + photo(d.autre_photo, who(d, 'autre_')) + '<span class="sp"><span class="t">' + esc(who(d, 'autre_')) + '</span><br><span class="d">En attente de réponse · envoyée ' + esc(since(d.created_at)) + '</span></span></div>').join('') + '</div>' : '');

    body.onclick = async e => {
      const act = e.target.closest('[data-rp-do]');
      if (act) {
        const a = act.dataset.rpDo;
        if (a === 'refuser' && !confirm('Refuser cette demande de contact ?')) return;
        if (a === 'bloquer' && !confirm('Bloquer ce compte ? Il ne pourra plus vous écrire ni vous redemander. Vous pourrez lever le blocage depuis le site.')) return;
        act.disabled = true;
        try {
          await api('/api/demandes-contact/' + act.dataset.id + '/repondre', { method: 'POST', body: { action: a } });
          toast(a === 'accepter' ? 'Contact accepté ✓ Vous pouvez maintenant échanger.' : (a === 'refuser' ? 'Demande refusée' : 'Compte bloqué')); reload();
        } catch (er) { toast(er.message, true); act.disabled = false; }
        return;
      }
      const ct = e.target.closest('[data-rp-ct]');
      if (ct) {
        const c = contacts.find(x => Number(x.id) === Number(ct.dataset.rpCt)); if (!c) return;
        const nm = who(c, '');
        const close = A.openSheet('<h2 style="margin:4px 0 2px;font-size:19px;word-break:break-word">' + esc(nm) + '</h2><p class="small muted" style="margin:0 0 10px">' + esc(roleLabel(c.role)) + '</p><div class="lst">' +
          '<button class="rp-actbtn" data-k="w"><span class="ic">' + ic('chat', 's') + '</span>Écrire un message</button>' +
          '<a class="rp-actbtn" href="profil.html?id=' + encodeURIComponent(c.id) + '"><span class="ic">' + ic('user', 's') + '</span>Voir le profil</a>' +
          '<button class="rp-actbtn" data-k="l"><span class="ic">' + ic('doc', 's') + '</span>Ajouter à une liste</button>' +
          '<button class="rp-actbtn danger" data-k="rm"><span class="ic">' + ic('close', 's') + '</span>Retirer ce contact</button></div>');
        document.querySelectorAll('#sheet [data-k]').forEach(b => b.onclick = async () => {
          const k = b.dataset.k;
          if (k === 'w') { close(); if (c.conversation_id) location.hash = '#/conv/' + c.conversation_id; else writeTo(c.id, nm); }
          else if (k === 'l') { close(); addToListSheet(c.id, nm); }
          else if (k === 'rm') {
            if (!confirm('Retirer ' + nm + ' de vos contacts ? L’historique des messages est conservé, mais vous ne pourrez plus échanger sans nouvelle demande acceptée.')) return;
            b.disabled = true;
            try { await api('/api/contacts/' + c.id, { method: 'DELETE' }); close(); toast('Contact retiré'); reload(); }
            catch (er) { toast(er.message, true); b.disabled = false; }
          }
        });
      }
    };
  }

  /* ============================================================
     STATISTIQUES DE MON RÉSEAU  (GET /api/reseau/me/stats)
     ============================================================ */
  async function secStats(body, ctx, tok) {
    body.innerHTML = skel(2, 90);
    let s;
    try { s = await api('/api/reseau/me/stats'); } catch (e) { if (alive(tok)) errInto(body, e, () => secStats(body, ctx, tok)); return; }
    if (!alive(tok)) return;
    const bars = (titre, rows, key, color) => {
      rows = arr(rows); if (!rows.length) return '';
      const max = rows[0].nb || 1;
      return '<div class="h2">' + titre + '</div><div class="card pad">' + rows.map(r => '<div class="rp-bar"><span class="l ell">' + esc(r[key] || 'Non renseigné') + '</span><span class="bar"><i style="width:' + Math.round(r.nb / max * 100) + '%;' + (color ? 'background:' + color : '') + '"></i></span><span class="c">' + Number(r.nb) + '</span></div>').join('') + '</div>';
    };
    body.innerHTML = '<div class="rp-tiles"><div class="rp-tile"><b>' + Number(s.total) + '</b><span>membres dans mon réseau</span></div><div class="rp-tile"><b style="color:var(--orange-d)">' + Number(s.enAttente) + '</b><span>demandes en attente</span></div>' +
      '<div class="rp-tile"><b style="color:var(--green)">' + Number(s.recos) + '</b><span>recommandations reçues</span></div><div class="rp-tile"><b style="color:#7c3aed">' + Number(s.membreDe) + '</b><span>réseaux dont je suis membre</span></div></div>' +
      bars('MEMBRES PAR PAYS', s.parPays, 'pays') + bars('MEMBRES PAR SECTEUR', s.parSecteur, 'domaine', '#7c3aed') +
      (Number(s.total) ? '' : '<div class="empty" style="padding:18px"><b>Pas encore de statistiques</b>Elles apparaîtront dès que des initiatives auront rejoint votre réseau.</div>');
  }

  /* ============================================================
     PROFIL RÉSEAU  (PATCH /api/reseau/me/profil, PUT /api/reseau/:id/visibilite)
     ============================================================ */
  async function secProfil(body, ctx, tok) {
    const m = ctx.moi, services = arr(m.services), langues = arr(m.langues);
    const formeAutre = m.forme_juridique && !FORMES.includes(m.forme_juridique);
    const opt = (list, cur) => list.map(v => '<option ' + (v === cur ? 'selected' : '') + '>' + esc(v) + '</option>').join('');
    const verif = m.immat_verifiee_ligne ? '<p class="small" style="color:var(--green);margin:6px 2px 0">✅ Validée en ligne' + (m.immat_nom_registre ? ' — ' + esc(m.immat_nom_registre) : '') + '</p>' : '';
    body.innerHTML =
      (!m.numero_immatriculation ? '<div class="rp-warn"><b>Immatriculation obligatoire</b>Sans numéro officiel, votre initiative ne peut ni rejoindre un réseau ni apparaître dans l’annuaire.</div>' : '') +
      '<p class="small muted" style="margin:0 4px 12px">Ces informations sont visibles dans l’annuaire du réseau. Aucun téléphone ni e-mail n’est affiché.</p>' +
      '<div class="h2" style="margin-top:0">QUI PEUT VOIR LA LISTE DE MES MEMBRES ?</div>' +
      [['prive', '🔒 Privé', 'Personne d’autre que vous ne voit la liste des membres (seul leur nombre est public).'], ['abonnes', '⭐ Abonnés uniquement', 'Visible uniquement par les comptes abonnés à votre initiative.'], ['public', '🌐 Tout membre Diaspo’Actif', 'Visible par tout membre connecté de la plateforme.']]
        .map(([v, t, d]) => '<label class="rp-opt"><input type="radio" name="rp-vis" value="' + v + '" ' + ((m.reseau_visibilite || 'prive') === v ? 'checked' : '') + '><span><b>' + t + '</b><span>' + d + '</span></span></label>').join('') +
      '<button class="btn out block" id="rp-vis-go">Enregistrer la visibilité</button>' +
      '<div class="h2">IDENTITÉ DANS LE RÉSEAU</div><div class="card pad">' +
      '<label class="rp-lab" style="margin-top:0" for="rp-p-pays">Pays d’immatriculation</label><select class="rp-in" id="rp-p-pays"><option value="">— Sélectionner —</option>' + Object.entries(PAYS_IMMAT).map(([k, v]) => '<option value="' + k + '" ' + (m.pays_immatriculation === k ? 'selected' : '') + '>' + esc(v) + '</option>').join('') + '<option value="AUTRE" ' + (m.pays_immatriculation && !PAYS_IMMAT[m.pays_immatriculation] ? 'selected' : '') + '>Autre pays</option></select>' +
      '<div id="rp-p-immat-zone"></div>' + verif +
      '<label class="rp-lab" for="rp-p-fiscal">Numéro fiscal <span style="font-weight:400">(facultatif — +1 point de fiabilité)</span></label><input class="rp-in" id="rp-p-fiscal" maxlength="60" value="' + esc(m.numero_fiscal || '') + '">' +
      '<label class="rp-lab" for="rp-p-annee">Année de création</label><input class="rp-in" id="rp-p-annee" type="number" inputmode="numeric" min="1900" max="2099" value="' + esc(m.annee_creation || '') + '">' +
      '<label class="rp-lab" for="rp-p-taille">Taille de la structure</label><select class="rp-in" id="rp-p-taille"><option value="">— Sélectionner —</option>' + opt(TAILLES, m.taille_structure) + '</select>' +
      '<label class="rp-lab" for="rp-p-forme">Type de structure</label><select class="rp-in" id="rp-p-forme"><option value="">— Sélectionner —</option>' + opt(FORMES, m.forme_juridique) + '<option value="AUTRE" ' + (formeAutre ? 'selected' : '') + '>Autre (préciser)</option></select>' +
      '<input class="rp-in" id="rp-p-forme2" maxlength="80" style="margin-top:8px;' + (formeAutre ? '' : 'display:none') + '" placeholder="Précisez le type de structure" value="' + esc(formeAutre ? m.forme_juridique : '') + '">' +
      '<label class="rp-lab" for="rp-p-serv">Services proposés <span style="font-weight:400">(séparés par des virgules)</span></label><textarea class="rp-in" id="rp-p-serv" style="min-height:70px" placeholder="Conseil, formation, accompagnement…">' + esc(services.join(', ')) + '</textarea>' +
      '<label class="rp-lab" for="rp-p-lang">Langues <span style="font-weight:400">(séparées par des virgules)</span></label><input class="rp-in" id="rp-p-lang" value="' + esc(langues.join(', ')) + '" placeholder="Français, Anglais…">' +
      '<label class="rp-opt" style="margin-top:16px"><input type="checkbox" id="rp-p-vis" ' + (m.reseau_visible !== 0 ? 'checked' : '') + '><span><b>Visible dans l’annuaire</b><span>Les autres initiatives peuvent trouver votre fiche.</span></span></label>' +
      '<label class="rp-opt"><input type="checkbox" id="rp-p-msg" ' + (m.accepte_messages !== 0 ? 'checked' : '') + '><span><b>Accepter les messages entrants</b><span>Les membres peuvent vous écrire depuis votre fiche.</span></span></label>' +
      '<p class="rp-err" id="rp-p-err" role="alert"></p><button class="btn block" id="rp-p-go">Enregistrer le profil réseau</button></div>' +
      '<div class="rp-note"><b>À faire sur ordinateur</b><br>Valider le numéro d’immatriculation en ligne auprès du registre officiel.<br><a href="' + SITE + '?tab=profil-reseau">Ouvrir mon profil réseau sur le site ↗</a></div>';

    ImmatType.monter(document.getElementById('rp-p-immat-zone'), { inputId: 'rp-p-immat', typeId: 'rp-p-immat-type', type: m.type_immatriculation, numero: m.numero_immatriculation, classeInput: 'rp-in' });
    const forme = document.getElementById('rp-p-forme');
    forme.onchange = () => { document.getElementById('rp-p-forme2').style.display = forme.value === 'AUTRE' ? 'block' : 'none'; };
    const vg = document.getElementById('rp-vis-go');
    vg.onclick = async () => {
      const v = (document.querySelector('input[name="rp-vis"]:checked') || {}).value || 'prive';
      vg.disabled = true;
      try { await api('/api/reseau/' + m.id + '/visibilite', { method: 'PUT', body: { visibilite: v } }); toast('Visibilité du réseau mise à jour ✓'); bust(); }
      catch (e) { toast(e.message, true); }
      vg.disabled = false;
    };
    const list = s => Array.from(new Set(String(s || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean).map(x => x.slice(0, 60)))).slice(0, 30);
    const go = document.getElementById('rp-p-go'), err = document.getElementById('rp-p-err');
    go.onclick = async () => {
      const immat = document.getElementById('rp-p-immat').value.trim();
      if (!immat) { err.textContent = 'Le numéro d’immatriculation est obligatoire pour apparaître dans les réseaux.'; document.getElementById('rp-p-immat').focus(); return; }
      const msgImmat = ImmatType.valider('rp-p-immat-type', 'rp-p-immat');
      if (msgImmat) { err.textContent = msgImmat; return; }
      const annee = parseInt(document.getElementById('rp-p-annee').value, 10);
      if (document.getElementById('rp-p-annee').value && (annee < 1900 || annee > 2099)) { err.textContent = 'L’année de création doit être comprise entre 1900 et 2099.'; return; }
      err.textContent = ''; go.disabled = true; go.textContent = 'Enregistrement…';
      try {
        const rr = await api('/api/reseau/me/profil', {
          method: 'PATCH', body: {
            numero_immatriculation: immat, type_immatriculation: document.getElementById('rp-p-immat-type').value || null, numero_fiscal: (document.getElementById('rp-p-fiscal').value || '').trim() || null, pays_immatriculation: document.getElementById('rp-p-pays').value || null, annee_creation: annee || null,
            taille_structure: document.getElementById('rp-p-taille').value || null,
            forme_juridique: (forme.value === 'AUTRE' ? document.getElementById('rp-p-forme2').value.trim() : forme.value) || null,
            services: list(document.getElementById('rp-p-serv').value), langues: list(document.getElementById('rp-p-lang').value),
            reseau_visible: document.getElementById('rp-p-vis').checked, accepte_messages: document.getElementById('rp-p-msg').checked
          }
        });
        toast(rr && rr.immatriculation === 'nom_different' ? 'Enregistré. Le nom du registre (« ' + (rr.nom_registre || '') + ' ») diffère de votre nom : dossier transmis à l’équipe.' : 'Profil réseau enregistré ✓'); reload();
      } catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = 'Enregistrer le profil réseau'; }
    };
  }
})();
