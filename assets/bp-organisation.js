/* ============================================================================
   Business Plan — Organisation & gouvernance, Ressources humaines (2026-11-11)
   Logique pure (aucun accès réseau ni DOM sauf l'injection facultative du style de l'organigramme).
   Réponse aux conseils reçus :
   - Organisation : organigramme dynamique, matrice des responsabilités (RACI), gouvernance financière,
     indicateurs de pilotage ; surtout, DISTINGUER les pratiques réellement en place de celles seulement
     prévues ou recommandées — un business plan ne doit pas présenter comme existants des contrôles ou des
     comités qui ne sont pas encore opérationnels.
   - Ressources humaines : effectif actuel → effectif après recrutements identifiés → objectif, avec le
     nombre de postes encore à définir, et indicateurs RH calculés à partir des postes saisis.
   Deux espaces de noms : BPOrga et BPRh (window.* et module.exports).
   ============================================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BPOrga = api.BPOrga; root.BPRh = api.BPRh;
})(typeof window !== 'undefined' ? window : this, function () {
  const has = v => v !== undefined && v !== null && String(v).trim() !== '';
  const nombre = v => {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  };
  const fmtNb = n => (n === null || n === undefined || !isFinite(n)) ? '' : (Math.round(n * 10) / 10).toLocaleString('fr-FR');
  /* Les coûts des postes sont saisis sans unité ni période (mensuel ou annuel, euro ou franc CFA) : on les affiche tels que saisis, sans symbole ni calcul de ratio. */
  const fmtMontant = n => (n === null || n === undefined || !isFinite(n)) ? '' : Math.round(n).toLocaleString('fr-FR');
  const escHtml = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ------------------------------------------------------------------ Organisation */
  const STATUTS_PRATIQUE = [
    { v: 'en_place', l: 'En place' },
    { v: 'prevu', l: 'Prévu' },
    { v: 'recommande', l: 'Recommandé' },
  ];
  const statutPratique = v => (STATUTS_PRATIQUE.some(s => s.v === v) ? v : 'prevu');   /* par défaut : « Prévu » — jamais « En place » sans que l'auteur l'affirme */
  const statutPratiqueLabel = v => STATUTS_PRATIQUE.find(s => s.v === statutPratique(v)).l;

  const SUJETS_FINANCE = ['Autorisation des dépenses', 'Validation des investissements', 'Contrôle budgétaire', 'Signature bancaire'];
  const DOMAINES_PILOTAGE = ['Production', 'Qualité', 'Ventes', 'Trésorerie', 'Ressources humaines'];
  const RACI_EXEMPLES = ['Validation du budget annuel', "Recrutement d'un collaborateur", 'Choix des fournisseurs', 'Contrôle qualité des lots'];

  const liste = v => (Array.isArray(v) ? v : []);

  /* Nœuds de l'organigramme : { id, nom, fonction, detail, parent_id }. */
  function noeuds(o) {
    return liste((o || {}).organigramme)
      .map((n, i) => ({ id: has(n && n.id) ? String(n.id) : 'n' + i, nom: ((n && n.nom) || '').toString().trim(), fonction: ((n && n.fonction) || '').toString().trim(), detail: ((n && n.detail) || '').toString().trim(), parent_id: has(n && n.parent_id) ? String(n.parent_id) : '' }))
      .filter(n => n.nom || n.fonction);
  }
  function nouvelId(liste_) {
    const pris = new Set(liste(liste_).map(n => n && n.id));
    let i = liste(liste_).length;
    while (pris.has('n' + i)) i++;
    return 'n' + i;
  }
  /* Arbre : un nœud dont le parent est absent, vide, lui-même ou pris dans une boucle devient un sommet. */
  function arbre(ns) {
    const par = new Map(ns.map(n => [n.id, n]));
    const remonteBoucle = n => {
      const vu = new Set([n.id]); let c = n;
      while (c.parent_id && par.has(c.parent_id)) { if (vu.has(c.parent_id)) return true; vu.add(c.parent_id); c = par.get(c.parent_id); }
      return false;
    };
    const parentValide = n => n.parent_id && n.parent_id !== n.id && par.has(n.parent_id) && !remonteBoucle(n);
    const enfants = new Map(ns.map(n => [n.id, []]));
    const racines = [];
    ns.forEach(n => { if (parentValide(n)) enfants.get(n.parent_id).push(n); else racines.push(n); });
    const construire = (n, prof) => ({ noeud: n, prof, enfants: prof >= 4 ? [] : enfants.get(n.id).map(e => construire(e, prof + 1)) });
    return racines.map(r => construire(r, 0));
  }
  function niveaux(a) {
    const out = [];
    (function marche(l) { l.forEach(x => { (out[x.prof] = out[x.prof] || []).push(x.noeud); marche(x.enfants); }); })(a);
    return out;
  }
  function controleOrganigramme(ns) {
    const a = arbre(ns), msgs = [];
    if (ns.length > 1 && a.length > 1) msgs.push("L'organigramme a " + a.length + " sommets : rattachez chaque poste à son responsable pour montrer les liens hiérarchiques.");
    if (ns.length > 14) msgs.push('Au-delà de 14 cases, l\'organigramme devient illisible : regroupez les équipes.');
    return msgs;
  }
  const CSS_ORG = [
    '.og{overflow-x:auto;padding:4px 0;}',
    '.og ul{display:flex;justify-content:center;gap:0;padding:16px 0 0;margin:0;list-style:none;position:relative;}',
    '.og li{position:relative;display:flex;flex-direction:column;align-items:center;padding:16px 5px 0;text-align:center;}',
    '.og li::before,.og li::after{content:"";position:absolute;top:0;right:50%;width:50%;height:16px;border-top:1px solid var(--og-line,#9aa5b8);}',
    '.og li::after{right:auto;left:50%;border-left:1px solid var(--og-line,#9aa5b8);}',
    '.og li:only-child::before,.og li:only-child::after{display:none;}',
    '.og li:only-child{padding-top:0;}',
    '.og li:first-child::before,.og li:last-child::after{border:0 none;}',
    '.og li:last-child::before{border-right:1px solid var(--og-line,#9aa5b8);border-radius:0 5px 0 0;}',
    '.og li:first-child::after{border-radius:5px 0 0 0;}',
    '.og ul ul::before{content:"";position:absolute;top:0;left:50%;height:16px;border-left:1px solid var(--og-line,#9aa5b8);}',
    '.og>ul{padding-top:0;}',
    '.og>ul>li{padding-top:0;}',
    '.og>ul>li::before,.og>ul>li::after{display:none;}',
    '.og-b{box-sizing:border-box;min-width:118px;max-width:168px;padding:7px 9px;border:1px solid var(--og-bord,#c9d1de);border-radius:6px;background:var(--og-fond,#f6f8fb);color:var(--og-texte,#16233a);}',
    '.og-b b{display:block;font-size:11px;line-height:1.25;}',
    '.og-b span{display:block;font-size:9.5px;line-height:1.3;color:var(--og-accent,#8a6a1f);margin-top:1px;}',
    '.og-b small{display:block;font-size:8.5px;line-height:1.3;opacity:.75;margin-top:2px;}',
    '.og-b.og-top{border-color:var(--og-accent,#B8892B);background:var(--og-fond-top,#fbf5e6);}',
  ].join('');
  function ensureCss() {
    if (typeof document === 'undefined' || document.getElementById('bp-orga-css')) return;
    const st = document.createElement('style'); st.id = 'bp-orga-css'; st.textContent = CSS_ORG; (document.head || document.documentElement).appendChild(st);
  }
  /* HTML de l'organigramme (le style est injecté une fois). `esc` : fonction d'échappement de la page. */
  function organigrammeHtml(ns, esc) {
    const e = esc || escHtml;
    ensureCss();
    const a = arbre(ns);
    if (!a.length) return '';
    const boite = x => '<div class="og-b' + (x.prof === 0 ? ' og-top' : '') + '">' + (x.noeud.nom ? '<b>' + e(x.noeud.nom) + '</b>' : '') + (x.noeud.fonction ? '<span>' + e(x.noeud.fonction) + '</span>' : '') + (x.noeud.detail ? '<small>' + e(x.noeud.detail) + '</small>' : '') + '</div>';
    const rendre = l => '<ul>' + l.map(x => '<li>' + boite(x) + (x.enfants.length ? rendre(x.enfants) : '') + '</li>').join('') + '</ul>';
    return '<div class="og">' + rendre(a) + '</div>';
  }

  /* Matrice RACI : une ligne par décision ou activité ; R réalise, A approuve (un seul), C consulté, I informé. */
  function raci(o) {
    return liste((o || {}).raci).map(l => ({ activite: ((l && l.activite) || '').toString().trim(), r: ((l && l.r) || '').toString().trim(), a: ((l && l.a) || '').toString().trim(), c: ((l && l.c) || '').toString().trim(), i: ((l && l.i) || '').toString().trim(), statut: statutPratique(l && l.statut) })).filter(l => l.activite);
  }
  function controleRaci(lignes) {
    return lignes.map((l, index) => {
      if (!l.a || !l.r) return { index, etat: 'incomplet', message: !l.a && !l.r ? "Indiquez qui réalise (R) et qui approuve (A)." : (!l.a ? 'Indiquez qui approuve (A).' : 'Indiquez qui réalise (R).') };
      if (/[,;/]|\s(et|ou)\s/i.test(l.a)) return { index, etat: 'plusieurs', message: 'Un seul approbateur (A) par décision : la responsabilité finale ne se partage pas.' };
      return { index, etat: 'ok', message: '' };
    });
  }
  function gouvernanceFinanciere(o) {
    return liste((o || {}).gouvernance_financiere).map(l => ({ sujet: ((l && l.sujet) || '').toString().trim(), regle: ((l && l.regle) || '').toString().trim(), statut: statutPratique(l && l.statut) })).filter(l => l.sujet && l.regle);
  }
  function pilotage(o) {
    return liste((o || {}).pilotage_indicateurs).map(l => ({ domaine: ((l && l.domaine) || '').toString().trim(), indicateur: ((l && l.indicateur) || '').toString().trim(), frequence: ((l && l.frequence) || '').toString().trim(), responsable: ((l && l.responsable) || '').toString().trim(), statut: statutPratique(l && l.statut) })).filter(l => l.indicateur);
  }
  /* Bilan des pratiques : combien sont réellement en place, prévues, recommandées. */
  function bilanPratiques(o) {
    const b = { en_place: 0, prevu: 0, recommande: 0, total: 0 };
    [].concat(raci(o), gouvernanceFinanciere(o), pilotage(o)).forEach(x => { b[x.statut]++; b.total++; });
    return b;
  }
  const NOTE_STATUTS = "« En place » : pratique réellement appliquée aujourd'hui. « Prévu » : décidée, pas encore opérationnelle. « Recommandé » : bonne pratique conseillée, non encore décidée. Sans précision de l'auteur, une pratique est présentée comme « prévue ».";

  /* ------------------------------------------------------------------ Ressources humaines */
  function postes(rh) {
    return liste((rh || {}).postes).filter(p => p && has(p.intitule)).map(p => ({ intitule: String(p.intitule).trim(), nb: Math.max(1, nombre(p.nb_personnes) || 1), mission: (p.mission || '').toString().trim(), competences: (p.competences || '').toString().trim(), date: (p.date_recrutement || '').toString().trim(), cout: nombre(p.cout_total_employeur), formation: (p.formation_necessaire || '').toString().trim(), temps: p.temps === 'partiel' ? 'Temps partiel' : 'Temps plein' }));
  }
  /* Effectifs : actuel → après les recrutements identifiés (postes saisis) → objectif ; postes à définir = écart. */
  function effectifs(rh) {
    const actuel = nombre((rh || {}).effectif_actuel), objectif = nombre((rh || {}).effectif_prevu);
    const recrutements = postes(rh).reduce((s, p) => s + p.nb, 0);
    const identifies = (actuel !== null ? actuel : 0) + recrutements;
    const aDefinir = objectif !== null ? Math.max(0, objectif - identifies) : 0;
    return { actuel, objectif, recrutements, identifies, aDefinir, depasse: objectif !== null && actuel !== null && identifies > objectif, recule: objectif !== null && actuel !== null && objectif < actuel };
  }
  function courbe(rh) {
    const e = effectifs(rh), barres = [];
    if (e.actuel !== null) barres.push({ libelle: 'Actuel', valeur: e.actuel });
    if (e.recrutements > 0 && e.actuel !== null) barres.push({ libelle: 'Après recrutements identifiés', valeur: e.identifies });
    if (e.objectif !== null) barres.push({ libelle: 'Objectif à 12 mois', valeur: e.objectif });
    return barres.length >= 2 ? barres : [];
  }
  function noteCourbe(rh) {
    const e = effectifs(rh);
    if (e.objectif === null) return '';
    return 'Objectif à 12 mois : ' + fmtNb(e.objectif) + ' collaborateur' + (e.objectif > 1 ? 's' : '') + (e.aDefinir > 0 ? ', dont ' + e.aDefinir + ' poste' + (e.aDefinir > 1 ? 's' : '') + ' encore à définir.' : '.');
  }
  function controle(rh) {
    const e = effectifs(rh), m = [];
    if (e.recule) m.push("L'effectif prévu (" + fmtNb(e.objectif) + ') est inférieur à l\'effectif actuel (' + fmtNb(e.actuel) + ').');
    else if (e.depasse) m.push('Les postes détaillés (' + e.recrutements + ' recrutement' + (e.recrutements > 1 ? 's' : '') + ') portent l\'effectif à ' + fmtNb(e.identifies) + ', au-delà de l\'effectif prévu (' + fmtNb(e.objectif) + '). Corrigez l\'un ou l\'autre.');
    else if (e.aDefinir > 0 && e.actuel !== null) m.push(e.aDefinir + ' poste' + (e.aDefinir > 1 ? 's restent' : ' reste') + ' à définir pour atteindre l\'effectif prévu de ' + fmtNb(e.objectif) + '.');
    return m;
  }
  function masseRecrutements(rh) { return postes(rh).reduce((s, p) => s + (p.cout || 0) * p.nb, 0); }
  const STATUTS_DONNEE = { objectif: 'Objectif', hypothese: 'Hypothèse', constate: 'Constaté' };
  /* Indicateurs RH essentiels, calculés à partir des postes saisis ; jamais de valeur inventée. */
  function indicateurs(rh, ctx) {
    const e = effectifs(rh), c = ctx || {}, out = [];
    if (e.actuel !== null) out.push({ cle: 'effectif_actuel', label: 'Effectif actuel', valeur: fmtNb(e.actuel), mesure: 'Collaborateurs en poste', origine: 'Saisi dans la rubrique', statut: 'constate' });
    if (e.objectif !== null) out.push({ cle: 'effectif_objectif', label: 'Effectif visé à 12 mois', valeur: fmtNb(e.objectif), mesure: 'Capacité de production et de vente visée', origine: 'Saisi dans la rubrique', statut: 'objectif' });
    if (e.recrutements > 0) out.push({ cle: 'recrutements', label: 'Recrutements identifiés', valeur: String(e.recrutements), mesure: 'Postes détaillés dans le plan de recrutement', origine: 'Somme des postes saisis', statut: 'hypothese' });
    if (e.aDefinir > 0) out.push({ cle: 'a_definir', label: 'Postes encore à définir', valeur: String(e.aDefinir), mesure: 'Écart entre l\'effectif visé et les postes identifiés', origine: 'Effectif visé − (effectif actuel + recrutements)', statut: 'hypothese' });
    const masse = masseRecrutements(rh);
    if (masse > 0) {
      out.push({ cle: 'masse', label: 'Coût employeur cumulé des postes à pourvoir', valeur: fmtMontant(masse), mesure: 'Somme des coûts saisis × nombre de personnes (unité et période de la saisie)', origine: 'Somme des postes saisis', statut: 'hypothese' });
      if (e.recrutements > 0) out.push({ cle: 'cout_moyen', label: 'Coût employeur moyen par recrutement', valeur: fmtMontant(masse / e.recrutements), mesure: 'Pour budgéter les prochains recrutements', origine: 'Coût cumulé ÷ nombre de recrutements', statut: 'hypothese' });
    }
    return out;
  }
  /* Histogramme SVG des effectifs : une seule échelle (0 → maximum arrondi) pour les barres, les graduations et les valeurs. */
  function barresSvg(barres, opt) {
    const o = opt || {}, L = o.largeur || 560, H = o.hauteur || 220;
    if (!barres || !barres.length) return '';
    const max = Math.max.apply(null, barres.map(b => b.valeur)) || 1;
    const pas = max <= 8 ? 2 : (max <= 20 ? 4 : (max <= 40 ? 10 : Math.pow(10, Math.floor(Math.log10(max)))));
    const sommet = Math.ceil(max / pas) * pas;
    const gx = 34, gy = 14, bas = H - 34, haut = gy, util = L - gx - 10;
    const y = v => bas - (v / sommet) * (bas - haut);
    const w = Math.min(96, util / barres.length * 0.55);
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + L + ' ' + H + '" width="100%" role="img" aria-label="Évolution prévisionnelle des effectifs" style="max-width:' + L + 'px;display:block;">';
    for (let t = 0; t <= sommet; t += pas) {
      svg += '<line x1="' + gx + '" x2="' + (L - 6) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="currentColor" stroke-opacity="' + (t === 0 ? '.45' : '.12') + '"/>';
      svg += '<text x="' + (gx - 6) + '" y="' + (y(t) + 3) + '" text-anchor="end" font-size="9" fill="currentColor" fill-opacity=".7">' + t + '</text>';
    }
    const palette = ['#7FA6E8', '#4E86DB', '#1E4F8A'];
    barres.forEach((b, i) => {
      const cx = gx + (util / barres.length) * (i + 0.5), h = bas - y(b.valeur);
      svg += '<rect x="' + (cx - w / 2) + '" y="' + y(b.valeur) + '" width="' + w + '" height="' + Math.max(0, h) + '" rx="4" fill="' + palette[Math.min(i, palette.length - 1)] + '"/>';
      svg += '<text x="' + cx + '" y="' + (y(b.valeur) - 4) + '" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor">' + fmtNb(b.valeur) + '</text>';
      svg += '<text x="' + cx + '" y="' + (bas + 14) + '" text-anchor="middle" font-size="9.5" fill="currentColor" fill-opacity=".85">' + escHtml(b.libelle) + '</text>';
    });
    return svg + '</svg>';
  }

  const BPOrga = { STATUTS_PRATIQUE, statutPratique, statutPratiqueLabel, SUJETS_FINANCE, DOMAINES_PILOTAGE, RACI_EXEMPLES, noeuds, nouvelId, arbre, niveaux, controleOrganigramme, organigrammeHtml, ensureCss, CSS_ORG, raci, controleRaci, gouvernanceFinanciere, pilotage, bilanPratiques, NOTE_STATUTS };
  const BPRh = { postes, effectifs, courbe, noteCourbe, controle, masseRecrutements, indicateurs, barresSvg, STATUTS_DONNEE, nombre, fmtNb, fmtMontant };
  return { BPOrga, BPRh };
});
