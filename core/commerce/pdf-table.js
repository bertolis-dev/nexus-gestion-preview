/**
 * Grille fournisseur en PDF → tableau de cellules, pour la même lecture paramétrable que les fichiers
 * Excel (sheet.js). Le PDF ne connaît que des morceaux de texte positionnés : on les regroupe en
 * lignes (même hauteur sur la page), puis en colonnes (position horizontale de départ, repérée sur
 * les lignes qui portent un code-barres, c'est-à-dire les lignes de produits).
 *
 * Entrée : [{ items: [{ str, x, y, w }] }] par page (coordonnées PDF : y croît vers le haut).
 */

import { eanDigits, isValidEan } from './ean.js?v=269c883';

const LINE_TOLERANCE = 2.5; // points : deux morceaux à moins de cette hauteur sont sur la même ligne
const COLUMN_GAP = 6; // points : écart minimal entre deux débuts de colonnes

/** Lignes d'une page : morceaux regroupés par hauteur, de haut en bas, triés de gauche à droite. */
export function pageLines(items) {
  const lines = [];
  for (const it of [...items].filter((i) => i.str && i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= LINE_TOLERANCE);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

const isProductLine = (line) => line.items.some((i) => isValidEan(eanDigits(i.str.trim())));

/**
 * Débuts de colonnes : positions où commencent les morceaux des lignes de produits. Une position
 * retenue doit revenir sur au moins un dixième de ces lignes (un mot isolé ne crée pas de colonne).
 */
export function columnStarts(lines) {
  const products = lines.filter(isProductLine);
  const starts = products.flatMap((l) => mergeWords(l.items).map((i) => i.x)).sort((a, b) => a - b);
  const clusters = [];
  for (const x of starts) {
    const c = clusters.at(-1);
    if (c && x - c.max <= COLUMN_GAP) [c.max, c.n] = [x, c.n + 1];
    else clusters.push({ min: x, max: x, n: 1 });
  }
  const min = Math.max(2, Math.ceil(products.length / 10));
  return clusters.filter((c) => c.n >= min).map((c) => c.min);
}

/** Morceaux voisins d'un même mot ou d'une même expression (espace normal entre eux) réunis. */
function mergeWords(items) {
  const out = [];
  for (const it of items) {
    const prev = out.at(-1);
    const gap = prev ? it.x - (prev.x + prev.w) : Infinity;
    if (prev && gap < 3.5) Object.assign(prev, { str: `${prev.str}${gap > 0.8 ? ' ' : ''}${it.str}`, w: it.x + it.w - prev.x });
    else out.push({ ...it });
  }
  return out;
}

/** Cellules d'une ligne selon les débuts de colonnes (texte avant la première colonne : colonne 0). */
function toCells(line, starts) {
  const cells = Array(starts.length).fill(null);
  // Lignes de produits : colonne où commence le texte. En-têtes (souvent centrés) : colonne où tombe son milieu.
  const product = isProductLine(line);
  for (const it of mergeWords(line.items)) {
    const at = product ? it.x : it.x + it.w / 2;
    let c = 0;
    for (let k = 0; k < starts.length; k++) if (at >= starts[k] - COLUMN_GAP / 2) c = k;
    const s = it.str.trim();
    cells[c] = cells[c] ? `${cells[c]} ${s}` : s;
  }
  return cells;
}

/**
 * Tableau du document entier. Les lignes d'en-tête (répétées en haut de chaque page) et les titres
 * de rubrique sont gardés : la lecture paramétrable saute ce qui n'a ni EAN ni prix.
 */
export function pdfToRows(pages) {
  const lines = pages.flatMap((p) => pageLines(p.items));
  const starts = columnStarts(lines);
  if (!starts.length)
    return lines.map((l) => [
      mergeWords(l.items)
        .map((i) => i.str.trim())
        .join(' '),
    ]);
  return lines.map((l) => toCells(l, starts));
}
