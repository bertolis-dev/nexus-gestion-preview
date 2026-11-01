/**
 * Catalogue des prestations et articles (company.catalog) : désignation, prix unitaire HT en
 * centimes, taux de TVA et nature, proposés pendant la saisie d'une ligne de facture ou de devis.
 */

const key = (label) =>
  String(label || '')
    .trim()
    .toLocaleLowerCase('fr');

export class CatalogError extends Error {}

/** Ajoute (ou remplace, même désignation) une prestation ; renvoie le nouveau catalogue trié. */
export function saveCatalogItem(catalog = [], { id, label, unitPrice, vatRateBp, nature = 'services', tracked = false, stockInitial = 0, stockAlert = null }) {
  const name = String(label || '').trim();
  if (!name) throw new CatalogError('Indiquez la désignation de la prestation.');
  if (name.length > 200) throw new CatalogError('Désignation trop longue (200 caractères au plus).');
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) throw new CatalogError('Prix unitaire illisible (exemple : 1 234,56).');
  if (!Number.isInteger(vatRateBp) || vatRateBp < 0 || vatRateBp > 10000) throw new CatalogError('Taux de TVA invalide.');
  const item = {
    id: id || `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label: name,
    unitPrice,
    vatRateBp,
    nature: nature === 'biens' ? 'biens' : 'services',
  };
  // Article suivi en stock (core/stock.js) : stock de départ et seuil d'alerte facultatif.
  if (tracked) {
    const qty = (v) => Number(String(v ?? '').replace(',', '.'));
    if (!Number.isFinite(qty(stockInitial)) || qty(stockInitial) < 0) throw new CatalogError('Stock de départ illisible.');
    if (stockAlert !== null && stockAlert !== '' && (!Number.isFinite(qty(stockAlert)) || qty(stockAlert) < 0))
      throw new CatalogError('Seuil d’alerte illisible.');
    Object.assign(item, { tracked: true, stockInitial: qty(stockInitial), stockAlert: stockAlert === null || stockAlert === '' ? null : qty(stockAlert) });
  }
  const rest = catalog.filter((c) => c.id !== item.id && key(c.label) !== key(name));
  return [...rest, item].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

export const removeCatalogItem = (catalog = [], id) => catalog.filter((c) => c.id !== id);

/** Prestation dont la désignation correspond exactement (casse et espaces ignorés), ou null. */
export function findCatalogItem(catalog = [], label) {
  const k = key(label);
  return (k && catalog.find((c) => key(c.label) === k)) || null;
}
