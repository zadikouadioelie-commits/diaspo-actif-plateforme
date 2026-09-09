/* ── Mailer Diaspo'Actif — Resend API ── */
const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY_PROD;
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

/* Le "Sceau" — signature officielle inimitable des messages de bienvenue (2026-09-07,
   demande explicite : "ajoute une signature stylisée inimitable"). Construite autour du
   VRAI logo (l'arbre gravé dans le cercle) plutôt qu'un texte stylé : un tiers ne peut pas
   la reproduire sans le fichier officiel. La devise "Actions locales • Impact global" est
   reprise du pourtour gravé du logo lui-même — jamais utilisée ailleurs sur la plateforme,
   ce qui la rend, elle aussi, spécifique à ce sceau. Table HTML + styles inline (pas de
   CSS externe, pas de background-clip:text) pour un rendu identique sur Gmail/Outlook. */
function sceauHtml() {
  return `
      <div style="margin:34px 0 4px;padding-top:24px;border-top:1px solid #E2E8F0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            <td style="vertical-align:middle;padding-right:18px;">
              <img src="https://diaspoactif.com/assets/vitrine/logo-diaspo-actif-transparent.png" width="60" height="60" alt="Diaspo'Actif" style="display:block;width:60px;height:60px;">
            </td>
            <td style="vertical-align:middle;border-left:2px solid #F2761F;padding-left:18px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:17px;letter-spacing:-.01em;color:#20242E;">DIASPO<span style="color:#F2761F;">'</span>ACTIF</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#C9460B;margin-top:3px;">Du Sud au Nord</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#64748B;margin-top:7px;">L'Administration</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:9.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:#94A3B8;margin-top:6px;">Actions locales <span style="color:#F2761F;">•</span> Impact global</div>
            </td>
          </tr>
        </table>
      </div>`;
}

function emailBienvenue({ prenom, nom, email, role, nom_institution }) {
  if (role === "collectivite") return emailBienvenueEtatique({ email, nom_institution });
  if (role === "initiative") return emailBienvenueInitiative({ email, prenom, nom, nom_institution });
  if (role === "utilisateur") return emailBienvenueUtilisateur({ email, prenom, nom });

  // Rôles restants (administrateur, administrateur_junior, partenaire...) : gabarit générique inchangé.
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

/* Copie approuvée par l'utilisateur le 2026-09-07 (exemple validé sur le compte "Sam
   Productions", responsable Samuel KOUASSI) — ne pas reformuler sans nouvelle validation. */
function emailBienvenueInitiative({ email, prenom, nom, nom_institution }) {
  const nomComplet = [prenom, nom].filter(Boolean).join(" ") || "";
  const nomInit = (nom_institution || "").replace(/</g, "&lt;");
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
      <p style="color:#374151;line-height:1.85;font-size:14.5px;margin:0 0 20px;">
        Bonjour ${nomComplet} 👋,
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14.5px;margin:0 0 16px;">
        Bienvenue sur <strong>Diaspo'Actif</strong> et félicitations pour la création du compte initiative « <strong>${nomInit}</strong> » !
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14.5px;margin:0 0 16px;">
        Votre initiative rejoint désormais un écosystème conçu pour <strong>mettre en relation les entrepreneurs, associations, ONG, porteurs de projets et acteurs de la diaspora</strong>.
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14.5px;margin:0 0 16px;">
        Votre espace vous permettra notamment de présenter votre initiative, développer votre visibilité, créer des connexions, rechercher des partenaires et accéder progressivement aux différentes opportunités proposées par l'écosystème Diaspo'Actif.
      </p>

      <div style="background:#F0F4FF;border-left:4px solid #2563EB;border-radius:0 10px 10px 0;padding:16px 20px;margin:22px 0;">
        <p style="margin:0;color:#1B3A6B;font-size:14px;line-height:1.75;font-weight:700;">
          🌍 Chaque initiative peut devenir un point de connexion et d'impact pour la diaspora.
        </p>
      </div>

      <p style="color:#374151;line-height:1.85;font-size:14.5px;margin:0 0 16px;">
        Nous vous encourageons à compléter votre profil, présenter clairement votre initiative et participer activement à la dynamique collective.
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14.5px;margin:0 0 16px;">
        Merci pour votre confiance et encore <strong>bienvenue dans l'écosystème Diaspo'Actif !</strong>
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14.5px;margin:0;">
        Nous vous souhaitons beaucoup de réussite dans le développement de <strong>${nomInit}</strong>.
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14.5px;margin:22px 0 0;">
        Bien cordialement,
      </p>
      ${sceauHtml()}

      <div style="text-align:center;margin:32px 0 8px;">
        <a href="https://diaspoactif.com/login.html" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:16px 36px;border-radius:12px;box-shadow:0 4px 20px rgba(37,99,235,.35);letter-spacing:.02em;">
          Accéder à mon espace Initiative →
        </a>
      </div>

      <p style="color:#94A3B8;font-size:12px;text-align:center;margin:24px 0 0;">
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

/* Copie approuvée par l'utilisateur le 2026-09-07 (exemple validé sur le compte utilisateur
   Deborah NIABA) — ne pas reformuler sans nouvelle validation. Nom complet (prénom + nom),
   jamais le prénom seul : demande explicite "ton professionnel pour tous les comptes". */
function emailBienvenueUtilisateur({ email, prenom, nom }) {
  const nomComplet = [prenom, nom].filter(Boolean).join(" ") || "";
  return sendEmail({
    to: email,
    subject: "Bienvenue sur Diaspo'Actif !",
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
        👋 Compte Utilisateur
      </div>
    </div>

    <div style="padding:40px 36px;">
      <p style="color:#374151;line-height:1.85;font-size:14.5px;margin:0 0 20px;">
        Bonjour ${nomComplet} 👋,
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14.5px;margin:0 0 16px;">
        Bienvenue sur <strong>Diaspo'Actif</strong> !
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14.5px;margin:0 0 16px;">
        Nous sommes heureux de vous compter parmi les membres de notre écosystème dédié à la diaspora.
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14.5px;margin:0 0 16px;">
        Votre compte utilisateur vous permet désormais de découvrir les initiatives, de participer aux événements, de développer votre réseau et de prendre part aux différentes opportunités proposées par la communauté.
      </p>

      <div style="background:#F0F4FF;border-left:4px solid #2563EB;border-radius:0 10px 10px 0;padding:16px 20px;margin:22px 0;">
        <p style="margin:0;color:#1B3A6B;font-size:14px;line-height:1.75;">
          🤝 <strong>Votre participation compte.</strong><br>
          Diaspo'Actif a été créé pour permettre à chacun de contribuer, partager, collaborer et construire des connexions utiles au sein de la diaspora.
        </p>
      </div>

      <p style="color:#374151;line-height:1.85;font-size:14.5px;margin:0 0 16px;">
        Nous vous souhaitons une excellente expérience sur la plateforme et vous encourageons à explorer votre espace et à participer activement à l'écosystème.
      </p>

      <p style="color:#374151;line-height:1.85;font-size:14.5px;margin:0;font-weight:700;">
        Bienvenue dans Diaspo'Actif ! 🌍
      </p>
      ${sceauHtml()}

      <div style="text-align:center;margin:32px 0 8px;">
        <a href="https://diaspoactif.com/login.html" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 32px;border-radius:12px;box-shadow:0 4px 16px rgba(37,99,235,.3);">
          Accéder à mon espace →
        </a>
      </div>

      <p style="color:#94A3B8;font-size:12px;text-align:center;margin:24px 0 0;">
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

function emailSuppressionProgrammee({ email, prenom, numeroDossier, dateSuppressionDefinitive, lienRestauration }) {
  return sendEmail({
    to: email,
    subject: `Votre compte sera supprimé dans 5 jours — Diaspo'Actif`,
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
        ${prenom ? `Bonjour ${prenom},` : "Bonjour,"}<br>votre demande de suppression a été validée
      </h1>
      <p style="color:#475569;line-height:1.7;">
        Votre compte est désormais masqué. Conformément à votre demande, vos données personnelles seront
        <strong>définitivement supprimées le ${dateSuppressionDefinitive}</strong>, sauf si vous annulez cette
        suppression avant cette date.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${lienRestauration}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 32px;border-radius:12px;box-shadow:0 4px 16px rgba(37,99,235,.3);">
          Annuler la suppression et restaurer mon compte →
        </a>
      </div>
      <p style="color:#475569;line-height:1.7;">
        Numéro de dossier : <strong>${numeroDossier}</strong>
      </p>
      <p style="color:#94A3B8;font-size:12px;line-height:1.6;margin-top:24px;">
        Passé ce délai de 5 jours, la suppression sera définitive et irréversible. Si vous n'êtes pas
        à l'origine de cette demande, utilisez le lien ci-dessus dès que possible.
      </p>
    </div>
  </div>
</body>
</html>`
  });
}

function emailCompteRestaure({ email, prenom }) {
  return sendEmail({
    to: email,
    subject: `Votre compte a été restauré — Diaspo'Actif`,
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
        ${prenom ? `Bonjour ${prenom},` : "Bonjour,"}<br>votre compte a été restauré ✅
      </h1>
      <p style="color:#475569;line-height:1.7;">
        La suppression de votre compte a été annulée. Votre compte est de nouveau actif et visible,
        avec toutes vos données intactes.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="https://diaspoactif.com/login.html" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 32px;border-radius:12px;box-shadow:0 4px 16px rgba(37,99,235,.3);">
          Me reconnecter →
        </a>
      </div>
    </div>
  </div>
</body>
</html>`
  });
}

function emailConfirmationBillets({ email, prenom, eventTitre, dateEvenement, lieu, billets, montantTotal }) {
  const lignes = billets.map(b => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #E2E8F0;color:#0D1B2A;font-size:14px;">${b.type_nom}${b.titulaire ? ` — ${b.titulaire}` : ''}</td>
      <td style="padding:10px 0;border-bottom:1px solid #E2E8F0;color:#0D1B2A;font-size:14px;text-align:right;">${b.prix === 0 ? 'Gratuit' : b.prix.toFixed(2) + ' €'}</td>
    </tr>`).join('');
  return sendEmail({
    to: email,
    subject: `Confirmation de votre billet — ${eventTitre} — Diaspo'Actif`,
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
      <div style="display:inline-block;background:#10B981;color:#fff;font-weight:800;font-size:13px;padding:6px 16px;border-radius:99px;margin-bottom:16px;">
        Billet(s) confirmé(s) ✅
      </div>
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:900;color:#0D1B2A;">
        ${prenom ? `Bonjour ${prenom},` : "Bonjour,"}<br>votre commande pour « ${eventTitre} » est confirmée
      </h1>
      <p style="color:#475569;line-height:1.7;">
        ${dateEvenement || ''}${lieu ? ' · ' + lieu : ''}
      </p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        ${lignes}
        <tr>
          <td style="padding:12px 0 0;font-weight:800;color:#0D1B2A;">Total</td>
          <td style="padding:12px 0 0;font-weight:800;color:#0D1B2A;text-align:right;">${montantTotal === 0 ? 'Gratuit' : montantTotal.toFixed(2) + ' €'}</td>
        </tr>
      </table>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://diaspoactif.com/billetterie.html" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;text-decoration:none;font-weight:800;padding:14px 32px;border-radius:12px;">
          Voir mon/mes billet(s) →
        </a>
      </div>
      <p style="color:#94A3B8;font-size:12px;line-height:1.6;margin-top:24px;">
        Votre QR code d'entrée est disponible dans votre espace « Mes Billets » sur Diaspo'Actif.
      </p>
    </div>
  </div>
</body>
</html>`
  });
}

/* Confirmation d'inscription (module Formulaires & Inscriptions Événementielles, 2026-09-08) —
   annexe §2 du cahier des charges : n'affiche la section Programme QUE si l'événement en a un
   renseigné, jamais de section vide. Le QR n'est jamais embarqué en image dans l'e-mail (poids,
   fiabilité de rendu) — un lien vers la confirmation imprimable (contenant le QR, rendu côté
   client via qrcodejs comme partout ailleurs sur la plateforme) est fourni à la place. */
function emailConfirmationInscription({ email, prenom, evenementNom, typeLabel, reference, dateEvt, heureDebut, lieu, ville, pays, programme, inscriptionId }) {
  const lieuTxt = [lieu, ville, pays].filter(Boolean).join(', ');
  return sendEmail({
    to: email,
    subject: `Confirmation de votre inscription — ${evenementNom} — Diaspo'Actif`,
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
      <div style="display:inline-block;background:#10B981;color:#fff;font-weight:800;font-size:13px;padding:6px 16px;border-radius:99px;margin-bottom:16px;">
        Inscription confirmée ✅
      </div>
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:900;color:#0D1B2A;">
        ${prenom ? `Bonjour ${prenom},` : "Bonjour,"}<br>votre inscription à « ${evenementNom} » est confirmée
      </h1>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px;">
        <tr><td style="padding:6px 0;color:#64748B;">Type d'inscription</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#0D1B2A;">${typeLabel || ''}</td></tr>
        <tr><td style="padding:6px 0;color:#64748B;">Numéro d'inscription</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#0D1B2A;">${reference || ''}</td></tr>
        ${dateEvt ? `<tr><td style="padding:6px 0;color:#64748B;">Date</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#0D1B2A;">${dateEvt}${heureDebut ? ' · ' + heureDebut : ''}</td></tr>` : ''}
        ${lieuTxt ? `<tr><td style="padding:6px 0;color:#64748B;">Lieu</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#0D1B2A;">${lieuTxt}</td></tr>` : ''}
      </table>
      ${programme ? `
      <div style="background:#F0F4FF;border-left:4px solid #2563EB;border-radius:0 10px 10px 0;padding:14px 18px;margin:0 0 20px;">
        <div style="font-weight:800;color:#1B3A6B;font-size:13px;margin-bottom:6px;">📋 Programme de l'événement</div>
        <div style="color:#374151;font-size:13px;line-height:1.7;white-space:pre-line;">${programme}</div>
      </div>` : ''}
      <div style="text-align:center;margin:24px 0;">
        <a href="https://diaspoactif.com/api/insc/inscriptions/${inscriptionId}/confirmation.pdf?ref=${encodeURIComponent(reference || "")}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;text-decoration:none;font-weight:800;padding:14px 32px;border-radius:12px;">
          Voir ma confirmation + QR Code →
        </a>
      </div>
      <p style="color:#94A3B8;font-size:12px;line-height:1.6;margin-top:24px;">
        Retrouvez cette inscription à tout moment dans « Mes inscriptions » sur votre espace Diaspo'Actif.
      </p>
    </div>
  </div>
</body>
</html>`
  });
}

/* Invitation par e-mail à une cagnotte (module Cagnotte, invitation externe) — le lien mène à
   la page publique de la cagnotte avec le token en paramètre ; la durée de validité est
   affichée en toutes lettres, même convention que emailVerification/emailSuppressionProgrammee.
   Accent orange (cohérent avec le reste du module Cagnotte sur la plateforme, cf. cagnotte.html)
   plutôt que le bleu des autres e-mails de compte. */
function emailInvitationCagnotte({ email, cagnotteTitre, createurNom, messagePersonnalise, montantCollecte, objectifMontant, devise, lien, dureeValiditeJours }) {
  const dev = devise || "EUR";
  const progression = (montantCollecte != null && objectifMontant)
    ? `<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:16px 18px;margin:20px 0;">
        <div style="font-size:20px;font-weight:900;color:#0D1B2A;">${Number(montantCollecte).toLocaleString('fr-FR')} ${dev}</div>
        <div style="font-size:12.5px;color:#9A3412;margin-top:2px;">collectés sur un objectif de ${Number(objectifMontant).toLocaleString('fr-FR')} ${dev}</div>
      </div>`
    : (montantCollecte != null
        ? `<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:16px 18px;margin:20px 0;">
            <div style="font-size:20px;font-weight:900;color:#0D1B2A;">${Number(montantCollecte).toLocaleString('fr-FR')} ${dev}</div>
            <div style="font-size:12.5px;color:#9A3412;margin-top:2px;">déjà collectés</div>
          </div>` : "");
  return sendEmail({
    to: email,
    subject: `${createurNom} vous invite à participer à « ${cagnotteTitre} » — Diaspo'Actif`,
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FFF7ED;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(242,100,34,.12);">
    <div style="background:linear-gradient(135deg,#0D1B2A,#1B3A6B);padding:32px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-.02em;">DIASPO'ACTIF</div>
      <div style="color:rgba(255,255,255,.6);font-size:13px;margin-top:4px;">Du Sud au Nord</div>
    </div>
    <div style="padding:36px 32px;">
      <h1 style="margin:0 0 12px;font-size:21px;font-weight:900;color:#0D1B2A;">🪙 ${createurNom} vous invite à participer</h1>
      <p style="color:#475569;line-height:1.7;margin:0 0 4px;">à la cagnotte</p>
      <p style="color:#0D1B2A;font-weight:800;font-size:17px;margin:0 0 16px;">« ${cagnotteTitre} »</p>
      ${messagePersonnalise ? `<div style="background:#F8FAFF;border-left:3px solid #F26422;border-radius:8px;padding:14px 16px;margin:16px 0;color:#334155;font-size:14px;line-height:1.6;font-style:italic;">« ${messagePersonnalise} »</div>` : ""}
      ${progression}
      <div style="text-align:center;margin:28px 0;">
        <a href="${lien}" style="display:inline-block;background:linear-gradient(135deg,#F26422,#c2410c);color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 32px;border-radius:12px;box-shadow:0 4px 16px rgba(242,100,34,.3);">
          Participer à la cagnotte →
        </a>
      </div>
      <p style="color:#94A3B8;font-size:12px;text-align:center;margin:0 0 4px;">
        Aucun compte n'est nécessaire pour participer. Ce lien est valable ${dureeValiditeJours} jours.
      </p>
      <p style="color:#94A3B8;font-size:12px;text-align:center;margin:0;">
        Si vous ne connaissez pas ${createurNom}, vous pouvez ignorer cet e-mail.
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

/* Confirmation envoyée au participant APRÈS paiement réussi — la seule trace écrite qu'a une
   personne sans compte de sa participation (elle n'a pas d'espace "Mes notifications"), donc
   toujours envoyée, y compris quand un compte existe déjà (auquel cas creerNotif() s'ajoute,
   ne remplace pas cet e-mail). */
function emailConfirmationParticipationCagnotte({ email, prenom, cagnotteTitre, montant, devise, cagnotteSlug, compteExistant }) {
  const dev = devise || "EUR";
  return sendEmail({
    to: email,
    subject: `Merci pour votre participation à « ${cagnotteTitre} » — Diaspo'Actif`,
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F4FF;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(37,99,235,.1);">
    <div style="background:linear-gradient(135deg,#0D1B2A,#1B3A6B);padding:32px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#fff;">DIASPO'ACTIF</div>
    </div>
    <div style="padding:36px 32px;">
      <div style="display:inline-block;background:#10B981;color:#fff;font-weight:800;font-size:13px;padding:6px 16px;border-radius:99px;margin-bottom:16px;">
        Paiement confirmé ✅
      </div>
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:900;color:#0D1B2A;">
        Merci${prenom ? ` ${prenom}` : ""} pour votre participation !
      </h1>
      <p style="color:#475569;line-height:1.7;margin:0 0 20px;">
        Votre don pour la cagnotte « ${cagnotteTitre} » a bien été reçu.
      </p>
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:16px 18px;text-align:center;margin:0 0 24px;">
        <div style="font-size:24px;font-weight:900;color:#166534;">${Number(montant).toLocaleString('fr-FR')} ${dev}</div>
        <div style="font-size:12.5px;color:#15803D;margin-top:2px;">versés à « ${cagnotteTitre} »</div>
      </div>
      ${compteExistant ? `
      <p style="color:#475569;line-height:1.7;font-size:14px;margin:0 0 16px;">
        Cette adresse e-mail est déjà associée à un compte Diaspo'Actif. Connectez-vous pour retrouver cette participation dans votre espace.
      </p>
      <div style="text-align:center;margin:0 0 20px;">
        <a href="https://diaspoactif.com/login.html?email=${encodeURIComponent(email)}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 26px;border-radius:12px;">
          Me connecter →
        </a>
      </div>` : `
      <p style="color:#475569;line-height:1.7;font-size:14px;margin:0 0 16px;">
        Vous souhaitez retrouver facilement vos participations et découvrir Diaspo'Actif ?
      </p>
      <div style="text-align:center;margin:0 0 20px;">
        <a href="https://diaspoactif.com/inscription.html?role=utilisateur&email=${encodeURIComponent(email)}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 26px;border-radius:12px;">
          Créer mon compte gratuitement →
        </a>
      </div>`}
      <p style="color:#94A3B8;font-size:12px;text-align:center;margin:0;">
        <a href="https://diaspoactif.com/cagnotte.html?slug=${encodeURIComponent(cagnotteSlug)}" style="color:#94A3B8;">Voir la cagnotte</a>
      </p>
    </div>
  </div>
</body>
</html>`
  });
}

/* Accès accordé à une cagnotte PRIVÉE (liste "Participants autorisés", distincte de
   l'invitation à contribuer ci-dessus) — 2026-08-30, signalé par l'utilisateur : ajouter un
   e-mail à cette liste ne prévenait jamais son destinataire par e-mail, seulement par
   notification in-app (creerNotif), donc jamais vu par quelqu'un qui n'a pas encore de
   compte — exactement le cas d'usage de cette liste. Même gabarit visuel que
   emailInvitationCagnotte (accent orange, module Cagnotte), message différent : accès à une
   cagnotte réservée, pas une sollicitation à contribuer. */
function emailAccesCagnottePrivee({ email, cagnotteTitre, createurNom, lien }) {
  return sendEmail({
    to: email,
    subject: `${createurNom} vous donne accès à la cagnotte privée « ${cagnotteTitre} » — Diaspo'Actif`,
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FFF7ED;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(242,100,34,.12);">
    <div style="background:linear-gradient(135deg,#0D1B2A,#1B3A6B);padding:32px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-.02em;">DIASPO'ACTIF</div>
      <div style="color:rgba(255,255,255,.6);font-size:13px;margin-top:4px;">Du Sud au Nord</div>
    </div>
    <div style="padding:36px 32px;">
      <h1 style="margin:0 0 12px;font-size:21px;font-weight:900;color:#0D1B2A;">🔒 ${createurNom} vous donne accès</h1>
      <p style="color:#475569;line-height:1.7;margin:0 0 4px;">à la cagnotte privée</p>
      <p style="color:#0D1B2A;font-weight:800;font-size:17px;margin:0 0 16px;">« ${cagnotteTitre} »</p>
      <p style="color:#475569;line-height:1.7;margin:0 0 20px;">
        Cette cagnotte est réservée aux personnes autorisées. Vous en faites désormais partie.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${lien}" style="display:inline-block;background:linear-gradient(135deg,#F26422,#c2410c);color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 32px;border-radius:12px;box-shadow:0 4px 16px rgba(242,100,34,.3);">
          Accéder à la cagnotte →
        </a>
      </div>
      <p style="color:#94A3B8;font-size:12px;text-align:center;margin:0;">
        Si vous ne connaissez pas ${createurNom}, vous pouvez ignorer cet e-mail.
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

/* Confirmation envoyée à un demandeur de devis SANS compte Diaspo'Actif — c'est sa seule trace
   écrite (pas d'espace "Mes demandes de devis" possible sans compte), voir server/index.js
   POST /api/produits/:id/devis. Pour un demandeur connecté, la notification in-app existante
   (creerNotif) suffit — pas d'e-mail redondant. */
function emailDemandeDevisRecue({ to, prenom, initiativeNom, produitNom }) {
  return sendEmail({
    to,
    subject: `Votre demande de devis a bien été envoyée — Diaspo'Actif`,
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFF;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(13,27,42,.1);">
    <div style="background:linear-gradient(135deg,#0D1B2A,#1B3A6B);padding:32px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-.02em;">DIASPO'ACTIF</div>
      <div style="color:rgba(255,255,255,.6);font-size:13px;margin-top:4px;">Du Sud au Nord</div>
    </div>
    <div style="padding:36px 32px;">
      <h1 style="margin:0 0 12px;font-size:21px;font-weight:900;color:#0D1B2A;">✅ Demande envoyée</h1>
      <p style="color:#475569;line-height:1.7;margin:0 0 16px;">Bonjour ${prenom || ''},</p>
      <p style="color:#475569;line-height:1.7;margin:0 0 16px;">
        Votre demande de devis concernant <strong>« ${produitNom} »</strong> a bien été transmise à
        <strong>${initiativeNom}</strong>. Vous recevrez un e-mail à cette même adresse dès que le
        professionnel vous aura répondu.
      </p>
      <p style="color:#94A3B8;font-size:12px;margin:0;">
        Aucun compte Diaspo'Actif n'est nécessaire pour recevoir la réponse.
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

/* Réponse du propriétaire d'une vitrine à un demandeur de devis SANS compte (voir
   POST /api/devis-demandes/:id/reponses) — seul canal de suivi possible pour un invité, la
   ligne devis_reponses n'ayant pas d'espace personnel pour l'afficher. lienDevis reste optionnel
   (accès sécurisé par lien différé à une évolution future, voir devis_demandes.guest_access_token_hash). */
function emailDemandeDevisReponse({ to, prenom, initiativeNom, produitNom, contenu, fichierNom, fichierUrl }) {
  return sendEmail({
    to,
    subject: `📩 Nouvelle réponse à votre demande de devis — Diaspo'Actif`,
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFF;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(13,27,42,.1);">
    <div style="background:linear-gradient(135deg,#0D1B2A,#1B3A6B);padding:32px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-.02em;">DIASPO'ACTIF</div>
      <div style="color:rgba(255,255,255,.6);font-size:13px;margin-top:4px;">Du Sud au Nord</div>
    </div>
    <div style="padding:36px 32px;">
      <h1 style="margin:0 0 12px;font-size:21px;font-weight:900;color:#0D1B2A;">📩 Nouvelle réponse</h1>
      <p style="color:#475569;line-height:1.7;margin:0 0 16px;">Bonjour ${prenom || ''},</p>
      <p style="color:#475569;line-height:1.7;margin:0 0 16px;">
        <strong>${initiativeNom}</strong> a répondu à votre demande de devis concernant
        <strong>« ${produitNom} »</strong> :
      </p>
      ${contenu ? `<div style="background:#F8FAFF;border-left:3px solid #2563EB;border-radius:8px;padding:14px 16px;margin:16px 0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${contenu}</div>` : ''}
      ${fichierUrl ? `<p style="margin:0 0 16px;"><a href="${fichierUrl}" style="color:#2563EB;font-weight:700;text-decoration:none;">📄 ${fichierNom || 'Document joint'}</a></p>` : ''}
      <p style="color:#94A3B8;font-size:12px;margin:0;">
        Pour répondre, contactez directement ${initiativeNom} via les coordonnées de sa boutique.
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

/* Communication ciblée depuis une fiche d'inscription (module Formulaires & Inscriptions,
   Passe 2, 2026-09-09) — objet/message déjà substitués par l'appelant (variables {prenom}
   etc.), cette fonction ne fait que les afficher. */
function emailCommunicationInscription({ email, prenom, objet, message, evenementNom }) {
  return sendEmail({
    to: email,
    subject: objet || `${evenementNom} — Diaspo'Actif`,
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
      <h1 style="margin:0 0 16px;font-size:18px;font-weight:900;color:#0D1B2A;">${prenom ? `Bonjour ${prenom},` : "Bonjour,"}</h1>
      <p style="color:#374151;font-size:14px;line-height:1.75;white-space:pre-wrap;">${message}</p>
    </div>
    <div style="background:#F8FAFF;padding:16px 32px;text-align:center;border-top:1px solid #E8EFFE;">
      <p style="margin:0;font-size:11px;color:#94A3B8;">Diaspo'Actif · contact@diaspoactif.com</p>
    </div>
  </div>
</body>
</html>`
  });
}

module.exports = { sendEmail, emailBienvenue, emailVerification, emailResetPassword, emailAccreditation, emailDeletionConfirmee, emailSuppressionProgrammee, emailCompteRestaure, emailConfirmationBillets, emailInvitationCagnotte, emailConfirmationParticipationCagnotte, emailAccesCagnottePrivee, emailDemandeDevisRecue, emailDemandeDevisReponse, emailConfirmationInscription, emailCommunicationInscription };
