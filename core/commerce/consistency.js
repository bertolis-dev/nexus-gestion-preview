/**
 * Cohérence des fournisseurs entre la caisse et les grilles (cas réels relevés sur une reprise) :
 *  - même fournisseur sous deux noms (« VB » et « VIVA BATIMENT », « PPG » et sa marque « GUITTET ») ;
 *  - article rangé sous un fournisseur fourre-tout dans la caisse alors que sa grille vient d'un autre :
 *    le prix d'achat de la grille n'est alors pas retenu (il ne vaut que pour le fournisseur principal).
 */

import { fold } from './sheet.js?v=d415f7a';

const initials = (name) =>
  fold(name)
    .split(' ')
    .filter((w) => w.length > 1)
    .map((w) => w[0])
    .join('');

/** Paires de fournisseurs qui sont sans doute le même, avec la raison. */
export function similarSuppliers(suppliers) {
  const out = [];
  for (let i = 0; i < suppliers.length; i++)
    for (let j = i + 1; j < suppliers.length; j++) {
      const [a, b] = [suppliers[i], suppliers[j]];
      const [fa, fb] = [fold(a.name), fold(b.name)];
      let reason = null;
      if (fa.replace(/ /g, '') === fb.replace(/ /g, '')) reason = 'Même nom, écrit autrement';
      else if (fa.length >= 2 && fa.length <= 4 && initials(b.name) === fa.replace(/ /g, '')) reason = `« ${a.name} » = initiales de « ${b.name} »`;
      else if (fb.length >= 2 && fb.length <= 4 && initials(a.name) === fb.replace(/ /g, '')) reason = `« ${b.name} » = initiales de « ${a.name} »`;
      else if ((b.brands || []).some((m) => fold(m) === fa) || fb.split(' ').includes(fa)) reason = `« ${a.name} » est une marque de « ${b.name} »`;
      else if ((a.brands || []).some((m) => fold(m) === fb) || fa.split(' ').includes(fb)) reason = `« ${b.name} » est une marque de « ${a.name} »`;
      if (reason) out.push({ a, b, reason });
    }
  return out;
}

const minRank = (links) => Math.min(...links.map((s) => s.rank ?? 0));

/**
 * Articles dont ce fournisseur donne un prix de grille sans être le fournisseur principal : dans la
 * caisse ils sont rangés sous un autre nom. Rend { article, link, primary }.
 */
export function misfiledArticles(articles, supplierId) {
  const out = [];
  for (const a of articles) {
    const links = a.suppliers || [];
    const link = links.find((s) => s.supplierId === supplierId && s.pricelistId);
    if (!link || (link.rank ?? 0) === minRank(links)) continue;
    out.push({ article: a, link, primary: links.find((s) => (s.rank ?? 0) === minRank(links)) });
  }
  return out;
}

/** Fait de ce fournisseur le principal de l'article (rang 0) ; son prix de grille devient le prix d'achat. */
export function makePrimary(article, supplierId) {
  const links = [...(article.suppliers || [])].sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0));
  const link = links.find((s) => s.supplierId === supplierId);
  if (!link) return article;
  const ordered = [link, ...links.filter((s) => s !== link)].map((s, rank) => ({ ...s, rank }));
  return { ...article, suppliers: ordered, purchasePrice: link.netPrice ?? article.purchasePrice ?? null };
}

/**
 * Fusionne le fournisseur `fromId` dans `toId` : les articles pointent vers `toId` (sans doublon, le
 * lien porteur d'un prix de grille gardé). Rend les articles modifiés seulement.
 */
export function mergeSupplierLinks(articles, fromId, toId) {
  const changed = [];
  for (const a of articles) {
    const links = a.suppliers || [];
    if (!links.some((s) => s.supplierId === fromId)) continue;
    const from = links.find((s) => s.supplierId === fromId);
    const to = links.find((s) => s.supplierId === toId);
    let next;
    if (!to) next = links.map((s) => (s === from ? { ...s, supplierId: toId } : s));
    else {
      const keep = to.pricelistId || !from.pricelistId ? { ...from, ...to } : { ...to, ...from, supplierId: toId };
      keep.rank = Math.min(from.rank ?? 0, to.rank ?? 0);
      next = links.filter((s) => s !== from && s !== to).concat(keep);
    }
    next = next.sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0)).map((s, rank) => ({ ...s, rank }));
    changed.push({ ...a, suppliers: next });
  }
  return changed;
}
