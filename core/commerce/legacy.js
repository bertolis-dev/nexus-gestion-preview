/**
 * Reprise d'un ancien logiciel de caisse dont la base n'a pas d'EAN (cas réel : code maison, libellé,
 * prix de vente HT). Le rapprochement avec les articles se fait par la référence fournisseur citée
 * dans le libellé (« Réf BROS010100 »), sinon par le libellé : mêmes mots, même contenance, même
 * teinte, prix plausible par rapport à l'achat. Chaque proposition a un niveau de confiance et se
 * valide à la main ; un ancien article peut correspondre à plusieurs articles (une base par teinte).
 */

import { divRound } from '../money.js?v=3bfbbd4';
import { cellNumber, fold, toCents } from './sheet.js?v=3bfbbd4';
import { purchaseOf } from './articles.js?v=3bfbbd4';

export const LEVELS = {
  A: 'Sûr',
  B: 'Très probable',
  C: 'À vérifier',
  D: 'Douteux',
};

/** Lit un export de l'ancienne base : colonnes « code », « libellé », « PV HT » (ou TTC) reconnues par leur intitulé. */
export function parseLegacyRows(rows) {
  const h = (rows[0] || []).map(fold);
  const find = (...w) => h.findIndex((x) => w.some((k) => x === k || x.startsWith(k)));
  const code = find('code article', 'code', 'reference');
  const label = find('libell', 'design'); // « Libellé » mal encodé par l'export : « Libell? »
  const ht = find('pv ht', 'prix ht', 'prix de vente ht');
  const ttc = find('pv ttc', 'prix ttc', 'prix de vente ttc');
  if (code < 0 || label < 0 || (ht < 0 && ttc < 0)) throw new Error('Colonnes attendues : code article, libellé et prix de vente (HT ou TTC).');
  return rows
    .slice(1)
    .map((r) => ({
      code: String(r[code] ?? '').trim(),
      label: String(r[label] ?? '')
        .replace(/�/g, 'é')
        .replace(/\s+/g, ' ')
        .trim(),
      priceHt: ht >= 0 ? toCents(cellNumber(r[ht])) : divRound(toCents(cellNumber(r[ttc])) * 10000, 12000),
    }))
    .filter((x) => x.code && x.label && x.priceHt > 0);
}

const SYN = { BLC: 'BLANC', BL: 'BLANC', BC: 'BLANC', TP: 'PASTEL', TV: 'VIVE', BAS: 'BASE', GUP: 'BASE', LT: 'L' };
const STOP = new Set(['DE', 'LA', 'LE', 'ET', 'A', 'EN', 'POUR', 'REF', 'AU', 'DU', 'LES', 'D', 'L', 'TEINTE']);
const COLORS = new Set(['BLANC', 'NOIR', 'PASTEL', 'VIVE', 'GRIS', 'INCOLORE', 'TRANSPARENT', 'DEEP', 'TR', 'BASE']);
const up = (s) =>
  fold(s)
    .toUpperCase()
    .replace(/(\d) (\d)/g, '$1.$2');

/** Contenances d'un libellé, ramenées au litre et au kilo : « 750 ML » = « 0,75L ». */
export function sizesOf(label) {
  const out = new Set();
  const s = String(label)
    .toUpperCase()
    .replace(/(\d),(\d)/g, '$1.$2');
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(ML|CL|LT|L|KGS|KG|GR|G|K)\b/g)) {
    let v = Number(m[1]);
    let u = m[2];
    if (u === 'ML') [v, u] = [v / 1000, 'L'];
    if (u === 'CL') [v, u] = [v / 100, 'L'];
    if (u === 'LT') u = 'L';
    if (u === 'GR' || u === 'G') [v, u] = [v / 1000, 'KG'];
    if (u === 'KGS' || u === 'K') u = 'KG';
    out.add(`${Math.round(v * 1000) / 1000}${u}`);
  }
  return out;
}

function tokens(label) {
  return new Set(
    up(label)
      .split(' ')
      .map((t) => SYN[t] || t)
      .filter((t) => t && !STOP.has(t) && !/^\d+(\.\d+)?(ML|CL|L|KG|G|GR|MM|CM|M)?$/.test(t)),
  );
}

const refsOf = (label) =>
  new Set(
    [
      ...String(label)
        .toUpperCase()
        .matchAll(/R[EÉ]F\.?\s*:?\s*([A-Z0-9][A-Z0-9\-/.]{3,})/g),
    ].map((m) => m[1].replace(/[^A-Z0-9]/g, '').replace(/^0+/, '')),
  );

const jaccard = (a, b) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  const u = a.size + b.size - n;
  return u ? n / u : 0;
};

const coefText = (k) => `× ${k.toFixed(2).replace('.', ',')}`;
const CONCLUSION = {
  A: 'Correspondance sûre.',
  B: 'Presque sûr : un coup d’œil suffit.',
  C: 'Les libellés diffèrent : comparez les deux désignations.',
  D: 'Ressemblance faible : probablement un autre produit.',
};

/** Pourquoi ce niveau de confiance, en langage courant (affiché à côté de chaque proposition). */
function explain(d, level) {
  const parts = [`${Math.round(d.words * 100)} % des mots en commun`];
  parts.push(d.sameSizes.length ? `même contenance (${d.sameSizes.join(', ')})` : 'contenance absente d’un des deux libellés : non vérifiable');
  if (d.sameColors.length) parts.push(`même teinte (${[...new Set(d.sameColors)].join(', ').toLowerCase()})`);
  if (d.k === null) parts.push('pas de prix d’achat pour contrôler l’ancien prix');
  else if (d.k >= 1.2 && d.k <= 3.5) parts.push(`ancien prix cohérent avec le prix d’achat (${coefText(d.k)})`);
  else parts.push(`ancien prix incohérent avec le prix d’achat (${coefText(d.k)}) : doute`);
  if (d.samePrice) parts.push('même prix de vente que dans la caisse');
  return `${parts.join(' · ')}. ${CONCLUSION[level]}`;
}

/**
 * Propose, pour chaque article, l'ancien article le plus proche. `designations` : EAN → désignation
 * de la grille fournisseur (souvent plus proche de l'ancien libellé que celle de la caisse).
 */
export function matchLegacy(legacy, articles, { designations = new Map() } = {}) {
  const old = legacy.map((x) => ({ ...x, toks: tokens(x.label), sizes: sizesOf(x.label), refs: refsOf(x.label) }));
  const byTok = new Map();
  old.forEach((x, i) => x.toks.forEach((t) => byTok.set(t, [...(byTok.get(t) || []), i])));
  const byRef = new Map();
  old.forEach((x) => x.refs.forEach((r) => byRef.set(r, x)));
  const out = [];
  for (const a of articles) {
    const refs = (a.suppliers || [])
      .map((s) =>
        String(s.ref || '')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .replace(/^0+/, ''),
      )
      .filter((r) => r.length >= 4);
    const gridLabel = designations.get(a.ean) || '';
    const t1 = tokens(a.label);
    const t2 = tokens(gridLabel);
    const viaRef = refs.map((r) => byRef.get(r)).find(Boolean);
    if (viaRef) {
      const ref = refs.find((r) => byRef.get(r) === viaRef);
      // Même référence mais libellés sans rapport (« CIMENT PROMPT » contre « MANCHON… Réf ROT25110 ») :
      // la référence est sans doute mal saisie dans la caisse. À vérifier, pas « sûr ».
      const words = Math.max(jaccard(t1, viaRef.toks), jaccard(t2, viaRef.toks));
      const sure = words >= 0.1; // au moins un mot significatif en commun
      out.push({
        articleId: a.id,
        code: viaRef.code,
        label: viaRef.label,
        priceHt: viaRef.priceHt,
        score: sure ? 1.2 : 0.6,
        level: sure ? 'A' : 'C',
        method: 'référence fournisseur',
        why: sure
          ? `La référence fournisseur ${ref} est écrite dans le libellé de l’ancien logiciel, et les libellés concordent : correspondance certaine.`
          : `Même référence fournisseur (${ref}), mais les libellés n’ont presque rien en commun (${Math.round(words * 100)} % des mots) : la référence est peut-être mal saisie dans la caisse. À vérifier.`,
      });
      continue;
    }
    const sizes = sizesOf(a.label).size ? sizesOf(a.label) : sizesOf(gridLabel);
    const colors = new Set([...t1, ...t2].filter((t) => COLORS.has(t)));
    const purchase = purchaseOf(a);
    const saleHt = a.salePrice ? divRound(a.salePrice * 10000, 10000 + (a.vatRateBp ?? 2000)) : null;
    const cand = new Set();
    for (const t of new Set([...t1, ...t2])) {
      const list = byTok.get(t);
      if (list && list.length < 250) list.forEach((i) => cand.add(i));
    }
    let best = null;
    for (const i of cand) {
      const x = old[i];
      if (sizes.size && x.sizes.size && ![...sizes].some((s) => x.sizes.has(s))) continue;
      const xc = [...x.toks].filter((t) => COLORS.has(t));
      if (colors.size && xc.length && !xc.some((c) => colors.has(c))) continue;
      const words = Math.max(jaccard(t1, x.toks), jaccard(t2, x.toks));
      const sameSizes = [...sizes].filter((s) => x.sizes.has(s));
      const sameColors = xc.filter((c) => colors.has(c));
      const k = purchase ? x.priceHt / purchase : null;
      const samePrice = Boolean(saleHt && Math.abs(x.priceHt - saleHt) <= 1);
      let score = words;
      if (sameSizes.length) score += 0.1;
      if (k !== null) score += k >= 1.2 && k <= 3.5 ? 0.1 : -0.3;
      if (samePrice) score += 0.25;
      if (!best || score > best.score) best = { x, score, d: { words, sameSizes, sameColors, k, samePrice } };
    }
    if (!best || best.score < 0.4) continue;
    const level = best.score >= 1 ? 'A' : best.score >= 0.75 ? 'B' : best.score >= 0.55 ? 'C' : 'D';
    out.push({
      articleId: a.id,
      code: best.x.code,
      label: best.x.label,
      priceHt: best.x.priceHt,
      score: Math.round(best.score * 1000) / 1000,
      level,
      method: 'libellé',
      why: explain(best.d, level),
    });
  }
  return out;
}
