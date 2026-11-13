/* ===========================================================
   tests/boutique-assistant-lot3.test.js — Assistant de création, lot 3 (2026-11-13) : Publication + aperçu de la page dédiée
   1. L'aperçu du centre de création montre la page dédiée du type (même correspondance que la redirection de profil-app.html).
   2. Les 6 pages dédiées lisent le brouillon en mode aperçu (?preview=draft), jamais autrement.
   3. Le serveur dit « apercu_brouillon » seulement au propriétaire ; l'écran de maintenance ne laisse passer que lui.
   4. L'étape Publication affiche ce qui reste à compléter et les liens vers l'aperçu et la page publiée.
   Lancer : node --test tests/boutique-assistant-lot3.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const TABLEAU = lire('dashboard-initiative.html');
const PAGES = ['boutique-commerce', 'boutique-video', 'boutique-portfolio', 'boutique-evenements', 'boutique-impact', 'boutique-finance'];

/* Extrait du tableau de bord les trois définitions utiles et les exécute dans un contexte isolé. */
function aperçu(type, idBoutique) {
  const debut = TABLEAU.indexOf('const PV_PAGES_DEDIEES');
  const fin = TABLEAU.indexOf('function pvMajLegendeApercu');
  assert.ok(debut > 0 && fin > debut, 'définitions de l\'aperçu introuvables');
  const ctx = vm.createContext({ __pvVitrineType: type, __pvVitrineTypes: [], window: { __vitrineInitId: idBoutique }, encodeURIComponent });
  vm.runInContext(TABLEAU.slice(debut, fin) + '\nthis.pvUrlBoutique = pvUrlBoutique; this.pvPageDuType = pvPageDuType;', ctx);
  return ctx;
}

test('L3-1 chaque type à page dédiée ouvre sa page, en brouillon pour l\'aperçu et sans brouillon pour la page publiée', () => {
  const attendu = { commercial: 'boutique.html', ecom: 'boutique.html', portfolio: 'portfolio.html', video: 'boutique-video.html',
    events: 'boutique-evenements.html', impact: 'boutique-impact.html', finance: 'boutique-finance.html' };
  Object.keys(attendu).forEach((t) => {
    const c = aperçu(t, 14);
    assert.equal(c.pvUrlBoutique(true), attendu[t] + '?id=14&preview=draft', t);
    assert.equal(c.pvUrlBoutique(false), attendu[t] + '?id=14', t);
  });
});

test('L3-2 un ancien type sans page dédiée garde la présentation générale', () => {
  ['evenement', 'projet', 'blog', 'createur', 'formation', null].forEach((t) => {
    const c = aperçu(t, 14);
    assert.equal(c.pvPageDuType(), null, String(t));
    assert.match(c.pvUrlBoutique(true), /^profil\.html\?preview=draft/);
  });
});

test('L3-3 la correspondance du tableau de bord est la même que celle de la redirection des visiteurs (profil-app.html)', () => {
  const profil = lire('profil-app.html');
  [['boutique.html', 'commercial'], ['boutique.html', 'ecom'], ['portfolio.html', 'portfolio'], ['boutique-video.html', 'video'],
    ['boutique-evenements.html', 'events'], ['boutique-impact.html', 'impact'], ['boutique-finance.html', 'finance']].forEach(([page, type]) => {
    assert.ok(new RegExp("vitrine_type === '" + type + "'[^\\n]*" + page.replace('.', '\\.')).test(profil), type + ' → ' + page + ' absent de profil-app.html');
  });
});

test('L3-4 les 6 pages dédiées lisent le brouillon seulement quand l\'adresse le demande', () => {
  PAGES.forEach((p) => {
    const js = lire('assets/' + p + '.js');
    assert.match(js, /'\/initiatives\/' \+ encodeURIComponent\((id|ref)\) \+ \(\/\[\?&\]preview=draft\(&\|\$\)\/\.test\(location\.search\) \? '\?preview=draft' : ''\)/, p);
    assert.equal((js.match(/preview=draft/g) || []).length, 2, p + ' : un seul usage attendu (expression + valeur)');
  });
});

test('L3-5 le serveur marque l\'aperçu pour le seul propriétaire connecté', () => {
  const serveur = lire('server/index.js');
  const i = serveur.indexOf('row.apercu_brouillon = useDraft;');
  assert.ok(i > 0, 'drapeau apercu_brouillon absent');
  const avant = serveur.slice(Math.max(0, i - 900), i);
  assert.match(avant, /useDraft = !!\(me && row\.owner_user_id && Number\(me\.id\) === Number\(row\.owner_user_id\)\)/);
});

test('L3-6 la maintenance ne laisse passer que l\'aperçu confirmé par le serveur, pas le simple paramètre d\'adresse', () => {
  const js = lire('assets/boutique-maintenance.js');
  assert.match(js, /apercu_brouillon === true/);
  assert.match(js, /if \(apercu\) return false;/);
  const faux = (reponses) => (url) => { const r = reponses.find((x) => url.indexOf(x.contient) >= 0); return Promise.resolve({ ok: true, json: () => Promise.resolve(r.corps) }); };
  const ctx = (reponses, recherche) => {
    const f = { location: { search: recherche }, URLSearchParams, encodeURIComponent, Promise, fetch: faux(reponses), document: { getElementById: () => null } };
    f.window = f;
    vm.runInContext(js, vm.createContext(f));
    return f;
  };
  const el = { innerHTML: '' };
  const maintenance = { contient: 'boutiques-maintenance', corps: { en_maintenance: true } };
  // propriétaire (le serveur confirme l'aperçu) : la page s'affiche malgré la maintenance
  return ctx([maintenance, { contient: '/api/initiatives/', corps: { initiative: { apercu_brouillon: true } } }], '?id=14&preview=draft')
    .DA_verifierMaintenanceBoutique(el).then((bloque) => {
      assert.equal(bloque, false); assert.equal(el.innerHTML, '');
      // quelqu'un d'autre avec le même paramètre : le serveur ne confirme pas, la maintenance l'arrête
      return ctx([maintenance, { contient: '/api/initiatives/', corps: { initiative: { apercu_brouillon: false } } }], '?id=14&preview=draft').DA_verifierMaintenanceBoutique(el);
    }).then((bloque) => {
      assert.equal(bloque, true); assert.match(el.innerHTML, /réorganisation/);
      el.innerHTML = '';
      // sans paramètre d'aperçu : comportement d'origine
      return ctx([maintenance], '?id=14').DA_verifierMaintenanceBoutique(el);
    }).then((bloque) => { assert.equal(bloque, true); });
});

test('L3-7 la publication affiche les points à compléter et les liens vers l\'aperçu et la page publiée', () => {
  ['pv-publication-attente', 'pv-publication-apercu', 'pv-publication-publiee', 'pv-publication-page', 'pv-apercu-lien', 'pv-apercu-note'].forEach((id) => {
    assert.ok(TABLEAU.indexOf('id="' + id + '"') > 0 || TABLEAU.indexOf("id=\"' + id") > 0 || TABLEAU.indexOf(id) > 0, id);
  });
  assert.match(TABLEAU, /\['type', 'identite', 'rubriques', 'confiance'\]\.filter\(c => pvAssistantEtat\(c\) === 'afaire'\)/);
  assert.match(TABLEAU, /vous pouvez publier quand même/);
});

test('L3-8 une page dédiée n\'est pas rechargée à chaque geste : elle l\'est après l\'enregistrement du brouillon', () => {
  assert.match(TABLEAU, /if \(!pret\) \{ if \(!pvPageDuType\(\)\) pvRefreshPreview\(\); return false; \}/);
  assert.match(TABLEAU, /renderPvDraftStatus\(\);\s*pvRafraichirApercuDiffere\(\);\s*return r;/);
});
