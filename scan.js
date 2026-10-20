// Prepara una foto: ridimensiona, comprime in JPEG, crea la miniatura.
// Il browser applica da solo l'orientamento EXIF quando disegna sul canvas.

function draw(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; // niente sfondo nero se l'immagine ha trasparenze
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

function toBytes(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error('Impossibile comprimere la foto.'));
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      'image/jpeg',
      quality
    );
  });
}

export async function prepareImage(file, { maxSide = 1800, quality = 0.82 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Non riesco a leggere questa immagine.'));
      im.src = url;
    });
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = draw(img, w, h);
    const bytes = await toBytes(canvas, quality);
    const t = 220 / Math.max(w, h);
    const thumb = draw(img, Math.max(1, Math.round(w * t)), Math.max(1, Math.round(h * t))).toDataURL('image/jpeg', 0.72);
    return { bytes, w, h, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}
