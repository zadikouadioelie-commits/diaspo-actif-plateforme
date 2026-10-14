/* Comptes à l'honneur — affichage public (2026-10-05) : mur d'honneur (accueil, annuaire), cadre doré
   et badge « Co-créateur actif » sur les cartes de l'annuaire, coup de pouce côté administrateur.
   Public = noms, types, photos et badges uniquement : aucun point, pourcentage ni classement. */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function css() {
    if (document.getElementById('honneur-aff-css')) return;
    const l = document.createElement('link'); l.id = 'honneur-aff-css'; l.rel = 'stylesheet'; l.href = 'assets/annonce-officielle.css?v=1'; document.head.appendChild(l);
    const s = document.createElement('style'); s.id = 'honneur-aff-css2';
    s.textContent = `
    .hn-mur{max-width:1200px;margin:18px auto;padding:0 24px}
    .hn-poster{position:relative;border-radius:24px;padding:30px 22px 26px;overflow:hidden;background:linear-gradient(160deg,#0F2E55 0%,#0A1E38 55%,#07111F 100%);border:1px solid rgba(242,201,76,.35);box-shadow:0 30px 80px rgba(0,0,0,.35);color:#F4EFE0}
    .hn-poster::before{content:"";position:absolute;inset:0;background:radial-gradient(600px 220px at 50% 0%,rgba(242,201,76,.22),transparent 70%);pointer-events:none}
    .hn-head{position:relative;text-align:center;margin-bottom:22px}
    .hn-crown{font-size:34px;filter:drop-shadow(0 0 12px rgba(242,201,76,.7))}
    .hn-head h2{font-family:var(--nd-display,"Cinzel","Trajan Pro",Georgia,serif);font-weight:700;letter-spacing:.04em;font-size:clamp(26px,5vw,40px);margin:2px 0 4px;background:linear-gradient(180deg,#FFF3B0,#F2C94C 50%,#C9962B);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
    .hn-head p{margin:0;color:#A9B6C9;font-size:14.5px}
    .hn-cat{position:relative;margin:18px 0 12px;display:flex;align-items:center;gap:10px}
    .hn-cat::after{content:"";height:1px;flex:1;background:linear-gradient(90deg,rgba(242,201,76,.6),transparent)}
    .hn-cat span{font-family:var(--nd-display,"Cinzel",Georgia,serif);font-weight:600;letter-spacing:.12em;font-size:13px;color:#FFF3B0;text-transform:uppercase}
    .hn-mur-grille{position:relative;display:grid;grid-template-columns:repeat(auto-fit,minmax(262px,1fr));gap:16px}
    .hn-mur .ao-gold{display:block;text-decoration:none}
    .hn-mur .ao-gold-in{padding:16px 14px 14px;text-align:center;height:100%;display:flex;flex-direction:column}
    .hn-rank{position:absolute;top:8px;left:8px;z-index:2;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#2A1D00;background:linear-gradient(135deg,#FFF3B0,#F2C94C 50%,#C9962B);box-shadow:0 2px 8px rgba(0,0,0,.4)}
    .hn-ribbon{position:absolute;top:10px;right:-34px;z-index:2;transform:rotate(38deg);width:130px;text-align:center;padding:2px 0;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;background:linear-gradient(90deg,#F26422,#FF8A52);color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.4)}
    .hn-mur .ao-av{width:74px;height:74px;font-size:26px;margin:6px auto 8px;overflow:hidden}
    .hn-mur .ao-av img{width:100%;height:100%;object-fit:cover}
    .hn-id{display:block;color:inherit;text-decoration:none}
    .hn-mur .nm{font-weight:700;font-size:16.5px;line-height:1.25;color:#fff}
    .hn-mur .sb{font-size:12.5px;color:#A9B6C9;margin-top:2px}
    .hn-tags{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin-top:9px}
    .hn-tag{font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:99px;background:rgba(242,201,76,.1);color:#FFF3B0;border:1px solid rgba(242,201,76,.35)}
    .hn-tag.typ{background:rgba(74,144,226,.18);color:#BBD8FF;border-color:rgba(74,144,226,.5)}
    .hn-desc{font-size:12.5px;line-height:1.45;color:#A9B6C9;margin:9px 2px 0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;flex:1;min-height:54px}
    .hn-voir{display:block;margin:12px 4px 0;text-align:center;border-radius:10px;padding:9px 14px;font-weight:800;font-size:13px;text-decoration:none;background:linear-gradient(135deg,#FFF3B0,#F2C94C 50%,#C9962B);color:#2A1D00}
    .hn-acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:8px 0 2px}
    .hn-act{border:1.5px solid rgba(242,201,76,.55);background:rgba(255,255,255,.07);color:#F4EFE0;border-radius:99px;padding:6px 12px;min-height:34px;font:800 12.5px/1 inherit;font-family:inherit;cursor:pointer;transition:background .15s,transform .1s}
    .hn-act:hover{background:rgba(242,201,76,.2);transform:translateY(-1px)}
    .hn-act:focus-visible,.hn-voir:focus-visible{outline:3px solid #FFF3B0;outline-offset:2px}
    .hn-act[data-abonne="1"]{background:rgba(110,231,168,.16);border-color:rgba(110,231,168,.55);color:#6EE7A8}
    .hn-act.soutenir-btn{background:linear-gradient(135deg,#F26422,#FF8A52);border-color:transparent;color:#fff}
    .hn-act[disabled]{opacity:.6;cursor:default;transform:none}
    .hn-act[hidden]{display:none}
    .hn-act[data-hn-cache]{display:none!important}
    .hn-legende{position:relative;margin-top:16px;text-align:center;font-size:12.5px;color:#A9B6C9}
    .hn-badge-co{display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,#FFF8E1,#FDECB4);color:#7A5200;border:1.5px solid #E3B84A;border-radius:99px;padding:2px 9px;font-size:10.5px;font-weight:800;margin:2px 0}
    .ann-card.hn-or{box-shadow:0 0 0 3px #E7B93C,0 8px 26px rgba(242,201,76,.35);border-color:#E7B93C}
    .hn-or-chip{display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,#E7B93C,#FFE27A);color:#3b2a00;border-radius:99px;padding:3px 10px;font-size:10.5px;font-weight:800;margin:2px 0}
    @media(max-width:600px){.hn-mur{padding:0 16px}}`;
    document.head.appendChild(s);
  }
  let _cache = null;
  async function donnees() {
    if (_cache) return _cache;
    _cache = Promise.all([
      fetch('/api/honneur/laureats', { credentials: 'include' }).then(r => r.json()).catch(() => ({ laureats: [] })),
      fetch('/api/honneur/co-createurs', { credentials: 'include' }).then(r => r.json()).catch(() => ({ initiative_ids: [], user_ids: [] })),
    ]).then(([l, c]) => ({ laureats: l.laureats || [], cycle: l.cycle || null, coUsers: new Set((c.user_ids || []).map(Number)), coInits: new Set((c.initiative_ids || []).map(Number)) }));
    return _cache;
  }
  const initiales = n => String(n).split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  function chargerScript(src, testeur) {
    if (testeur()) return Promise.resolve();
    return new Promise(res => { const sc = document.createElement('script'); sc.src = src; sc.onload = () => res(); sc.onerror = () => res(); document.head.appendChild(sc); });
  }
  function etincelles(n) {
    let h = '';
    for (let i = 0; i < n; i++) h += '<i class="ao-spk" style="left:' + (6 + Math.random() * 86).toFixed(0) + '%;top:' + (4 + Math.random() * 88).toFixed(0) + '%;animation-delay:' + (Math.random() * 2.8).toFixed(2) + 's;width:' + (8 + Math.random() * 7).toFixed(0) + 'px;height:' + (8 + Math.random() * 7).toFixed(0) + 'px"></i>';
    return h;
  }
  /* Libellé d'un domaine : la liste officielle (assets/domaines-activite.js) quand la valeur en fait partie, sinon le texte saisi. */
  const libelleDomaine = c => { const i = (typeof domaineActiviteInfo === 'function') ? domaineActiviteInfo(c) : null; return i ? i.label : String(c); };

  function carte(l, rang) {
    const initiative = l.categorie === 'initiative';
    const doms = (l.domaines || []).slice(0, 2).map(libelleDomaine);
    const idAbo = initiative ? l.initiative_id : l.user_id;
    const typeAbo = initiative && l.initiative_id ? 'initiative' : 'user';
    const actions = '<button type="button" class="hn-act" data-hn-propre="' + Number(l.user_id) + '" data-abonne="0" onclick="event.stopPropagation(); daToggleSuivre(\'' + typeAbo + '\', ' + Number(typeAbo === 'initiative' ? l.initiative_id : l.user_id) + ', this)">🔔 S\'abonner</button>'
      + (initiative && l.adhesions_ouvertes && l.initiative_id ? '<button type="button" class="hn-act" data-hn-propre="' + Number(l.user_id) + '" data-adherer-init="' + Number(l.initiative_id) + '" onclick="event.stopPropagation(); demanderAdhesion(' + Number(l.initiative_id) + ', this)">🤝 Adhérer</button>' : '')
      + (initiative && window.Soutenir ? window.Soutenir.buttonHtml(l.user_id, { cls: 'hn-act', nom: l.nom }).replace('<button ', '<button data-hn-propre="' + Number(l.user_id) + '" ') : '');
    return '<div class="ao-gold"><div class="ao-gold-in">' + etincelles(4) + '<span class="hn-rank" aria-hidden="true">★</span>' + (l.mois_offert ? '<span class="hn-ribbon">Mois offert</span>' : '')
      + '<a class="hn-id" href="' + esc(l.profil_url) + '"><div class="ao-av' + (initiative ? ' sq' : '') + '">' + (l.photo_url ? '<img src="' + esc(l.photo_url) + '" alt="" loading="lazy" onerror="this.remove()">' : esc(initiales(l.nom))) + '</div>'
      + '<div class="nm">' + esc(l.nom) + '</div><div class="sb">' + (initiative ? 'Initiative' : 'Membre') + (l.ville ? ' · ' + esc(l.ville) : '') + '</div></a>'
      + ((l.type || doms.length) ? '<div class="hn-tags">' + (l.type ? '<span class="hn-tag typ">' + esc(l.type) + '</span>' : '') + doms.map(d => '<span class="hn-tag">' + esc(d) + '</span>').join('') + '</div>' : '')
      + '<p class="hn-desc">' + esc(l.description || '') + '</p>'
      + '<a class="hn-voir" href="' + esc(l.profil_url) + '">Voir le profil</a><div class="hn-acts">' + actions + '</div></div></div>';
  }

  /* Mur d'honneur : rien n'est affiché tant qu'aucun cycle n'a été clôturé avec des lauréats. Chaque carte présente le type, les domaines, une courte
     description et les actions S'abonner / Adhérer / Soutenir (mêmes fonctions que les cartes de l'annuaire : assets/app.js, assets/soutenir.js). */
  async function mur(elId, opts) {
    opts = opts || {};
    const el = document.getElementById(elId); if (!el) return;
    const d = await donnees();
    if (!d.laureats.length) { el.style.display = 'none'; return; }
    css();
    await Promise.all([
      chargerScript('assets/domaines-activite.js', () => typeof domaineActiviteInfo === 'function'),
      chargerScript('assets/soutenir.js', () => !!window.Soutenir),
    ]);
    const mois = d.cycle && d.cycle.fin_mesure ? new Date(d.cycle.fin_mesure + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : '';
    const titreMois = mois ? mois.charAt(0).toUpperCase() + mois.slice(1) + ' · ' : '';
    const groupes = [['utilisateur', 'Utilisateurs'], ['initiative', 'Initiatives']].map(([cat, lib]) => {
      const liste = d.laureats.filter(l => l.categorie === cat);
      return liste.length ? '<div class="hn-cat"><span>' + lib + ' · ' + liste.length + (liste.length > 1 ? ' lauréats' : ' lauréat') + '</span></div><div class="hn-mur-grille">' + liste.map(carte).join('') + '</div>' : '';
    }).join('');
    el.innerHTML = '<div class="hn-mur"><div class="hn-poster"><div class="hn-head"><div class="hn-crown">👑</div><h2>Les comptes à l\'honneur</h2><p>' + esc(titreMois) + 'les plus actifs de la communauté</p></div>'
      + groupes + '<div class="hn-legende">Mis à l\'honneur pour leur activité sur Diaspo\'Actif. Merci pour votre engagement.</div></div></div>';
    el.style.display = 'block';
    /* Le texte « Prochainement » de l'accueil cède la place aux vrais lauréats. */
    const bientot = document.getElementById('hp-trophee-bientot'); if (bientot) bientot.style.display = 'none';
    if (window.Soutenir && window.Soutenir.hydrate) window.Soutenir.hydrate(el);
    if (typeof hydraterAdhesions === 'function') hydraterAdhesions(el);
    /* Un compte ne s'abonne pas à lui-même, n'adhère pas à sa propre structure et ne se soutient pas : on masque ses propres boutons
       dès que le compte connecté est connu (il se charge un peu après la page). */
    let essais = 0;
    const masquerPropres = () => {
      const me = typeof CURRENT_USER !== 'undefined' ? CURRENT_USER : null;
      if (me) { el.querySelectorAll('[data-hn-propre="' + Number(me.id) + '"]').forEach(b => { b.hidden = true; b.setAttribute('data-hn-cache', '1'); }); return; }
      if (++essais < 8) setTimeout(masquerPropres, 600);
    };
    masquerPropres();
  }

  /* Annuaire : cadre doré + badge sur les cartes déjà rendues (et celles ajoutées après filtrage). */
  async function decorerAnnuaire(listeId) {
    const liste = document.getElementById(listeId); if (!liste) return;
    const d = await donnees();
    const lauUsers = new Set(d.laureats.map(l => Number(l.user_id)));
    if (!lauUsers.size && !d.coUsers.size) return;
    css();
    const passe = () => liste.querySelectorAll('.ann-card:not([data-hn])').forEach(carte => {
      carte.setAttribute('data-hn', '1');
      const a = carte.querySelector('a[href*="profil.html?id="]'); const m = a && a.getAttribute('href').match(/profil\.html\?id=(\d+)/);
      const uid = m ? Number(m[1]) : null; if (!uid) return;
      const titre = carte.querySelector('.ann-card-title'); if (!titre) return;
      let html = '';
      if (lauUsers.has(uid)) { carte.classList.add('hn-or'); html += '<span class="hn-or-chip">🏆 À l\'honneur</span> '; }
      if (d.coUsers.has(uid)) html += '<span class="hn-badge-co" title="Compte distingué pour son implication dans la vie de la plateforme">✦ Co-créateur actif</span>';
      if (html) titre.insertAdjacentHTML('afterend', '<div>' + html + '</div>');
    });
    passe(); new MutationObserver(passe).observe(liste, { childList: true });
  }

  window.HonneurAffichage = { css, donnees, mur, decorerAnnuaire };
})();
