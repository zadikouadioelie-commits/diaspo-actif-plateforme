/* ── Upload Media vers Bunny.net — Diaspo'Actif ── */

/**
 * Upload un fichier image vers Bunny via l'API serveur
 * @param {File} file — fichier sélectionné par l'utilisateur
 * @param {'avatar'|'banner'|'logo'|'post'} type — type de média
 * @returns {Promise<string>} URL CDN de l'image uploadée
 */
async function uploadMedia(file, type = 'avatar') {
  const endpoint = {
    avatar: '/api/upload/avatar',
    banner: '/api/upload/banner',
    logo:   '/api/upload/logo',
    post:   '/api/upload/post'
  }[type] || '/api/upload/avatar';

  const formData = new FormData();
  formData.append(type, file);

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

      if (file.size > maxMo * 1024 * 1024) {
        alert(`Image trop volumineuse (max ${maxMo} Mo).`);
        return resolve(null);
      }

      try {
        const compressed = await compressImageFile(file, maxW, maxH, quality);
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
