/**
 * Workspace — Clôture de l'exercice : inventaire, amortissements, impôt, affectation du résultat, exercice suivant.
 * Méthodes installées sur Workspace.prototype (voir core/workspace.js).
 */

import { sum } from '../money.js?v=d415f7a';
import {
  allocationEntry,
  balanceSheet,
  closingChecklist,
  corporateTax,
  corporateTaxEntry,
  depreciationEntry,
  fiscalYearMonths,
  incomeStatement,
  inventoryEntry,
  nextYearOpening,
  resultEntry,
} from '../closing.js?v=d415f7a';
import { nextFiscalYear } from '../dates.js?v=d415f7a';
import { Workspace } from '../workspace.js?v=d415f7a';

export const closingMethods = {
  addInventory(item) {
    // Client douteux : toute sa créance encore ouverte est transférée en 416.
    const receivableTtc =
      item.type === 'doubtful' && item.aux
        ? sum(
            this.ledger
              .lines()
              .filter((l) => l.account === '411000' && l.aux === item.aux)
              .map((l) => l.debit - l.credit),
          )
        : 0;
    return this.ledger.addDraft(inventoryEntry(item, this.company.fiscalYear, { receivableTtc }));
  },

  bookDepreciation() {
    if (this.ledger.entries.some((e) => e.source?.kind === 'inventory' && e.source.type === 'depreciation'))
      throw new Error('Les dotations de l’exercice sont déjà passées.');
    const entry = depreciationEntry(this);
    if (!entry) throw new Error('Aucune immobilisation à amortir cette année.');
    return this.ledger.addDraft(entry);
  },

  /** Calcul de l'IS sur le résultat comptable avant impôt (EURL et sociétés à l'IS uniquement). */
  computeCorporateTax(opts = {}) {
    const fy = this.company.fiscalYear;
    const days = Math.round((Date.parse(fy.end) - Date.parse(fy.start)) / 86400000) + 1;
    return corporateTax({ resultBeforeTax: incomeStatement(this.ledger).resultBeforeTax, days, months: fiscalYearMonths(fy), ...opts });
  },

  /** Passe (ou remplace, tant qu'elle est en brouillon) l'écriture d'IS de l'exercice. */
  bookCorporateTax(tax) {
    const previous = this.ledger.entries.find((e) => e.source?.kind === 'inventory' && e.source.type === 'corporate-tax');
    if (previous?.status === 'validated') throw new Error('L’impôt de l’exercice est déjà comptabilisé et validé.');
    if (previous) this.ledger.deleteDraft(previous.id);
    const entry = corporateTaxEntry(tax, this.company.fiscalYear);
    return entry ? this.ledger.addDraft(entry) : null;
  },

  /**
   * Clôture : détermination du résultat, validation de toutes les écritures de l'exercice, puis
   * état du nouvel exercice (bilan d'ouverture et extournes). Renvoie l'état à charger dans un nouveau
   * Workspace — le grand livre de l'exercice clos reste consultable dans son FEC.
   */
  /** Affecte le résultat de l'exercice précédent (décision d'assemblée ou du dirigeant). */
  allocateResult(parts, date) {
    if (this.ledger.entries.some((e) => e.source?.kind === 'allocation')) throw new Error('Le résultat a déjà été affecté.');
    return this.ledger.addDraft(allocationEntry(this.ledger, this.company, parts, date));
  },

  closeYear(today) {
    const fy = this.company.fiscalYear;
    if (today <= fy.end) throw new Error('L’exercice n’est pas terminé.');
    // Contrôle bloquant : on ne clôture jamais un exercice dont le bilan ne s'équilibre pas.
    // TVA de l'exercice non déclarée : après clôture, ces périodes ne seraient plus déclarables et leurs
    // soldes fausseraient les déclarations de l'exercice suivant.
    const vat = closingChecklist(this, { today }).find((i) => i.id === 'vat');
    if (vat && !vat.ok)
      throw new Error(`TVA : ${vat.detail}. Validez chaque déclaration dans l’écran TVA avant de clôturer, y compris celles déjà déposées sur impots.gouv.fr.`);
    const bs = balanceSheet(this.ledger);
    if (!bs.balanced)
      throw new Error(
        `Le bilan n’est pas équilibré (écart de ${(bs.totalAssets - bs.totalLiabilities) / 100} €) : la clôture est bloquée. Contactez le support.`,
      );
    const result = resultEntry(this.ledger, fy);
    if (result && this.ledger.lockedThrough >= fy.end)
      throw new Error('Le dernier jour de l’exercice est déjà verrouillé : l’écriture de résultat ne peut plus être passée.');
    if (result) this.ledger.addDraft(result);
    this.ledger.validateThrough(fy.end);
    const late = this.ledger.entries.filter((e) => e.status === 'draft');
    if (late.length) throw new Error(`${late.length} écriture(s) sont datées après la fin de l’exercice.`);
    const { start: nextStart, end: nextEnd } = nextFiscalYear(fy);
    const { opening, reversals } = nextYearOpening(this.ledger, nextStart);
    const nextCompany = { ...structuredClone(this.company), fiscalYear: { start: nextStart, end: nextEnd } };
    const next = new Workspace({
      company: nextCompany,
      newId: this.newId,
      state: {
        ...structuredClone(this.toJSON()),
        company: nextCompany,
        // Nouveau grand livre : numérotation repartant de 1, ordre de saisie poursuivi (clé unique en base).
        ledger: { entries: [], seq: this.ledger.seq, lastNumber: 0, lastLetter: this.ledger.lastLetter, auditLog: [] },
      },
    });
    // Exercice clos conservé en lecture seule (en base, il reste dans ses tables ; ici pour le mode local).
    next.archives = [...(this.archives || []), { fiscalYear: structuredClone(fy), ledger: structuredClone(this.ledger.toJSON()) }];
    if (opening.lines.length) next.ledger.addDraft(opening);
    for (const r of reversals) next.ledger.addDraft(r);
    // Encaissement rapproché après la dernière déclaration de l'exercice : sa TVA devient exigible le
    // premier jour du nouvel exercice (la 445800 est reprise dans les à-nouveaux).
    for (const i of next.book.invoices) if (i.status === 'issued' && i.type !== 'credit' && i.type !== 'quote') next._syncReceiptVat(i, nextStart);
    return next;
  },
};
