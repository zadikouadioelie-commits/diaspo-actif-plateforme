/* ═════════════════════════════════════════════════
   server/commission.js — taux de commission de la plateforme : SOURCE UNIQUE (2026-11-01)

   Décision de l'utilisateur (2026-11-01) : 4 % sur absolument tout (billets, cagnottes, adhésions,
   inscriptions, boutique, formations). Historique : 5 % jusqu'au 2026-08-26, puis 3 %, puis 4 %.
   Pour changer le taux un jour, ne modifier QUE cette constante.
   Ne réécrit jamais les ventes passées : le taux appliqué est écrit sur chaque ligne du registre
   (wallet_transactions.commission_rate) et sur chaque commande de formation (commission_pct).
   ═════════════════════════════════════════════════ */
"use strict";

const TAUX_COMMISSION_PCT = 4;
const TAUX_COMMISSION = TAUX_COMMISSION_PCT / 100;

module.exports = { TAUX_COMMISSION_PCT, TAUX_COMMISSION };
