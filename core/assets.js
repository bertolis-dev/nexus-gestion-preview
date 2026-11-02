/**
 * Registre des immobilisations (§3.3) : les achats d'équipement au-delà du seuil (500 € HT par
 * défaut) sont inscrits en compte de classe 2 à l'enregistrement de la dépense (purchases.js) ;
 * ce module en dresse la liste et le plan d'amortissement linéaire.
 *
 * Amortissement linéaire au prorata des jours (à valider par l'expert-comptable, voir
 * docs/regles-a-valider.md) : l'amortissement cumulé à une date est le coût × jours écoulés depuis la
 * mise en service / (durée × 365), plafonné au coût. La dotation d'un exercice est l'écart de cumul
 * entre sa fin et la veille de son début : exercice décalé, de 18 mois ou raccourci compris, sans
 * dérive d'arrondi (le total des dotations égale exactement le coût).
 */

import { divRound, sum, vatFromHt } from './money.js?v=269c883';
import { categoryById } from './pcg.js?v=269c883';
import { addDays } from './dates.js?v=269c883';

/** Durées d'usage courantes, à confirmer par l'expert-comptable. */
export const DEFAULT_YEARS = { 205000: 1, 215400: 5, 218200: 5, 218300: 3, 218400: 10 };

export const DEPRECIATION_ACCOUNT = { 205000: '280500', 215400: '281540', 218200: '281820', 218300: '281830', 218400: '281840' };

/** Seuil d'immobilisation par défaut (500 € HT), modifiable par l'entreprise. */
export const DEFAULT_FIXED_ASSET_THRESHOLD = 50000;

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const norm = (s) =>
  String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** Amortissement cumulé d'un bien à une date (incluse). */
export function cumulativeDepreciation({ cost, startDate, years }, date) {
  if (date < startDate) return 0;
  const days = daysBetween(startDate, date) + 1;
  return Math.min(cost, divRound(cost * days, years * 365));
}

/**
 * Coût d'acquisition d'une ligne : HT, plus la TVA non récupérable (PCG art. 213-8). En franchise de
 * TVA, rien n'est récupérable : le bien est inscrit TTC.
 */
const isReverse = (p) => (p.supplier.country || 'FR') !== 'FR' || !!p.reverseCharge;

function lineCost(l, cat, company, reverse = false) {
  // TVA de la ligne telle qu'enregistrée (saisie TTC : HT + TVA redonne le montant tapé), comme purchaseEntry ;
  // en autoliquidation, la TVA calculée sur le HT (20 % sans taux précisé).
  const vat = reverse ? vatFromHt(l.ht, l.vatRateBp ?? 2000) : Number.isSafeInteger(l.vat) ? l.vat : divRound(l.ht * (l.vatRateBp || 0), 10000);
  const deductiblePct = company.vatRegime === 'franchise' ? 0 : cat.vatDeductiblePct;
  return l.ht + divRound(vat * (100 - deductiblePct), 100);
}

/** Exercices successifs couvrant la vie d'un bien, calés sur les dates de l'exercice en cours. */
function fiscalPeriods(fiscalYear, fromDate, fullyDepreciated) {
  const [ey, em, ed] = fiscalYear.end.split('-').map(Number);
  const endOfYear = (k) => {
    // Fin d'exercice k années après celle de l'exercice en cours (le 29/02 suit les années bissextiles).
    const lastDay = new Date(Date.UTC(ey + k, em, 0)).getUTCDate();
    return `${ey + k}-${String(em).padStart(2, '0')}-${String(Math.min(ed, lastDay)).padStart(2, '0')}`;
  };
  let k = 0;
  while (endOfYear(k - 1) >= fromDate) k -= 1;
  const out = [];
  for (let guard = 0; guard < 80; guard++, k++) {
    const end = k === 0 ? fiscalYear.end : endOfYear(k);
    const start = k === 0 ? fiscalYear.start : addDays(endOfYear(k - 1), 1);
    out.push({ start, end });
    if (fullyDepreciated(end)) break;
  }
  return out;
}

/**
 * @param {object[]} purchases dépenses du Workspace
 * @param {{ assetYears?: Record<string, number>, fixedAssetThreshold?: number, vatRegime?: string }} company
 * @param {{ start: string, end: string }} fiscalYear exercice pour la dotation affichée
 */
export function fixedAssets(purchases, company, fiscalYear) {
  const threshold = company.fixedAssetThreshold ?? DEFAULT_FIXED_ASSET_THRESHOLD;
  const assets = [];
  for (const p of purchases) {
    if (p.type === 'credit') continue;
    p.lines.forEach((l, i) => {
      const cat = categoryById(l.categoryId);
      if (!cat.fixedAsset || l.ht < threshold) return;
      const id = `${p.id}#${i}`;
      assets.push({
        id,
        purchaseId: p.id,
        supplier: norm(p.supplier.name),
        categoryId: l.categoryId,
        label: `${cat.label} — ${p.supplier.name}${p.number ? ` ${p.number}` : ''}`,
        date: p.date,
        account: cat.account,
        depreciationAccount: DEPRECIATION_ACCOUNT[cat.account],
        cost: lineCost(l, cat, company, isReverse(p)),
        years: company.assetYears?.[id] || DEFAULT_YEARS[cat.account] || 5,
      });
    });
  }
  // Avoir fournisseur sur un équipement : il diminue le coût du bien d'origine (même fournisseur,
  // même catégorie, le plus récent acheté avant l'avoir) au lieu de créer un bien fantôme.
  for (const p of purchases) {
    if (p.type !== 'credit') continue;
    for (const l of p.lines) {
      const cat = categoryById(l.categoryId);
      if (!cat.fixedAsset) continue;
      const target = assets.filter((a) => a.supplier === norm(p.supplier.name) && a.categoryId === l.categoryId && a.date <= p.date).at(-1);
      if (target) target.cost = Math.max(0, target.cost - lineCost(l, cat, company, isReverse(p)));
    }
  }
  const dayBefore = addDays(fiscalYear.start, -1);
  return assets
    .filter((a) => a.cost > 0)
    .map(({ supplier: _s, categoryId: _c, ...a }) => {
      const plan = { cost: a.cost, startDate: a.date, years: a.years };
      const cumEnd = cumulativeDepreciation(plan, fiscalYear.end);
      const schedule = fiscalPeriods(fiscalYear, a.date, (end) => cumulativeDepreciation(plan, end) >= a.cost).map(({ start, end }) => {
        const cum = cumulativeDepreciation(plan, end);
        const year = start.slice(0, 4) === end.slice(0, 4) ? end.slice(0, 4) : `${start.slice(0, 4)}-${end.slice(0, 4)}`;
        return { year, start, end, dotation: cum - cumulativeDepreciation(plan, addDays(start, -1)), vnc: a.cost - cum };
      });
      return { ...a, schedule, dotationThisYear: cumEnd - cumulativeDepreciation(plan, dayBefore), netBookValue: a.cost - cumEnd };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Un avoir fournisseur sur un équipement vise-t-il un bien du registre (sinon : simple charge) ? */
export function creditTargetsAsset(purchases, company, { supplierName, categoryId, date }) {
  const threshold = company.fixedAssetThreshold ?? DEFAULT_FIXED_ASSET_THRESHOLD;
  return purchases.some(
    (p) =>
      p.type !== 'credit' &&
      norm(p.supplier.name) === norm(supplierName) &&
      p.date <= date &&
      p.lines.some((l) => l.categoryId === categoryId && l.ht >= threshold),
  );
}

/**
 * Contrôle croisé du registre et du grand livre : pour chaque compte d'immobilisation, coût inscrit au
 * registre (biens acquis sur l'exercice) contre mouvements du compte hors à-nouveaux. Renvoie les écarts.
 */
export function assetsCrossCheck(ws) {
  const fy = ws.ledger.fiscalYear;
  const inYear = fixedAssets(
    ws.purchases.filter((p) => p.date >= fy.start && p.date <= fy.end),
    ws.company,
    fy,
  );
  const accounts = new Set([...inYear.map((a) => a.account), ...Object.keys(DEFAULT_YEARS)]);
  const gaps = [];
  for (const account of accounts) {
    const register = sum(inYear.filter((a) => a.account === account).map((a) => a.cost));
    const ledger = sum(
      ws.ledger
        .lines()
        .filter((l) => l.account === account && l.entry.journal !== 'AN')
        .map((l) => l.debit - l.credit),
    );
    if (register !== ledger) gaps.push({ account, register, ledger });
  }
  return gaps;
}
