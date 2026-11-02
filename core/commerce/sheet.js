/**
 * Lecture paramétrable d'une grille fournisseur (ou de tout tableau d'articles) : le classeur est un
 * objet neutre { sheets: [{ name, rows: [[cellule, …], …] }] } produit par l'interface (Excel, CSV).
 *
 * Un PROFIL dit où lire : onglet, première ligne de données, colonne de chaque champ, base de prix
 * (à la pièce ou à l'unité de contenance), onglet joint par EAN (prix conseillé dans un autre onglet).
 * Il est proposé automatiquement (detectProfile), corrigé par l'utilisateur, puis mémorisé par fournisseur.
 * L'EAN est la clé pivot ; la référence fournisseur sert quand l'EAN manque.
 */

import { normalizeEan, isValidEan, eanDigits } from './ean.js?v=17f2ba9';

export class SheetError extends Error {}

/** Champs d'une ligne de grille, avec les intitulés de colonnes reconnus (comparés sans accents ni casse). */
// Mots par ordre de préférence ; « not » écarte une colonne (un prix « au L » n'est pas un prix à la pièce).
const PER_UNIT = ['au l', 'au kg', 'p u au l', 'pu au l', 'prix net l', 'net l', 'l kg', 'au litre'];
export const FIELDS = [
  { key: 'ean', label: 'EAN (code-barres)', words: ['ean', 'gencod', 'gencode', 'code barre', 'code ean', 'ean 13', 'gtin', 'multicode'] },
  {
    key: 'ref',
    label: 'Référence fournisseur',
    words: ['reference', 'references', 'ref', 'code article', 'ref fou', 'reference fournisseur', 'ref dlog', 'code'],
    not: ['ean', 'barre', 'douanier', 'gencod'],
  },
  { key: 'designation', label: 'Désignation', multi: true, words: ['designation', 'libelle', 'libelle du produit', 'def', 'produit', 'nom'] },
  { key: 'brand', label: 'Marque', words: ['marque', 'gamme', 'fabricant', 'marque gamme'] },
  {
    key: 'size',
    label: 'Contenance',
    words: ['condt', 'conditionnement', 'contenance', 'cont', 'vol l', 'volume', 'poids volume'],
    not: ['pu', 'prix', 'tarif'],
  },
  { key: 'unit', label: 'Unité', words: ['unite', 'unite facturation', 'unite prix tarif'], exact: true },
  { key: 'packSize', label: 'Colisage', words: ['colisage', 'pcb', 'upc', 'colisage par'] },
  { key: 'grossPrice', label: 'Prix brut HT', words: ['tg piece', 'prix brut', 'pvc brut', 'tarif general', 'tarif ht', 'tarif pro'], not: ['net'] },
  { key: 'discount', label: 'Remise (%)', words: ['total remises', 'remise', 'remise achat'] },
  {
    key: 'netPrice',
    label: 'Prix d’achat net HT',
    words: ['prix net piece', 'pu condt', 'tarif achat net', 'prix unitaire', 'achat net', 'pu tarif fou', 'prix net'],
    not: [...PER_UNIT, 'franco', 'palette'],
  },
  { key: 'previousNetPrice', label: 'Prix d’achat précédent', words: [] },
  {
    key: 'retailPrice',
    label: 'Prix de vente conseillé HT',
    words: ['pv conseille ht', 'tarif de vente ht', 'pv ht', 'prix public ht', 'pv conseille'],
    not: ['ttc'],
  },
  { key: 'ecoTax', label: 'Écocontribution', words: ['eco contribution', 'ecotaxe', 'dds'], not: ['hors'] },
];
// Colonnes ajoutées à la désignation quand elles existent (teinte d'une peinture : BLANC, BASE TR…).
const DESIGNATION_EXTRA = ['bases et couleurs', 'caracteristiques bases et couleurs', 'teinte', 'couleur'];
const FIELD_KEYS = FIELDS.map((f) => f.key);

export const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();

/** Nombre d'une cellule : 12.5 · « 12,50 € » · « 1 234,56 » ; null si vide ou illisible. */
export function cellNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  // « 3,43 € A la palette complète » (PDF : commentaire collé au prix) : le montant avant le symbole €.
  const before = /^([^€]*\d[^€]*)€/.exec(String(v ?? ''));
  const s = String(before ? before[1] : (v ?? ''))
    .replace(/[\s\u00A0\u202F€%]/g, '')
    .replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

/** Prix en centimes entiers (les tableurs donnent des flottants : 3,0653… au litre). */
export const toCents = (n) => (n === null || n === undefined ? null : Math.round(n * 100 + Math.sign(n) * 1e-7));

/** Contenance : 15 · « 2,5 L » · « 0,5K » · « 400ML » → { qty, unit } (ml et g ramenés au L et au kg). */
export function parseSize(v, unitCell) {
  if (typeof v === 'number') return { qty: v, unit: fold(unitCell) || null };
  const m = /^(\d+(?:[.,]\d+)?)\s*([a-zA-Z²]*)/.exec(String(v ?? '').trim());
  if (!m) return { qty: null, unit: fold(unitCell) || null };
  let qty = Number(m[1].replace(',', '.'));
  let unit = fold(m[2]) || fold(unitCell) || null;
  if (unit === 'ml') [qty, unit] = [qty / 1000, 'l'];
  if (unit === 'cl') [qty, unit] = [qty / 100, 'l'];
  if (unit === 'g' || unit === 'gr') [qty, unit] = [qty / 1000, 'kg'];
  if (unit === 'k' || unit === 'kgs') unit = 'kg';
  return { qty: Math.round(qty * 1000) / 1000, unit };
}

const isEanCell = (v) => isValidEan(eanDigits(v)) || (eanDigits(v).length === 12 && /^[0-9]/.test(eanDigits(v)));

/** Colonne qui contient le plus d'EAN dans les rangées données. */
function eanColumn(rows) {
  const counts = new Map();
  for (const r of rows) (r || []).forEach((v, i) => isEanCell(v) && counts.set(i, (counts.get(i) || 0) + 1));
  let best = null;
  for (const [i, n] of counts) if (!best || n > best[1]) best = [i, n];
  return best ? { col: best[0], count: best[1] } : { col: null, count: 0 };
}

/** Onglet le plus probable : celui qui porte le plus de codes-barres (« TAHT » plutôt que « COUV »). */
export function suggestSheet(workbook) {
  const scored = workbook.sheets.map((s) => ({ name: s.name, count: eanColumn(s.rows).count }));
  scored.sort((a, b) => b.count - a.count);
  return scored[0]?.count ? scored[0].name : workbook.sheets[0]?.name;
}

const sheetByName = (workbook, name) => {
  const s = workbook.sheets.find((x) => x.name === name);
  if (!s) throw new SheetError(`Onglet « ${name} » introuvable dans le fichier.`);
  return s;
};

/** Intitulé de chaque colonne : textes des lignes d'en-tête (souvent deux lignes fusionnées), réunis. */
export function columnLabels(rows, firstRow, depth = 3) {
  const width = Math.max(0, ...rows.slice(Math.max(0, firstRow - depth), firstRow + 5).map((r) => (r || []).length));
  const labels = [];
  for (let c = 0; c < width; c++) {
    const parts = [];
    for (let r = Math.max(0, firstRow - depth); r < firstRow; r++) {
      const v = rows[r]?.[c];
      if (typeof v === 'string' && v.trim() && cellNumber(v) === null) parts.push(v.replace(/\s+/g, ' ').trim());
    }
    labels.push(parts.join(' · '));
  }
  return labels;
}

const hasWord = (l, w) => new RegExp(`(^| )${w}( |$)`).test(l);

function scoreLabel(label, { words, not = [], exact = false }) {
  const l = fold(label);
  if (!l || not.some((w) => hasWord(l, w))) return 0;
  let best = 0;
  words.forEach((w, k) => {
    // La dernière ligne d'en-tête (après « · ») est souvent la plus précise.
    const last = fold(String(label).split(' · ').pop());
    if (l === w || last === w) best = Math.max(best, 3 - k * 0.01);
    else if (!exact && hasWord(l, w)) best = Math.max(best, 2 - k * 0.01 - l.split(' ').length / 50);
  });
  return best;
}

/** Autre onglet du même fichier portant les mêmes EAN et un prix de vente conseillé (grilles SD : « TV TTC »). */
function detectJoin(workbook, sheetName) {
  for (const s of workbook.sheets) {
    if (s.name === sheetName) continue;
    const { col, count } = eanColumn(s.rows);
    if (col === null || count < 2) continue;
    const firstRow = s.rows.findIndex((r) => isEanCell(r?.[col]));
    const labels = columnLabels(s.rows, firstRow);
    const retail = FIELDS.find((f) => f.key === 'retailPrice');
    const c = labels.map((l, i) => ({ i, s: scoreLabel(l, retail) })).sort((a, b) => b.s - a.s)[0];
    if (c?.s > 0) return { sheet: s.name, firstRow, ean: col, columns: { retailPrice: c.i } };
  }
  return null;
}

/**
 * Profil proposé pour un onglet : colonne EAN (la plus fournie en codes valides), première ligne de
 * données (premier EAN), colonnes devinées d'après les intitulés et le contenu (un prix est numérique).
 */
export function detectProfile(workbook, sheetName = suggestSheet(workbook)) {
  const { rows } = sheetByName(workbook, sheetName);
  const { col: eanCol } = eanColumn(rows);
  const firstRow = eanCol === null ? 1 : rows.findIndex((r) => isEanCell(r?.[eanCol]));
  const labels = columnLabels(rows, firstRow);
  const sample = rows.slice(firstRow, firstRow + 40);
  const numeric = labels.map((_, c) => sample.filter((r) => cellNumber(r?.[c]) !== null).length >= sample.length / 2);
  const columns = {};
  const taken = new Set(eanCol === null ? [] : [eanCol]);
  if (eanCol !== null) columns.ean = eanCol;
  for (const f of FIELDS) {
    if (f.key === 'ean' || !f.words.length) continue;
    const priceLike = ['grossPrice', 'netPrice', 'retailPrice', 'ecoTax', 'discount', 'packSize'].includes(f.key);
    const ranked = labels
      .map((l, c) => ({ c, s: scoreLabel(l, f) }))
      .filter((x) => x.s > 0 && !taken.has(x.c) && (!priceLike || numeric[x.c]))
      .sort((a, b) => b.s - a.s || a.c - b.c);
    if (!ranked.length) continue;
    columns[f.key] = f.multi ? [ranked[0].c] : ranked[0].c;
    taken.add(ranked[0].c);
    // Deux colonnes de prix net au même intitulé (révision en cours d'année) : la première est le
    // tarif en vigueur, la suivante le précédent.
    if (f.key === 'netPrice') {
      const twin = ranked.find((x) => x.c !== ranked[0].c && fold(labels[x.c]) === fold(labels[ranked[0].c]));
      if (twin) {
        columns.previousNetPrice = twin.c;
        taken.add(twin.c);
      }
    }
  }
  if (columns.designation) {
    // Colonne sans intitulé juste après la désignation, remplie de texte (teinte d'un PDF : « Blanc ») : la suite du libellé.
    const next = columns.designation[0] + 1;
    const texty = sample.filter((r) => typeof r?.[next] === 'string' && r[next].trim() && cellNumber(r[next]) === null).length >= sample.length / 2;
    if (!labels[next] && !taken.has(next) && texty) {
      columns.designation.push(next);
      taken.add(next);
    }
    labels.forEach((l, c) => {
      if (!taken.has(c) && DESIGNATION_EXTRA.some((w) => fold(l) === w || fold(String(l).split(' · ').pop()) === w)) {
        columns.designation.push(c);
        taken.add(c);
      }
    });
  }
  // Aucune colonne de prix reconnue à son intitulé : les colonnes en euros (« 13,61 € »), la dernière
  // pour le prix net, celle d'avant pour le prix brut (cas des PDF : intitulés sur plusieurs lignes).
  if (columns.netPrice === undefined && columns.grossPrice === undefined) {
    const euros = labels.map((_, c) => c).filter((c) => !taken.has(c) && sample.filter((r) => /€/.test(String(r?.[c] ?? ''))).length >= sample.length / 2);
    if (euros.length) columns.netPrice = euros.at(-1);
    if (euros.length > 1) columns.grossPrice = euros.at(-2);
  }
  // Prix exprimés au litre ou au kilo (« Tarif pro au L ») : multipliés par la contenance.
  const perUnit = ['netPrice', 'grossPrice'].some((k) => columns[k] !== undefined && PER_UNIT.some((w) => hasWord(fold(labels[columns[k]]), w)));
  const profile = { sheet: sheetName, firstRow, columns, priceBasis: perUnit ? 'unit' : 'piece', labels };
  const join = columns.retailPrice === undefined ? detectJoin(workbook, sheetName) : null;
  if (join) profile.join = join;
  return profile;
}

/** Contrôle d'un profil avant usage (colonnes entières, au moins un identifiant et un prix). */
export function validateProfile(p) {
  if (!p || typeof p.sheet !== 'string' || !p.sheet) throw new SheetError('Choisissez l’onglet à lire.');
  if (!Number.isInteger(p.firstRow) || p.firstRow < 0) throw new SheetError('Indiquez la première ligne de données.');
  const cols = p.columns || {};
  for (const [k, v] of Object.entries(cols)) {
    if (!FIELD_KEYS.includes(k)) throw new SheetError(`Champ inconnu : ${k}.`);
    const list = Array.isArray(v) ? v : [v];
    if (!list.length || list.some((c) => !Number.isInteger(c) || c < 0 || c > 500)) throw new SheetError(`Colonne invalide pour « ${k} ».`);
  }
  if (cols.ean === undefined && cols.ref === undefined) throw new SheetError('Indiquez la colonne de l’EAN (ou, à défaut, de la référence fournisseur).');
  if (cols.netPrice === undefined && cols.grossPrice === undefined) throw new SheetError('Indiquez au moins une colonne de prix (net ou brut).');
  if (!['piece', 'unit'].includes(p.priceBasis || 'piece')) throw new SheetError('Base de prix invalide.');
  if (p.join) {
    if (typeof p.join.sheet !== 'string' || !Number.isInteger(p.join.ean) || !p.join.columns) throw new SheetError('Onglet joint incomplet.');
  }
  return p;
}

/** Empreinte des intitulés lus par le profil : si le fournisseur change la mise en page, elle change. */
export function profileSignature(workbook, profile) {
  const { rows } = sheetByName(workbook, profile.sheet);
  const labels = columnLabels(rows, profile.firstRow);
  const used = Object.values(profile.columns || {})
    .flat()
    .sort((a, b) => a - b);
  return used.map((c) => `${c}:${fold(labels[c])}`).join('|');
}

const text = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());

/**
 * Applique un profil : lignes normalisées (prix en centimes, EAN réparé) et lignes écartées avec le
 * motif, pour le contrôle avant validation. Les doublons d'EAN gardent la première ligne.
 */
export function applyProfile(workbook, profile) {
  validateProfile(profile);
  const { rows } = sheetByName(workbook, profile.sheet);
  const C = profile.columns;
  const at = (r, k) => (C[k] === undefined ? undefined : r?.[C[k]]);
  const joined = new Map();
  if (profile.join) {
    const j = sheetByName(workbook, profile.join.sheet);
    for (const r of j.rows.slice(profile.join.firstRow || 0)) {
      const e = normalizeEan(r?.[profile.join.ean]).ean;
      if (e) joined.set(e, r);
    }
  }
  const lines = [];
  const rejected = [];
  const seen = new Set();
  for (let i = profile.firstRow; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((v) => text(v) === '')) continue;
    const e = normalizeEan(at(r, 'ean'));
    const ref = text(at(r, 'ref')).replace(/\.0+$/, '');
    const designation = (Array.isArray(C.designation) ? C.designation : C.designation === undefined ? [] : [C.designation])
      .map((c) => text(r[c]))
      .filter(Boolean)
      .join(' ');
    if (!e.ean && !ref) {
      if (designation && (cellNumber(at(r, 'netPrice')) !== null || cellNumber(at(r, 'grossPrice')) !== null))
        rejected.push({ row: i + 1, designation, reason: e.invalid ? 'Code-barres illisible' : 'Ni EAN ni référence' });
      continue;
    }
    const key = e.ean || `ref:${fold(ref)}`;
    if (seen.has(key)) {
      rejected.push({ row: i + 1, designation, reason: 'Doublon (même EAN ou même référence plus haut)' });
      continue;
    }
    const size = parseSize(at(r, 'size'), at(r, 'unit'));
    // Prix au litre sans contenance lisible (accessoire vendu à la pièce, au m²) : prix pris tel quel.
    const factor = profile.priceBasis === 'unit' && size.qty ? size.qty : 1;
    const price = (k) => {
      const n = cellNumber(at(r, k));
      return n === null ? null : factor ? toCents(n * factor) : null;
    };
    let netPrice = price('netPrice');
    const grossPrice = price('grossPrice');
    const discount = cellNumber(at(r, 'discount'));
    const discountBp = discount === null ? null : Math.round((discount <= 1 ? discount * 100 : discount) * 100);
    if (netPrice === null && grossPrice !== null && discountBp !== null) netPrice = Math.round((grossPrice * (10000 - discountBp)) / 10000);
    const jr = e.ean ? joined.get(e.ean) : null;
    const retailN = jr ? cellNumber(jr[profile.join.columns.retailPrice]) : cellNumber(at(r, 'retailPrice'));
    if (netPrice === null && grossPrice === null) {
      rejected.push({ row: i + 1, designation, reason: 'Sans prix' });
      continue;
    }
    if ((netPrice ?? 0) < 0 || (grossPrice ?? 0) < 0) {
      rejected.push({ row: i + 1, designation, reason: 'Prix négatif' });
      continue;
    }
    seen.add(key);
    lines.push({
      row: i + 1,
      ean: e.ean,
      eanRepaired: Boolean(e.repaired),
      ref,
      designation: designation.slice(0, 200),
      brand: text(at(r, 'brand')).slice(0, 80) || null,
      size: size.qty,
      unit: size.unit,
      packSize: cellNumber(at(r, 'packSize')),
      grossPrice,
      discountBp,
      netPrice,
      previousNetPrice: price('previousNetPrice'),
      retailPrice: retailN === null ? null : toCents(retailN),
      ecoTax: toCents(cellNumber(at(r, 'ecoTax'))),
    });
  }
  return {
    lines,
    rejected,
    stats: { lines: lines.length, withEan: lines.filter((l) => l.ean).length, repaired: lines.filter((l) => l.eanRepaired).length, rejected: rejected.length },
  };
}
