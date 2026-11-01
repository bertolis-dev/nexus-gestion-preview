/**
 * Stock simple des articles du catalogue suivis en stock (item.tracked) : stock de départ, entrées et
 * corrections saisies (company.stockMoves), moins les quantités vendues sur les factures émises
 * (rapprochées par la désignation de l'article), plus les retours sur avoir.
 */

import { sum } from './money.js?v=e821f3b';

const key = (label) =>
  String(label || '')
    .trim()
    .toLocaleLowerCase('fr');

export class StockError extends Error {}

/** Quantités vendues par article (désignation), factures émises moins avoirs ; devis exclus. */
export function soldQuantities(invoices) {
  const sold = new Map();
  for (const inv of invoices) {
    if (inv.status !== 'issued' || inv.type === 'quote') continue;
    const sign = inv.type === 'credit' ? -1 : 1;
    for (const l of inv.lines || []) sold.set(key(l.label), (sold.get(key(l.label)) || 0) + sign * Number(l.qty || 0));
  }
  return sold;
}

/** État du stock de chaque article suivi : { item, initial, moves, sold, level, low }. */
export function stockLevels(catalog = [], moves = [], invoices = []) {
  const sold = soldQuantities(invoices);
  return catalog
    .filter((i) => i.tracked)
    .map((item) => {
      const moved = sum(moves.filter((m) => m.itemId === item.id).map((m) => Math.round(m.qty * 1000))) / 1000;
      const out = Math.round((sold.get(key(item.label)) || 0) * 1000) / 1000;
      const level = Math.round((Number(item.stockInitial || 0) + moved - out) * 1000) / 1000;
      return { item, initial: Number(item.stockInitial || 0), moves: moved, sold: out, level, low: item.stockAlert != null && level <= item.stockAlert };
    });
}

/** Mouvement de stock saisi (entrée de marchandise, casse, inventaire). */
export function stockMove({ id, date, itemId, qty, reason }) {
  const q = Number(String(qty).replace(',', '.'));
  if (!itemId) throw new StockError('Choisissez l’article.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new StockError('Indiquez la date.');
  if (!Number.isFinite(q) || q === 0 || Math.abs(q) > 1e6 || Math.round(q * 1000) !== q * 1000)
    throw new StockError('Quantité illisible : un nombre positif pour une entrée, négatif pour une sortie (3 décimales au plus).');
  return {
    id,
    date,
    itemId,
    qty: q,
    reason:
      String(reason || '')
        .trim()
        .slice(0, 120) || (q > 0 ? 'Entrée en stock' : 'Sortie de stock'),
  };
}
