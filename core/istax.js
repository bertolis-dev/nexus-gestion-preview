/**
 * Échéancier de l'impôt sur les sociétés pour la trésorerie prévisionnelle (CGI art. 1668) : acomptes
 * trimestriels de l'exercice en cours, solde de l'exercice clos, et solde estimé de l'exercice terminé
 * mais pas encore clôturé. Les versements déjà faits (compte 444) sont imputés dans l'ordre des échéances.
 */

import { divRound, sum } from './money.js?v=3bfbbd4';

/**
 * Paramètres 2026, à faire valider par l'expert-comptable (docs/regles-a-valider.md) :
 *  - acomptes le 15 mars, juin, septembre et décembre, ceux qui tombent pendant l'exercice ;
 *  - chacun 25 % de l'impôt du dernier exercice clos ; aucun acompte si cet impôt est inférieur à
 *    3 000 € (ni pour le premier exercice) ;
 *  - solde le 15 du 4ᵉ mois suivant la clôture, le 15 mai pour un exercice clos le 31 décembre.
 */
export const IS_SCHEDULE_2026 = {
  advanceDates: ['03-15', '06-15', '09-15', '12-15'],
  advanceSharePct: 25,
  minTaxForAdvances: 300000,
  balanceDay: 15,
  balanceMonthsAfterEnd: 4,
  balanceDateDecember: '05-15',
};

const P = IS_SCHEDULE_2026;

/** Échéance du solde d'un exercice clos le `end`. */
export function balanceDueDate(end) {
  const [y, m] = end.split('-').map(Number);
  if (end.slice(5) === '12-31') return `${y + 1}-${P.balanceDateDecember}`;
  const month = m + P.balanceMonthsAfterEnd;
  const yy = y + Math.floor((month - 1) / 12);
  const mm = ((month - 1) % 12) + 1;
  return `${yy}-${String(mm).padStart(2, '0')}-${String(P.balanceDay).padStart(2, '0')}`;
}

/** Dates d'acompte qui tombent pendant l'exercice. */
function advanceDates({ start, end }) {
  const out = [];
  for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
    for (const md of P.advanceDates) {
      const d = `${y}-${md}`;
      if (d >= start && d <= end) out.push(d);
    }
  }
  return out;
}

const dayAfter = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

const isTaxEntry = (e) => e.source?.kind === 'inventory' && e.source.type === 'corporate-tax';

/**
 * @returns {{ date, label, amount }[]} sorties à venir (montants négatifs, en centimes), à partir de
 *   `today`, pour une société à l'IS ; [] sinon.
 */
export function corporateTaxSchedule(ws, today) {
  if (ws.company.taxRegime !== 'is-reel') return [];
  const fy = ws.company.fiscalYear;
  const last = (ws.archives || []).at(-1);
  const obligations = [];
  if (last) {
    const entries = last.ledger.entries || [];
    const refTax = sum(entries.filter(isTaxEntry).flatMap((e) => e.lines.filter((l) => l.account.startsWith('695')).map((l) => l.debit - l.credit)));
    // Solde de l'exercice clos : ce qui reste dû au compte 444 à sa clôture.
    const due = sum(entries.flatMap((e) => e.lines.filter((l) => l.account === '444000').map((l) => l.credit - l.debit)));
    if (due > 0)
      obligations.push({
        date: balanceDueDate(last.fiscalYear.end),
        label: `Solde de l'impôt sur les sociétés ${last.fiscalYear.end.slice(0, 4)}`,
        amount: due,
      });
    if (refTax >= P.minTaxForAdvances) {
      // Exercice terminé mais pas encore clôturé : les acomptes du nouvel exercice courent déjà, sur la
      // base du dernier impôt connu.
      const next = { start: dayAfter(fy.end), end: `${Number(fy.end.slice(0, 4)) + 1}${fy.end.slice(4)}` };
      const dates = [...advanceDates(fy), ...(fy.end < today ? advanceDates(next) : [])];
      const part = divRound(refTax * P.advanceSharePct, 100);
      dates.forEach((date, i) =>
        obligations.push({
          date,
          label: `Acompte d'impôt sur les sociétés (${(i % 4) + 1}/4)`,
          amount: i % 4 === 3 ? refTax - part * 3 : part,
        }),
      );
    }
  }
  // Versements de l'exercice en cours (hors impôt comptabilisé à la clôture et à-nouveaux).
  const lines = ws.ledger.entries.filter((e) => !isTaxEntry(e) && e.source?.kind !== 'opening').flatMap((e) => e.lines);
  const paidThisYear = sum(lines.filter((l) => l.account === '444000').map((l) => l.debit - l.credit));
  // Exercice terminé mais pas encore clôturé : son solde est estimé d'après le résultat actuel.
  if (fy.end < today) {
    // Versements de l'exercice moins le solde de l'exercice précédent : acomptes de cet exercice.
    const previousBalance = sum(obligations.filter((o) => o.label.startsWith('Solde')).map((o) => o.amount));
    const advancesPaid = Math.max(0, paidThisYear - previousBalance);
    const estimate = ws.computeCorporateTax().tax - advancesPaid;
    if (estimate > 0)
      obligations.push({
        date: balanceDueDate(fy.end),
        label: `Solde de l'impôt sur les sociétés ${fy.end.slice(0, 4)} (estimation)`,
        amount: estimate,
        estimate: true,
      });
  }
  obligations.sort((a, b) => a.date.localeCompare(b.date));
  let paid = paidThisYear;
  const out = [];
  for (const o of obligations) {
    if (o.estimate) {
      if (o.date >= today) out.push({ date: o.date, label: o.label, amount: -o.amount });
      continue;
    }
    const covered = Math.min(paid, o.amount);
    paid -= covered;
    const left = o.amount - covered;
    if (left > 0 && o.date >= today) out.push({ date: o.date, label: o.label, amount: -left });
  }
  return out;
}
