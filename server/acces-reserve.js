/* ════════════════════════════════════════════════════════════════════════════════════════════
   Accès réservé en phase de test (2026-11-02, demande explicite).

   Les nouvelles rubriques (Influenceur Diaspo'Actif, module Accréditations…) ne sont visibles et utilisables que par le compte
   Diaspo'Actif officiel (diaspo.actif@gmail.com) tant que les tests ne sont pas terminés. Ce n'est PAS le compte administrateur.

   Pour ouvrir à tout le monde après les tests : passer RESERVE_TEST à false (une seule ligne, aucun autre code à réécrire).
   ════════════════════════════════════════════════════════════════════════════════════════════ */
const RESERVE_TEST = true;
const COMPTES_TEST = ['diaspo.actif@gmail.com'];

const norm = (e) => String(e || '').trim().toLowerCase();

/* Vrai si ce compte voit les rubriques en test. */
function ouvert(user) {
  if (!user) return false;
  if (!RESERVE_TEST) return true;
  return COMPTES_TEST.includes(norm(user.email));
}

module.exports = { ouvert, RESERVE_TEST, COMPTES_TEST };
