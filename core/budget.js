/**
 * Budget de l'exercice (company.budget[début d'exercice] = { rubrique: montant annuel en centimes }) :
 * comparé au réalisé du grand livre et à ce qui était prévu à date (budget au prorata des jours écoulés).
 */

import { divRound, sum } from './money.js?v=269c883';

/** Rubriques du budget : comptes du compte de résultat regroupés en langage courant. */
export const BUDGET_LINES = [
  { key: 'ca', label: 'Chiffre d’affaires', prefixes: ['70'], income: true },
  { key: 'autresProduits', label: 'Autres produits', prefixes: ['71', '72', '74', '75', '76', '77'], income: true },
  { key: 'achats', label: 'Achats et marchandises', prefixes: ['60'] },
  { key: 'externes', label: 'Charges externes (loyer, honoraires, logiciels…)', prefixes: ['61', '62'] },
  { key: 'impots', label: 'Impôts et taxes', prefixes: ['63'] },
  { key: 'personnel', label: 'Salaires et cotisations', prefixes: ['64'] },
  { key: 'autresCharges', label: 'Autres charges (intérêts, amortissements…)', prefixes: ['65', '66', '67', '68'] },
];

const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;

/** Réalisé de chaque rubrique sur l'exercice jusqu'à `today` (produits et charges en positif). */
export function budgetActuals(ledger, { start, end }, today) {
  const to = today < end ? today : end;
  const lines = ledger.lines({ from: start, to }).filter((l) => l.entry.source?.kind !== 'closing-result');
  const out = {};
  for (const b of BUDGET_LINES) {
    const net = sum(lines.filter((l) => b.prefixes.some((p) => l.account.startsWith(p))).map((l) => l.debit - l.credit));
    out[b.key] = b.income ? -net : net;
  }
  return out;
}

/**
 * Comparaison budget / réalisé.
 * @returns {{ rows: { key, label, income, budget, actual, expected, pct }[], result: { budget, actual, expected }, elapsedPct }}
 */
export function budgetReport(ledger, fiscalYear, budget = {}, today) {
  const total = days(fiscalYear.start, fiscalYear.end);
  const elapsed = Math.max(0, Math.min(total, days(fiscalYear.start, today < fiscalYear.end ? today : fiscalYear.end)));
  const actuals = budgetActuals(ledger, fiscalYear, today);
  const rows = BUDGET_LINES.map((b) => {
    const amount = Math.max(0, Math.trunc(Number(budget[b.key]) || 0));
    return {
      key: b.key,
      label: b.label,
      income: Boolean(b.income),
      budget: amount,
      actual: actuals[b.key],
      expected: divRound(amount * elapsed, total),
      pct: amount ? Math.round((actuals[b.key] * 100) / amount) : null,
    };
  });
  const signed = (k) => sum(rows.map((r) => (r.income ? r[k] : -r[k])));
  return {
    rows,
    result: { budget: signed('budget'), actual: signed('actual'), expected: signed('expected') },
    elapsedPct: Math.round((elapsed * 100) / total),
  };
}

/** Budget saisi (texte en euros par rubrique) → centimes ; erreur lisible si un montant est illisible. */
export function parseBudget(form) {
  const out = {};
  for (const b of BUDGET_LINES) {
    const raw = String(form[b.key] ?? '')
      .replace(/[\s\u00a0\u202f€]/g, '')
      .replace(',', '.');
    if (!raw) continue;
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error(`${b.label} : montant illisible (exemple : 45000 ou 45 000,50).`);
    out[b.key] = Math.round(Number(raw) * 100);
  }
  return out;
}
