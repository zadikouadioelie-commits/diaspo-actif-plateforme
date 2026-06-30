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

function emailBienvenue({ prenom, email, role }) {
  const roleLabel = {
    utilisateur: "Utilisateur",
    initiative: "Initiative",
    collectivite: "Compte Étatique",
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
      <p style="margin:0;font-size:11px;color:#94A3B8;">Diaspo'Actif · contact@diaspoactif.com · <a href="https://diaspoactif.com/confidentialite.html" style="color:#2563EB;">Confidentialité</a></p>
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

module.exports = { sendEmail, emailBienvenue, emailResetPassword, emailAccreditation };
