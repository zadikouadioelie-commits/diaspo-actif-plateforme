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
      ? '<p class="small muted" style="margin:0">Voici comment les autres vous voient.</p>'
      : `${o.adherer ? `<button type="button" class="btn sm navy block" style="margin-bottom:6px" data-adh="${o.fid}" data-nom="${esc(o.nom)}">${ic('people', 's')} Adhérer à cette structure</button>` : ''}<div class="pf-act">${o.uid ? `<button type="button" class="btn sm" data-sup="${o.uid}">${ic('heart', 's')} Soutenir</button><button type="button" class="btn sm out" data-write="${o.uid}">${ic('chat', 's')} Contacter</button>` : ''}${o.fid ? `<button type="button" class="btn sm out" data-follow="${o.fid}" data-kind="${esc(o.kind)}" data-on="0">${ic('bell', 's')} S’abonner</button>` : ''}</div>`;
    if (o.uid) { S.annNames = S.annNames || {}; S.annNames[o.uid] = o.nom; }
    return `<div class="pf-hero"><div class="pf-banner">${o.banner ? `<img src="${attrUrl(o.banner)}" alt="" onerror="this.remove()">` : ''}</div>
      <div class="pf-id"><div class="pf-av ${o.rond ? 'rond' : ''}">${o.photo ? `<img src="${attrUrl(o.photo)}" alt="" onerror="this.remove()">` : esc(initials(o.nom))}</div><div class="pf-nm"><h2>${esc(o.nom)}</h2>${o.sous ? `<div class="small muted">${esc(o.sous)}</div>` : ''}</div></div>
      <div class="pf-body">${o.badges && o.badges.length ? `<div class="tags" style="margin:0 0 6px">${o.badges.join('')}</div>` : ''}
        ${o.loc ? `<div class="meta">${ic('pin', 's')}<span>${esc(o.loc)}</span></div>` : ''}${o.orig ? `<div class="meta">${ic('dir', 's')}<span>Origine : ${esc(o.orig)}</span></div>` : ''}
        ${o.stats && o.stats.length ? `<div class="pf-stats">${o.stats.map(s => `<div><b>${esc(s[0])}</b><span>${esc(s[1])}</span></div>`).join('')}</div>` : ''}${act}</div></div>`;
  }

  async function initiative(id) {
    let r; try { r = (await api('/api/initiatives/' + encodeURIComponent(id))).initiative; } catch (e) { return setPane('Profil', `<div class="empty"><b>Profil introuvable</b>${esc(e.message)}</div>`); }
    const [avis, pubs, prods] = await Promise.all([
      api('/api/initiatives/' + encodeURIComponent(r.id) + '/avis').catch(() => ({})),
      api('/api/initiatives/' + encodeURIComponent(r.id) + '/publications').catch(() => ({})),
      r.vitrine_active ? api('/api/initiatives/' + encodeURIComponent(r.id) + '/produits').catch(() => ({})) : Promise.resolve({})
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
    const infos = [['Type', r.type], ['Créée en', r.annee_creation], ['Taille', r.taille_structure], ['Pays d’intervention', pays.join(', ')]].filter(x => x[1]);
    const lstAvis = (avis.avis || []).slice(0, 4);
    const prodsL = (prods.produits || []).filter(p => p.disponible !== 0).slice(0, 6);
    const desc = r.description ? `<div class="rich">${richHtml(r.description)}</div>` : '';
    const sections = [
      sec('À propos', (r.slogan ? `<p style="margin:0 0 8px;font-weight:700;color:var(--navy2)">${esc(strip(r.slogan))}</p>` : '') + desc + (r.mission ? `<p style="margin:10px 0 0"><b>Notre mission.</b> ${esc(strip(r.mission))}</p>` : '')),
      sec('Domaines et services', (dom ? `<div style="margin-bottom:8px"><span class="badge g">${esc(dom)}</span></div>` : '') + chips(services) + (langues.length ? `<div class="small muted" style="margin-top:10px">Langues : ${esc(langues.join(', '))}</div>` : '')),
      sec('Informations', infos.length ? infos.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('') : ''),
      sec('Réalisations', chips(list(r.realisations).map(item))),
      sec('Contact et liens', liens),
      prodsL.length ? sec('Boutique', `<div class="prods" style="padding:0">${prodsL.map(p => { const ph = list(p.photos_json)[0]; return `<div class="p"><div class="ph">${ph ? `<img src="${attrUrl(ph)}" alt="" loading="lazy" onerror="this.remove()">` : ic('shop')}</div><div class="pn ell">${esc(p.nom)}</div><div class="pp">${p.prix != null ? esc(p.prix) + ' ' + esc(!p.devise || p.devise === 'EUR' ? '€' : p.devise) : ''}</div></div>`; }).join('')}</div><a class="pf-more" href="profil.html?id=${encodeURIComponent(r.owner_user_id)}&vitrine=1">Voir toute la boutique sur le site ›</a>`) : '',
      sec('Avis' + (avis.total ? ` (${avis.total})` : ''), avis.total ? `<div class="row" style="margin-bottom:6px"><b style="font-size:22px">${esc(Number(avis.moyenne || 0).toFixed(1))}</b><span class="pf-st">${stars(avis.moyenne)}</span></div>` + lstAvis.map(v => `<div class="pf-rev"><span class="pf-st">${stars(v.note || v.rating)}</span> <b class="small">${esc(v.auteur_nom || v.nom || '')}</b><div>${esc(strip(v.commentaire || v.texte || v.contenu || ''))}</div></div>`).join('') : ''),
      sec('Publications', posts(pubs.publications || []))
    ].join('');
    const badges = [r.type ? `<span class="badge g">${esc(r.type)}</span>` : '', verifiee ? `<span class="badge g">${ic('check', 's')} Vérifiée</span>` : ''].filter(Boolean);
    const h = hero({ adherer: ['Association', 'ONG'].includes(r.type) && r.adhesions_ouvertes !== false && r.adhesions_ouvertes !== 0, uid: r.owner_user_id, fid: r.id, kind: 'initiative', nom: r.nom, sous: r.sigle || '', photo: r.logo_url, banner: r.vitrine_banniere_url || r.banniere_url, badges, loc: [r.ville, r.pays].filter(Boolean).join(', '), orig: [r.origine1 || r.owner_origine1, r.origine2 || r.owner_origine2].filter(Boolean).join(' · '),
      stats: [[r.abonnes || 0, 'abonnés'], [r.vues || r.nb_vues || 0, 'vues'], [avis.total ? Number(avis.moyenne || 0).toFixed(1) + '★' : '—', 'avis']] });
    setPane(r.nom, h + sections + `<a class="btn out block" style="margin:4px 0 8px" href="initiative.html?id=${encodeURIComponent(r.slug || r.id)}">${ic('out', 's')} Ouvrir la fiche complète sur le site</a>`);
  }

  async function compte(id) {
    let p; try { p = (await api('/api/profil/' + encodeURIComponent(id))).profil; } catch (e) { return setPane('Profil', `<div class="empty"><b>Profil introuvable</b>${esc(e.message)}</div>`); }
    if (p.role === 'initiative' && p.initiative_id) { location.replace('#/profil/i/' + p.initiative_id); return; }
    const pro = p.role !== 'utilisateur';
    const nom = pro ? (p.nom_structure || p.nom_institution || p.nom) : [p.prenom, p.nom].filter(Boolean).join(' ') || p.nom;
    const resp = pro && p.responsable ? (typeof p.responsable === 'string' ? p.responsable : [p.responsable.prenom, p.responsable.nom].filter(Boolean).join(' ')) : '';
    const comp = list(p.competences).map(item), centres = list(p.centres_interet).map(item), exps = list(p.experiences);
    const gal = list(p.galerie).map(g => typeof g === 'string' ? g : (g && g.url)).filter(Boolean);
    const rez = reseaux(obj(p.reseaux_sociaux));
    const dom = [domLabel(p.domaine_principal), domLabel(p.sous_domaine_1), domLabel(p.sous_domaine_2)].filter(Boolean);
    const situ = { en_poste: 'En poste', recherche: 'En recherche', etudiant: 'Étudiant·e', independant: 'Indépendant·e', entrepreneur: 'Entrepreneur·e' }[p.situation_pro] || '';
    const bio = pro ? (p.structure_description || p.bio) : p.bio;
    const sections = [
      sec('À propos', (p.titre_pro ? `<p style="margin:0 0 8px;font-weight:700;color:var(--navy2)">${esc(p.titre_pro)}</p>` : '') + (bio ? `<div class="rich">${richHtml(bio)}</div>` : '') + (situ ? `<div style="margin-top:8px"><span class="badge">${esc(situ)}</span></div>` : '') + (resp ? `<div class="small muted" style="margin-top:10px;font-size:11.5px">Responsable : ${esc(resp)}</div>` : '')),
      sec('Domaines d’activité', chips(dom, 'g')),
      sec('Compétences', chips(comp)),
      sec('Expériences', exps.length ? exps.slice(0, 5).map(e => `<div class="pf-rev"><b>${esc(e.poste || e.titre || item(e))}</b>${e.entreprise || e.structure ? `<div class="small muted">${esc(e.entreprise || e.structure)}${e.periode ? ' · ' + esc(e.periode) : ''}</div>` : ''}</div>`).join('') : ''),
      sec('Centres d’intérêt', chips(centres)),
      sec('Réseaux', rez),
      gal.length ? sec('Galerie', `<div class="pf-gal">${gal.slice(0, 9).map(g => `<img src="${attrUrl(g)}" alt="" loading="lazy" data-zoom="${attrUrl(g)}" onerror="this.remove()">`).join('')}</div>`) : '',
      sec('Publications', posts(Array.isArray(p.publications) ? p.publications : []))
    ].join('');
    const rolLabel = A.ROLE_LABEL[p.role] || '';
    const badges = [pro && rolLabel ? `<span class="badge g">${esc(rolLabel)}</span>` : `<span class="badge">Membre</span>`, p.identite_verifiee ? `<span class="badge g">${ic('check', 's')} Identité vérifiée</span>` : '', p.partenaire_officiel ? '<span class="badge o">Partenaire officiel</span>' : ''].filter(Boolean);
    const h = hero({ uid: p.id, fid: p.id, kind: p.role === 'collectivite' ? 'collectivite' : 'user', nom, sous: pro ? '' : (p.titre_pro || ''), photo: p.photo_url, banner: p.banner_url || p.vitrine_banniere_url, rond: !pro, badges,
      loc: [p.ville, p.pays].filter(Boolean).join(', '), orig: [p.origine1, p.origine2].filter(Boolean).join(' · '), stats: [[p.nbAbonnes || 0, 'abonnés'], [p.nbSuivis || 0, 'abonnements'], [(Array.isArray(p.publications) ? p.publications.length : 0), 'publications']] });
    setPane(nom, h + sections + `<a class="btn out block" style="margin:4px 0 8px" href="profil.html?id=${encodeURIComponent(p.id)}">${ic('out', 's')} Ouvrir le profil complet sur le site</a>`);
  }

  window.MMods.profil = function (b, c) {
    setPane('Profil', '<div class="sk" style="height:140px;margin-bottom:12px"></div><div class="sk skc"></div>');
    if (b === 'i') return initiative(c);
    return compte(b);
  };
})();
