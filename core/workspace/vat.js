/**
 * Workspace — TVA : périodes, échéances, préparation et déclaration (CA3, CA12), montant dû, liste « À faire ».
 * Méthodes installées sur Workspace.prototype (voir core/workspace.js).
 */

import { ca12Advances, liquidationEntry, prepareCa12, prepareCa3 } from '../vatreturn.js?v=e821f3b';
import { sum } from '../money.js?v=e821f3b';

export const vatMethods = {
  /** Déclarations déjà validées (conservées dans les paramètres de la structure). */
  get vatReturns() {
    return this.company.vatReturns || [];
  },

  /** Une facture se date du jour de son émission : jamais dans une période de TVA déjà déclarée. */
  _assertNotDeclared(draft) {
    const undeclared = this._firstUndeclaredDay();
    if (undeclared && draft?.status === 'draft' && draft.type !== 'quote' && draft.issueDate < undeclared)
      throw new Error(`La TVA est déjà déclarée jusqu’au ${undeclared.split('-').reverse().join('/')} exclu : datez la facture d’aujourd’hui.`);
  },

  /**
   * Date comptable d'une pièce reçue après la déclaration de TVA de son mois : la première période non
   * déclarée (sa TVA y est déduite) ; la date de la pièce reste la sienne.
   */
  _undeclaredDate(date) {
    const undeclared = this._firstUndeclaredDay();
    return undeclared && date < undeclared && undeclared <= this.ledger.fiscalYear.end ? undeclared : date;
  },

  /**
   * Dépense de banque datée dans un mois déjà déclaré : l'écriture de banque garde sa date, la TVA
   * déductible est reprise de la charge le premier jour non déclaré (elle y est déduite).
   */
  _deferredVat(tx, account, vatAccount, amount) {
    const date = this._undeclaredDate(tx.date);
    this.ledger.addDraft({
      journal: 'OD',
      date,
      label: `TVA déductible ${tx.label}`,
      pieceRef: tx.id,
      pieceDate: tx.date,
      source: { kind: 'bank-vat', id: tx.id },
      lines: [
        { account: vatAccount, debit: amount, credit: 0 },
        { account, debit: 0, credit: amount },
      ],
    });
  },

  /** Lendemain de la dernière période de TVA déclarée (null si aucune) : une régularisation n'y retourne pas. */
  _firstUndeclaredDay() {
    const last = this.vatReturns
      .map((r) => r.to)
      .sort()
      .at(-1);
    return last ? new Date(Date.parse(`${last}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : null;
  },

  /** Crédit de TVA reporté de la dernière déclaration validée avant la période. */
  previousVatCredit(from) {
    const last = this.vatReturns
      .filter((r) => r.to < from)
      .sort((a, b) => a.to.localeCompare(b.to))
      .at(-1);
    return last && last.balance < 0 ? -last.balance : 0;
  },

  prepareVatReturn(period) {
    const prepare = this.company.vatRegime === 'reel-simplifie' ? prepareCa12 : prepareCa3;
    return prepare(this, period, { previousCredit: this.previousVatCredit(period.from) });
  },

  /** Acomptes de TVA de l'exercice (régime simplifié), d'après la dernière CA12 déclarée. */
  vatAdvancesDue() {
    const last = this.vatReturns
      .filter((r) => r.kind === 'CA12')
      .sort((a, b) => a.to.localeCompare(b.to))
      .at(-1);
    return last ? ca12Advances(last.summary) : null;
  },

  /** Valide la CA3 : écriture de liquidation et déclaration conservée (une seule par période). */
  declareVat(period, today) {
    if (period.to >= today) throw new Error('La période n’est pas terminée : la déclaration se prépare après sa dernière journée.');
    if (this.vatReturns.some((r) => r.from === period.from)) throw new Error('Cette période a déjà été déclarée.');
    // Dans l'ordre : pas de trou après la dernière déclaration (la TVA du mois sauté ne serait déclarée nulle part).
    const lastBefore = this.vatReturns
      .filter((r) => r.to < period.from)
      .sort((a, b) => a.to.localeCompare(b.to))
      .at(-1);
    const skipped =
      lastBefore && this.vatPeriods().find((p) => p.from > lastBefore.to && p.to < period.from && !this.vatReturns.some((r) => r.from === p.from));
    if (skipped) throw new Error(`Déclarez d’abord la période précédente (${skipped.label}).`);
    const ca3 = this.prepareVatReturn(period);
    const liquidation = liquidationEntry(ca3);
    // Mois sans aucune TVA : la déclaration « néant » est enregistrée, sans écriture (rien à solder).
    const entry = liquidation.lines.length >= 2 ? this.ledger.addDraft(liquidation) : null;
    const record = {
      kind: ca3.kind || 'CA3',
      from: period.from,
      to: period.to,
      boxes: ca3.boxes,
      balance: ca3.balance,
      entryId: entry?.id || null,
      declaredAt: today,
      summary: { grossVat: ca3.grossVat, deductibleOther: ca3.deductibleOther },
    };
    this.company.vatReturns = [...this.vatReturns, record];
    return { ca3, entry, record };
  },

  /** TVA nette due sur une période (collectée − déductible), à partir des écritures. */
  vatDue({ from, to }) {
    const lines = this.ledger.lines({ from, to });
    const credit = (acc) => sum(lines.filter((l) => l.account === acc).map((l) => l.credit - l.debit));
    const debit = (acc) => sum(lines.filter((l) => l.account === acc).map((l) => l.debit - l.credit));
    const collected = credit('445710') + credit('445200');
    const deductible = debit('445660') + debit('445620');
    return { collected, deductible, net: collected - deductible };
  },

  /**
   * Prochaine échéance de TVA. Réel normal : CA3 du mois M déposée le mois M+1 avant le jour limite
   * (entre le 15 et le 24 selon le SIREN et la forme, paramétrable ; 19 par défaut) — une fois ce
   * jour passé, on annonce la déclaration du mois en cours. Réel simplifié : acomptes de juillet et
   * décembre, CA12 annuelle début mai.
   */
  /**
   * Périodes de déclaration de TVA (CA3) couvrant l'exercice : mois civils, ou trimestres civils si
   * l'entreprise déclare chaque trimestre (company.vatPeriodicity = 'trimestrielle').
   */
  vatPeriods() {
    const fy = this.company.fiscalYear;
    const quarterly = this.company.vatPeriodicity === 'trimestrielle';
    const span = quarterly ? 3 : 1;
    let [y, m] = fy.start.split('-').map(Number);
    if (quarterly) m = Math.floor((m - 1) / 3) * 3 + 1;
    const out = [];
    for (let guard = 0; guard < 40; guard++) {
      const from = `${y}-${String(m).padStart(2, '0')}-01`;
      if (from > fy.end) break;
      const to = new Date(Date.UTC(y, m - 1 + span, 0)).toISOString().slice(0, 10);
      const label = quarterly
        ? `${(m - 1) / 3 + 1 === 1 ? '1er' : `${(m - 1) / 3 + 1}e`} trimestre ${y}`
        : new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' });
      out.push({ from, to, label });
      m += span;
      if (m > 12) {
        m -= 12;
        y += 1;
      }
    }
    return out;
  },

  /** Date limite de dépôt d'une CA3 : le jour limite du mois qui suit la période. */
  vatDeadline(period) {
    const [y, m] = period.to.split('-').map(Number);
    return new Date(Date.UTC(y, m, this.company.vatDeadlineDay || 19)).toISOString().slice(0, 10);
  },
};
