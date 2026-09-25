/* ── Upload Media vers Bunny.net — Diaspo'Actif ── */

/**
 * Upload un fichier image vers Bunny via l'API serveur
 * @param {File} file — fichier sélectionné par l'utilisateur
 * @param {'avatar'|'banner'|'logo'|'post'} type — type de média
 * @returns {Promise<string>} URL CDN de l'image uploadée
 */
async function uploadMedia(file, type = 'avatar') {
  const endpoint = {
    avatar:      '/api/upload/avatar',
    banner:      '/api/upload/banner',
    /* Distinct de 'banner' (2026-08-30) : n'écrit aucune colonne côté serveur, contrairement à
       'banner' qui écrase toujours users.banner_url — la bannière de vitrine doit pouvoir
       différer de celle du profil personnel (voir editVitrineBanner, profil-app.html). */
    'vitrine-banner': '/api/upload/vitrine-banniere',
    logo:        '/api/upload/logo',
    post:        '/api/upload/post',
    produit:     '/api/upload/produit',
    cagnotte:    '/api/upload/cagnotte',
    evenement:   '/api/upload/evenement',
    publication: '/api/upload/post',
    document:    '/api/upload/document',
    'video-tutoriel': '/api/upload/video-tutoriel',
    invitation:  '/api/upload/invitation'
  }[type] || '/api/upload/avatar';

  const formData = new FormData();
  // file peut être un File (avec .name) ou un Blob brut (ex: sortie du recadreur) — on force un nom dans ce dernier cas.
  formData.append(type, file, file.name || `${type}.jpg`);

  const res = await fetch(endpoint, {
    method: 'POST',
    body: formData,
    credentials: 'include'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur upload (${res.status})`);
  }

  const data = await res.json();
  return data.url;
}

/**
 * Compresse une image avant upload via canvas
 * @param {File} file
 * @param {number} maxW — largeur max en px
 * @param {number} maxH — hauteur max en px
 * @param {number} quality — qualité JPEG (0-1)
 * @returns {Promise<File>}
 */
function compressImageFile(file, maxW = 800, maxH = 800, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Ouvre un sélecteur de fichier image et retourne l'URL uploadée
 * @param {'avatar'|'banner'|'logo'|'post'} type
 * @param {{ maxW, maxH, quality, maxMo }} options
 * @returns {Promise<string|null>} URL ou null si annulé
 */
function pickAndUpload(type = 'avatar', options = {}) {
  const { maxW = 800, maxH = 800, quality = 0.85, maxMo = 5 } = options;
  /* Garde-fou brut (2026-09-25, bug réel signalé : "plusieurs personnes ont été embêtées parce
     que les photos qu'ils ont essayé de mettre n'ont pas passé") — une photo de téléphone
     récente pèse très souvent 8 à 20 Mo au format d'origine, largement au-dessus de maxMo
     (5 Mo par défaut). Ce n'est jamais un problème en soi : compressImageFile() ci-dessous la
     redimensionne et la recompresse, la faisant systématiquement retomber à quelques centaines
     de Ko. Avant ce correctif, la taille du fichier D'ORIGINE était comparée à maxMo AVANT
     toute compression, rejetant donc en boucle des photos parfaitement normales que la
     compression aurait sans problème fait passer — jamais un cas limite, le cas le plus
     fréquent pour une photo prise directement avec un smartphone. Seul ce plafond très large
     (jamais la vraie limite : juste pour éviter de tenter de décoder un fichier aberrant dans
     le canvas) s'applique désormais au fichier BRUT ; maxMo s'applique au résultat COMPRESSÉ. */
  const RAW_SANITY_CAP_MO = 30;

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async () => {
      const file = input.files[0];
      document.body.removeChild(input);
      if (!file) return resolve(null);

      if (file.size > RAW_SANITY_CAP_MO * 1024 * 1024) {
        alert(`Fichier trop volumineux pour être traité (max ${RAW_SANITY_CAP_MO} Mo avant compression).`);
        return resolve(null);
      }

      try {
        const compressed = await compressImageFile(file, maxW, maxH, quality);
        if (compressed.size > maxMo * 1024 * 1024) {
          alert(`Image encore trop volumineuse après compression (max ${maxMo} Mo). Essayez une photo moins détaillée.`);
          return resolve(null);
        }
        const url = await uploadMedia(compressed, type);
        resolve(url);
      } catch (err) {
        console.error('[uploadMedia]', err);
        alert('Erreur lors du chargement de l\'image : ' + err.message);
        resolve(null);
      }
    };

    input.oncancel = () => { document.body.removeChild(input); resolve(null); };
    input.click();
  });
}

window.uploadMedia    = uploadMedia;
window.pickAndUpload  = pickAndUpload;
window.compressImageFile = compressImageFile;
