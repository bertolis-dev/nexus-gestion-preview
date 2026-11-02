/**
 * Stock des articles et propositions de prix, saisis en magasin (scan). Un COMPTAGE donne la quantité
 * trouvée en rayon : le stock repart de là. Les entrées, sorties et corrections s'ajoutent ensuite.
 * Les ventes de la caisse ne sont pas déduites ici (la caisse tient ses ventes) : le stock Nexus est
 * celui constaté, utile pour l'inventaire, la valorisation et les alertes de réapprovisionnement.
 */

import { isCalendarDate } from '../dates.js?v=a619ec1';
import { divRound } from '../money.js?v=a619ec1';
import { purchaseOf } from './articles.js?v=a619ec1';

export class StockError extends Error {}

export const MOVE_KINDS = { comptage: 'Comptage', entree: 'Entrée', sortie: 'Sortie', correction: 'Correction' };

const qty3 = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : NaN;
};

/** Mouvement contrôlé. Comptage : quantité trouvée (≥ 0) ; sortie : saisie positive, enregistrée en négatif. */
export function stockMove({ articleId, date, kind, qty, note }, { newId, now = new Date() } = {}) {
  if (!articleId) throw new StockError('Choisissez l’article.');
  if (!isCalendarDate(date)) throw new StockError('Date invalide.');
  if (!MOVE_KINDS[kind]) throw new StockError('Type de mouvement inconnu.');
  let q = qty3(qty);
  if (!Number.isFinite(q) || Math.abs(q) > 1e6) throw new StockError('Quantité illisible (3 décimales au plus).');
  if (kind === 'comptage' && q < 0) throw new StockError('Un comptage ne peut pas être négatif.');
  if (kind !== 'comptage' && q === 0) throw new StockError('Indiquez une quantité.');
  if (kind === 'sortie') q = -Math.abs(q);
  if (kind === 'entree') q = Math.abs(q);
  return {
    id: newId(),
    articleId,
    date,
    kind,
    qty: q,
    note:
      String(note || '')
        .trim()
        .slice(0, 200) || null,
    createdAt: now.toISOString(),
  };
}

const byTime = (a, b) => a.date.localeCompare(b.date) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));

/** Stock d'un article : dernier comptage + mouvements postérieurs ; null s'il n'a jamais été compté ni mouvementé. */
export function stockOf(moves, articleId) {
  const list = moves.filter((m) => m.articleId === articleId).sort(byTime);
  if (!list.length) return { level: null, lastCount: null, moves: 0 };
  let level = 0;
  let lastCount = null;
  for (const m of list) {
    if (m.kind === 'comptage') {
      level = m.qty;
      lastCount = m.date;
    } else level += m.qty;
  }
  return { level: Math.round(level * 1000) / 1000, lastCount, moves: list.length };
}

/** Niveaux de stock de tous les articles (Map id → résultat de stockOf). */
export function stockLevels(moves) {
  const ids = new Set(moves.map((m) => m.articleId));
  return new Map([...ids].map((id) => [id, stockOf(moves, id)]));
}

/** Valeur du stock au prix d'achat (centimes) et articles sous le seuil minimal. */
export function stockSummary(articles, moves) {
  const levels = stockLevels(moves);
  let value = 0;
  let counted = 0;
  const low = [];
  for (const a of articles) {
    const s = levels.get(a.id);
    if (!s || s.level === null) continue;
    counted++;
    const p = purchaseOf(a);
    if (p && s.level > 0) value += divRound(Math.round(s.level * 1000) * p, 1000);
    if (a.stockMin !== null && a.stockMin !== undefined && s.level <= a.stockMin) low.push({ article: a, level: s.level });
  }
  return { counted, value, low };
}

/** Proposition de nouveau prix de vente TTC, à valider par le dirigeant. */
export function priceProposal(article, proposed, { reason, newId, now = new Date() } = {}) {
  if (!Number.isSafeInteger(proposed) || proposed <= 0) throw new StockError('Prix proposé illisible.');
  if (proposed === article.salePrice) throw new StockError('C’est déjà le prix de vente actuel.');
  return {
    id: newId(),
    articleId: article.id,
    current: article.salePrice ?? null,
    proposed,
    reason:
      String(reason || '')
        .trim()
        .slice(0, 300) || null,
    status: 'proposee',
    proposedAt: now.toISOString(),
  };
}
