/**
 * Cohérence des fournisseurs entre la caisse et les grilles (cas réels relevés sur une reprise) :
 *  - même fournisseur sous deux noms (« VB » et « VIVA BATIMENT », « PPG » et sa marque « GUITTET ») ;
 *  - article rangé sous un fournisseur fourre-tout dans la caisse alors que sa grille vient d'un autre :
 *    le prix d'achat de la grille n'est alors pas retenu (il ne vaut que pour le fournisseur principal) ;
 *  - article créé deux fois dans la caisse (souvent l'un avec code-barres, l'autre sans) ;
 *  - code-barres de la caisse qui désigne un autre produit dans la grille (contenance, teinte, nom).
 */

import { sizesOf } from './legacy.js?v=a619ec1';
import { fold } from './sheet.js?v=a619ec1';

const COLOURS = new Set(
  'blanc noir gris rouge vert bleu jaune miel incolore cuivre fonce clair moyen dore rustique teck acajou merisier ivoire beige creme anthracite naturel'.split(
    ' ',
  ),
);
const colours = (s) =>
  new Set(
    fold(s)
      .split(' ')
      .filter((w) => COLOURS.has(w)),
  );
const measure = (size) => [Number.parseFloat(size), size.replace(/^[\d.]+/, '')];

/**
 * Articles dont le code-barres désigne, dans la grille du fournisseur, un autre produit :
 *  - autre contenance (1 L contre 2,5 L ; une base à teinter un peu plus petite que le pot est normale) ;
 *  - autre teinte (chêne noir contre chêne foncé) ;
 *  - aucun mot en commun (Rustol contre Primafloor), sauf libellé de produit teinté (« TEINTE VIVE » / « TR »).
 * Rend [{ article, line, reason }] ; `pricelists` : dernières versions de chaque fournisseur.
 */
export function labelMismatches(articles, pricelists) {
  const byEan = new Map();
  for (const p of pricelists) for (const l of p.lines || []) if (l.ean) byEan.set(l.ean, l);
  const out = [];
  for (const a of articles) {
    const l = a.ean && byEan.get(a.ean);
    if (!l) continue;
    const theirs = [l.designation, l.size ? `${l.size}${l.unit || (Number(l.size) >= 1 || !l.unit ? 'L' : '')}` : ''].join(' ');
    const sa = [...sizesOf(a.label)].map(measure);
    const sl = [...sizesOf(theirs)].map(measure);
    const sameUnit = sa.flatMap(([x, u]) => sl.filter(([, v]) => v === u).map(([y]) => Math.min(x, y) / Math.max(x, y)));
    const ca = colours(a.label);
    const cl = colours(l.designation);
    const ra = roots(a.label);
    const rl = roots(l.designation);
    const share = [...ra].filter((w) => rl.has(w)).length / Math.max(1, Math.min(ra.size, rl.size));
    let reason = null;
    if (sameUnit.length && Math.max(...sameUnit) < 0.75) reason = 'Autre contenance dans la grille';
    else if (ca.size && cl.size && ![...ca].some((c) => cl.has(c))) reason = 'Autre teinte dans la grille';
    else if (share < 0.3 && !/teinte/i.test(a.label)) reason = 'Aucun nom en commun avec la grille';
    if (reason) out.push({ article: a, line: l, reason });
  }
  return out;
}

// Mots d'une désignation : « 2,5 L » et « 2.5L » donnent le même mot « 2p5l ».
const words = (label) =>
  fold(
    String(label)
      .replace(/(\d)[,.](\d)/g, '$1p$2')
      .replace(/(\d)\s+(ml|cl|l|kg|g|gr|mm|cm|m)\b/gi, '$1$2'),
  )
    .split(' ')
    .filter(Boolean);
// Mot réduit à sa racine pour comparer malgré pluriels et fautes de frappe (« TERRASE » et
// « TERRASSES », « OLEOFUGUE » et « OLEOFUGE ») ; les mots avec chiffres sont comparés à part.
const roots = (label) =>
  new Set(
    words(label)
      .filter((w) => !/\d/.test(w))
      .map((w) => (w.length > 3 ? w.replace(/s$/, '') : w))
      .map((w) => (w.length >= 5 ? w.slice(0, 5) : w)),
  );
const figures = (label) =>
  words(label)
    .filter((w) => /\d/.test(w))
    .sort()
    .join(' ');

/**
 * Articles en double dans la caisse. Rend [{ kind, reason, articles }] :
 *  - 'doublon' : même désignation, avec au plus un code-barres distinct (créé deux fois) ;
 *  - 'libelle' : même désignation mais codes-barres différents (produits différents, souvent la
 *    contenance oubliée dans le libellé) : à renommer pour que le vendeur s'y retrouve ;
 *  - 'sans-code' : article sans code-barres qui ressemble fortement à un article qui en a un (mêmes
 *    chiffres, au moins 65 % des mots en commun) : doublon, ou code-barres mal saisi.
 */
export function duplicateArticles(articles, { minShare = 0.65 } = {}) {
  const out = [];
  const seen = new Set();
  const byLabel = new Map();
  for (const a of articles) {
    const k = words(a.label).join('');
    if (k) byLabel.set(k, [...(byLabel.get(k) || []), a]);
  }
  for (const group of byLabel.values()) {
    if (group.length < 2) continue;
    const eans = new Set(group.map((a) => a.ean).filter(Boolean));
    const doublon = eans.size <= 1 || eans.size < group.length - 1;
    out.push({
      kind: doublon ? 'doublon' : 'libelle',
      reason: doublon
        ? 'Même désignation : article créé deux fois ?'
        : 'Même désignation pour des codes-barres différents : préciser le libellé (contenance, teinte)',
      articles: group,
    });
    group.forEach((a) => seen.add(a.id));
  }
  const withEan = articles.filter((a) => a.ean).map((a) => ({ a, r: roots(a.label), f: figures(a.label) }));
  for (const a of articles) {
    if (a.ean || seen.has(a.id)) continue;
    const r = roots(a.label);
    const f = figures(a.label);
    if (r.size < 2) continue;
    let best = null;
    for (const o of withEan) {
      if (o.f !== f) continue;
      const share = [...r].filter((w) => o.r.has(w)).length / new Set([...r, ...o.r]).size;
      if (share >= minShare && (!best || share > best.share)) best = { o: o.a, share };
    }
    if (best)
      out.push({
        kind: 'sans-code',
        reason: `Sans code-barres, ${Math.round(best.share * 100)} % des mots en commun avec un article qui en a un : doublon ou code mal saisi ?`,
        articles: [a, best.o],
      });
  }
  return out;
}

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
