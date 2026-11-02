/**
 * Articles d'un commerce : codes (EAN pivot, code caisse, code de l'ancien système), fournisseurs et
 * leurs références, prix d'achat de référence, prix de vente, marge. Montants en centimes entiers,
 * prix de vente TTC (celui de l'étiquette et de la caisse), prix d'achat HT.
 */

import { divRound } from '../money.js?v=269c883';
import { eanCandidates, normalizeEan } from './ean.js?v=269c883';
import { fold } from './sheet.js?v=269c883';
import { lineKey } from './pricelists.js?v=269c883';

export class ArticleError extends Error {}

export const CODE_TYPES = { ean: 'EAN', caisse: 'Identifiant caisse', ancien: 'Code ancien système', interne: 'Code interne' };

const clean = (s, max) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const cents = (v, label) => {
  if (v === null || v === undefined || v === '') return null;
  if (!Number.isSafeInteger(v) || v < 0) throw new ArticleError(`${label} illisible.`);
  return v;
};

/**
 * Crée ou met à jour un article (même identifiant). L'EAN est normalisé. Un EAN partagé par
 * plusieurs articles est permis (teintes vendues sous le code de leur base) mais signalé (sharedEans).
 */
export function saveArticle(list = [], input, { newId, now = new Date() } = {}) {
  const label = clean(input.label, 200);
  if (!label) throw new ArticleError('Indiquez la désignation de l’article.');
  const e = input.ean ? normalizeEan(input.ean) : { ean: '' };
  if (input.ean && !e.ean) throw new ArticleError(`Code-barres « ${input.ean} » illisible (8 ou 13 chiffres avec une clé de contrôle juste).`);
  const prev = list.find((a) => a.id === input.id);
  const vat = input.vatRateBp ?? prev?.vatRateBp ?? 2000;
  if (!Number.isInteger(vat) || vat < 0 || vat > 10000) throw new ArticleError('Taux de TVA invalide.');
  const article = {
    ...(prev || {}),
    id: prev?.id || input.id || newId(),
    label,
    ean: e.ean || null,
    codes: dedupeCodes(input.codes ?? prev?.codes ?? []),
    brand: clean(input.brand ?? prev?.brand, 80) || null,
    department: clean(input.department ?? prev?.department, 80) || null,
    size: input.size ?? prev?.size ?? null,
    unit: clean(input.unit ?? prev?.unit, 10) || null,
    vatRateBp: vat,
    salePrice: cents(input.salePrice ?? prev?.salePrice ?? null, 'Prix de vente'),
    purchasePrice: cents(input.purchasePrice ?? prev?.purchasePrice ?? null, 'Prix d’achat'),
    pmpa: cents(input.pmpa ?? prev?.pmpa ?? null, 'PMPA'),
    suppliers: input.suppliers ?? prev?.suppliers ?? [],
    stockTracked: Boolean(input.stockTracked ?? prev?.stockTracked),
    stockMin: input.stockMin ?? prev?.stockMin ?? null,
    stockMax: input.stockMax ?? prev?.stockMax ?? null,
    active: input.active ?? prev?.active ?? true,
    updatedAt: now.toISOString(),
  };
  return [...list.filter((a) => a.id !== article.id), article];
}

function dedupeCodes(codes) {
  const seen = new Set();
  return codes
    .map((c) => ({ type: CODE_TYPES[c.type] ? c.type : 'interne', value: clean(c.value, 60) }))
    .filter((c) => c.value && !seen.has(`${c.type}:${c.value}`) && seen.add(`${c.type}:${c.value}`));
}

/** Ajoute un code (sans doublon) : code caisse, code de l'ancien système… */
export function withCode(article, type, value) {
  return { ...article, codes: dedupeCodes([...(article.codes || []), { type, value }]) };
}

export const codeOf = (article, type) => article.codes?.find((c) => c.type === type)?.value || null;

// ------------------------------------------------------------------ marges et prix

/** Prix d'achat retenu : celui de la grille du fournisseur principal, sinon le PMPA de la caisse. */
export const purchaseOf = (a) => a.purchasePrice ?? a.pmpa ?? null;

/** PV HT, coefficient (points de base : 20000 = ×2,00) et taux de marque ((PV − PA) / PV). */
export function margin(a, purchase = purchaseOf(a)) {
  const saleHt = a.salePrice === null || a.salePrice === undefined ? null : divRound(a.salePrice * 10000, 10000 + (a.vatRateBp ?? 2000));
  if (!saleHt || !purchase) return { purchase, saleHt, coefBp: null, markBp: null };
  return { purchase, saleHt, coefBp: divRound(saleHt * 10000, purchase), markBp: divRound((saleHt - purchase) * 10000, saleHt) };
}

/** Arrondis commerciaux d'un prix TTC. */
export const ROUNDINGS = {
  centime: { label: 'Au centime', fn: (c) => c },
  dixieme: { label: 'Aux 10 centimes', fn: (c) => Math.ceil(c / 10) * 10 },
  psy: { label: 'En ,90 (12,90 €)', fn: (c) => Math.max(90, Math.ceil((c - 90) / 100) * 100 + 90) },
  euro: { label: 'À l’euro', fn: (c) => Math.ceil(c / 100) * 100 },
};

/** Prix de vente TTC proposé : achat HT × coefficient, TVA, arrondi. */
export function proposeSalePrice(purchaseHt, coefBp, { vatRateBp = 2000, rounding = 'centime' } = {}) {
  if (!Number.isSafeInteger(purchaseHt) || purchaseHt <= 0) return null;
  const ht = divRound(purchaseHt * coefBp, 10000);
  return (ROUNDINGS[rounding] || ROUNDINGS.centime).fn(divRound(ht * (10000 + vatRateBp), 10000));
}

/** Points d'attention d'un article, en langage courant. */
export function articleAlerts(a, { minMarkBp = 3000 } = {}) {
  const out = [];
  const m = margin(a);
  if (!a.salePrice) out.push({ level: 'erreur', code: 'prix-nul', text: 'Prix de vente nul' });
  if (!purchaseOf(a)) out.push({ level: 'info', code: 'sans-achat', text: 'Prix d’achat inconnu' });
  if (m.markBp !== null && m.markBp < 0) out.push({ level: 'erreur', code: 'perte', text: 'Vendu à perte' });
  else if (m.markBp !== null && m.markBp < minMarkBp) out.push({ level: 'alerte', code: 'marge-faible', text: 'Marge sous le seuil' });
  if (m.coefBp !== null && m.coefBp > 60000) out.push({ level: 'alerte', code: 'unite', text: 'Coefficient anormal : unité d’achat et de vente à vérifier' });
  if (a.purchasePrice && a.pmpa && a.purchasePrice > a.pmpa + divRound(a.pmpa, 200))
    out.push({ level: 'info', code: 'pmpa', text: 'Achat en hausse : PMPA de la caisse à mettre à jour' });
  if (!a.ean) out.push({ level: 'info', code: 'sans-ean', text: 'Sans code-barres' });
  return out;
}

// ------------------------------------------------------------------ rapprochement grille ↔ articles

/**
 * Index des articles par EAN (EAN principal et codes EAN secondaires, y compris formes ambiguës à 12
 * chiffres). Plusieurs articles peuvent porter le même EAN : en caisse, une peinture « teinte vive »
 * est souvent vendue sous le code-barres de sa base.
 */
export function eanIndex(articles) {
  const idx = new Map();
  for (const a of articles) {
    const codes = new Set([a.ean, ...(a.codes || []).filter((c) => c.type === 'ean').map((c) => c.value)].filter(Boolean).flatMap((c) => eanCandidates(c)));
    for (const k of codes) idx.set(k, [...(idx.get(k) || []), a]);
  }
  return idx;
}

/** EAN portés par plusieurs articles (ambigus au passage en caisse). */
export function sharedEans(articles) {
  const count = new Map();
  for (const a of articles) if (a.ean) count.set(a.ean, (count.get(a.ean) || 0) + 1);
  return new Set([...count].filter(([, n]) => n > 1).map(([e]) => e));
}

/**
 * Rapproche les lignes d'une grille des articles : par EAN d'abord (clé pivot), puis par référence
 * de ce fournisseur. Jamais par désignation : une proposition sur le libellé se valide à la main.
 */
export function matchLines(lines, articles, supplierId) {
  const byEan = eanIndex(articles);
  const byRef = new Map();
  for (const a of articles) for (const s of a.suppliers || []) if (s.supplierId === supplierId && s.ref) byRef.set(fold(s.ref), a);
  const matched = [];
  const unmatched = [];
  for (const line of lines) {
    const viaEan = (line.ean && byEan.get(line.ean)) || [];
    const viaRef = !viaEan.length && line.ref ? byRef.get(fold(line.ref)) : null;
    if (viaEan.length) viaEan.forEach((article) => matched.push({ line, article, by: 'ean' }));
    else if (viaRef) matched.push({ line, article: viaRef, by: 'ref' });
    else unmatched.push(line);
  }
  return { matched, unmatched };
}

/**
 * Applique une version de grille aux articles : référence et prix net du fournisseur mis à jour,
 * prix d'achat de référence mis à jour si ce fournisseur est le principal (rang 0) ou le seul.
 * Rend les articles modifiés, l'historique des prix et la liste des changements.
 */
export function applyPricelist(articles, pricelist, { newId } = {}) {
  const { matched, unmatched } = matchLines(pricelist.lines, articles, pricelist.supplierId);
  const updated = new Map();
  const history = [];
  for (const { line, article } of matched) {
    const price = Number.isSafeInteger(line.netPrice) ? line.netPrice : null;
    const a = updated.get(article.id) || article;
    const links = [...(a.suppliers || [])];
    let link = links.find((s) => s.supplierId === pricelist.supplierId);
    if (!link) {
      link = { supplierId: pricelist.supplierId, rank: links.length ? Math.max(...links.map((s) => s.rank ?? 0)) + 1 : 0 };
      links.push(link);
    }
    const before = link.netPrice ?? null;
    Object.assign(link, {
      ref: line.ref || link.ref || null,
      netPrice: price ?? link.netPrice ?? null,
      grossPrice: line.grossPrice ?? null,
      packSize: line.packSize ?? link.packSize ?? null,
      pricelistId: pricelist.id,
    });
    const primary = (link.rank ?? 0) === Math.min(...links.map((s) => s.rank ?? 0));
    const next = { ...a, suppliers: links.map((s) => ({ ...s })) };
    // La grille fait foi pour l'EAN : un code tronqué ambigu de la caisse prend la forme de la grille.
    if (line.ean && next.ean !== line.ean) {
      if (next.ean) next.codes = dedupeCodes([...(next.codes || []), { type: 'ean', value: next.ean }]);
      next.ean = line.ean;
    }
    if (primary && price !== null) next.purchasePrice = price;
    if (price !== null && before !== price)
      history.push({
        id: newId(),
        articleId: a.id,
        date: pricelist.effectiveDate,
        kind: 'achat',
        supplierId: pricelist.supplierId,
        before,
        after: price,
        source: `grille:${pricelist.id}`,
      });
    updated.set(a.id, next);
  }
  return {
    articles: articles.map((a) => updated.get(a.id) || a),
    history,
    changed: updated.size,
    matchedBy: { ean: matched.filter((m) => m.by === 'ean').length, ref: matched.filter((m) => m.by === 'ref').length },
    unmatched,
  };
}

/** Nouvel article créé depuis une ligne de grille (nouveauté du catalogue fournisseur). */
export function articleFromLine(line, supplier, { newId, coefBp = supplier.defaultCoefBp || 20000, rounding = 'centime', vatRateBp = 2000, now } = {}) {
  const purchase = Number.isSafeInteger(line.netPrice) ? line.netPrice : null;
  const [a] = saveArticle(
    [],
    {
      label: line.designation || line.ref || line.ean,
      ean: line.ean || null,
      brand: line.brand,
      size: line.size,
      unit: line.unit,
      vatRateBp,
      purchasePrice: purchase,
      salePrice: purchase ? proposeSalePrice(purchase, coefBp, { vatRateBp, rounding }) : null,
      suppliers: [
        { supplierId: supplier.id, ref: line.ref || null, netPrice: purchase, grossPrice: line.grossPrice ?? null, packSize: line.packSize ?? null, rank: 0 },
      ],
    },
    { newId, now },
  );
  return a;
}

/** Changement de prix de vente tracé (historique « vente »). */
export function setSalePrice(article, salePrice, { date, source = 'saisie', newId }) {
  if (!Number.isSafeInteger(salePrice) || salePrice < 0) throw new ArticleError('Prix de vente illisible.');
  const entry =
    article.salePrice === salePrice
      ? null
      : { id: newId(), articleId: article.id, date, kind: 'vente', supplierId: null, before: article.salePrice ?? null, after: salePrice, source };
  return { article: { ...article, salePrice }, history: entry ? [entry] : [] };
}

export { lineKey };
