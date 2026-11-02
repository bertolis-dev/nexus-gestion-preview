/**
 * Salaires du mois importés de Nexus RH (bloc « paie » du fichier v1 : journal de paie saisi ou importé
 * dans Nexus RH, qui ne calcule pas la paie). Deux usages selon le réglage « Qui saisit les salaires ? »
 * (`company.payrollBy`) :
 *  - « expert » (par défaut) : l'expert-comptable passe les salaires depuis le journal de paie ; Nexus ne
 *    les reprend que dans la trésorerie prévisionnelle (aucune écriture : pas de double saisie) ;
 *  - « nexus » : Nexus passe aussi l'écriture de paie du mois.
 */

import { formatEuros, sum } from './money.js?v=269c883';

/**
 * Paramètres 2026, à valider (docs/regles-a-valider.md) : cotisations de tous les organismes payées le
 * 15 du mois suivant la paie (entreprise de moins de 50 salariés, déclaration sociale nominative).
 */
export const PAYROLL_DUE_2026 = { organismsDay: 15 };

const eur = (cents) => formatEuros(cents).replace(/\s/g, ' ');
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
function cents(v) {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof v === 'string' && !v.trim()) return null;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** Compte de l'organisme : URSSAF en 431000, les autres (retraite, mutuelle, prévoyance) en 437000. */
export const organismAccount = (name) => (/urssaf/.test(norm(name)) ? '431000' : '437000');

/** Échéance des cotisations d'une paie de la période AAAA-MM. */
function organismsDue(period) {
  const [y, m] = period.split('-').map(Number);
  const yy = m === 12 ? y + 1 : y;
  const mm = m === 12 ? 1 : m + 1;
  return `${yy}-${String(mm).padStart(2, '0')}-${String(PAYROLL_DUE_2026.organismsDay).padStart(2, '0')}`;
}

/** @returns {{ errors: string[], payroll: object|null }} montants en centimes. */
export function parsePayroll(paie, period) {
  const errors = [];
  const gross = cents(paie?.brut);
  const employee = cents(paie?.charges_salariales);
  const employer = cents(paie?.charges_patronales);
  const net = cents(paie?.net_a_payer);
  const organisms = (Array.isArray(paie?.detail_par_organisme) ? paie.detail_par_organisme : []).map((o) => ({
    name: String(o?.organisme ?? '')
      .trim()
      .slice(0, 100),
    amount: cents(o?.montant),
  }));
  if ([gross, employee, employer, net].includes(null) || organisms.some((o) => o.amount === null || !o.name)) errors.push('Salaires : montant illisible');
  else {
    // Égalités exactes : l'écriture de paie (mode « Nexus ») doit s'équilibrer au centime.
    if (gross - employee !== net)
      errors.push(`Salaires : le net à payer (${eur(net)}) ne correspond pas au brut moins les cotisations salariales (${eur(gross - employee)})`);
    const detail = sum(organisms.map((o) => o.amount));
    if (!organisms.length) errors.push('Salaires : le détail par organisme est vide');
    else if (detail !== employee + employer)
      errors.push(
        `Salaires : le détail par organisme (${eur(detail)}) ne correspond pas aux cotisations salariales et patronales (${eur(employee + employer)})`,
      );
  }
  if (!isDate(paie?.date_paiement)) errors.push('Salaires : date de paiement illisible');
  if (errors.length) return { errors: errors.map((e) => `${e} : corrigez le journal de paie dans Nexus RH puis exportez de nouveau.`), payroll: null };
  const due = organismsDue(period);
  return {
    errors,
    payroll: {
      period,
      gross,
      employeeCharges: employee,
      employerCharges: employer,
      net,
      payDate: paie.date_paiement,
      organisms: organisms.map((o) => ({ ...o, account: organismAccount(o.name), dueDate: due })),
    },
  };
}

/** Écriture de paie du mois (mode « nexus ») : charges brutes et patronales, dettes envers salariés et organismes. */
export function payrollEntry(p) {
  const [y, m] = p.period.split('-').map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const label = `Salaires ${p.period.slice(5)}/${p.period.slice(0, 4)}`;
  const byAccount = new Map();
  for (const o of p.organisms) byAccount.set(o.account, (byAccount.get(o.account) || 0) + o.amount);
  return {
    journal: 'OD',
    date: end,
    label,
    pieceRef: `PAIE-${p.period}`,
    pieceDate: end,
    source: { kind: 'paie', period: p.period },
    lines: [
      { account: '641000', debit: p.gross, credit: 0, label },
      { account: '645000', debit: p.employerCharges, credit: 0, label },
      { account: '421000', debit: 0, credit: p.net, label },
      ...[...byAccount].sort(([a], [b]) => a.localeCompare(b)).map(([account, amount]) => ({ account, debit: 0, credit: amount, label })),
    ].filter((l) => l.debit || l.credit),
  };
}

/** Décaissements à venir d'une paie (le net à sa date de paiement, les cotisations à leur échéance). */
export function payrollOutflows(p) {
  return [
    { date: p.payDate, label: `Salaires nets ${p.period.slice(5)}/${p.period.slice(0, 4)}`, amount: -p.net },
    ...p.organisms.map((o) => ({ date: o.dueDate, label: `Cotisations ${o.name} ${p.period.slice(5)}/${p.period.slice(0, 4)}`, amount: -o.amount })),
  ];
}
