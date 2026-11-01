/**
 * Justificatif photo (téléphone) : décide s'il faut réduire l'image avant l'envoi, et à quelle taille.
 * La réduction elle-même se fait dans le navigateur (app/ui/photo.js). Un PDF, un fichier XML ou une
 * image déjà légère restent au format d'origine.
 */

export const PHOTO_MAX_SIDE = 1600; // px : un ticket ou une facture reste lisible
export const PHOTO_MAX_BYTES = 500_000; // au-delà, une photo est recompressée
export const PHOTO_QUALITY = 0.82;

/**
 * @param {{ type: string, size: number, width?: number, height?: number }} f
 * @returns {{ compress: false } | { compress: true, width, height, type: 'image/jpeg', quality }}
 */
export function photoPlan({ type, size, width = 0, height = 0 }) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(type || '')) return { compress: false };
  const side = Math.max(width, height);
  if (size <= PHOTO_MAX_BYTES && side <= PHOTO_MAX_SIDE) return { compress: false };
  const ratio = side > PHOTO_MAX_SIDE ? PHOTO_MAX_SIDE / side : 1;
  return { compress: true, width: Math.round(width * ratio), height: Math.round(height * ratio), type: 'image/jpeg', quality: PHOTO_QUALITY };
}
