/**
 * Workspace — TVA sur encaissements (prestations de services) : bascule 445800 → 445710 date par date.
 * Méthode installée sur Workspace.prototype (voir core/workspace.js).
 */

import { sum } from '../money.js?v=3bfbbd4';
import { isOnReceipt, receiptEvents, receiptTargets } from '../receipts.js?v=3bfbbd4';

export const receiptVatMethods = {
  /**
   * TVA sur encaissements : passe l'écriture 445800 → 445710 (ou inverse) qui amène la TVA exigible
   * comptabilisée sur l'exercice au niveau attendu (receipts.js). Calcul par écart avec ce qui est
   * déjà comptabilisé : pas de dérive d'arrondi, et un encaissement de l'exercice précédent n'est pas
   * compté deux fois.
   */
  _syncReceiptVat(inv, date) {
    if (!isOnReceipt(inv) || !inv.totals.totalVat) return;
    const fy = this.ledger.fiscalYear;
    const before = new Date(Date.parse(`${fy.start}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const base = receiptTargets(this.book.invoices, this.book.payments, inv, before).vat;
    const locked = this.ledger.lockedThrough;
    const firstOpen = locked ? new Date(Date.parse(`${locked}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : fy.start;
    // Chaque date d'encaissement, d'avoir ou de remboursement de l'exercice, dans l'ordre : la TVA
    // exigible comptabilisée à cette date doit valoir la TVA encaissée à cette date. Un règlement
    // rapproché après un règlement plus récent est ainsi rattaché à son mois, sans rester bloqué en 445800.
    const dates = [...new Set([...receiptEvents(this.book.invoices, this.book.payments, inv).map((e) => e.date), date])]
      .filter((d) => d >= fy.start && d <= fy.end)
      .sort();
    const bookedUpTo = (d) =>
      sum(
        this.ledger.entries
          .filter((e) => e.source?.kind === 'vat-receipt' && e.source.id === inv.id && e.date <= d)
          .flatMap((e) => e.lines)
          .filter((l) => l.account === '445710')
          .map((l) => l.credit - l.debit),
      );
    for (const d of dates) {
      const when = d < firstOpen ? firstOpen : d;
      const delta = receiptTargets(this.book.invoices, this.book.payments, inv, d).vat - base - bookedUpTo(when);
      if (!delta) continue;
      const amount = Math.abs(delta);
      this.ledger.addDraft({
        journal: 'OD',
        date: when,
        label: `TVA exigible sur encaissement ${inv.number}`,
        pieceRef: inv.number,
        pieceDate: when,
        source: { kind: 'vat-receipt', id: inv.id },
        lines:
          delta > 0
            ? [
                { account: '445800', debit: amount, credit: 0 },
                { account: '445710', debit: 0, credit: amount },
              ]
            : [
                { account: '445710', debit: amount, credit: 0 },
                { account: '445800', debit: 0, credit: amount },
              ],
      });
    }
  },
};
