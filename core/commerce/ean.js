/**
 * Codes-barres EAN / GTIN : clé pivot de tout le module Articles. Un même produit doit avoir le même
 * code dans la caisse, dans chaque grille fournisseur et dans Nexus, quelle que soit la façon dont le
 * tableur l'a abîmé (espaces, « 3.66E+12 », zéro de tête perdu, clé de contrôle tronquée).
 */

/** Clé de contrôle GS1 des chiffres donnés (sans la clé). */
export function checkDigit(digits) {
  let total = 0;
  const s = String(digits);
  for (let i = 0; i < s.length; i++) total += Number(s[s.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return String((10 - (total % 10)) % 10);
}

/** EAN-8, UPC-A (12), EAN-13 ou GTIN-14 dont la clé de contrôle est juste. */
export function isValidEan(code) {
  const s = String(code ?? '');
  return /^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(s) && checkDigit(s.slice(0, -1)) === s.slice(-1);
}

/** Chiffres seuls d'une cellule : nombre Excel (3700202200099 ou 3.7002022E+12), texte avec espaces. */
export function eanDigits(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? BigInt(Math.round(value)).toString() : '';
  const s = String(value).trim();
  if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) return BigInt(Math.round(Number(s))).toString();
  const d = s.replace(/\.0+$/, '').replace(/[\s.\-\u00A0]/g, '');
  return /^\d+$/.test(d) ? d : ''; // « LOT634 » : code interne, pas un EAN
}

/**
 * Forme normalisée : { ean, repaired } ou { ean: '', invalid: true }.
 * - 13 ou 8 chiffres valides : tels quels ;
 * - 12 chiffres valides (UPC-A) : préfixés d'un zéro pour devenir un EAN-13 ;
 * - 12 chiffres invalides : EAN-13 dont la clé a été tronquée (export Kezia vers Excel) → clé recalculée ;
 * - 14 chiffres commençant par 0 (GTIN-14 d'une unité) : zéro de tête retiré.
 */
export function normalizeEan(value) {
  const d = eanDigits(value);
  if (!d) return { ean: '', invalid: Boolean(String(value ?? '').trim()) };
  if ((d.length === 13 || d.length === 8) && isValidEan(d)) return { ean: d, repaired: false };
  if (d.length === 14 && d.startsWith('0') && isValidEan(d)) return { ean: d.slice(1), repaired: false };
  if (d.length === 14 && isValidEan(d)) return { ean: d, repaired: false };
  if (d.length === 12 && isValidEan(d)) return { ean: `0${d}`, repaired: false };
  if (d.length === 12) return { ean: d + checkDigit(d), repaired: true };
  return { ean: '', invalid: true, raw: d };
}

/**
 * Formes possibles d'un code à 12 chiffres, ambigu par nature : UPC-A valide (préfixe 0) ou EAN-13
 * tronqué de sa clé (une fois sur dix, la troncature produit par hasard un UPC « valide »). Le
 * rapprochement essaie les deux.
 */
export function eanCandidates(value) {
  const d = eanDigits(value);
  if (d.length !== 12) return [ean(value)].filter(Boolean);
  return [...new Set([isValidEan(d) ? `0${d}` : '', d + checkDigit(d)].filter(Boolean))];
}

/**
 * Codes à 12 chiffres d'un même fichier : un code ambigu (UPC « valide ») est lu comme un EAN-13
 * tronqué quand d'autres codes du fichier, tronqués sans aucun doute, commencent par les mêmes
 * 9 chiffres (même fabricant). Rend Map(chiffres → EAN retenu), pour les seuls codes ainsi tranchés.
 */
export function resolveTruncated(values) {
  const digits = [...new Set(values.map(eanDigits).filter((d) => d.length === 12))];
  const truncated = new Set(digits.filter((d) => !isValidEan(d)).map((d) => d.slice(0, 9)));
  return new Map(digits.filter((d) => isValidEan(d) && truncated.has(d.slice(0, 9))).map((d) => [d, d + checkDigit(d)]));
}

/** Raccourci : EAN normalisé ou chaîne vide. */
export const ean = (value) => normalizeEan(value).ean;
