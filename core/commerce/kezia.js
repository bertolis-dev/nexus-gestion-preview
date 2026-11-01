/**
 * Connecteur de caisse Kezia II (Altis Développement). Kezia n'a pas d'API : l'échange se fait par
 * le fichier Excel de son outil « Import / Export Articles », dont la première colonne IDART identifie
 * l'article (à ne pas modifier pour réimporter). Une ligne par couple article × fournisseur.
 *
 * Lecture : articles normalisés (centimes, EAN réparés, fournisseurs par nom, code caisse = IDART).
 * Écriture : mêmes 58 colonnes, en repartant des valeurs lues pour ne rien perdre de ce que Nexus ne
 * gère pas ; seuls les champs tenus par Nexus sont remplacés.
 */

import { eanCandidates, normalizeEan } from './ean.js?v=e821f3b';
import { fold } from './sheet.js?v=e821f3b';
import { codeOf } from './articles.js?v=e821f3b';

export const KEZIA_COLUMNS = [
  'IDART', 'NOM_FOURNISSEUR', 'REFERENCE_FOURNISSEUR', 'EAN', 'DEF', 'RAYON', 'FAMILLE', 'SS_FAMILLE', 'PMPA', 'TYP_FRAIS', 'FRAIS', 'PRIX_TTC',
  'TAUX_TVA_VENTE', 'FABRICANT', 'CODE_VENTE', 'CODE_ACHAT', 'QTE_APPRO', 'QTE_MINI', 'QTE_MAXI', 'NOTA', 'COMP_DEF', 'NO_SERIE', 'STOCK',
  'TAUX_TVA_ACHAT', 'TAUX_TVA_2_VENTE', 'PSTVA2', 'OEUVRE', 'CDTV', 'REMISE_FOU', 'PU_TARIF_FOU', 'CONTENU', 'ECOTAX', 'TAILLE', 'COULEUR',
  'MODELE', 'SAISON', 'CODE', 'COLISAGE', 'VOL_UNIT_NET', 'UNITE', 'DEGREE_ALCOOL', 'CAT_ALCOOL', 'PREMIX', 'CONSIGNE', 'BASE_ALCOOL_HT',
  'AUXILIAIRE', 'PROMO', 'DEBUT_PROMO', 'FIN_PROMO', 'DLV', 'HEURE_DEBUT_PROMO', 'HEURE_FIN_PROMO', 'COND_ACH', 'GES_STOCK', 'ABANDON',
  'VENTE_BLOQUEE', 'PESAGE', 'OCCASION',
]; // prettier-ignore

export class KeziaError extends Error {}

// Valeurs « vides » de Kezia : on ne les garde pas dans la copie brute (gain de place).
const EMPTY = new Set(['', '0', '00000000', '000000']);
const num = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const cents = (v) => Math.round(num(v) * 100 + 1e-7);
const text = (v) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** Le fichier est-il un export Articles de Kezia ? (ligne d'en-tête IDART … EAN … DEF) */
export function isKeziaExport(rows) {
  const h = (rows?.[0] || []).map((c) => text(c).toUpperCase());
  return h.includes('IDART') && h.includes('EAN') && h.includes('DEF');
}

/**
 * Lit un export Articles de Kezia. Rend des articles avec leurs fournisseurs NOMMÉS (le rattachement
 * aux fiches fournisseurs de Nexus se fait ensuite par resolveSuppliers) et les anomalies relevées.
 */
export function parseKeziaExport(rows) {
  if (!isKeziaExport(rows)) throw new KeziaError('Ce fichier n’est pas un export Articles de Kezia (colonnes IDART, EAN, DEF attendues en première ligne).');
  const header = rows[0].map((c) => text(c).toUpperCase());
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const byId = new Map();
  const issues = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !text(r[col.IDART])) continue;
    const idart = String(Math.round(num(r[col.IDART])));
    const raw = {};
    header.forEach((h, j) => {
      const v = r[j];
      if (KEZIA_COLUMNS.includes(h) && !EMPTY.has(text(v))) raw[h] = typeof v === 'number' ? v : text(v);
    });
    const e = normalizeEan(r[col.EAN]);
    if (e.repaired) issues.push({ idart, label: text(r[col.DEF]), code: 'ean-repare', text: `EAN tronqué ${text(r[col.EAN])} : clé recalculée (${e.ean})` });
    if (e.invalid && text(r[col.EAN]))
      issues.push({ idart, label: text(r[col.DEF]), code: 'ean-illisible', text: `Code « ${text(r[col.EAN])} » : pas un EAN` });
    let a = byId.get(idart);
    if (!a) {
      a = {
        idart,
        label: text(r[col.DEF]),
        eans: [],
        department: text(r[col.RAYON]) || null,
        family: text(r[col.FAMILLE]) || null,
        salePrice: cents(r[col.PRIX_TTC]),
        vatRateBp: Math.round(num(r[col.TAUX_TVA_VENTE]) * 100),
        pmpa: cents(r[col.PMPA]) || null,
        stockTracked: num(r[col.GES_STOCK]) === 1,
        stockMin: num(r[col.QTE_MINI]) || null,
        stockMax: num(r[col.QTE_MAXI]) || null,
        suppliers: [],
        rawLines: [],
      };
      byId.set(idart, a);
    }
    // Code à 12 chiffres ambigu : les deux formes sont gardées, la grille du fournisseur tranchera.
    for (const c of e.ean ? [e.ean, ...eanCandidates(r[col.EAN])] : []) if (!a.eans.includes(c)) a.eans.push(c);
    const supplierName = text(r[col.NOM_FOURNISSEUR]);
    if (supplierName)
      a.suppliers.push({
        supplierName,
        ref: text(r[col.REFERENCE_FOURNISSEUR]) || null,
        netPrice: cents(r[col.PU_TARIF_FOU]) || null,
        packSize: num(r[col.CDTV]) || null,
        rank: a.suppliers.length,
      });
    a.rawLines.push(raw);
  }
  const articles = [...byId.values()];
  for (const a of articles) if (!a.salePrice) issues.push({ idart: a.idart, label: a.label, code: 'prix-nul', text: 'Prix de vente nul dans la caisse' });
  return { articles, supplierNames: [...new Set(articles.flatMap((a) => a.suppliers.map((s) => s.supplierName)))].sort(), issues };
}

/**
 * Transforme le résultat de parseKeziaExport en articles Nexus : fournisseurs retrouvés par nom
 * (sans casse ni accents) ou créés, EAN principal = premier EAN, IDART gardé comme code caisse.
 * Un article déjà connu (même IDART ou même EAN) est mis à jour, ses prix d'achat de grille gardés.
 */
export function mergeKeziaArticles(parsed, { articles = [], suppliers = [] }, { newId, now = new Date() }) {
  const sup = [...suppliers];
  const supplierId = (name) => {
    let s = sup.find((x) => fold(x.name) === fold(name));
    if (!s) {
      s = { id: newId(), name, brands: [], priceType: 'inconnu', defaultCoefBp: null, profiles: [], createdAt: now.toISOString() };
      sup.push(s);
    }
    return s.id;
  };
  const byIdart = new Map(articles.map((a) => [codeOf(a, 'caisse'), a]));
  const byEan = new Map(articles.filter((a) => a.ean).map((a) => [a.ean, a]));
  const out = new Map(articles.map((a) => [a.id, a]));
  let created = 0;
  let updated = 0;
  for (const k of parsed.articles) {
    const prev = byIdart.get(k.idart) || k.eans.map((e) => byEan.get(e)).find(Boolean);
    const links = k.suppliers.map((s) => {
      const id = supplierId(s.supplierName);
      const old = prev?.suppliers?.find((x) => x.supplierId === id);
      return {
        supplierId: id,
        ref: s.ref || old?.ref || null,
        netPrice: old?.pricelistId ? old.netPrice : s.netPrice,
        packSize: s.packSize,
        rank: s.rank,
        ...(old?.pricelistId ? { pricelistId: old.pricelistId } : {}),
      };
    });
    const codes = [
      { type: 'caisse', value: k.idart },
      ...k.eans.slice(1).map((v) => ({ type: 'ean', value: v })),
      ...(prev?.codes || []).filter((c) => c.type !== 'caisse'),
    ];
    const article = {
      ...(prev || {}),
      id: prev?.id || newId(),
      label: k.label || prev?.label || '(sans désignation)',
      ean: k.eans[0] || prev?.ean || null,
      codes: codes.filter((c, i) => codes.findIndex((x) => x.type === c.type && x.value === c.value) === i),
      department: k.department,
      vatRateBp: k.vatRateBp || 2000,
      salePrice: k.salePrice,
      pmpa: k.pmpa,
      purchasePrice: prev?.purchasePrice ?? (links.find((l) => l.rank === 0)?.netPrice || null),
      suppliers: links,
      stockTracked: k.stockTracked,
      stockMin: k.stockMin,
      stockMax: k.stockMax,
      active: true,
      kezia: { rawLines: k.rawLines },
      updatedAt: now.toISOString(),
    };
    out.set(article.id, article);
    prev ? updated++ : created++;
  }
  return { articles: [...out.values()], suppliers: sup.sort((a, b) => a.name.localeCompare(b.name, 'fr')), created, updated };
}

const price = (c) => (c === null || c === undefined ? 0 : Math.round(c) / 100);

/**
 * Lignes d'un fichier à réimporter dans Kezia (outil Import / Export Excel, Articles, par IDART).
 * Une ligne par fournisseur de l'article, comme l'export. `updatePmpa` : PMPA remplacé par le prix
 * d'achat de la grille (à ne cocher qu'à la reprise : ensuite Kezia recalcule le PMPA à chaque réception).
 */
export function toKeziaRows(articles, suppliers, { updatePmpa = false } = {}) {
  const names = new Map(suppliers.map((s) => [s.id, s.name]));
  const rows = [KEZIA_COLUMNS];
  for (const a of articles) {
    const links = [...(a.suppliers || [])].sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0));
    const raws = a.kezia?.rawLines || [];
    (links.length ? links : [null]).forEach((link, i) => {
      const base = { ...(raws.find((r) => link && fold(r.NOM_FOURNISSEUR) === fold(names.get(link.supplierId))) || raws[i] || raws[0] || {}) };
      const v = {
        ...base,
        IDART: codeOf(a, 'caisse') ? Number(codeOf(a, 'caisse')) : '',
        NOM_FOURNISSEUR: link ? names.get(link.supplierId) || '' : '',
        REFERENCE_FOURNISSEUR: link?.ref || '',
        EAN: a.ean || '',
        DEF: a.label,
        RAYON: a.department || '',
        PRIX_TTC: price(a.salePrice),
        TAUX_TVA_VENTE: (a.vatRateBp ?? 2000) / 100,
        PU_TARIF_FOU: price(link?.netPrice),
        CDTV: link?.packSize || base.CDTV || 1,
        GES_STOCK: a.stockTracked ? 1 : 0,
        QTE_MINI: a.stockMin || 0,
        QTE_MAXI: a.stockMax || 0,
      };
      if (updatePmpa && a.purchasePrice) v.PMPA = price(a.purchasePrice);
      else if (!('PMPA' in base)) v.PMPA = price(a.pmpa);
      rows.push(KEZIA_COLUMNS.map((c) => (c in v ? v[c] : ['TYP_FRAIS', 'COLISAGE'].includes(c) ? 1 : '')));
    });
  }
  return rows;
}
