/* ════════════════════════════════════════════════════════════════════════
   DAA-Lang — Diaspo Association Accreditation Language
   ────────────────────────────────────────────────────────────────────────
   Le DSL déclaratif décrivant l'accréditation « Gestion des Associations »
   est ici encodé en configuration exécutable. Le backend (routes, règles
   métier, permissions) lit cette spécification — elle est la source unique
   de vérité. Toute évolution du module se fait en modifiant ce fichier.
   ════════════════════════════════════════════════════════════════════════ */

/* ── 2. ACCREDITATION ──────────────────────────────────────────────────── */
const ACCREDITATION = {
  name: "GestionAssociations",
  TYPE: "PREMIUM",
  PAYMENT_REQUIRED: true,
  STATUSES: ["PENDING", "ACTIVE", "SUSPENDED"],
  VERIFICATION_REQUIRED: true,
  BADGE: "Diaspo Verified Association",
};

/* ── 3. MEMBERS ────────────────────────────────────────────────────────── */
const MEMBERS = {
  LINK_TO_PLATFORM_ACCOUNT: true,
  HIDE_PHONE_NUMBER: true,
  HIDE_EMAIL: true,
  ALLOW_MULTI_ASSOCIATION: true,
  ROLES: ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY", "TREASURER", "MEMBER", "GUEST"],
  CUSTOM_ROLES: true,
};

/* ── 4. CONTRIBUTIONS ──────────────────────────────────────────────────── */
const CONTRIBUTIONS = {
  TYPES: ["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"],
  PAYMENT_METHODS: ["CARD", "PAYPAL", "STRIPE", "BANK_TRANSFER", "MOBILE_MONEY", "MANUAL"],
  BANK_INFO: {
    IBAN: "REQUIRED",
    BIC: "OPTIONAL",
    HOLDER_NAME: "REQUIRED",
    BANK_NAME: "OPTIONAL",
    DISPLAY_TO_MEMBERS: true,
    ACCESS_ROLE: ["PRESIDENT", "TREASURER"],
  },
  AUTO_REMINDERS: true,
  REMINDER_SCHEDULE: ["DUE_DAY", "+7D", "+15D", "+30D", "+60D"],
  AUTO_SUSPENSION: true,
};

/* ── 5. NOTIFICATIONS ──────────────────────────────────────────────────── */
const NOTIFICATIONS = {
  PAYMENT_REMINDERS: true,
  TEMPLATE_LEVELS: ["INFO", "WARNING", "URGENT", "FINAL_NOTICE"],
  CHANNELS: ["APP", "EMAIL", "PUSH"],
};

/* ── 6. ANALYTICS ──────────────────────────────────────────────────────── */
const ANALYTICS = {
  MEMBERS_STATS: true,
  EVENTS_STATS: true,
  CONTRIBUTION_STATS: true,
  ENGAGEMENT_SCORE: true,
  TRACKING: ["EVENTS_ATTENDED", "PAYMENTS_DONE", "POSTS", "VOTES", "GROUP_ACTIVITY"],
  AUTO_INSIGHTS: true,
};

/* ── 7. FINANCE ────────────────────────────────────────────────────────── */
const FINANCE = {
  AUTO_CALCULATIONS: true,
  REPORTS: ["MONTHLY", "QUARTERLY", "YEARLY", "EVENT_BASED"],
  EXPENSES_TRACKING: true,
  INCOME_TRACKING: true,
  BUDGETS: true,
  MULTI_CURRENCY: true,
  CURRENCIES: ["EUR", "XOF", "XAF", "USD", "CAD", "GBP", "CHF"],
  AUDIT_TRAIL: true,
};

/* ── 8. DOCUMENTS ──────────────────────────────────────────────────────── */
const DOCUMENTS = {
  TYPES: ["INVOICE", "RECEIPT", "CONTRACT", "REPORT", "BANK_STATEMENT"],
  UPLOAD: ["PDF", "IMAGE", "SCAN", "CAMERA_CAPTURE"],
  OCR_ENABLED: true,
  AUTO_CLASSIFICATION: true,
  DUPLICATE_DETECTION: true,
  STORAGE: "SECURE_VAULT",
};

/* ── 9. GENERAL_ASSEMBLY ───────────────────────────────────────────────── */
const GENERAL_ASSEMBLY = {
  CREATION: "ONE_CLICK",
  FEATURES: [
    "AUTO_CONVOCATION", "AGENDA_GENERATION_AI", "DOCUMENT_SHARING",
    "QR_ATTENDANCE", "VIDEO_CONFERENCE", "SECURE_VOTING",
    "AI_MINUTES", "ELECTRONIC_SIGNATURE", "AUTO_ARCHIVING",
  ],
  QUORUM_CHECK: true,
};

/* ── 10. SECURITY ──────────────────────────────────────────────────────── */
const SECURITY = {
  GDPR_COMPLIANCE: true,
  DATA_VISIBILITY_RULES: "STRICT",
  PHONE_NUMBER_VISIBLE: false,
  EMAIL_VISIBLE: false,
  AUDIT_LOGS: true,
  ENCRYPTION: "END_TO_END",
};

/* ── 11. AI_ASSISTANT ──────────────────────────────────────────────────── */
const AI_ASSISTANT = {
  FINANCE_ANALYSIS: true,
  DOCUMENT_READING: true,
  MEETING_SUMMARY: true,
  ENGAGEMENT_PREDICTION: true,
  AUTO_REPORTS: true,
  RECOMMENDATIONS: true,
};

/* ── 12. SUBSCRIPTION ──────────────────────────────────────────────────── */
const SUBSCRIPTION = {
  TYPE: "PAID_ACCREDITATION",
  BILLING: ["MONTHLY", "YEARLY"],
  FREE_MODE: "READ_ONLY",
  UNPAID_STATE: "SUSPENDED_LIMITED_ACCESS",
  BADGE_GRANTED_ON_PAYMENT: true,
};

/* ── Spécification complète ────────────────────────────────────────────── */
const SPEC = {
  ASSOCIATION_MODULE: "GestionAssociations",
  ACCREDITATION,
  MODULES: {
    MEMBERS, CONTRIBUTIONS, NOTIFICATIONS, ANALYTICS, FINANCE,
    DOCUMENTS, GENERAL_ASSEMBLY, SECURITY, AI_ASSISTANT, SUBSCRIPTION,
  },
};

/* ════════════════════════════════════════════════════════════════════════
   MOTEUR DE PERMISSIONS — dérivé strictement du DSL
   ════════════════════════════════════════════════════════════════════════ */

/* Rôles DAA-Lang (majuscules) ⇄ rôles stockés en base (minuscules FR) */
const ROLE_ALIASES = {
  PRESIDENT: ["president", "président"],
  VICE_PRESIDENT: ["vice_president", "vice-président", "vice_président"],
  SECRETARY: ["secretary", "secretaire", "secrétaire"],
  TREASURER: ["treasurer", "tresorier", "trésorier"],
  MEMBER: ["member", "membre"],
  GUEST: ["guest", "invite", "invité"],
};

/* Normalise un rôle stocké → clé DAA-Lang canonique */
function canonicalRole(role) {
  if (!role) return "MEMBER";
  const r = String(role).toLowerCase().trim();
  for (const [canon, aliases] of Object.entries(ROLE_ALIASES)) {
    if (canon.toLowerCase() === r || aliases.includes(r)) return canon;
  }
  return "MEMBER"; // rôle personnalisé → traité comme membre par défaut
}

/* Matrice de capacités par rôle, déduite des règles du DSL.
   Le propriétaire du compte association (titulaire de l'accréditation)
   est toujours PRESIDENT. */
const CAPABILITIES = {
  // action : rôles DAA-Lang autorisés
  "members.read":        ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY", "TREASURER", "MEMBER"],
  "members.write":       ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY"],
  "members.delete":      ["PRESIDENT", "SECRETARY"],
  "contributions.read":  ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY", "TREASURER"],
  "contributions.write": ["PRESIDENT", "TREASURER"],
  "bank_info.read":      CONTRIBUTIONS.BANK_INFO.ACCESS_ROLE,   // ← du DSL
  "bank_info.write":     CONTRIBUTIONS.BANK_INFO.ACCESS_ROLE,   // ← du DSL
  "finance.read":        ["PRESIDENT", "VICE_PRESIDENT", "TREASURER"],
  "finance.write":       ["PRESIDENT", "TREASURER"],
  "finance.validate":    ["PRESIDENT", "TREASURER"],
  "budgets.write":       ["PRESIDENT", "TREASURER"],
  "documents.read":      ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY", "TREASURER"],
  "documents.write":     ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY", "TREASURER"],
  "assembly.manage":     ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY"],
  "votes.manage":        ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY"],
  "votes.cast":          ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY", "TREASURER", "MEMBER"],
  "analytics.read":      ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY", "TREASURER"],
  "notifications.send":  ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY", "TREASURER"],
  "audit.read":          ["PRESIDENT", "TREASURER"],
};

/* roleCan(role, action) — la décision d'autorisation centrale */
function roleCan(role, action) {
  const allowed = CAPABILITIES[action];
  if (!allowed) return false;
  return allowed.includes(canonicalRole(role));
}

/* Vérifie qu'une valeur appartient à un énuméré du DSL */
function isValid(category, value) {
  const map = {
    payment_method: CONTRIBUTIONS.PAYMENT_METHODS,
    contribution_type: CONTRIBUTIONS.TYPES,
    currency: FINANCE.CURRENCIES,
    document_type: DOCUMENTS.TYPES,
    upload_kind: DOCUMENTS.UPLOAD,
    reminder_level: NOTIFICATIONS.TEMPLATE_LEVELS,
    channel: NOTIFICATIONS.CHANNELS,
    billing: SUBSCRIPTION.BILLING,
    assembly_feature: GENERAL_ASSEMBLY.FEATURES,
  };
  const list = map[category];
  if (!list) return false;
  return list.map(v => String(v).toUpperCase()).includes(String(value).toUpperCase());
}

/* Confidentialité : champs à masquer aux membres (DSL SECURITY) */
function redactMember(adherent, viewerRole) {
  if (!adherent) return adherent;
  const copy = { ...adherent };
  const privileged = ["PRESIDENT", "VICE_PRESIDENT", "SECRETARY", "TREASURER"].includes(canonicalRole(viewerRole));
  if (!privileged) {
    if (MEMBERS.HIDE_PHONE_NUMBER) delete copy.telephone;
    if (MEMBERS.HIDE_EMAIL) delete copy.email;
    delete copy.adresse;
    delete copy.date_naissance;
  }
  return copy;
}

/* Échéancier de relance → jours depuis l'échéance (DSL REMINDER_SCHEDULE) */
function reminderOffsets() {
  return CONTRIBUTIONS.REMINDER_SCHEDULE.map(step => {
    if (step === "DUE_DAY") return 0;
    const m = String(step).match(/\+(\d+)D/);
    return m ? Number(m[1]) : null;
  }).filter(v => v !== null);
}

/* Niveau de gabarit de relance selon le retard (mappe REMINDER_SCHEDULE → TEMPLATE_LEVELS) */
function reminderLevelFor(daysLate) {
  if (daysLate <= 0) return "INFO";
  if (daysLate <= 7) return "INFO";
  if (daysLate <= 15) return "WARNING";
  if (daysLate <= 30) return "URGENT";
  return "FINAL_NOTICE";
}

module.exports = {
  SPEC, ACCREDITATION, MEMBERS, CONTRIBUTIONS, NOTIFICATIONS, ANALYTICS,
  FINANCE, DOCUMENTS, GENERAL_ASSEMBLY, SECURITY, AI_ASSISTANT, SUBSCRIPTION,
  roleCan, canonicalRole, isValid, redactMember, reminderOffsets, reminderLevelFor,
  CAPABILITIES,
};
