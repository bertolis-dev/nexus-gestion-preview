/**
 * Workspace — TVA déductible au paiement (achats de prestations de services, fournisseur sans option
 * pour les débits) : bascule 445680 → 445660 date par date, au prorata des règlements.
 * Méthode installée sur Workspace.prototype (voir core/workspace.js).
 */

import { divRound, sum } from '../money.js?v=e821f3b';
import { purchaseEntry } from '../purchases.js?v=e821f3b';

const dayBefore = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const dayAfter = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

export const paymentVatMethods = {
  /**
   * Amène la TVA devenue déductible comptabilisée sur l'exercice au niveau des règlements reçus ou
   * versés à chaque date (même principe que la TVA sur encaissements, receipt-vat.js) : calcul par
   * écart, sans dérive d'arrondi ; le règlement qui solde prend le reste exact.
   */
  _syncPurchaseVat(p, date) {
    const pending = sum(
      purchaseEntry(p, this.company)
        .lines.filter((l) => l.account === '445680')
        .map((l) => l.debit - l.credit),
    );
    if (!pending || !p.totalTtc) return;
    // Pas de déduction avant la facture (CGI art. 271-II) : un acompte versé avant attend sa date.
    const target = (d) => {
      if (d < p.date) return 0;
      const paid = sum((p.payments || []).filter((x) => x.date <= d).map((x) => x.amount));
      return paid >= p.totalTtc ? pending : divRound(pending * paid, p.totalTtc);
    };
    const fy = this.ledger.fiscalYear;
    const base = target(dayBefore(fy.start));
    const locked = this.ledger.lockedThrough;
    // Ni dans une période verrouillée, ni dans une période de TVA déjà déclarée : reportée au premier jour libre.
    const firstOpen = [locked ? dayAfter(locked) : fy.start, this._firstUndeclaredDay()].filter(Boolean).sort().at(-1);
    const dates = [...new Set([...(p.payments || []).map((x) => (x.date < p.date ? p.date : x.date)), date < p.date ? p.date : date])]
      .filter((d) => d >= fy.start && d <= fy.end)
      .sort();
    const bookedUpTo = (d) =>
      sum(
        this.ledger.entries
          .filter((e) => e.source?.kind === 'vat-payment' && e.source.id === p.id && e.date <= d)
          .flatMap((e) => e.lines)
          .filter((l) => l.account === '445660')
          .map((l) => l.debit - l.credit),
      );
    for (const d of dates) {
      // Exercice entièrement déclaré : passée au dernier jour, la 445660 restante est reprise et déduite l'an suivant.
      const when = [d < firstOpen ? firstOpen : d, fy.end].sort()[0];
      const delta = target(d) - base - bookedUpTo(when);
      if (!delta) continue;
      const amount = Math.abs(delta);
      const label = `TVA déductible au paiement ${p.supplier.name}${p.number ? ` ${p.number}` : ''}`;
      this.ledger.addDraft({
        journal: 'OD',
        date: when,
        label,
        pieceRef: p.number || p.id,
        pieceDate: when,
        source: { kind: 'vat-payment', id: p.id },
        lines:
          delta > 0
            ? [
                { account: '445660', label, debit: amount, credit: 0 },
                { account: '445680', label, debit: 0, credit: amount },
              ]
            : [
                { account: '445680', label, debit: amount, credit: 0 },
                { account: '445660', label, debit: 0, credit: amount },
              ],
      });
    }
  },
};
