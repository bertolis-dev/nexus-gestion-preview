/**
 * Workspace — lettrage des factures d'un exercice précédent (à-nouveaux) une fois soldées.
 * Méthodes installées sur Workspace.prototype (voir core/workspace.js).
 */

import { sum } from '../money.js?v=269c883';

const tryLetter = (ledger, refs, date) => {
  try {
    ledger.letter(refs, date);
    return true;
  } catch {
    return false; // solde non nul, ligne verrouillée… : à lettrer à la main
  }
};

export const letteringMethods = {
  /** Facture d'un exercice précédent soldée : lettrage de sa ligne d'à-nouveau, ou du compte du client. */
  _letterPriorYear(inv, doc, payments, date) {
    const account = doc.thirdPartyAccount;
    const aux = this.invoiceAux(inv);
    const opening = this.ledger.entries.filter((x) => x.source?.kind === 'opening');
    for (const e of opening) {
      const lineIndex = e.lines.findIndex((l) => l.account === account && l.aux === aux && !l.letter && l.label.includes(inv.number));
      if (lineIndex < 0) continue;
      const inLedger = payments.filter((p) => this.ledger.entries.some((x) => x.id === p.entryId)).map((p) => ({ entryId: p.entryId, lineIndex: p.lineIndex }));
      if (tryLetter(this.ledger, [{ entryId: e.id, lineIndex }, ...inLedger], date)) return;
    }
    // Réglée en partie l'an passé (règlement repris en à-nouveau) : tout le compte, s'il est revenu à zéro.
    const refs = [];
    for (const e of this.ledger.entries)
      e.lines.forEach((l, lineIndex) => {
        if (l.account === account && l.aux === aux && !l.letter) refs.push({ entryId: e.id, lineIndex, amount: l.debit - l.credit });
      });
    if (refs.length >= 2 && !sum(refs.map((r) => r.amount)))
      tryLetter(
        this.ledger,
        refs.map(({ entryId, lineIndex }) => ({ entryId, lineIndex })),
        date,
      );
  },
};
