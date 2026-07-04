/* ── Mailer Diaspo'Actif — Resend API ── */
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = "Diaspo'Actif <noreply@diaspoactif.com>";

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.log("[Mailer] RESEND_API_KEY absent — email non envoyé:", subject, "→", to);
    return { ok: false, reason: "no_key" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from: FROM, to, subject, html })
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("[Mailer] Erreur Resend:", data);
      return { ok: false, error: data };
    }
    console.log("[Mailer] Email envoyé:", subject, "→", to);
    return { ok: true, id: data.id };
  } catch (e) {
    console.error("[Mailer] Erreur réseau:", e.message);
    return { ok: false, error: e.message };
  }
}

/* ── Templates ── */

function emailBienvenue({ prenom, email, role, nom_institution }) {
  if (role === "collectivite") return emailBienvenueEtatique({ email, nom_institution });
  if (role === "initiative") return emailBienvenueInitiative({ email, prenom, nom_institution });

  const roleLabel = {
    utilisateur: "Utilisateur",
    administrateur: "Administrateur"
  }[role] || role;

  return sendEmail({
    to: email,
    subject: "Bienvenue sur Diaspo'Actif !",
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F4FF;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(37,99,235,.1);">
    <div style="background:linear-gradient(135deg,#0D1B2A,#1B3A6B);padding:32px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-.02em;">DIASPO'ACTIF</div>
      <div style="color:rgba(255,255,255,.6);font-size:13px;margin-top:4px;">Du Sud au Nord</div>
    </div>
    <div style="padding:36px 32px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#0D1B2A;">Bienvenue ${prenom || ""} ! 🎉</h1>
      <p style="color:#475569;line-height:1.7;margin:0 0 20px;">
        Votre compte <strong>${roleLabel}</strong> est activé sur la plateforme Diaspo'Actif.<br>
        Connectez-vous pour découvrir toutes les fonctionnalités qui vous sont réservées.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="https://diaspoactif.com/login.html" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 32px;border-radius:12px;box-shadow:0 4px 16px rgba(37,99,235,.3);">
          Accéder à mon espace →
        </a>
      </div>
      <p style="color:#94A3B8;font-size:12px;text-align:center;margin:0;">
        Vous recevez cet email car vous venez de créer un compte sur diaspoactif.com
      </p>
    </div>
    <div style="background:#F8FAFF;padding:16px 32px;text-align:center;border-top:1px solid #E8EFFE;">
      <p style="margin:0;font-size:11px;color:#94A3B8;">Diaspo'Actif · contact@diaspoactif.com · <a href="https://diaspoactif.com/politique-confidentialite.html" style="color:#2563EB;">Confidentialité</a></p>
    </div>
  </div>
</body>
</html>`
  });
}

function emailBienvenueInitiative({ email, prenom, nom_institution }) {
  return sendEmail({
    to: email,
    subject: "Bienvenue sur Diaspo'Actif — Compte Initiative",
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F4FF;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(37,99,235,.1);">

    <div style="background:linear-gradient(135deg,#0D1B2A,#1B3A6B);padding:36px;text-align:center;">
      <div style="font-size:30px;font-weight:900;color:#fff;letter-spacing:-.02em;">DIASPO'ACTIF</div>
      <div style="color:rgba(255,255,255,.55);font-size:13px;margin-top:6px;letter-spacing:.05em;">DU SUD AU NORD</div>
      <div style="display:inline-block;margin-top:16px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:99px;padding:5px 16px;font-size:12px;font-weight:700;color:rgba(255,255,255,.8);letter-spacing:.08em;text-transform:uppercase;">
        🌱 Compte Initiative
      </div>
    </div>

    <div style="padding:40px 36px;">
      <p style="margin:0 0 24px;font-size:16px;font-weight:900;color:#0D1B2A;line-height:1.4;">
        Bienvenue sur Diaspo'Actif${nom_institution ? ` — ${nom_institution}` : prenom ? ` — ${prenom}` : ""}.
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14px;margin:0 0 14px;">
        Nous sommes heureux de vous accueillir au sein de notre plateforme et vous remercions sincèrement de votre confiance.
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14px;margin:0 0 14px;">
        En rejoignant Diaspo'Actif, votre organisation intègre un écosystème international conçu pour favoriser les rencontres, les partenariats, les opportunités d'affaires, le recrutement, les investissements, les projets collaboratifs et le développement des diasporas.
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14px;margin:0 0 14px;">
        Qu'il s'agisse d'une entreprise, d'une association, d'une ONG, d'une fondation, d'un incubateur ou de toute autre organisation, votre engagement contribue à renforcer les liens entre les diasporas, leurs pays d'origine et leurs pays d'accueil.
      </p>

      <div style="background:#F0F4FF;border-left:4px solid #2563EB;border-radius:0 10px 10px 0;padding:16px 20px;margin:24px 0;">
        <p style="margin:0;color:#1B3A6B;font-size:14px;line-height:1.75;font-style:italic;">
          Votre présence est essentielle. C'est grâce à l'implication et au soutien des organisations qui nous rejoignent que Diaspo'Actif peut aujourd'hui mettre à la disposition des diasporas un outil innovant, pensé pour répondre à leurs besoins, valoriser leurs talents et créer davantage d'opportunités de coopération et de développement.
        </p>
      </div>

      <p style="color:#374151;line-height:1.85;font-size:14px;margin:0 0 28px;">
        Nous vous remercions chaleureusement de prendre part à cette aventure collective et nous vous souhaitons une excellente expérience sur Diaspo'Actif.<br><br>
        <strong>Ensemble, faisons de la coopération, de l'innovation et de l'engagement des diasporas une véritable force au service du développement.</strong>
      </p>

      <div style="text-align:center;margin:32px 0 24px;">
        <a href="https://diaspoactif.com/login.html" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:16px 36px;border-radius:12px;box-shadow:0 4px 20px rgba(37,99,235,.35);letter-spacing:.02em;">
          Accéder à mon espace Initiative →
        </a>
      </div>

      <p style="color:#94A3B8;font-size:12px;text-align:center;margin:0;">
        Vous recevez cet email car vous venez de créer un compte sur diaspoactif.com
      </p>
    </div>

    <div style="background:#F8FAFF;padding:18px 36px;border-top:1px solid #E8EFFE;display:flex;justify-content:space-between;align-items:center;">
      <p style="margin:0;font-size:11px;color:#94A3B8;">Diaspo'Actif · Du Sud au Nord · 2026</p>
      <p style="margin:0;font-size:11px;">
        <a href="https://diaspoactif.com/politique-confidentialite.html" style="color:#2563EB;text-decoration:none;">Confidentialité</a> ·
        <a href="https://diaspoactif.com/mentions-legales.html" style="color:#2563EB;text-decoration:none;">Mentions légales</a>
      </p>
    </div>
  </div>
</body>
</html>`
  });
}

function emailBienvenueEtatique({ email, nom_institution }) {
  return sendEmail({
    to: email,
    subject: "Bienvenue sur Diaspo'Actif — Compte Étatique",
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F4FF;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(37,99,235,.1);">

    <div style="background:linear-gradient(135deg,#0D1B2A,#1B3A6B);padding:36px;text-align:center;">
      <div style="font-size:30px;font-weight:900;color:#fff;letter-spacing:-.02em;">DIASPO'ACTIF</div>
      <div style="color:rgba(255,255,255,.55);font-size:13px;margin-top:6px;letter-spacing:.05em;">DU SUD AU NORD</div>
      <div style="display:inline-block;margin-top:16px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:99px;padding:5px 16px;font-size:12px;font-weight:700;color:rgba(255,255,255,.8);letter-spacing:.08em;text-transform:uppercase;">
        🏛️ Compte Étatique
      </div>
    </div>

    <div style="padding:40px 36px;">
      <p style="margin:0 0 24px;font-size:16px;font-weight:900;color:#0D1B2A;line-height:1.4;">
        Bienvenue sur Diaspo'Actif${nom_institution ? ` — ${nom_institution}` : ""}.
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14px;margin:0 0 14px;">
        Nous sommes honorés de vous accueillir au sein de notre plateforme et vous remercions de l'intérêt que vous portez à cette initiative.
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14px;margin:0 0 14px;">
        En rejoignant Diaspo'Actif, votre institution participe à une dynamique internationale dédiée au rapprochement des diasporas, au développement des territoires, au renforcement des coopérations et à la création d'opportunités économiques, sociales, culturelles et institutionnelles.
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14px;margin:0 0 14px;">
        Votre présence contribuera à mieux accompagner vos ressortissants, à favoriser le dialogue avec les communautés établies à travers le monde, à valoriser les initiatives de votre institution et à développer de nouvelles collaborations avec les acteurs publics, privés et associatifs.
      </p>

      <div style="background:#F0F4FF;border-left:4px solid #2563EB;border-radius:0 10px 10px 0;padding:16px 20px;margin:24px 0;">
        <p style="margin:0;color:#1B3A6B;font-size:14px;line-height:1.75;font-style:italic;">
          Diaspo'Actif ambitionne de devenir un espace de référence où les institutions, les diasporas et leurs partenaires construisent ensemble des projets concrets au service du développement.
        </p>
      </div>

      <p style="color:#374151;line-height:1.85;font-size:14px;margin:0 0 14px;">
        Nous espérons que votre engagement enrichira cette dynamique collective et permettra de renforcer les liens entre les États, les territoires, les organisations et leurs diasporas.
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14px;margin:0 0 28px;">
        Au nom de toute l'équipe Diaspo'Actif, nous vous souhaitons la bienvenue et vous remercions de contribuer, à nos côtés, à bâtir une plateforme fondée sur la <strong>coopération</strong>, l'<strong>innovation</strong>, le <strong>partage des connaissances</strong> et la <strong>création de valeur</strong> au bénéfice des diasporas et de leurs pays d'origine comme de leurs pays d'accueil.
      </p>

      <div style="text-align:center;margin:32px 0 24px;">
        <a href="https://diaspoactif.com/login.html" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:16px 36px;border-radius:12px;box-shadow:0 4px 20px rgba(37,99,235,.35);letter-spacing:.02em;">
          Accéder à mon espace institutionnel →
        </a>
      </div>

      <p style="color:#94A3B8;font-size:12px;text-align:center;margin:0;">
        Votre compte est en cours de validation par notre équipe. Vous serez notifié par email.
      </p>
    </div>

    <div style="background:#F8FAFF;padding:18px 36px;border-top:1px solid #E8EFFE;display:flex;justify-content:space-between;align-items:center;">
      <p style="margin:0;font-size:11px;color:#94A3B8;">Diaspo'Actif · Du Sud au Nord · 2026</p>
      <p style="margin:0;font-size:11px;">
        <a href="https://diaspoactif.com/politique-confidentialite.html" style="color:#2563EB;text-decoration:none;">Confidentialité</a> ·
        <a href="https://diaspoactif.com/mentions-legales.html" style="color:#2563EB;text-decoration:none;">Mentions légales</a>
      </p>
    </div>
  </div>
</body>
</html>`
  });
}

function emailVerification({ email, prenom, token }) {
  const lien = `https://diaspoactif.com/verifier-email.html?token=${token}`;
  return sendEmail({
    to: email,
    subject: "Confirmez votre adresse e-mail — Diaspo'Actif",
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F4FF;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(37,99,235,.1);">
    <div style="background:linear-gradient(135deg,#0D1B2A,#1B3A6B);padding:32px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-.02em;">DIASPO'ACTIF</div>
      <div style="color:rgba(255,255,255,.6);font-size:13px;margin-top:4px;">Du Sud au Nord</div>
    </div>
    <div style="padding:36px 32px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#0D1B2A;">Confirmez votre adresse e-mail ${prenom ? `, ${prenom}` : ""} ✉️</h1>
      <p style="color:#475569;line-height:1.7;margin:0 0 20px;">
        Merci de votre inscription sur Diaspo'Actif. Pour activer pleinement votre compte, confirmez que cette adresse e-mail vous appartient bien.<br>
        Ce lien est valable <strong>24 heures</strong>.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${lien}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 32px;border-radius:12px;box-shadow:0 4px 16px rgba(37,99,235,.3);">
          Confirmer mon adresse e-mail →
        </a>
      </div>
      <p style="color:#94A3B8;font-size:12px;text-align:center;margin:0;">
        Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.
      </p>
    </div>
    <div style="background:#F8FAFF;padding:16px 32px;text-align:center;border-top:1px solid #E8EFFE;">
      <p style="margin:0;font-size:11px;color:#94A3B8;">Diaspo'Actif · contact@diaspoactif.com</p>
    </div>
  </div>
</body>
</html>`
  });
}

function emailResetPassword({ email, token }) {
  const lien = `https://diaspoactif.com/reset-password.html?token=${token}`;
  return sendEmail({
    to: email,
    subject: "Réinitialisation de votre mot de passe — Diaspo'Actif",
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F4FF;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(37,99,235,.1);">
    <div style="background:linear-gradient(135deg,#0D1B2A,#1B3A6B);padding:32px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-.02em;">DIASPO'ACTIF</div>
    </div>
    <div style="padding:36px 32px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#0D1B2A;">Réinitialisation du mot de passe</h1>
      <p style="color:#475569;line-height:1.7;margin:0 0 20px;">
        Vous avez demandé à réinitialiser votre mot de passe.<br>
        Cliquez sur le bouton ci-dessous — ce lien est valable <strong>1 heure</strong>.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${lien}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 32px;border-radius:12px;box-shadow:0 4px 16px rgba(37,99,235,.3);">
          Réinitialiser mon mot de passe →
        </a>
      </div>
      <p style="color:#94A3B8;font-size:12px;text-align:center;margin:0;">
        Si vous n'avez pas fait cette demande, ignorez cet email. Votre mot de passe ne changera pas.
      </p>
    </div>
    <div style="background:#F8FAFF;padding:16px 32px;text-align:center;border-top:1px solid #E8EFFE;">
      <p style="margin:0;font-size:11px;color:#94A3B8;">Diaspo'Actif · contact@diaspoactif.com</p>
    </div>
  </div>
</body>
</html>`
  });
}

function emailAccreditation({ email, prenom, typeAccred, statut }) {
  const statutLabel = statut === "accordee" ? "accordée ✅" : statut === "refusee" ? "refusée ❌" : "suspendue ⏸️";
  const couleur = statut === "accordee" ? "#10B981" : statut === "refusee" ? "#EF4444" : "#F59E0B";
  return sendEmail({
    to: email,
    subject: `Accréditation ${typeAccred} — ${statutLabel} — Diaspo'Actif`,
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F0F4FF;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(37,99,235,.1);">
    <div style="background:linear-gradient(135deg,#0D1B2A,#1B3A6B);padding:32px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#fff;">DIASPO'ACTIF</div>
    </div>
    <div style="padding:36px 32px;">
      <div style="display:inline-block;background:${couleur};color:#fff;font-weight:800;font-size:13px;padding:6px 16px;border-radius:99px;margin-bottom:16px;">
        Accréditation ${statutLabel}
      </div>
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:900;color:#0D1B2A;">
        ${prenom ? `Bonjour ${prenom},` : "Bonjour,"}<br>votre accréditation <em>${typeAccred}</em> a été ${statutLabel}
      </h1>
      <p style="color:#475569;line-height:1.7;">
        Connectez-vous à votre espace pour voir les détails et les fonctionnalités disponibles.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://diaspoactif.com/login.html" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;text-decoration:none;font-weight:800;padding:14px 32px;border-radius:12px;">
          Accéder à mon espace →
        </a>
      </div>
    </div>
  </div>
</body>
</html>`
  });
}

function emailDeletionConfirmee({ email, prenom, numeroDossier, dateSuppression }) {
  return sendEmail({
    to: email,
    subject: `Confirmation de suppression de votre compte — Diaspo'Actif`,
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F0F4FF;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(37,99,235,.1);">
    <div style="background:linear-gradient(135deg,#0D1B2A,#1B3A6B);padding:32px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#fff;">DIASPO'ACTIF</div>
    </div>
    <div style="padding:36px 32px;">
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:900;color:#0D1B2A;">
        ${prenom ? `Bonjour ${prenom},` : "Bonjour,"}<br>votre compte a été définitivement supprimé
      </h1>
      <p style="color:#475569;line-height:1.7;">
        Conformément à votre demande, votre compte Diaspo'Actif et vos données personnelles ont été supprimés
        le <strong>${dateSuppression}</strong>, à l'exception des informations dont la conservation est imposée par la loi
        (le cas échéant, archivées de façon sécurisée pendant la durée légale applicable).
      </p>
      <p style="color:#475569;line-height:1.7;">
        Numéro de dossier : <strong>${numeroDossier}</strong>
      </p>
      <p style="color:#94A3B8;font-size:12px;line-height:1.6;margin-top:24px;">
        Si vous n'êtes pas à l'origine de cette demande, contactez-nous immédiatement.
      </p>
    </div>
  </div>
</body>
</html>`
  });
}

module.exports = { sendEmail, emailBienvenue, emailVerification, emailResetPassword, emailAccreditation, emailDeletionConfirmee };
