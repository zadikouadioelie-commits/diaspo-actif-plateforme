/* ============================================================
   Diaspo'Actif — Tracker (module sportif d'association) : moteur de calcul des prix.
   Fonctions PURES (aucun accès base, aucune horloge) : faciles à tester, mêmes résultats partout.

   Entrées
     notes   : lignes « note de match » d'UN joueur chacune, déjà filtrées sur la période du prix :
               { joueur_id, match_id, poste_joue, buts, passes, fair_play, arrets, buts_encaisses,
                 note_etoiles, duels_gagnes, interceptions, tacles }
     regle   : { modele, min_matchs, fair_play_mode ('moyenne'|'total'), poids: {...} }
   Sortie
     classement : [{ joueur_id, rang, score, score_sur_100, matchs, detail:{...}, egalite }]
                  trié du meilleur au moins bon ; les joueurs sous le minimum de matchs sont écartés
                  (renvoyés à part dans `ecartes`) pour qu'un joueur à 1 match / 1 but ne gagne pas une moyenne.
   ============================================================ */
'use strict';

const MODELES = {
  buteur: {
    cle: 'buteur', nom: 'Meilleur buteur', emoji: '⚽',
    description: 'Classement au nombre de buts marqués. À égalité : plus de passes décisives, puis moins de matchs joués.',
    poste_filtre: null,
    regle_defaut: { min_matchs: 1, poids: {} },
  },
  gardien: {
    cle: 'gardien', nom: 'Meilleur gardien', emoji: '🧤',
    description: "Note à l'étoile (moyenne) et taux d'arrêts (arrêts / tirs cadrés subis), uniquement sur les matchs joués au poste de gardien.",
    poste_filtre: 'gardien',
    regle_defaut: { min_matchs: 3, poids: { etoiles: 50, taux_arrets: 50 } },
  },
  defenseur: {
    cle: 'defenseur', nom: 'Meilleur défenseur', emoji: '🛡️',
    description: "Note à l'étoile (moyenne), duels gagnés, interceptions et tacles par match, uniquement sur les matchs joués au poste de défenseur.",
    poste_filtre: 'defenseur',
    regle_defaut: { min_matchs: 3, poids: { etoiles: 40, duels: 30, interceptions: 15, tacles: 15 } },
  },
  fairplay: {
    cle: 'fairplay', nom: 'Joueur fair-play', emoji: '🤝',
    description: 'Niveau de fair-play par match joué : 5/10 pour tout le monde, +1 à +3 pour une belle action, moins les cartons. Moyenne sur les matchs joués.',
    poste_filtre: null,
    regle_defaut: { min_matchs: 3, poids: {} },
  },
  jogabonito: {
    cle: 'jogabonito', nom: 'Joga Bonito', emoji: '✨', dore: true,
    description: 'Le joueur le plus technique et le plus plaisant à regarder : celui qui a du style, joue avec le ballon et fait plaisir aux yeux. Noté sur 10 à chaque match.',
    poste_filtre: null,
    regle_defaut: { min_matchs: 3, joga_mode: 'moyenne', poids: {} },
  },
};

/* ---------- Cartons et niveau de fair-play ---------- */
const CARTONS = ['rouge', 'jaune', 'vert', 'blanc'];
const PORTEES = ['tous', 'entrainement', 'match'];
/* Réglage de départ, demandé et confirmé à chaque nouvelle journée puis conservé jusqu'à modification.
   malus : points de fair-play retirés (sur 10) ; matchs : nombre de matchs sur lesquels le malus pèse (1 à 3) ;
   portee : type de rencontres concernées (entrainement, match, ou tous). */
const CARTONS_DEFAUT = {
  rouge: { malus: 3, matchs: 1, portee: 'tous' }, jaune: { malus: 1, matchs: 1, portee: 'tous' },
  vert: { malus: 2, matchs: 1, portee: 'tous' }, blanc: { malus: 0, matchs: 1, portee: 'tous' },
};
function normaliserCartons(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const out = {};
  for (const c of CARTONS) {
    const x = b[c] && typeof b[c] === 'object' ? b[c] : {}, d = CARTONS_DEFAUT[c];
    const malus = x.malus === undefined || x.malus === '' ? d.malus : Math.min(10, Math.max(0, Math.round(Number(x.malus)) || 0));
    const matchs = [1, 2, 3].includes(Number(x.matchs)) ? Number(x.matchs) : d.matchs;
    out[c] = { malus, matchs, portee: PORTEES.includes(x.portee) ? x.portee : d.portee };
  }
  return out;
}

const POSTES = ['gardien', 'defenseur', 'milieu', 'attaquant'];
const CATEGORIES = ['match', 'entrainement'];
const FAIR_PLAY_DEFAUT = 5;     // note de fair-play d'un joueur présent quand le bureau n'a rien noté
const FAIR_PLAY_BONUS = [2, 3];  // bonus proposés au bureau pour un comportement remarquable

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const arrondi = (v, d = 2) => { const p = 10 ** d; return Math.round((v + Number.EPSILON) * p) / p; };

function normaliserRegle(modele, regle) {
  const base = (MODELES[modele] && MODELES[modele].regle_defaut) || { min_matchs: 1, poids: {} };
  const r = regle && typeof regle === 'object' ? regle : {};
  const min = Math.max(1, Math.floor(n(r.min_matchs !== undefined ? r.min_matchs : base.min_matchs)) || 1);
  const poids = { ...(base.poids || {}), ...((r.poids && typeof r.poids === 'object') ? r.poids : {}) };
  Object.keys(poids).forEach(k => { poids[k] = Math.max(0, n(poids[k])); });
  /* Catégories de rencontres prises en compte : matchs officiels, entraînements entre équipes du club, ou les deux (défaut). */
  let cats = Array.isArray(r.categories) ? r.categories.filter(c => CATEGORIES.includes(c)) : CATEGORIES.slice();
  if (!cats.length) cats = CATEGORIES.slice();
  /* « Membres à jour » : si coché, seuls les adhérents dont la cotisation est à jour comptent pour ce prix (classement, lauréat, trophée). */
  const out = { min_matchs: min, poids, categories: cats, membres_a_jour: r.membres_a_jour === true || r.membres_a_jour === 1 || r.membres_a_jour === '1' };
  if (modele === 'jogabonito') out.joga_mode = (r.joga_mode || base.joga_mode) === 'total' ? 'total' : 'moyenne';
  return out;
}

/* Niveau de fair-play d'UN joueur, match après match (ordre chronologique : date puis ordre du match).
   Règles : base 5 pour tout le monde, qui ne s'ADDITIONNE PAS d'un match à l'autre ; les points rapides (+1, +2, +3, changement d'équipe)
   s'ajoutent au match concerné (plafond 10) ; un carton retire son malus sur le nombre de matchs réglé (match où il est donné compris),
   uniquement sur les rencontres de son type ; le niveau peut passer SOUS ZÉRO. Dès que le niveau est ≤ 0, le joueur est « en sanction » :
   son niveau reste figé (et baisse si d'autres malus tombent) jusqu'à ce qu'il ait joué sur DEUX JOURNÉES DIFFÉRENTES sans aucun malus.
   Deux matchs le même jour comptent pour une seule journée. Après quoi tout est remis à plat : retour aux 5 points.
   matchs : [{ cle, date, categorie, cartons:{rouge,jaune,vert,blanc}, points, reglage }] → [{ cle, niveau, score, sanction, malus }] */
function historiqueFairPlay(matchs) {
  const out = [];
  let actifs = [], sanction = null;
  const jours = [];
  for (const m of matchs || []) { const j = jours[jours.length - 1]; if (j && j.date === m.date) j.matchs.push(m); else jours.push({ date: m.date, matchs: [m] }); }
  for (const jour of jours) {
    let malusDuJour = false;
    for (const m of jour.matchs) {
      const reg = normaliserCartons(m.reglage), nouveaux = [];
      for (const c of CARTONS) for (let k = 0; k < Math.max(0, Math.floor(n(m.cartons && m.cartons[c]))); k++) nouveaux.push({ points: reg[c].malus, restants: reg[c].matchs, portee: reg[c].portee });
      const concerne = (e) => e.portee === 'tous' || e.portee === m.categorie;
      const malusNouveau = nouveaux.filter(concerne).reduce((s, e) => s + e.points, 0);
      if (nouveaux.some(e => e.points > 0)) malusDuJour = true;
      actifs.push(...nouveaux);
      let niveau;
      if (sanction) { sanction.niveau -= malusNouveau; niveau = sanction.niveau; }
      else {
        niveau = FAIR_PLAY_DEFAUT - actifs.filter(concerne).reduce((s, e) => s + e.points, 0);
        if (niveau <= 0) sanction = { niveau, depuis: jour.date, propres: 0 };
      }
      out.push({ cle: m.cle, niveau, score: Math.min(10, niveau + n(m.points)), sanction: !!sanction, malus: FAIR_PLAY_DEFAUT - niveau });
      actifs.forEach(e => { if (concerne(e)) e.restants -= 1; });
      actifs = actifs.filter(e => e.restants > 0);
    }
    if (sanction && sanction.depuis !== jour.date) {
      if (malusDuJour) sanction.propres = 0;
      else if (++sanction.propres >= 2) { sanction = null; actifs = []; }
    }
  }
  return out;
}

/* Regroupe les notes par joueur, après filtre éventuel sur le poste. */
function agreger(notes, posteFiltre) {
  const par = new Map();
  for (const x of notes || []) {
    if (posteFiltre && String(x.poste_joue || '').toLowerCase() !== posteFiltre) continue;
    const id = x.joueur_id;
    if (!par.has(id)) par.set(id, { joueur_id: id, matchs: 0, buts: 0, passes: 0, fair_play: 0, fp_n: 0, joga: 0, cartons: 0, arrets: 0, buts_encaisses: 0, duels: 0, interceptions: 0, tacles: 0, etoiles_somme: 0, etoiles_n: 0 });
    const a = par.get(id);
    a.matchs += 1;
    a.buts += n(x.buts); a.passes += n(x.passes);
    /* Fair-play du match : calculé en amont (historiqueFairPlay : base 5, points rapides, malus des cartons, sanction) et passé dans fp_match.
       Sans valeur calculée : 5 + points rapides (plafond 10). */
    const fp = (x.fp_match !== undefined && x.fp_match !== null) ? n(x.fp_match) : Math.min(10, FAIR_PLAY_DEFAUT + n(x.fp_points) + n(x.fp_bonus));
    a.fair_play += fp; a.fp_n += 1;
    a.joga += Math.min(10, Math.max(0, n(x.joga_bonito)));
    a.cartons += n(x.carton_rouge) + n(x.carton_jaune) + n(x.carton_vert) + n(x.carton_blanc);
    a.arrets += n(x.arrets); a.buts_encaisses += n(x.buts_encaisses);
    a.duels += n(x.duels_gagnes); a.interceptions += n(x.interceptions); a.tacles += n(x.tacles);
    if (x.note_etoiles !== null && x.note_etoiles !== undefined && x.note_etoiles !== '') { a.etoiles_somme += n(x.note_etoiles); a.etoiles_n += 1; }
  }
  return Array.from(par.values());
}

/* Normalise une valeur sur 0-100 par rapport au meilleur du groupe (le meilleur = 100). */
function surMax(valeur, max) { return max > 0 ? (valeur / max) * 100 : 0; }

function noter(modele, regle, agregats) {
  const p = regle.poids || {};
  if (modele === 'buteur') {
    return agregats.filter(a => a.buts > 0).map(a => ({ a, score: a.buts, detail: { buts: a.buts, passes: a.passes, matchs: a.matchs },
      tri: [a.buts, a.passes, -a.matchs] }));
  }
  if (modele === 'fairplay') {
    return agregats.filter(a => a.fp_n > 0).map(a => {
      const moy = a.fair_play / a.fp_n;                      // niveau moyen sur les matchs joués (le fair-play ne s'additionne pas)
      return { a, score: moy, detail: { fair_play_moyen: arrondi(moy), cartons: a.cartons, matchs: a.fp_n }, tri: [moy, -a.cartons, a.fp_n] };
    });
  }
  if (modele === 'jogabonito') {
    return agregats.filter(a => a.matchs > 0).map(a => {
      const moy = a.joga / a.matchs, score = regle.joga_mode === 'total' ? a.joga : moy;   // non noté = 0
      return { a, score, detail: { joga_moyen: arrondi(moy), joga_total: arrondi(a.joga), matchs: a.matchs }, tri: [score, a.joga, a.matchs] };
    }).filter(l => l.a.joga > 0);
  }
  if (modele === 'gardien') {
    const lignes = agregats.map(a => {
      const etoiles = a.etoiles_n ? a.etoiles_somme / a.etoiles_n : 0;      // sur 5
      const tirs = a.arrets + a.buts_encaisses;
      const taux = tirs ? a.arrets / tirs : 0;                               // 0..1
      return { a, etoiles, taux, tirs };
    });
    const wE = n(p.etoiles), wT = n(p.taux_arrets), wTot = (wE + wT) || 1;
    return lignes.map(l => {
      const score = ((l.etoiles / 5) * 100 * wE + l.taux * 100 * wT) / wTot;
      return { a: l.a, score, detail: { etoiles_moyenne: arrondi(l.etoiles), taux_arrets_pct: arrondi(l.taux * 100, 1), arrets: l.a.arrets, buts_encaisses: l.a.buts_encaisses, matchs: l.a.matchs },
        tri: [score, l.taux, l.a.matchs] };
    });
  }
  if (modele === 'defenseur') {
    const lignes = agregats.map(a => ({
      a, etoiles: a.etoiles_n ? a.etoiles_somme / a.etoiles_n : 0,
      duels: a.matchs ? a.duels / a.matchs : 0,
      inter: a.matchs ? a.interceptions / a.matchs : 0,
      tacles: a.matchs ? a.tacles / a.matchs : 0,
    }));
    const maxD = Math.max(0, ...lignes.map(l => l.duels)), maxI = Math.max(0, ...lignes.map(l => l.inter)), maxT = Math.max(0, ...lignes.map(l => l.tacles));
    const wE = n(p.etoiles), wD = n(p.duels), wI = n(p.interceptions), wT = n(p.tacles), wTot = (wE + wD + wI + wT) || 1;
    return lignes.map(l => {
      const score = ((l.etoiles / 5) * 100 * wE + surMax(l.duels, maxD) * wD + surMax(l.inter, maxI) * wI + surMax(l.tacles, maxT) * wT) / wTot;
      return { a: l.a, score, detail: { etoiles_moyenne: arrondi(l.etoiles), duels_par_match: arrondi(l.duels), interceptions_par_match: arrondi(l.inter), tacles_par_match: arrondi(l.tacles), matchs: l.a.matchs },
        tri: [score, l.etoiles, l.a.matchs] };
    });
  }
  return [];
}

function comparerTri(x, y) {
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (y[i] || 0) - (x[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

function classer(modele, notes, regleBrute) {
  const def = MODELES[modele];
  if (!def) return { classement: [], ecartes: [], regle: normaliserRegle(modele, regleBrute), erreur: 'modele_inconnu' };
  const regle = normaliserRegle(modele, regleBrute);
  const agregats = agreger(notes, def.poste_filtre);
  const eligibles = agregats.filter(a => a.matchs >= regle.min_matchs);
  const ecartes = agregats.filter(a => a.matchs < regle.min_matchs).map(a => ({ joueur_id: a.joueur_id, matchs: a.matchs, raison: `moins de ${regle.min_matchs} match(s)` }));
  const notes_ = noter(modele, regle, eligibles).sort((x, y) => comparerTri(x.tri, y.tri));
  const maxScore = Math.max(0, ...notes_.map(l => l.score));
  let rang = 0, precedent = null;
  const classement = notes_.map((l, i) => {
    const cle = JSON.stringify(l.tri.map(v => arrondi(v, 6)));
    const ex = cle === precedent;
    if (!ex) rang = i + 1;
    precedent = cle;
    return { joueur_id: l.a.joueur_id, rang, score: arrondi(l.score), score_sur_100: arrondi(maxScore > 0 ? (l.score / maxScore) * 100 : 0, 1), matchs: l.a.matchs, detail: l.detail, egalite: false };
  });
  // Marque les égalités parfaites (même rang sur plusieurs joueurs) : le bureau tranche, rien n'est caché.
  const effectif = {};
  classement.forEach(c => { effectif[c.rang] = (effectif[c.rang] || 0) + 1; });
  classement.forEach(c => { c.egalite = effectif[c.rang] > 1; });
  return { classement, ecartes, regle };
}

/* Mélange score calculé + vote, chacun ramené sur 100 avant pondération.
   scoreParJoueur / votesParJoueur : Map ou objet { joueur_id: valeur }. poidsVotePct : 0..100. */
function combinerScoreEtVote(classement, votesParJoueur, poidsVotePct) {
  const pv = Math.min(100, Math.max(0, n(poidsVotePct)));
  const ps = 100 - pv;
  const votes = votesParJoueur instanceof Map ? Object.fromEntries(votesParJoueur) : (votesParJoueur || {});
  const total = Object.values(votes).reduce((s, v) => s + n(v), 0);
  const maxVotes = Math.max(0, ...Object.values(votes).map(n));
  const lignes = classement.map(c => {
    const v = n(votes[c.joueur_id]);
    const votePct = total ? (v / total) * 100 : 0;
    const vote100 = maxVotes ? (v / maxVotes) * 100 : 0;      // le plus voté = 100
    const final = (c.score_sur_100 * ps + vote100 * pv) / 100;
    return { ...c, votes: v, votes_pct: arrondi(votePct, 1), vote_sur_100: arrondi(vote100, 1), score_final: arrondi(final, 2) };
  }).sort((x, y) => y.score_final - x.score_final || y.score_sur_100 - x.score_sur_100);
  let rang = 0, prec = null;
  lignes.forEach((l, i) => { if (l.score_final !== prec) rang = i + 1; prec = l.score_final; l.rang_final = rang; });
  const eff = {}; lignes.forEach(l => { eff[l.rang_final] = (eff[l.rang_final] || 0) + 1; });
  lignes.forEach(l => { l.egalite_finale = eff[l.rang_final] > 1; });
  return { lignes, poids: { score: ps, vote: pv } };
}

/* ============================================================
   SÉANCE D'ENTRAÎNEMENT : enchaînement automatique des matchs entre équipes du club.
   regle : 'gagnant_reste' (le vainqueur reste, le perdant passe en fin de file, l'équipe suivante entre)
           'gagnant_sort'  (les DEUX équipes sortent, les deux suivantes entrent)
           'manuel'        (aucune proposition, le gestionnaire choisit chaque affiche)
   ordre  : ids des équipes dans l'ordre d'entrée voulu (les deux premières jouent en premier).
   matchs : rencontres déjà jouées dans l'ordre [{ a, b, sp, sc }] (sp/sc null = score pas encore saisi).
   Le calcul REJOUE l'historique à chaque fois : modifier un score ancien met la file à jour sans état stocké.
   ============================================================ */
const REGLES_ROTATION = ['gagnant_reste', 'gagnant_sort', 'manuel'];
function etatRotation(regle, ordre, matchs) {
  const eq = (ordre || []).map(Number);
  if (eq.length < 2) return { prochain: null, attente: eq, attend_score: false, raison: 'Il faut au moins deux équipes.' };
  if (regle === 'manuel') return { prochain: null, attente: [], attend_score: false, raison: 'Mode manuel : choisissez vous-même les équipes.' };
  let queue = eq.slice(), cur = [eq[0], eq[1]];
  const consec = {}; eq.forEach(id => { consec[id] = 0; });
  for (const m of matchs || []) {
    const a = Number(m.a), b = Number(m.b);
    queue = queue.filter(t => t !== a && t !== b);
    if (m.sp === null || m.sp === undefined || m.sc === null || m.sc === undefined) return { sur_terrain: [a, b], prochain: null, attente: queue, attend_score: true, raison: 'Saisissez le score du match en cours pour connaître la suite.' };
    consec[a] = (consec[a] || 0) + 1; consec[b] = (consec[b] || 0) + 1;
    const sp = n(m.sp), sc = n(m.sc);
    if (regle === 'gagnant_sort') {
      queue.push(a, b); consec[a] = 0; consec[b] = 0;
      cur = [queue.shift(), queue.shift()];
    } else {
      let reste, sort;
      if (sp > sc) { reste = a; sort = b; }
      else if (sc > sp) { reste = b; sort = a; }
      else if (consec[a] > consec[b]) { sort = a; reste = b; }   // nul : l'équipe restée le plus longtemps sort
      else if (consec[b] > consec[a]) { sort = b; reste = a; }
      else { sort = a; reste = b; }
      queue.push(sort); consec[sort] = 0;
      cur = [reste, queue.shift()];
    }
  }
  return { sur_terrain: null, prochain: cur[0] && cur[1] && cur[0] !== cur[1] ? cur : null, attente: queue, attend_score: false, raison: null };
}

const POSTE_PLURIEL = { gardien: 'gardien', defenseur: 'défenseur', milieu: 'milieu', attaquant: 'attaquant' };
/* Équipe la plus logique pour un joueur donné (retardataire) : celle qui compte le moins de joueurs à CE poste, puis le moins de joueurs au total.
   equipes : [{ id, nom, joueurs:[{ poste }] }] */
function suggererEquipe(equipes, poste) {
  if (!equipes || !equipes.length) return null;
  const lignes = equipes.map((e, i) => ({ e, i, nbPoste: poste ? e.joueurs.filter(j => j.poste === poste).length : 0, total: e.joueurs.length }));
  lignes.sort((x, y) => x.nbPoste - y.nbPoste || x.total - y.total || x.i - y.i);
  const g = lignes[0], lib = POSTE_PLURIEL[poste] || null;
  let raison;
  if (!lib) raison = `${g.e.nom} a le moins de joueurs (${g.total})`;
  else if (g.nbPoste === 0) raison = `${g.e.nom} n'a aucun ${lib}`;
  else { const pl = lib === 'milieu' ? 'milieux' : lib + 's'; raison = `${g.e.nom} a le moins ${/^[aeiouéh]/.test(pl) ? 'd’' : 'de '}${pl} (${g.nbPoste})`; }
  return { equipe_id: g.e.id, nom: g.e.nom, raison, comptes: lignes.map(l => ({ equipe_id: l.e.id, nom: l.e.nom, au_poste: l.nbPoste, total: l.total })) };
}

/* Répartition équilibrée de tous les présents entre les équipes, poste par poste (gardiens d'abord).
   presents : [{ joueur_id, poste }], equipeIds : [id...] → { joueur_id: equipe_id } */
function equilibrer(presents, equipeIds) {
  const ordre = ['gardien', 'defenseur', 'milieu', 'attaquant', ''];
  const tri = (presents || []).slice().sort((x, y) => ordre.indexOf(x.poste || '') - ordre.indexOf(y.poste || ''));
  const eq = equipeIds.map(id => ({ id, joueurs: [] }));
  const res = {};
  for (const p of tri) {
    const cible = eq.slice().sort((x, y) => x.joueurs.filter(j => j.poste === p.poste).length - y.joueurs.filter(j => j.poste === p.poste).length || x.joueurs.length - y.joueurs.length)[0];
    cible.joueurs.push({ poste: p.poste }); res[p.joueur_id] = cible.id;
  }
  return res;
}

module.exports = { CARTONS, PORTEES, CARTONS_DEFAUT, normaliserCartons, historiqueFairPlay, REGLES_ROTATION, etatRotation, suggererEquipe, equilibrer, MODELES, POSTES, CATEGORIES, FAIR_PLAY_DEFAUT, FAIR_PLAY_BONUS, normaliserRegle, classer, combinerScoreEtVote };
