/**
 * États financiers au format PCG simplifié (rubriques de la liasse 2033-A / 2033-B) : compte de
 * résultat et bilan. Correspondance compte → rubrique à faire valider par l'expert-comptable
 * (docs/regles-a-valider.md). Utilisé par la clôture (core/closing.js).
 */

import { sum } from './money.js?v=d415f7a';

/** Soldes (débit − crédit) par compte, hors écritures de détermination du résultat. */
export function balancesOf(ledger) {
  const out = new Map();
  for (const l of ledger.lines()) {
    if (l.entry.source?.kind === 'closing-result') continue;
    out.set(l.account, (out.get(l.account) || 0) + l.debit - l.credit);
  }
  return out;
}

/**
 * Rubriques du compte de résultat (esprit du 2033-B) : [préfixe, groupe, rubrique]. Chaque compte de
 * classe 6 ou 7 est rangé dans la rubrique du préfixe LE PLUS LONG qui lui correspond ; un compte que
 * rien ne décrit tombe dans « Autres charges » ou « Autres produits ». Aucun compte n'est ignoré : le
 * résultat est toujours égal à −Σ(classes 6 et 7).
 */
const PNL_RULES = [
  // Produits d'exploitation
  ['707', 'opIncome', 'Ventes de marchandises'],
  ['7097', 'opIncome', 'Ventes de marchandises'],
  ['701', 'opIncome', 'Production vendue (biens)'],
  ['702', 'opIncome', 'Production vendue (biens)'],
  ['703', 'opIncome', 'Production vendue (biens)'],
  ['7091', 'opIncome', 'Production vendue (biens)'],
  ['7092', 'opIncome', 'Production vendue (biens)'],
  ['7093', 'opIncome', 'Production vendue (biens)'],
  ['704', 'opIncome', 'Production vendue (services)'],
  ['705', 'opIncome', 'Production vendue (services)'],
  ['706', 'opIncome', 'Production vendue (services)'],
  ['708', 'opIncome', 'Production vendue (services)'],
  ['709', 'opIncome', 'Production vendue (services)'],
  ['71', 'opIncome', 'Production stockée'],
  ['72', 'opIncome', 'Production immobilisée'],
  ['74', 'opIncome', 'Subventions d’exploitation'],
  ['781', 'opIncome', 'Reprises sur amortissements et provisions, transferts de charges'],
  ['791', 'opIncome', 'Reprises sur amortissements et provisions, transferts de charges'],
  ['75', 'opIncome', 'Autres produits'],
  ['7', 'opIncome', 'Autres produits'],
  // Charges d'exploitation
  ['607', 'opCharges', 'Achats de marchandises'],
  ['6037', 'opCharges', 'Variation de stock (marchandises)'],
  ['601', 'opCharges', 'Achats de matières premières'],
  ['602', 'opCharges', 'Achats de matières premières'],
  ['6031', 'opCharges', 'Variation de stock (matières premières)'],
  ['6032', 'opCharges', 'Variation de stock (matières premières)'],
  ['60', 'opCharges', 'Autres achats et charges externes'],
  ['61', 'opCharges', 'Autres achats et charges externes'],
  ['62', 'opCharges', 'Autres achats et charges externes'],
  ['63', 'opCharges', 'Impôts, taxes et versements assimilés'],
  ['641', 'opCharges', 'Salaires et traitements'],
  ['642', 'opCharges', 'Salaires et traitements'],
  ['643', 'opCharges', 'Salaires et traitements'],
  ['644', 'opCharges', 'Salaires et traitements'],
  ['645', 'opCharges', 'Charges sociales'],
  ['646', 'opCharges', 'Charges sociales'],
  ['647', 'opCharges', 'Charges sociales'],
  ['648', 'opCharges', 'Charges sociales'],
  ['6811', 'opCharges', 'Dotations aux amortissements'],
  ['6812', 'opCharges', 'Dotations aux amortissements'],
  ['681', 'opCharges', 'Dotations aux provisions'],
  ['65', 'opCharges', 'Autres charges'],
  ['6', 'opCharges', 'Autres charges'],
  // Financier, exceptionnel, impôt
  ['76', 'finIncome', 'Produits financiers'],
  ['786', 'finIncome', 'Produits financiers'],
  ['796', 'finIncome', 'Produits financiers'],
  ['66', 'finCharges', 'Charges financières'],
  ['686', 'finCharges', 'Charges financières'],
  ['77', 'excIncome', 'Produits exceptionnels'],
  ['787', 'excIncome', 'Produits exceptionnels'],
  ['797', 'excIncome', 'Produits exceptionnels'],
  ['67', 'excCharges', 'Charges exceptionnelles'],
  ['687', 'excCharges', 'Charges exceptionnelles'],
  ['691', 'excCharges', 'Participation des salariés'],
  ['69', 'tax', 'Impôt sur les bénéfices'],
];
const OP_INCOME_ORDER = [
  'Ventes de marchandises',
  'Production vendue (biens)',
  'Production vendue (services)',
  'Production stockée',
  'Production immobilisée',
  'Subventions d’exploitation',
  'Reprises sur amortissements et provisions, transferts de charges',
  'Autres produits',
];
const OP_CHARGES_ORDER = [
  'Achats de marchandises',
  'Variation de stock (marchandises)',
  'Achats de matières premières',
  'Variation de stock (matières premières)',
  'Autres achats et charges externes',
  'Impôts, taxes et versements assimilés',
  'Salaires et traitements',
  'Charges sociales',
  'Dotations aux amortissements',
  'Dotations aux provisions',
  'Autres charges',
];

/** Rubrique d'un compte de classe 6 ou 7 : règle au préfixe le plus long. */
export function pnlRubric(account) {
  let best = null;
  for (const rule of PNL_RULES) if (account.startsWith(rule[0]) && (!best || rule[0].length > best[0].length)) best = rule;
  return best;
}

/** Compte de résultat simplifié (rubriques 2033-B). Produits en positif, charges en positif. */
export function incomeStatement(ledger) {
  const operatingIncome = Object.fromEntries(OP_INCOME_ORDER.map((k) => [k, 0]));
  const operatingCharges = Object.fromEntries(OP_CHARGES_ORDER.map((k) => [k, 0]));
  const groups = { finIncome: 0, finCharges: 0, excIncome: 0, excCharges: 0, tax: 0 };
  let sixSeven = 0; // Σ (crédit − débit) des classes 6 et 7, pour le contrôle final
  for (const [acc, v] of balancesOf(ledger)) {
    if (!/^[67]/.test(acc) || !v) continue;
    sixSeven -= v;
    const [, group, rubric] = pnlRubric(acc);
    if (group === 'opIncome') operatingIncome[rubric] -= v;
    else if (group === 'opCharges') operatingCharges[rubric] += v;
    else groups[group] += group.endsWith('Income') ? -v : v;
  }
  const opIncome = sum(Object.values(operatingIncome));
  const opCharges = sum(Object.values(operatingCharges));
  const operatingResult = opIncome - opCharges;
  const currentResult = operatingResult + groups.finIncome - groups.finCharges;
  const resultBeforeTax = currentResult + groups.excIncome - groups.excCharges;
  const netResult = resultBeforeTax - groups.tax;
  // Contrôle bloquant : un compte oublié ou compté deux fois fausserait le résultat, l'IS et le bilan.
  if (netResult !== sixSeven) throw new Error(`Compte de résultat incohérent (${netResult} ≠ ${sixSeven}) : contactez le support.`);
  const revenue = operatingIncome['Ventes de marchandises'] + operatingIncome['Production vendue (biens)'] + operatingIncome['Production vendue (services)'];
  return {
    operatingIncome,
    operatingCharges,
    opIncome,
    opCharges,
    operatingResult,
    financialIncome: groups.finIncome,
    financialCharges: groups.finCharges,
    currentResult,
    exceptionalIncome: groups.excIncome,
    exceptionalCharges: groups.excCharges,
    resultBeforeTax,
    incomeTax: groups.tax,
    netResult,
    revenue,
  };
}

/**
 * Règles de classement des comptes de bilan : [préfixes, rubrique si solde débiteur (actif),
 * rubrique si solde créditeur (passif)]. La première règle qui correspond s'applique ; un compte de
 * tiers va à l'actif ou au passif selon le sens de son solde (un crédit de TVA est une créance, une
 * TVA à décaisser une dette, un fournisseur débiteur une créance). Chaque compte est ainsi classé
 * une et une seule fois : le bilan est équilibré par construction.
 */
const BALANCE_RULES = [
  [['101', '104', '108'], 'Capital', 'Capital'],
  [['106'], 'Réserves', 'Réserves'],
  [['110', '119'], 'Report à nouveau', 'Report à nouveau'],
  [['120', '129'], 'Résultat antérieur en attente d’affectation', 'Résultat antérieur en attente d’affectation'],
  [['16'], 'Autres créances', 'Emprunts et dettes financières'],
  [['20', '280'], 'Immobilisations incorporelles', 'Immobilisations incorporelles'],
  [['21', '281'], 'Immobilisations corporelles', 'Immobilisations corporelles'],
  [['411', '416', '418'], 'Créances clients', 'Autres dettes'],
  [['419'], 'Autres créances', 'Autres dettes'],
  [['401', '404', '408'], 'Autres créances', 'Dettes fournisseurs'],
  [['42', '43', '44'], 'Autres créances', 'Dettes fiscales et sociales'],
  [['486'], 'Charges constatées d’avance', 'Charges constatées d’avance'],
  [['487'], 'Produits constatés d’avance', 'Produits constatés d’avance'],
  [['51', '53', '58'], 'Disponibilités', 'Emprunts et dettes financières'],
];
const ASSET_ORDER = [
  'Immobilisations incorporelles',
  'Immobilisations corporelles',
  'Créances clients',
  'Autres créances',
  'Disponibilités',
  'Charges constatées d’avance',
];
const LIABILITY_ORDER = [
  'Capital',
  'Réserves',
  'Report à nouveau',
  'Résultat antérieur en attente d’affectation',
  'Résultat de l’exercice',
  'Emprunts et dettes financières',
  'Dettes fournisseurs',
  'Dettes fiscales et sociales',
  'Autres dettes',
  'Produits constatés d’avance',
];
// Rubriques de capitaux et d'immobilisations : toujours du même côté, quel que soit le sens (un
// amortissement créditeur vient en déduction de l'actif, un capital débiteur en déduction du passif).
const FIXED_SIDE = {
  Capital: 'liability',
  Réserves: 'liability',
  'Report à nouveau': 'liability',
  'Résultat antérieur en attente d’affectation': 'liability',
  'Immobilisations incorporelles': 'asset',
  'Immobilisations corporelles': 'asset',
  'Créances clients': null,
  'Charges constatées d’avance': 'asset',
  'Produits constatés d’avance': 'liability',
};

/** Bilan simplifié (rubriques 2033-A), montants nets. */
export function balanceSheet(ledger) {
  const b = balancesOf(ledger);
  const assets = Object.fromEntries(ASSET_ORDER.map((k) => [k, 0]));
  const liabilities = Object.fromEntries(LIABILITY_ORDER.map((k) => [k, 0]));
  const unmapped = [];
  for (const [acc, v] of b) {
    if (!/^[1-5]/.test(acc) || !v) continue;
    // Dépréciation des créances : toujours en diminution des créances clients, à l'actif.
    if (acc.startsWith('491')) {
      assets['Créances clients'] += v;
      continue;
    }
    const rule = BALANCE_RULES.find(([prefixes]) => prefixes.some((p) => acc.startsWith(p)));
    if (!rule) unmapped.push(acc);
    const [, assetRubric, liabilityRubric] = rule || [null, 'Autres créances', 'Autres dettes'];
    const rubric = v > 0 ? assetRubric : liabilityRubric;
    const side = FIXED_SIDE[rubric] ?? (v > 0 ? 'asset' : 'liability');
    if (side === 'asset') assets[rubric] += v;
    else liabilities[rubric] -= v;
  }
  liabilities['Résultat de l’exercice'] = incomeStatement(ledger).netResult;
  const totalAssets = sum(Object.values(assets));
  const totalLiabilities = sum(Object.values(liabilities));
  return { assets, liabilities, totalAssets, totalLiabilities, balanced: totalAssets === totalLiabilities, unmapped };
}
