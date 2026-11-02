/**
 * Réduction d'une photo de justificatif dans le navigateur avant l'envoi (core/photo.js décide de la
 * taille). En cas d'échec (format que le navigateur ne sait pas lire, HEIC hors Safari…), la photo part
 * telle quelle : aucun justificatif n'est perdu.
 */

import { photoPlan } from '../../core/photo.js?v=269c883';

export async function preparePhoto(file) {
  if (!file || !/^image\//.test(file.type)) return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const plan = photoPlan({ type: file.type, size: file.size, width: bitmap.width, height: bitmap.height });
  if (!plan.compress) return file;
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // fond blanc : une image PNG transparente reste lisible en JPEG
  ctx.fillRect(0, 0, plan.width, plan.height);
  ctx.drawImage(bitmap, 0, 0, plan.width, plan.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, plan.type, plan.quality));
  if (!blob || blob.size >= file.size) return file;
  const name = `${file.name.replace(/\.[^.]+$/, '') || 'justificatif'}.jpg`;
  return new File([blob], name, { type: plan.type, lastModified: file.lastModified });
}
