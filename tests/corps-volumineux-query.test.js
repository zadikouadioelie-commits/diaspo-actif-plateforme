/* ===========================================================
   tests/corps-volumineux-query.test.js — plafonds de corps de requête élargis (2026-11-20)
   ===========================================================
   Sur Vercel, la réécriture /api/:path* → /api/index ajoute « ?path=… » à req.url. readBody() comparait l'URL AVEC cette query : les plafonds élargis (Koffi des sondages 5 Mo,
   pièces jointes de messages 25 Mo, photo de réclamation 2 Mo) ne s'appliquaient donc jamais en production, et tout corps > 1 Mo restait sans réponse jusqu'au délai de 30 s (504).
   Le test envoie un corps de 1,5 Mo, avec et sans query, sans session : la réponse attendue est un 401 immédiat (JSON), pas une connexion coupée.
   Lancer : node --test tests/corps-volumineux-query.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { process.env.KOFI_IA_FAUSSE = '1'; env = await H.demarrer('corps-volumineux'); });
test.after(() => { if (env) env.stop(); });

const corps = (mo) => JSON.stringify({ texte: 'essai', fichiers: [{ nom: 'a.pdf', data: 'data:application/pdf;base64,' + 'A'.repeat(Math.round(mo * 1e6)) }] });
const poster = (chemin, body) => fetch(env.base + chemin, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(15000) });

test('Koffi sondages : un corps de 1,5 Mo atteint la route, même avec la query ajoutée par Vercel', async () => {
  for (const q of ['', '?path=kofi%2Fsondages%2Fmessages']) {
    const r = await poster('/api/kofi/sondages/messages' + q, corps(1.5));
    assert.equal(r.status, 401, 'sans session : réponse immédiate « Connexion requise » (query « ' + q + ' »)');
  }
});

test('Pièces jointes de messages (25 Mo) : un corps de 1,5 Mo n\'est pas coupé, avec la query de Vercel', async () => {
  const r = await poster('/api/conversations/1/messages?path=conversations%2F1%2Fmessages', corps(1.5));
  assert.ok(r.status >= 400 && r.status < 500, 'réponse normale du serveur (401/403/404), pas une connexion coupée — reçu ' + r.status);
});

test('Un corps trop gros pour une route ordinaire reste refusé (plafond 1 Mo conservé)', async () => {
  await assert.rejects(() => poster('/api/auth/login?path=auth%2Flogin', corps(1.5)), 'la connexion est coupée comme avant');
});
