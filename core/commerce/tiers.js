/**
 * Plusieurs fournisseurs pour un même article, et prix d'achat par palier de quantité.
 *
 * Chaque lien article ↔ fournisseur porte sa référence, son prix net à l'unité, son colisage, sa
 * quantité par palette et ses PALIERS : { qty, per, netPrice, source } = « dès 4 palettes, 26,12 €
 * l'unité ». Un palier vient d'une grille (colonnes « Prix unitaire franco 4P » de VB : remplacé à
 * chaque nouvelle grille) ou d'une saisie (remise négociée : gardé). Le fournisseur principal (rang 0)
 * donne le prix d'achat de référence ; pour une quantité donnée, on compare tous les fournisseurs.
 */

export class TierError extends Error {}

export const TIER_UNITS = { piece: 'unités', colis: 'colis', palette: 'palettes' };

/** Paliers contrôlés et triés (plus petite quantité d'abord), un seul par quantité et unité. */
export function normalizeTiers(tiers = []) {
  const seen = new Map();
  for (const t of tiers) {
    if (!TIER_UNITS[t.per]) throw new TierError('Unité de palier inconnue.');
    if (!Number.isInteger(t.qty) || t.qty < 1 || t.qty > 100000) throw new TierError('Quantité de palier entre 1 et 100 000.');
    if (!Number.isSafeInteger(t.netPrice) || t.netPrice < 0) throw new TierError('Prix de palier illisible.');
    seen.set(`${t.per}:${t.qty}`, { qty: t.qty, per: t.per, netPrice: t.netPrice, source: t.source === 'grille' ? 'grille' : 'saisie' });
  }
  const order = { piece: 0, colis: 1, palette: 2 };
  return [...seen.values()].sort((a, b) => order[a.per] - order[b.per] || a.qty - b.qty);
}

/** Paliers d'une nouvelle grille : ceux de l'ancienne grille sont remplacés, les saisis restent. */
export const mergeGridTiers = (current = [], fromGrid = []) =>
  normalizeTiers([...current.filter((t) => t.source !== 'grille'), ...fromGrid.map((t) => ({ ...t, source: 'grille' }))]);

/** Nombre d'unités d'un palier (null si le colisage ou la quantité par palette manque). */
export function tierUnits(tier, link) {
  if (tier.per === 'piece') return tier.qty;
  const per = tier.per === 'colis' ? link.packSize : link.palletSize;
  return Number.isFinite(per) && per > 0 ? Math.round(tier.qty * per) : null;
}

/** Prix unitaire de ce fournisseur pour une quantité : le meilleur palier atteint, sinon le prix net. */
export function unitPriceAt(link, qty) {
  let best = { netPrice: Number.isSafeInteger(link.netPrice) ? link.netPrice : null, tier: null };
  for (const t of link.tiers || []) {
    const units = tierUnits(t, link);
    if (units === null || units > qty) continue;
    if (best.netPrice === null || t.netPrice < best.netPrice) best = { netPrice: t.netPrice, tier: t };
  }
  return best;
}

/** Fournisseurs de l'article classés du moins cher au plus cher pour cette quantité. */
export function compareSuppliers(article, qty) {
  if (!(qty > 0)) throw new TierError('Indiquez une quantité.');
  return (article.suppliers || [])
    .map((link) => {
      const { netPrice, tier } = unitPriceAt(link, qty);
      return { link, netPrice, tier, total: netPrice === null ? null : Math.round(netPrice * qty) };
    })
    .sort((a, b) => (a.netPrice ?? Infinity) - (b.netPrice ?? Infinity) || (a.link.rank ?? 0) - (b.link.rank ?? 0));
}

const ranked = (links) => [...links].sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0)).map((s, rank) => ({ ...s, rank }));
const count = (v, label) => {
  if (v === null || v === undefined || v === '') return null;
  if (!(Number.isFinite(v) && v > 0 && v <= 100000)) throw new TierError(`${label} illisible.`);
  return v;
};

/**
 * Ajoute un fournisseur à l'article, ou met à jour sa référence, son prix et ses quantités. Le premier
 * fournisseur devient le principal (son prix devient le prix d'achat de référence).
 */
export function saveSupplierLink(article, { supplierId, ref, netPrice, packSize, palletSize }) {
  if (!supplierId) throw new TierError('Choisissez le fournisseur.');
  if (netPrice !== null && netPrice !== undefined && (!Number.isSafeInteger(netPrice) || netPrice < 0)) throw new TierError('Prix d’achat illisible.');
  const links = [...(article.suppliers || [])];
  const prev = links.find((s) => s.supplierId === supplierId);
  const link = {
    ...(prev || { supplierId, rank: links.length ? Math.max(...links.map((s) => s.rank ?? 0)) + 1 : 0, tiers: [] }),
    ref:
      String(ref ?? prev?.ref ?? '')
        .trim()
        .slice(0, 60) || null,
    netPrice: netPrice ?? prev?.netPrice ?? null,
    packSize: count(packSize ?? prev?.packSize, 'Colisage'),
    palletSize: count(palletSize ?? prev?.palletSize, 'Quantité par palette'),
  };
  const next = ranked([...links.filter((s) => s !== prev), link]);
  const primary = next[0].supplierId === supplierId;
  return { ...article, suppliers: next, purchasePrice: primary && link.netPrice !== null ? link.netPrice : (article.purchasePrice ?? null) };
}

/** Retire un fournisseur ; si c'était le principal, le suivant le devient et donne le prix d'achat. */
export function removeSupplierLink(article, supplierId) {
  const links = article.suppliers || [];
  const wasPrimary = ranked(links)[0]?.supplierId === supplierId;
  const next = ranked(links.filter((s) => s.supplierId !== supplierId));
  const purchasePrice = wasPrimary ? (next[0]?.netPrice ?? null) : (article.purchasePrice ?? null);
  return { ...article, suppliers: next, purchasePrice };
}

/** Ajoute (ou remplace, même quantité et unité) un palier saisi pour ce fournisseur. */
export function addTier(article, supplierId, tier) {
  const links = article.suppliers || [];
  if (!links.some((s) => s.supplierId === supplierId)) throw new TierError('Ajoutez d’abord ce fournisseur à l’article.');
  return {
    ...article,
    suppliers: links.map((s) => (s.supplierId === supplierId ? { ...s, tiers: normalizeTiers([...(s.tiers || []), { ...tier, source: 'saisie' }]) } : s)),
  };
}

/** Retire le palier n° `index` (dans l'ordre affiché) de ce fournisseur. */
export function removeTier(article, supplierId, index) {
  return {
    ...article,
    suppliers: (article.suppliers || []).map((s) => (s.supplierId === supplierId ? { ...s, tiers: (s.tiers || []).filter((_, i) => i !== index) } : s)),
  };
}

/**
 * Commande à passer quand le stock est au minimum ou dessous : la quantité à commander de l'article
 * (case QTE_APPRO de Kezia), sinon de quoi remonter au maximum, arrondie au colis du fournisseur
 * principal ; avec le fournisseur le moins cher pour cette quantité. null si rien à commander.
 */
export function orderSuggestion(article, level) {
  const min = article.stockMin;
  if (min === null || min === undefined || level === null || level === undefined || level > min) return null;
  const max = article.stockMax;
  let qty = article.reorderQty || (max !== null && max !== undefined && max > level ? max - level : null);
  if (!qty) return { qty: null, best: null };
  const pack = ranked(article.suppliers || [])[0]?.packSize;
  if (pack > 1) qty = Math.ceil(qty / pack) * pack;
  return { qty, best: (article.suppliers || []).length ? compareSuppliers(article, qty)[0] : null };
}
