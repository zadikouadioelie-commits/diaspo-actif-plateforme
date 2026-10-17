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
    description: 'Points de fair-play par match joué : 5/10 par défaut (irréprochable), +2 ou +3 pour un fait remarquable. Moyenne par match ou total.',
    poste_filtre: null,
    regle_defaut: { min_matchs: 3, fair_play_mode: 'moyenne', poids: {} },
  },
};

const POSTES = ['gardien', 'defenseur', 'milieu', 'attaquant'];
const FAIR_PLAY_DEFAUT = 5;      // note de fair-play d'un joueur présent quand le bureau n'a rien noté
const FAIR_PLAY_BONUS = [2, 3];  // bonus proposés au bureau pour un comportement remarquable

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const arrondi = (v, d = 2) => { const p = 10 ** d; return Math.round((v + Number.EPSILON) * p) / p; };

function normaliserRegle(modele, regle) {
  const base = (MODELES[modele] && MODELES[modele].regle_defaut) || { min_matchs: 1, poids: {} };
  const r = regle && typeof regle === 'object' ? regle : {};
  const min = Math.max(1, Math.floor(n(r.min_matchs !== undefined ? r.min_matchs : base.min_matchs)) || 1);
  const poids = { ...(base.poids || {}), ...((r.poids && typeof r.poids === 'object') ? r.poids : {}) };
  Object.keys(poids).forEach(k => { poids[k] = Math.max(0, n(poids[k])); });
  const out = { min_matchs: min, poids };
  if (modele === 'fairplay') out.fair_play_mode = (r.fair_play_mode || base.fair_play_mode) === 'total' ? 'total' : 'moyenne';
  return out;
}

/* Regroupe les notes par joueur, après filtre éventuel sur le poste. */
function agreger(notes, posteFiltre) {
  const par = new Map();
  for (const x of notes || []) {
    if (posteFiltre && String(x.poste_joue || '').toLowerCase() !== posteFiltre) continue;
    const id = x.joueur_id;
    if (!par.has(id)) par.set(id, { joueur_id: id, matchs: 0, buts: 0, passes: 0, fair_play: 0, fp_n: 0, arrets: 0, buts_encaisses: 0, duels: 0, interceptions: 0, tacles: 0, etoiles_somme: 0, etoiles_n: 0 });
    const a = par.get(id);
    a.matchs += 1;
    a.buts += n(x.buts); a.passes += n(x.passes);
    /* Fair-play : un joueur PRÉSENT sans note de fair-play compte automatiquement FAIR_PLAY_DEFAUT (5/10 = irréprochable
       sans être extraordinaire). Le bureau ajoute +2 ou +3 pour un fait remarquable (la note finale reste entre 0 et 10). */
    const fp = (x.fair_play === null || x.fair_play === undefined || x.fair_play === '') ? FAIR_PLAY_DEFAUT : n(x.fair_play);
    a.fair_play += fp; a.fp_n += 1;
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
      const moy = a.fair_play / a.fp_n;                      // moyenne par match où le fair-play est noté
      const score = regle.fair_play_mode === 'total' ? a.fair_play : moy;
      return { a, score, detail: { fair_play_total: arrondi(a.fair_play), fair_play_moyenne: arrondi(moy), matchs: a.fp_n },
        tri: [score, a.fair_play, a.fp_n] };
    });
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

module.exports = { MODELES, POSTES, FAIR_PLAY_DEFAUT, FAIR_PLAY_BONUS, normaliserRegle, classer, combinerScoreEtVote };
