/* ============================================================
   Diaspo'Actif — Profil public, version téléphone
   Routes : #/profil/<idCompte>   (membre, collectivité, institution…)
            #/profil/i/<id ou slug> (initiative)
   Données : les mêmes routes publiques que le site (/api/initiatives/:id, /api/profil/:id…) ; le serveur applique déjà
   la confidentialité (coordonnées privées retirées, niveaux de visibilité du profil).
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp; if (!A) return;
  const { S, api, esc, strip, ic, setPane, attrUrl, initials, richHtml, linkify, md, ago } = A;
  /* Onglet « Moi » (2026-10-08) : le même rendu s'écrit dans un conteneur de l'onglet (cibleTab) au lieu d'un écran ouvert par-dessus. */
  let cibleTab = null;
  const rendre = (titre, html) => { if (cibleTab) cibleTab.innerHTML = html; else setPane(titre, html); };

  if (!document.getElementById('m-mod-profil-css')) {
    const st = document.createElement('style'); st.id = 'm-mod-profil-css';
    st.textContent = `
.pf-hero{background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow);margin-bottom:12px}
.pf-banner{height:120px;background:linear-gradient(135deg,#0D2B4E,#1B3A6B 55%,#F26422);position:relative;overflow:hidden}
.pf-banner img{width:100%;height:100%;object-fit:cover;display:block}
.pf-id{display:flex;gap:12px;align-items:flex-end;padding:0 14px;margin-top:-34px;position:relative}
.pf-av{flex:none;width:84px;height:84px;border-radius:20px;border:4px solid var(--card);background:var(--navy2);color:#fff;font-weight:800;font-size:28px;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 2px 8px rgba(13,43,78,.25)}
.pf-av.rond{border-radius:50%}
.pf-av img{width:100%;height:100%;object-fit:cover}
.pf-nm{min-width:0;padding-bottom:4px}
.pf-nm h2{margin:0;font-size:20px;line-height:1.2;color:var(--navy);word-break:break-word}
.pf-body{padding:10px 14px 14px}
.pf-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.pf-stats div{background:var(--bg);border-radius:12px;padding:8px 4px;text-align:center}
.pf-stats b{display:block;font-size:17px;color:var(--navy)}
.pf-stats span{font-size:11.5px;color:var(--muted)}
.pf-act{display:flex;gap:6px}
.pf-act .btn{flex:1;min-width:0;padding:0 6px;font-size:12.5px;gap:5px;white-space:nowrap}
.pf-act .btn.sub{background:var(--green-l);border-color:var(--green);color:var(--green)}
.pf-sec{background:var(--card);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);margin-bottom:12px;padding:14px}
.pf-sec h3{margin:0 0 8px;font-size:16px;color:var(--navy);display:flex;align-items:center;gap:8px}
.pf-sec h3:before{content:"";width:4px;height:16px;border-radius:2px;background:var(--orange)}
.pf-lk{display:flex;align-items:center;gap:10px;padding:10px 2px;border-bottom:1px solid var(--border);color:var(--navy2);font-weight:600;word-break:break-all}
.pf-lk:last-child{border-bottom:0}
.pf-lk svg{flex:none}
.pf-more{display:block;margin:6px 0 0;color:var(--orange-d);font-weight:800;font-size:13.5px}
.pf-rev{border-top:1px solid var(--border);padding:10px 0}
.pf-rev:first-of-type{border-top:0}
.pf-st{color:#f59e0b;letter-spacing:1px}
.pf-gal{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.pf-gal img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;display:block}
.pf-post{border-top:1px solid var(--border);padding:10px 0}
.pf-post:first-of-type{border-top:0}
.pf-clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line;word-break:break-word}
.pf-gauge{height:8px;border-radius:6px;background:var(--bg);overflow:hidden;margin:6px 0}
.pf-gauge i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--orange),var(--green))}
.pf-eq{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--border);color:inherit}
.pf-eq:first-of-type{border-top:0}
.pf-eqav{flex:none;width:40px;height:40px;border-radius:50%;background:var(--navy2);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;overflow:hidden}
.pf-eqav img{width:100%;height:100%;object-fit:cover}
.pf-part{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.pf-part>*{background:var(--bg);border-radius:12px;padding:10px;text-align:center;font-size:13px;font-weight:700;color:inherit;word-break:break-word}
.pf-part img{width:100%;height:46px;object-fit:contain;margin-bottom:4px;display:block}
.pf-note{margin:10px 0 0;font-size:12px;color:var(--muted)}
`;
    document.head.appendChild(st);
  }

  const list = v => { if (Array.isArray(v)) return v; if (!v) return []; try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch (e) { return []; } };
  const obj = v => { if (v && typeof v === 'object') return v; try { const x = JSON.parse(v || '{}'); return x && typeof x === 'object' ? x : {}; } catch (e) { return {}; } };
  const domLabel = k => { const d = (window.DOMAINES_ACTIVITE || []).find(z => z[0] === k); return d ? d[2] : (k ? String(k).replace(/_/g, ' ') : ''); };
  const item = x => typeof x === 'string' ? x : (x && (x.titre || x.nom || x.libelle || x.texte || x.label)) || '';
  const chips = (arr, cls) => arr.filter(Boolean).length ? `<div class="tags" style="margin:0">${arr.filter(Boolean).map(t => `<span class="badge ${cls || ''}">${esc(t)}</span>`).join('')}</div>` : '';
  const sec = (titre, html) => html ? `<section class="pf-sec"><h3>${esc(titre)}</h3>${html}</section>` : '';
  const url = u => { u = String(u || '').trim(); if (!u) return ''; return /^https?:\/\//i.test(u) ? u : 'https://' + u; };
  const rich = v => v ? `<div class="rich">${richHtml(v)}</div>` : '';
  const kvs = rows => { rows = rows.filter(x => x && x[1] != null && String(x[1]).trim() !== ''); return rows.length ? rows.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span style="text-align:right">${v}</span></div>`).join('') : ''; };
  const gauge = n => { n = Math.max(0, Math.min(100, Math.round(Number(n) || 0))); return `<div class="row" style="align-items:baseline;gap:4px"><b style="font-size:24px;color:var(--navy)">${n}</b><span class="small muted">/100</span></div><div class="pf-gauge"><i style="width:${n}%"></i></div>`; };
  const tuiles = rows => { rows = rows.filter(x => x && x[0] != null && String(x[0]) !== ''); return rows.length ? `<div class="pf-stats">${rows.map(s => `<div><b>${esc(s[0])}</b><span>${esc(s[1])}</span></div>`).join('')}</div>` : ''; };
  const realList = arr => arr.length ? arr.map(x => { const t = item(x); if (!t) return ''; const o = typeof x === 'object' && x ? x : {}; return `<div class="pf-rev"><b>${esc(t)}</b>${o.annee ? ` <span class="small muted">· ${esc(o.annee)}</span>` : ''}${o.description ? `<div class="small">${esc(strip(o.description))}</div>` : ''}</div>`; }).join('') : '';
  const galerieHtml = g => g.length ? `<div class="pf-gal">${g.slice(0, 12).map(u => `<img src="${attrUrl(u)}" alt="" loading="lazy" data-zoom="${attrUrl(u)}" onerror="this.remove()">`).join('')}</div>` : '';
  const carteLien = adr => adr ? `<a class="pf-more" href="https://www.openstreetmap.org/search?query=${encodeURIComponent(adr)}" target="_blank" rel="noopener">Voir sur la carte ›</a>` : '';
  const STAT_INIT = { projets: 'Projets réalisés', evenements: 'Événements', formations: 'Formations', pays_couverts: 'Pays couverts', partenaires: 'Partenaires', benevoles: 'Bénévoles actifs' };
  const STAT_MEMBRE = { projets: 'Projets', formations: 'Formations', collaborations: 'Collaborations', pays_couverts: 'Pays couverts', clients: 'Clients', missions: 'Missions' };
  const statsPerso = (o, labels) => Object.keys(obj(o)).filter(k => obj(o)[k]).map(k => [obj(o)[k], labels[k] || k]);
  const stars = n => { n = Math.round(Number(n) || 0); return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n)); };

  const REZO = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', twitter: 'X (Twitter)', x: 'X (Twitter)', youtube: 'YouTube', tiktok: 'TikTok', whatsapp: 'WhatsApp' };
  function reseaux(o) {
    return Object.keys(o || {}).filter(k => o[k]).map(k => {
      let v = String(o[k]).trim(); const h = k === 'instagram' && v.startsWith('@') ? 'https://instagram.com/' + v.slice(1) : url(v);
      return `<a class="pf-lk" href="${esc(attrUrl(h))}" target="_blank" rel="noopener">${ic('out', 's')}<span>${esc(REZO[k.toLowerCase()] || k)}</span></a>`;
    }).join('');
  }
  const posts = l => l.length ? l.slice(0, 5).map(p => {
    const t = strip(md(p.titre || p.article_titre || '')); const c = strip(md(p.corps != null ? p.corps : (p.contenu || '')));
    return `<div class="pf-post"><div class="small muted">${esc(ago(p.created_at))}${p.categorie ? ' · ' + esc(p.categorie) : ''}</div>${t ? `<div style="font-weight:700">${esc(t)}</div>` : ''}<div class="pf-clamp">${linkify(c)}</div></div>`;
  }).join('') : '';

  /* En-tête commun */
  function hero(o) {
    const own = S.me && o.uid && Number(S.me.id) === Number(o.uid);
    const act = own
      ? `${o.kind !== 'collectivite' ? `<a class="btn sm navy block" style="margin-bottom:6px" href="profil-app.html">✏️ Modifier mon profil</a>` : ''}<p class="small muted" style="margin:0">Voici comment les autres vous voient.</p>`
      : `${o.adherer ? `<button type="button" class="btn sm navy block" style="margin-bottom:6px" data-adh="${o.fid}" data-nom="${esc(o.nom)}">${ic('people', 's')} Adhérer à cette structure</button>` : ''}${o.rejoindre ? `<div class="pf-act" style="margin-bottom:6px"><button type="button" class="btn sm out" data-rejoindre="benevole" data-fid="${o.fid}" data-nom="${esc(o.nom)}">🙋 Devenir bénévole</button><button type="button" class="btn sm out" data-rejoindre="partenaire" data-fid="${o.fid}" data-nom="${esc(o.nom)}">🤝 Devenir partenaire</button></div>` : ''}<div class="pf-act">${o.uid ? `<button type="button" class="btn sm" data-sup="${o.uid}">${ic('heart', 's')} Soutenir</button><button type="button" class="btn sm out" data-write="${o.uid}">${ic('chat', 's')} Contacter</button>` : ''}${o.fid ? `<button type="button" class="btn sm out" data-follow="${o.fid}" data-kind="${esc(o.kind)}" data-on="0">${ic('bell', 's')} S’abonner</button>` : ''}</div>`;
    if (o.uid) { S.annNames = S.annNames || {}; S.annNames[o.uid] = o.nom; }
    return `<div class="pf-hero"><div class="pf-banner">${o.banner ? `<img src="${attrUrl(o.banner)}" alt="" onerror="this.remove()">` : ''}</div>
      <div class="pf-id"><div class="pf-av ${o.rond ? 'rond' : ''}">${o.photo ? `<img src="${attrUrl(o.photo)}" alt="" onerror="this.remove()">` : esc(initials(o.nom))}</div><div class="pf-nm"><h2>${esc(o.nom)}</h2>${o.sous ? `<div class="small muted">${esc(o.sous)}</div>` : ''}</div></div>
      <div class="pf-body">${o.badges && o.badges.length ? `<div class="tags" style="margin:0 0 6px">${o.badges.join('')}</div>` : ''}
        ${o.loc ? `<div class="meta">${ic('pin', 's')}<span>${esc(o.loc)}</span></div>` : ''}${o.orig ? `<div class="meta">${ic('dir', 's')}<span>Origine : ${esc(o.orig)}</span></div>` : ''}
        ${o.stats && o.stats.length ? `<div class="pf-stats">${o.stats.map(s => `<div><b>${esc(s[0])}</b><span>${esc(s[1])}</span></div>`).join('')}</div>` : ''}${act}</div></div>`;
  }

  async function initiative(id) {
    let r; try { r = (await api('/api/initiatives/' + encodeURIComponent(id))).initiative; } catch (e) { return rendre('Profil', `<div class="empty"><b>Profil introuvable</b>${esc(e.message)}</div>`); }
    const sous = p => api('/api/initiatives/' + encodeURIComponent(r.id) + p).catch(() => ({}));
    const [avis, pubs, prods, eq, part, camp, sc, evs] = await Promise.all([
      sous('/avis'), sous('/publications'),
      r.vitrine_active ? sous('/produits') : Promise.resolve({}),
      sous('/equipe'), sous('/partenaires'), sous('/campagnes-actives'), sous('/score-activite'),
      r.owner_user_id ? api('/api/evenements?owner=' + encodeURIComponent(r.owner_user_id)).catch(() => ({})) : Promise.resolve({})
    ]);
    const dom = domLabel(r.domaine_principal) || r.domaine || '';
    const verifiee = r.organisation_verifiee || (r.certif && r.certif.niveau);
    const services = list(r.services).map(item), langues = list(r.langues).map(item);
    const pays = (r.pays_intervention_arr || []).map(item);
    const rez = reseaux(Object.assign({}, r.reseaux_sociaux_obj || obj(r.reseaux_sociaux)));
    const tel = Number(r.vitrine_tel_visible) === 1 && r.vitrine_tel_pro ? r.vitrine_tel_pro : '', mail = r.vitrine_email_pro || '';
    const liens = (r.site_web ? `<a class="pf-lk" href="${esc(attrUrl(url(r.site_web)))}" target="_blank" rel="noopener">${ic('out', 's')}<span>${esc(String(r.site_web).replace(/^https?:\/\//, ''))}</span></a>` : '')
      + (tel ? `<a class="pf-lk" href="tel:${esc(String(tel).replace(/[^+\d]/g, ''))}">${ic('chat', 's')}<span>${esc(tel)}</span></a>` : '')
      + (mail ? `<a class="pf-lk" href="mailto:${esc(mail)}">${ic('send', 's')}<span>${esc(mail)}</span></a>` : '') + rez;
    const adr = [r.adresse, r.ville, r.pays].filter(Boolean).join(', ');
    const infos = [['Type', esc(r.type || '')], ['Créée en', esc(r.annee_creation || '')], ['Taille', esc(r.taille_structure || '')], ['Forme juridique', esc(r.forme_juridique || '')], ['Taille de l’entreprise', esc(r.taille_entreprise || '')], ['Organisme financier', esc(r.finance_type || '')], ['Horaires', esc(strip(r.vitrine_horaires || ''))], ['Adresse', esc(adr)]];
    const lstAvis = (avis.avis || []).slice(0, 4);
    const prodsL = (prods.produits || []).filter(p => p.disponible !== 0).slice(0, 6);
    const desc = r.description ? `<div class="rich">${richHtml(r.description)}</div>` : '';
    const publics = list(r.publics).map(item), besoins = list(r.besoins).map(item);
    const galerie = list(r.galerie_json).map(g => typeof g === 'string' ? g : (g && g.url)).filter(Boolean);
    const docs = list(r.documents).filter(d => d && d.url);
    const labels = [r.certif ? '🛡️ Initiative certifiée' : '', ...list(r.accreditations).map(a => a === 'mobilisation_active' ? '📢 Mobilisation active' : '💼 Opportunités')].filter(Boolean);
    const orig = [r.origine1 || r.owner_origine1, r.origine2 || r.owner_origine2].filter(Boolean), nat = [r.nationalite1, r.nationalite2].filter(Boolean);
    const equipe = eq.equipe || [], partenaires = part.partenaires || [], campagnes = camp.campagnes || [];
    const auj = new Date().toISOString().slice(0, 10);
    const aVenir = (evs.evenements || []).filter(e => !e.est_termine && String(e.date_fin || e.date_evt || '') >= auj).sort((x, y) => String(x.date_evt).localeCompare(String(y.date_evt))).slice(0, 4);
    const sections = [
      sec('À propos', (r.slogan ? `<p style="margin:0 0 8px;font-weight:700;color:var(--navy2)">${esc(strip(r.slogan))}</p>` : '') + desc + (r.mission ? `<p style="margin:10px 0 0"><b>Notre mission.</b> ${esc(strip(r.mission))}</p>` : '')),
      sec('Nos atouts', rich(r.historique)),
      sec('Domaines et services', (dom ? `<div style="margin-bottom:8px"><span class="badge g">${esc(dom)}</span></div>` : '') + chips(services) + (langues.length ? `<div class="small muted" style="margin-top:10px">Langues : ${esc(langues.join(', '))}</div>` : '')),
      sec('Services proposés', rich(r.vitrine_services)),
      sec('Origines', (orig.length ? chips(orig, 'g') : '') + (nat.length ? `<div class="small muted" style="margin-top:8px">Nationalité${nat.length > 1 ? 's' : ''} : ${esc(nat.join(' · '))}</div>` : '')),
      sec('Zones d’intervention', chips(pays)),
      sec('Public concerné', chips(publics)),
      sec('Recherche actuellement', chips(besoins, 'o')),
      sec('Équipe', equipe.length ? equipe.map(m => `<a class="pf-eq" href="#/profil/${encodeURIComponent(m.user_id)}"><span class="pf-eqav">${m.photo_url ? `<img src="${attrUrl(m.photo_url)}" alt="" onerror="this.remove()">` : esc(initials(m.nom))}</span><span><b>${esc(m.nom)}</b><span class="small muted" style="display:block">${esc(m.fonction || '')}</span></span></a>`).join('') : ''),
      sec('Informations pratiques', kvs(infos) + carteLien(adr)),
      sec('Statistiques', tuiles([[r.membres != null ? r.membres : 0, 'membres'], [r.abonnes != null ? r.abonnes : 0, 'abonnés'], [r.annee_creation, 'depuis'], ...statsPerso(r.stats_perso, STAT_INIT)])),
      sec('Labels et accréditations', labels.length ? labels.map(l => `<div class="pf-rev" style="padding:6px 0">${esc(l)}</div>`).join('') : ''),
      sec('Score d’activité', sc && sc.score != null ? gauge(sc.score) + '<div class="pf-note">Calculé sur les publications, événements, campagnes, membres et la complétude du profil.</div>' : ''),
      sec('Réalisations', realList(list(r.realisations))),
      sec('Événements à venir', aVenir.map(e => `<a class="pf-eq" href="#/evenement/${e.id}"><span><b>${esc(e.titre)}</b><span class="small muted" style="display:block">${esc(String(e.date_evt || '').slice(0, 10).split('-').reverse().join('/'))}${e.lieu ? ' · ' + esc(e.lieu) : ''}</span></span></a>`).join('')),
      sec('Campagnes en cours', campagnes.map(c => `<div class="pf-rev"><b>${esc(c.nom)}</b>${c.objectif_membres ? `<div class="small muted">Objectif : ${esc(c.objectif_membres)} membres</div>` : ''}${S.me && Number(S.me.id) === Number(r.owner_user_id) ? '' : `<button type="button" class="btn sm navy" style="margin-top:6px" data-adh="${esc(r.id)}" data-nom="${esc(r.nom)}">Participer</button>`}</div>`).join('')),
      sec('Galerie', galerieHtml(galerie)),
      sec('Documents', docs.map(d => `<a class="pf-lk" href="${esc(attrUrl(d.url))}" target="_blank" rel="noopener">${ic('out', 's')}<span>${esc(d.titre || 'Document')}</span></a>`).join('')),
      sec('Partenaires', partenaires.length ? `<div class="pf-part">${partenaires.slice(0, 12).map(p => { const inner = `${p.logo_url ? `<img src="${attrUrl(p.logo_url)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${esc(p.nom || '')}${p.type_partenaire ? `<div class="small muted" style="font-weight:500">${esc(p.type_partenaire)}</div>` : ''}`; return p.profil_url ? `<a href="${esc(attrUrl(p.profil_url))}">${inner}</a>` : `<div>${inner}</div>`; }).join('')}</div>` : ''),
      sec('Contact et liens', liens),
      prodsL.length ? sec('Boutique', `<div class="prods" style="padding:0">${prodsL.map(p => { const ph = list(p.photos_json)[0]; return `<div class="p"><div class="ph">${ph ? `<img src="${attrUrl(ph)}" alt="" loading="lazy" onerror="this.remove()">` : ic('shop')}</div><div class="pn ell">${esc(p.nom)}</div><div class="pp">${p.prix != null ? esc(p.prix) + ' ' + esc(!p.devise || p.devise === 'EUR' ? '€' : p.devise) : ''}</div></div>`; }).join('')}</div><a class="pf-more" href="profil.html?id=${encodeURIComponent(r.owner_user_id)}&vitrine=1">Voir toute la boutique sur le site ›</a>`) : '',
      sec('Avis' + (avis.total ? ` (${avis.total})` : ''), avis.total ? `<div class="row" style="margin-bottom:6px"><b style="font-size:22px">${esc(Number(avis.moyenne || 0).toFixed(1))}</b><span class="pf-st">${stars(avis.moyenne)}</span></div>` + lstAvis.map(v => `<div class="pf-rev"><span class="pf-st">${stars(v.note || v.rating)}</span> <b class="small">${esc(v.auteur_nom || v.nom || '')}</b><div>${esc(strip(v.commentaire || v.texte || v.contenu || ''))}</div></div>`).join('') : ''),
      sec('Publications', posts(pubs.publications || []))
    ].join('');
    const badges = [r.type ? `<span class="badge g">${esc(r.type)}</span>` : '', verifiee ? `<span class="badge g">${ic('check', 's')} Vérifiée</span>` : ''].filter(Boolean);
    const h = hero({ rejoindre: true, adherer: ['Association', 'ONG'].includes(r.type) && r.adhesions_ouvertes !== false && r.adhesions_ouvertes !== 0, uid: r.owner_user_id, fid: r.id, kind: 'initiative', nom: r.nom, sous: r.sigle || '', photo: r.logo_url, banner: r.vitrine_banniere_url || r.banniere_url, badges, loc: [r.ville, r.pays].filter(Boolean).join(', '), orig: [r.origine1 || r.owner_origine1, r.origine2 || r.owner_origine2].filter(Boolean).join(' · '),
      stats: [[r.abonnes || 0, 'abonnés'], [r.vues || r.nb_vues || 0, 'vues'], [avis.total ? Number(avis.moyenne || 0).toFixed(1) + '★' : '—', 'avis']] });
    rendre(r.nom, h + sections + `<a class="btn out block" style="margin:4px 0 8px" href="initiative.html?id=${encodeURIComponent(r.slug || r.id)}">${ic('out', 's')} Ouvrir la fiche complète sur le site</a>`);
    /* Partager ce profil (2026-10-07) : lien public, lisible sans compte. */
    if (A.paneShare && !cibleTab) A.paneShare(location.origin + (r.owner_user_id ? '/profil.html?id=' + encodeURIComponent(r.owner_user_id) : '/initiative.html?id=' + encodeURIComponent(r.slug || r.id)) + '&r=' + A.jetonPartage(), r.nom);
  }

  async function compte(id) {
    let p; try { p = (await api('/api/profil/' + encodeURIComponent(id))).profil; } catch (e) { return rendre('Profil', `<div class="empty"><b>Profil introuvable</b>${esc(e.message)}</div>`); }
    if (p.role === 'initiative' && p.initiative_id) { if (cibleTab) return initiative(p.initiative_id); location.replace('#/profil/i/' + p.initiative_id); return; }
    if (p.role === 'collectivite') return collectivite(p.id);
    const sc = await api('/api/profil/' + encodeURIComponent(p.id) + '/score-activite').catch(() => null);
    const pro = p.role !== 'utilisateur';
    const nom = pro ? (p.nom_structure || p.nom_institution || p.nom) : [p.prenom, p.nom].filter(Boolean).join(' ') || p.nom;
    const resp = pro && p.responsable ? (typeof p.responsable === 'string' ? p.responsable : [p.responsable.prenom, p.responsable.nom].filter(Boolean).join(' ')) : '';
    const comp = list(p.competences).map(item), centres = list(p.centres_interet).map(item), exps = list(p.experiences);
    const gal = list(p.galerie).map(g => typeof g === 'string' ? g : (g && g.url)).filter(Boolean);
    const rez = reseaux(obj(p.reseaux_sociaux));
    const dom = [domLabel(p.domaine_principal), domLabel(p.sous_domaine_1), domLabel(p.sous_domaine_2)].filter(Boolean);
    const situ = { en_poste: 'En poste', recherche: 'En recherche', etudiant: 'Étudiant·e', independant: 'Indépendant·e', entrepreneur: 'Entrepreneur·e' }[p.situation_pro] || '';
    const bio = pro ? (p.structure_description || p.bio) : p.bio;
    const zones = list(p.zones).map(item), publics = list(p.publics).map(item), besoins = list(p.besoins).map(item);
    const rezAll = reseaux(Object.assign({}, obj(p.reseaux_sociaux), obj(p.reseaux_enrichis)));
    const labels = [p.partenaire_officiel ? '🏅 Partenaire officiel Diaspo’Actif' : '', p.identite_verifiee ? '🪪 Identité vérifiée' : '', p.email_verifie ? '✔️ E-mail vérifié' : ''].filter(Boolean);
    const nat = [p.nationalite1, p.nationalite2].filter(Boolean), orig = [p.origine1, p.origine2].filter(Boolean);
    const residence = [p.ville, p.pays].filter(Boolean).join(', ');
    const nbPubs = Array.isArray(p.publications) ? p.publications.length : 0;
    const suivies = (p.initiativesSuivies || []).slice(0, 5);
    const tel = p.telephone ? `<a href="tel:${esc(String(p.telephone).replace(/[^+\d]/g, ''))}">${esc(p.telephone)}</a>` : '';
    const sections = [
      sec('À propos', (p.titre_pro ? `<p style="margin:0 0 8px;font-weight:700;color:var(--navy2)">${esc(p.titre_pro)}</p>` : '') + (bio ? `<div class="rich">${richHtml(bio)}</div>` : '') + (situ ? `<div style="margin-top:8px"><span class="badge">${esc(situ)}</span></div>` : '') + (resp ? `<div class="small muted" style="margin-top:10px;font-size:11.5px">Responsable : ${esc(resp)}</div>` : '')),
      sec('Origine et résidence', kvs([['Pays d’origine', esc(orig.join(' · '))], ['Résidence', esc(residence)], ['Nationalité' + (nat.length > 1 ? 's' : ''), esc(nat.join(' · '))]])),
      sec('Domaines d’activité', chips(dom, 'g')),
      sec('Compétences', chips(comp)),
      sec('Zones d’intervention', chips(zones)),
      sec('Public concerné', chips(publics)),
      sec('Recherche actuellement', chips(besoins, 'o')),
      sec('Services proposés', rich(p.services_perso)),
      sec('Expériences', exps.length ? exps.slice(0, 8).map(e => `<div class="pf-rev"><b>${esc(e.poste || e.titre || item(e))}</b>${e.entreprise || e.structure ? `<div class="small muted">${esc(e.entreprise || e.structure)}${e.periode ? ' · ' + esc(e.periode) : ''}</div>` : ''}</div>`).join('') : ''),
      sec('Centres d’intérêt', chips(centres)),
      sec('Réalisations', realList(list(p.realisations))),
      sec('Réseaux', rezAll),
      sec('Informations pratiques', kvs([['Téléphone', tel], ['Localisation', esc(residence)], ['Activité depuis', esc(p.annee_debut || '')]])),
      sec('Statistiques', tuiles([[p.nbAbonnes || 0, 'abonnés'], [nbPubs, 'publications'], [p.annee_debut, 'depuis'], ...statsPerso(p.stats_perso, STAT_MEMBRE)])),
      sec('Labels et accréditations', labels.map(l => `<div class="pf-rev" style="padding:6px 0">${esc(l)}</div>`).join('')),
      sec('Score d’activité', sc && sc.score != null ? gauge(sc.score) + '<div class="pf-note">Calculé sur les publications, abonnés, relations et la complétude du profil.</div>' : ''),
      sec('Galerie', galerieHtml(gal)),
      sec('Initiatives suivies', suivies.map(i => `<a class="pf-eq" href="#/profil/i/${encodeURIComponent(i.slug || i.id)}"><span class="pf-eqav">${i.logo_url ? `<img src="${attrUrl(i.logo_url)}" alt="" onerror="this.remove()">` : esc(initials(i.nom))}</span><span><b>${esc(i.nom)}</b>${i.type ? `<span class="small muted" style="display:block">${esc(i.type)}</span>` : ''}</span></a>`).join('')),
      sec('Publications', posts(Array.isArray(p.publications) ? p.publications : []))
    ].join('');
    const rolLabel = A.ROLE_LABEL[p.role] || '';
    const badges = [pro && rolLabel ? `<span class="badge g">${esc(rolLabel)}</span>` : `<span class="badge">Membre</span>`, p.identite_verifiee ? `<span class="badge g">${ic('check', 's')} Identité vérifiée</span>` : '', p.partenaire_officiel ? '<span class="badge o">Partenaire officiel</span>' : ''].filter(Boolean);
    const h = hero({ uid: p.id, fid: p.id, kind: p.role === 'collectivite' ? 'collectivite' : 'user', nom, sous: pro ? '' : (p.titre_pro || ''), photo: p.photo_url, banner: p.banner_url || p.vitrine_banniere_url, rond: !pro, badges,
      loc: [p.ville, p.pays].filter(Boolean).join(', '), orig: [p.origine1, p.origine2].filter(Boolean).join(' · '), stats: [[p.nbAbonnes || 0, 'abonnés'], [p.nbSuivis || 0, 'abonnements'], [(Array.isArray(p.publications) ? p.publications.length : 0), 'publications']] });
    rendre(nom, h + sections + `<a class="btn out block" style="margin:4px 0 8px" href="profil.html?id=${encodeURIComponent(p.id)}">${ic('out', 's')} Ouvrir le profil complet sur le site</a>`);
    if (A.paneShare && !cibleTab) A.paneShare(location.origin + '/profil.html?id=' + encodeURIComponent(p.id) + '&r=' + A.jetonPartage(), nom);
  }

  const TYPE_COLLECTIVITE = { region: 'Région', district: 'District', departement: 'Département', prefecture: 'Préfecture', commune: 'Commune', consulat: 'Consulat', institution: 'Institution', ambassade: 'Ambassade', ministere: 'Ministère', mairie: 'Mairie' };
  const dateCourte = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
  /* Profil public d'une collectivité (2026-10-08) : mêmes données que la page du site (profil-collectivite.html) — présentation, gouvernance,
     documents, projets d'expansion, galerie, agenda territorial — au lieu du profil générique d'un compte. */
  async function collectivite(id) {
    let c; try { c = (await api('/api/collectivites/' + encodeURIComponent(id) + '/profil-public')).profil; } catch (e) { return rendre('Profil', `<div class="empty"><b>Profil introuvable</b>${esc(e.message)}</div>`); }
    const [ag, ex, act] = await Promise.all([
      api('/api/collectivites/' + encodeURIComponent(id) + '/agenda').catch(() => ({})),
      api('/api/collectivites/' + encodeURIComponent(id) + '/expansion-projets').catch(() => ({})),
      api('/api/collectivites/' + encodeURIComponent(id) + '/actualites').catch(() => ({}))
    ]);
    const type = TYPE_COLLECTIVITE[String(c.type_organisme || '').toLowerCase()] || c.type_organisme || 'Collectivité';
    const territoire = [c.ville, c.departement, c.region, c.pays].filter(Boolean).join(', ');
    const resp = [c.prenom_responsable, c.nom_responsable].filter(Boolean).join(' ');
    const gal = list(c.galerie).map(g => typeof g === 'string' ? g : (g && g.url)).filter(Boolean);
    const docs = list(c.documents).filter(d => d && d.url);
    const projets = ex.projets || [];
    const carteProjet = (p, etiquette) => {
      const pct = (p.budget_recherche && p.montant_deja_leve != null) ? Math.min(100, Math.round(p.montant_deja_leve / p.budget_recherche * 100)) : null;
      return `<div class="pf-rev"><span class="badge o">${etiquette}</span> <b>${esc(p.titre)}</b>${p.secteur || p.lieu ? `<div class="small muted">${esc([p.secteur, p.lieu].filter(Boolean).join(' · '))}</div>` : ''}${p.description ? `<div class="small">${esc(strip(p.description))}</div>` : ''}${p.budget_recherche ? `<div class="small" style="margin-top:4px"><b>${esc(Number(p.budget_recherche).toLocaleString('fr-FR'))} ${esc(p.devise || 'EUR')}</b> recherchés${pct != null ? ` — ${pct} % déjà levés` : ''}</div>` : ''}${p.contact_email ? `<a class="pf-more" href="mailto:${esc(p.contact_email)}?subject=${encodeURIComponent('Partenariat — ' + p.titre)}">Contacter ›</a>` : ''}</div>`;
    };
    const parStatut = s => projets.filter(p => p.statut === s);
    const evts = (ag.events || []).slice(0, 5);
    const sections = [
      sec('Présentation', rich(c.bio)),
      sec('Gouvernance', (resp ? `<div style="margin-bottom:8px"><b>${esc(resp)}</b>${c.fonction_responsable ? `<div class="small muted">${esc(c.fonction_responsable)}</div>` : ''}</div>` : '') + rich(c.presentation_gouvernance)),
      sec('Recherche de partenaires', parStatut('recherche_partenaires').map(p => carteProjet(p, '🤝 Recherche partenaire')).join('')),
      sec('Projets en cours', parStatut('en_cours').map(p => carteProjet(p, 'En cours')).join('')),
      sec('Projets réalisés', parStatut('termine').map(p => carteProjet(p, 'Réalisé')).join('')),
      sec('Agenda territorial', evts.map(e => `<div class="pf-rev"><b>${esc(e.titre)}</b><div class="small muted">${esc(dateCourte(e.date_evt))}${e.lieu ? ' · ' + esc(e.lieu) : ''}</div></div>`).join('')),
      sec('Liens', (c.site_web ? `<a class="pf-lk" href="${esc(attrUrl(url(c.site_web)))}" target="_blank" rel="noopener">${ic('out', 's')}<span>Site officiel</span></a>` : '') + reseaux(obj(c.reseaux_sociaux))),
      sec('Documents', docs.map(d => `<a class="pf-lk" href="${esc(attrUrl(d.url))}" target="_blank" rel="noopener">${ic('out', 's')}<span>${esc(d.nom || d.titre || 'Document')}</span></a>`).join('')),
      sec('Galerie', galerieHtml(gal)),
      sec('Actualités', posts(act.posts || []))
    ].join('');
    const st = c.stats || {};
    const h = hero({ uid: c.id, fid: c.id, kind: 'collectivite', nom: c.nom, sous: type, photo: c.logo_url, banner: c.banner_url,
      badges: [`<span class="badge g">${esc(type)}</span>`, c.is_verified ? `<span class="badge g">${ic('check', 's')} Vérifiée</span>` : ''].filter(Boolean),
      loc: territoire, stats: [[st.abonnes || 0, 'abonnés'], [st.publications || 0, 'publications'], [st.evenements || 0, 'événements']] });
    rendre(c.nom, h + sections + `<a class="btn out block" style="margin:4px 0 8px" href="profil-collectivite.html?id=${encodeURIComponent(c.id)}">${ic('out', 's')} Ouvrir le profil complet sur le site</a>`);
    if (A.paneShare && !cibleTab) A.paneShare(location.origin + '/profil-collectivite.html?id=' + encodeURIComponent(c.id) + '&r=' + A.jetonPartage(), c.nom);
  }

  /* « Devenir bénévole / partenaire » : même demande que sur la fiche du site (POST /api/initiatives/:id/rejoindre) ; l'initiative reçoit une notification. */
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-rejoindre]'); if (!b) return;
    e.preventDefault();
    if (!(await A.needLogin('Connectez-vous pour envoyer cette demande.'))) return;
    const type = b.dataset.rejoindre, lib = type === 'benevole' ? 'bénévole' : 'partenaire'; b.disabled = true;
    try {
      const r = await api(`/api/initiatives/${encodeURIComponent(b.dataset.fid)}/rejoindre`, { method: 'POST', body: { type } });
      A.toast(r.deja_envoyee ? `Vous avez déjà envoyé une demande pour devenir ${lib}.` : `Demande envoyée ✓ « ${b.dataset.nom} » sera notifiée.`);
    } catch (er) { A.toast(er.message, true); }
    b.disabled = false;
  });

  window.MMods.profil = function (b, c) {
    cibleTab = null;
    setPane('Profil', '<div class="sk" style="height:140px;margin-bottom:12px"></div><div class="sk skc"></div>');
    if (b === 'i') return initiative(c);
    return compte(b);
  };
  /* Profil public du compte connecté, affiché dans l'onglet « Moi » (voir viewMoi, m.js). */
  window.MMods.profilTab = function (el, me) { cibleTab = el; return compte(me.id); };
})();
