/**
 * Simulateur salaire ou dividendes du dirigeant de société à l'IS : pour un bénéfice avant
 * rémunération, compare ce qui reste au dirigeant selon la part versée en rémunération, le reste
 * étant soumis à l'impôt sur les sociétés puis distribué en dividendes. Estimation simplifiée par taux
 * moyens (modifiables), qui ne remplace pas le calcul de l'expert-comptable.
 */

import { divRound } from './money.js?v=a619ec1';

/**
 * Taux moyens par défaut (2026), à faire valider (docs/regles-a-valider.md) :
 *  - président de SAS/SASU (assimilé salarié) : cotisations patronales et salariales ≈ 82 % du net ;
 *  - gérant majoritaire de SARL/EURL (indépendant) : cotisations ≈ 45 % du net ;
 *  - IS : 15 % jusqu'à 42 500 € de bénéfice, 25 % au-delà (taux réduit des PME) ;
 *  - dividendes : prélèvement forfaitaire unique de 31,4 % (12,8 % d'impôt + 18,6 % de prélèvements sociaux) ;
 *    gérant majoritaire : la part au-delà de 10 % du capital supporte les cotisations d'indépendant (≈ 40 %)
 *    et 12,8 % d'impôt au lieu des prélèvements sociaux ;
 *  - impôt sur le revenu du salaire : taux moyen choisi par l'utilisateur (11 % par défaut).
 */
export const REMUNERATION_DEFAULTS = {
  assimileSalariePct: 82,
  independantPct: 45,
  isReducedLimit: 4250000,
  isReducedPct: 15,
  isNormalPct: 25,
  pfuPct: 31.4,
  pfuIncomeTaxPct: 12.8,
  independantDividendPct: 40,
  salaryIncomeTaxPct: 11,
};

/** Statut social du dirigeant d'après la forme juridique : SAS/SASU → assimilé salarié, sinon indépendant. */
export const isAssimileSalarie = (legalForm) => /^SAS/i.test(String(legalForm || ''));

export function corporateTax(profit, p = REMUNERATION_DEFAULTS) {
  if (profit <= 0) return 0;
  const reduced = Math.min(profit, p.isReducedLimit);
  return divRound(reduced * p.isReducedPct, 100) + divRound((profit - reduced) * p.isNormalPct, 100);
}

/**
 * Un scénario : `costShare` (0-100) du bénéfice consacré à la rémunération (coût total, cotisations comprises).
 * @returns {{ costShare, cost, contributions, netSalary, salaryTax, profitAfterPay, corporateTax, dividends, dividendTax, inPocket }}
 */
export function scenario({ profit, legalForm, capital = 0, costShare }, p = REMUNERATION_DEFAULTS) {
  const salarie = isAssimileSalarie(legalForm);
  const rate = salarie ? p.assimileSalariePct : p.independantPct;
  const cost = divRound(Math.max(0, profit) * costShare, 100);
  const netSalary = divRound(cost * 100, 100 + rate);
  const contributions = cost - netSalary;
  const salaryTax = divRound(netSalary * p.salaryIncomeTaxPct, 100);
  const profitAfterPay = profit - cost;
  const is = corporateTax(profitAfterPay, p);
  const dividends = Math.max(0, profitAfterPay - is);
  let dividendTax;
  if (salarie) dividendTax = divRound(dividends * Math.round(p.pfuPct * 10), 1000);
  else {
    // Gérant majoritaire : au-delà de 10 % du capital, cotisations d'indépendant et impôt à 12,8 %.
    const free = Math.min(dividends, divRound(Math.max(0, capital) * 10, 100));
    const over = dividends - free;
    dividendTax = divRound(free * Math.round(p.pfuPct * 10), 1000) + divRound(over * Math.round(p.independantDividendPct * 10 + p.pfuIncomeTaxPct * 10), 1000);
  }
  return {
    costShare,
    cost,
    contributions,
    netSalary,
    salaryTax,
    profitAfterPay,
    corporateTax: is,
    dividends,
    dividendTax,
    inPocket: netSalary - salaryTax + dividends - dividendTax,
  };
}

/** Scénarios de 0 à 100 % de rémunération (pas de 25 %), et le meilleur. */
export function compareScenarios({ profit, legalForm, capital }, p = REMUNERATION_DEFAULTS) {
  const list = [0, 25, 50, 75, 100].map((costShare) => scenario({ profit, legalForm, capital, costShare }, p));
  const best = list.reduce((a, b) => (b.inPocket > a.inPocket ? b : a));
  return { list, best, assimileSalarie: isAssimileSalarie(legalForm) };
}

/** Capital social saisi en texte (« 1 000 € ») → centimes ; 0 si illisible. */
export function capitalCents(text) {
  const n = Number(
    String(text || '')
      .replace(/[^\d,.]/g, '')
      .replace(',', '.'),
  );
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
