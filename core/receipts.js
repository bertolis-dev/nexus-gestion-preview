/**
 * Facture, avoirs et encaissements vus comme un tout : restant dû du groupe et TVA exigible à
 * l'encaissement (prestations de services sans option pour les débits).
 *
 * Règle appliquée (à valider par l'expert-comptable référent, voir docs/regles-a-valider.md) :
 * la TVA exigible d'une facture à une date est la TVA NETTE (facture − acomptes − avoirs émis à cette
 * date) au prorata du cumul encaissé net (règlements − remboursements) sur le TTC net, plafonné à 100 % ;
 * quand le groupe est soldé, c'est la TVA nette exacte (le dernier règlement solde le reste, sans
 * dérive d'arrondi). Un avoir émis sur une facture déjà encaissée réduit donc la TVA à sa date ; sur une
 * facture non encaissée, il réduit la TVA restant en attente.
 */

import { divRound, sum } from './money.js?v=a619ec1';
import { vatSplit } from './invoices.js?v=a619ec1';

/**
 * Une part de la TVA est-elle exigible à l'encaissement ? (prestations sans option pour les débits,
 * acompte sur biens). Un avoir suit la facture qu'il corrige.
 */
export function isOnReceipt(inv) {
  return vatSplit(inv).receipt.length > 0;
}

/** Avoirs émis rattachés à une facture (par son numéro). */
export function creditsOf(invoices, inv) {
  return invoices.filter((c) => c.type === 'credit' && c.status === 'issued' && inv.number && c.creditOf === inv.number);
}

/** Facture d'origine d'un avoir, ou null. */
export function originalOf(invoices, credit) {
  return invoices.find((i) => i.status === 'issued' && i.type !== 'credit' && i.number === credit.creditOf) || null;
}

const paymentsUpTo = (payments, date) => sum((payments || []).filter((p) => !date || p.date <= date).map((p) => p.amount));
/** Date de prise en compte en TVA d'un règlement : celle du paiement, ou la première période non déclarée s'il a été rapproché après. */
const vatDateOf = (p) => p.vatDate || p.date;
const vatPaidUpTo = (payments, date) => sum((payments || []).filter((p) => !date || vatDateOf(p) <= date).map((p) => p.amount));

/**
 * Restant dû du groupe (facture + ses avoirs + règlements et remboursements) à une date (toutes dates si
 * absente). Positif : le client doit encore ; négatif : il faut le rembourser.
 */
export function groupBalance(invoices, payments, inv, date = null) {
  const credits = creditsOf(invoices, inv).filter((c) => !date || c.issueDate <= date);
  return (
    inv.totals.netToPay -
    sum(credits.map((c) => c.totals.netToPay)) -
    paymentsUpTo(payments[inv.id], date) -
    sum(credits.map((c) => paymentsUpTo(payments[c.id], date)))
  );
}

/**
 * Part exigible à l'encaissement de la base et de la TVA, par taux, nette des acomptes déduits
 * (vatSplit). `receiptGoods` : l'avoir suit la règle de la facture qu'il corrige (acompte sur biens).
 */
function ratesOf(inv, sign = 1, receiptGoods = inv.type === 'deposit') {
  return vatSplit(inv, { receiptGoods }).receipt.map((r) => ({ rateBp: r.rateBp, base: sign * r.base, vat: sign * r.vat }));
}

/**
 * TVA (et base) exigible d'une facture à une date, par taux : { byRate: Map(rateBp → {base, vat}), vat }.
 * Seulement pour une facture à TVA sur encaissements.
 */
export function receiptTargets(invoices, payments, inv, date) {
  const credits = creditsOf(invoices, inv).filter((c) => c.issueDate <= date);
  const net = new Map();
  for (const r of [...ratesOf(inv), ...credits.flatMap((c) => ratesOf(c, -1, inv.type === 'deposit'))]) {
    const row = net.get(r.rateBp) || { rateBp: r.rateBp, base: 0, vat: 0 };
    row.base += r.base;
    row.vat += r.vat;
    net.set(r.rateBp, row);
  }
  const netTtc = inv.totals.netToPay - sum(credits.map((c) => c.totals.netToPay));
  const paid = vatPaidUpTo(payments[inv.id], date) + sum(credits.map((c) => vatPaidUpTo(payments[c.id], date)));
  const settled = netTtc <= 0 || paid >= netTtc;
  const received = Math.max(0, Math.min(paid, netTtc));
  const byRate = new Map();
  for (const r of net.values()) {
    byRate.set(r.rateBp, settled ? { base: r.base, vat: r.vat } : { base: divRound(r.base * received, netTtc), vat: divRound(r.vat * received, netTtc) });
  }
  return { byRate, vat: sum([...byRate.values()].map((x) => x.vat)) };
}

/**
 * Événements qui changent la TVA exigible (règlements, remboursements, avoirs), avec l'écart par taux
 * qu'ils produisent : [{ date, reason, byRate: Map(rateBp → {base, vat}) }], dans l'ordre des dates.
 */
export function receiptEvents(invoices, payments, inv) {
  const credits = creditsOf(invoices, inv);
  const dated = [
    ...(payments[inv.id] || []).map((p) => [vatDateOf(p), 'encaissement']),
    ...credits.map((c) => [c.issueDate, `avoir ${c.number}`]),
    ...credits.flatMap((c) => (payments[c.id] || []).map((p) => [vatDateOf(p), 'remboursement'])),
  ].sort((a, b) => a[0].localeCompare(b[0]));
  const out = [];
  let previous = new Map();
  const seen = new Set();
  for (const [date, reason] of dated) {
    if (seen.has(date)) continue;
    seen.add(date);
    const { byRate } = receiptTargets(invoices, payments, inv, date);
    const delta = new Map();
    for (const [rate, t] of byRate) {
      const p = previous.get(rate) || { base: 0, vat: 0 };
      if (t.base !== p.base || t.vat !== p.vat) delta.set(rate, { base: t.base - p.base, vat: t.vat - p.vat });
    }
    if (delta.size) out.push({ date, reason, byRate: delta });
    previous = byRate;
  }
  return out;
}
