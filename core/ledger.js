/**
 * Moteur d'écritures en partie double (§6) — la même règle est dupliquée en base (trigger
 * `check_entry_balanced`, supabase/migrations) : le navigateur n'est jamais seul garant.
 *
 * Cycle de vie d'une écriture :
 *   brouillon  → modifiable / supprimable, sans numéro ;
 *   validée    → numérotée sans trou dans l'ordre chronologique, intangible (PCG art. 921-3) ;
 *                seule correction possible : la contre-passation (`reverse`).
 * La validation se fait par période (`validateThrough`) : elle verrouille toutes les dates
 * antérieures, ce qui garantit que la numérotation reste chronologique.
 */

import { assertCents, sum } from './money.js?v=d415f7a';
import { isCalendarDate } from './dates.js?v=d415f7a';

export const JOURNALS = {
  VE: 'Ventes',
  AC: 'Achats',
  BQ: 'Banque',
  OD: 'Opérations diverses',
  AN: 'À-nouveaux',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class LedgerError extends Error {}

export class Ledger {
  /**
   * @param {object} opts
   * @param {Map<string, object>} opts.chart plan comptable (buildChart)
   * @param {{start: string, end: string}} opts.fiscalYear exercice ouvert
   * @param {() => string} [opts.now] horloge injectable (tests)
   * @param {string} [opts.actor]
   */
  constructor({ chart, fiscalYear, now = () => new Date().toISOString(), actor = 'système', state, newId } = {}) {
    if (!chart) throw new LedgerError('Plan comptable manquant');
    if (!fiscalYear || !ISO_DATE.test(fiscalYear.start) || !ISO_DATE.test(fiscalYear.end)) {
      throw new LedgerError('Exercice comptable invalide');
    }
    this.chart = chart;
    this.fiscalYear = fiscalYear;
    this.now = now;
    this.actor = actor;
    const s = state || {};
    this.entries = s.entries || [];
    this.lockedThrough = s.lockedThrough || null;
    this.lastNumber = s.lastNumber || 0;
    this.lastLetter = s.lastLetter || 0;
    this.auditLog = s.auditLog || [];
    this.seq = s.seq || 0;
    // Identifiants : « E1, E2… » par défaut (tests) ; l'application injecte crypto.randomUUID pour
    // que la même clé serve en local et en base. L'ordre de saisie est porté par seq, jamais par l'id.
    this.newId = newId || ((n) => `E${n}`);
  }

  toJSON() {
    const { entries, lockedThrough, lastNumber, lastLetter, auditLog, seq, fiscalYear } = this;
    return { entries, lockedThrough, lastNumber, lastLetter, auditLog, seq, fiscalYear };
  }

  // ---------------------------------------------------------------- audit

  #audit(action, entityId, before, after) {
    const record = {
      at: this.now(),
      actor: this.actor,
      action,
      entityId,
      before: before === undefined ? null : structuredClone(before),
      after: after === undefined ? null : structuredClone(after),
    };
    this.auditLog.push(Object.freeze(record));
  }

  // ---------------------------------------------------------------- contrôles

  #checkEntry(entry) {
    if (!JOURNALS[entry.journal]) throw new LedgerError(`Journal inconnu : ${entry.journal}`);
    if (!isCalendarDate(entry.date)) throw new LedgerError(`Date invalide : ${entry.date}`);
    if (entry.date < this.fiscalYear.start || entry.date > this.fiscalYear.end) {
      throw new LedgerError(`La date ${entry.date} est hors de l'exercice ouvert`);
    }
    if (this.lockedThrough && entry.date <= this.lockedThrough) {
      throw new LedgerError(`La période est verrouillée jusqu'au ${this.lockedThrough} : utilisez une date postérieure`);
    }
    if (!entry.label || !String(entry.label).trim()) throw new LedgerError("Libellé d'écriture obligatoire");
    if (!Array.isArray(entry.lines) || entry.lines.length < 2) {
      throw new LedgerError('Une écriture comporte au moins deux lignes');
    }
    for (const [i, l] of entry.lines.entries()) {
      if (!this.chart.has(l.account)) throw new LedgerError(`Ligne ${i + 1} : compte inconnu ${l.account}`);
      assertCents(l.debit ?? 0, `débit ligne ${i + 1}`);
      assertCents(l.credit ?? 0, `crédit ligne ${i + 1}`);
      const d = l.debit ?? 0;
      const c = l.credit ?? 0;
      if (d < 0 || c < 0) throw new LedgerError(`Ligne ${i + 1} : montant négatif interdit`);
      if ((d === 0) === (c === 0)) {
        throw new LedgerError(`Ligne ${i + 1} : renseigner soit un débit, soit un crédit`);
      }
    }
    const debit = sum(entry.lines.map((l) => l.debit ?? 0));
    const credit = sum(entry.lines.map((l) => l.credit ?? 0));
    if (debit !== credit) {
      throw new LedgerError(`Écriture déséquilibrée : débit ${debit} ≠ crédit ${credit} (centimes)`);
    }
  }

  #find(id) {
    const e = this.entries.find((x) => x.id === id);
    if (!e) throw new LedgerError(`Écriture introuvable : ${id}`);
    return e;
  }

  // ---------------------------------------------------------------- écritures

  addDraft({ journal, date, label, pieceRef = '', pieceDate = date, lines, source = null }) {
    const entry = {
      seq: ++this.seq,
      id: null,
      journal,
      date,
      label,
      pieceRef,
      pieceDate,
      source,
      status: 'draft',
      number: null,
      validatedAt: null,
      reversalOf: null,
      lines: lines.map((l) => ({
        account: l.account,
        aux: l.aux || '',
        auxLabel: l.auxLabel || '',
        label: l.label || label,
        debit: l.debit ?? 0,
        credit: l.credit ?? 0,
        letter: '',
        letterDate: '',
      })),
    };
    entry.id = this.newId(entry.seq);
    this.#checkEntry(entry);
    this.entries.push(entry);
    this.#audit('entry.create', entry.id, undefined, entry);
    return entry;
  }

  updateDraft(id, patch) {
    const e = this.#find(id);
    if (e.status !== 'draft') throw new LedgerError('Écriture validée : correction par contre-passation uniquement');
    const before = structuredClone(e);
    const next = { ...e, ...patch, id: e.id, status: 'draft' };
    if (patch.lines) next.lines = patch.lines.map((l) => ({ aux: '', auxLabel: '', label: next.label, debit: 0, credit: 0, letter: '', letterDate: '', ...l }));
    this.#checkEntry(next);
    Object.assign(e, next);
    this.#audit('entry.update', id, before, e);
    return e;
  }

  deleteDraft(id) {
    const e = this.#find(id);
    if (e.status !== 'draft') throw new LedgerError('Écriture validée : suppression interdite');
    this.entries = this.entries.filter((x) => x.id !== id);
    this.#audit('entry.delete', id, e, undefined);
  }

  /** Valide tous les brouillons datés jusqu'à `date` incluse, numérotés dans l'ordre chronologique. */
  validateThrough(date, { today = null } = {}) {
    if (!isCalendarDate(date)) throw new LedgerError(`Date invalide : ${date}`);
    // On ne valide définitivement que ce qui est déjà arrivé (une écriture future pourrait encore changer).
    if (today && date > today) throw new LedgerError(`Impossible de valider des écritures datées après aujourd’hui (${today.split('-').reverse().join('/')}).`);
    if (this.lockedThrough && date < this.lockedThrough) {
      throw new LedgerError(`Déjà verrouillé jusqu'au ${this.lockedThrough}`);
    }
    const at = this.now();
    const toValidate = this.entries
      .filter((e) => e.status === 'draft' && e.date <= date)
      .sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1));
    for (const e of toValidate) {
      e.status = 'validated';
      e.number = ++this.lastNumber;
      e.validatedAt = at;
      this.#audit('entry.validate', e.id, undefined, { number: e.number });
    }
    this.lockedThrough = date;
    this.#audit('period.lock', date, undefined, { count: toValidate.length });
    return toValidate.length;
  }

  /** Contre-passation d'une écriture validée (débits et crédits inversés), seule correction autorisée. */
  reverse(id, date, label) {
    const original = this.#find(id);
    if (original.status !== 'validated') throw new LedgerError('Seule une écriture validée se contre-passe ; un brouillon se modifie');
    if (this.entries.some((e) => e.reversalOf === id)) throw new LedgerError('Écriture déjà contre-passée');
    const rev = this.addDraft({
      journal: original.journal,
      date,
      label: label || `Annulation écriture n° ${original.number}`,
      pieceRef: original.pieceRef,
      pieceDate: original.pieceDate,
      lines: original.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
    });
    rev.reversalOf = id;
    return rev;
  }

  // ---------------------------------------------------------------- lettrage

  /** Code de lettrage n° n : AAA, AAB… (3 lettres au moins, sans jamais réutiliser un code). */
  static #letterCode(n) {
    let s = '';
    let x = n + 702; // 703 = « AAA » : on part des codes à 3 lettres au lieu de compléter par des « A »
    do {
      s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
      x = Math.floor((x - 1) / 26);
    } while (x > 0);
    return s;
  }

  /**
   * Lettre un ensemble de lignes d'un même compte (et même tiers) dont le solde est nul.
   * @param {{entryId: string, lineIndex: number}[]} refs
   */
  letter(refs, date) {
    if (refs.length < 2) throw new LedgerError('Le lettrage associe au moins deux lignes');
    const lines = refs.map(({ entryId, lineIndex }) => {
      const l = this.#find(entryId).lines[lineIndex];
      if (!l) throw new LedgerError(`Ligne introuvable : ${entryId}#${lineIndex}`);
      return l;
    });
    const { account, aux } = lines[0];
    if (!['4', '5'].includes(account[0])) throw new LedgerError('Seuls les comptes de tiers se lettrent');
    if (lines.some((l) => l.account !== account || l.aux !== aux)) {
      throw new LedgerError('Les lignes lettrées doivent porter sur le même compte et le même tiers');
    }
    if (lines.some((l) => l.letter)) throw new LedgerError('Une des lignes est déjà lettrée');
    if (sum(lines.map((l) => l.debit - l.credit)) !== 0) throw new LedgerError('Lettrage impossible : le solde des lignes n’est pas nul');
    const code = Ledger.#letterCode(++this.lastLetter);
    for (const l of lines) {
      l.letter = code;
      l.letterDate = date;
    }
    this.#audit('letter.create', code, undefined, { refs });
    return code;
  }

  unletter(code) {
    const touched = [];
    for (const e of this.entries) {
      e.lines.forEach((l, i) => {
        if (l.letter === code) {
          l.letter = '';
          l.letterDate = '';
          touched.push({ entryId: e.id, lineIndex: i });
        }
      });
    }
    if (!touched.length) throw new LedgerError(`Lettrage inconnu : ${code}`);
    this.#audit('letter.delete', code, { refs: touched }, undefined);
  }

  // ---------------------------------------------------------------- lectures

  /** Lignes aplaties, filtrées par période et statut, dans l'ordre des écritures. */
  lines({ from, to, validatedOnly = false } = {}) {
    const out = [];
    for (const e of this.entries) {
      if (validatedOnly && e.status !== 'validated') continue;
      if (from && e.date < from) continue;
      if (to && e.date > to) continue;
      e.lines.forEach((l, lineIndex) => out.push({ ...l, entry: e, lineIndex }));
    }
    return out;
  }

  /** Solde (débit − crédit) d'un compte ou d'un préfixe de comptes. */
  balanceOf(prefix, opts) {
    return sum(
      this.lines(opts)
        .filter((l) => l.account.startsWith(prefix))
        .map((l) => l.debit - l.credit),
    );
  }

  /** Lignes ouvertes (non lettrées) d'un compte de tiers — base du rapprochement. */
  openItems(account, aux) {
    return this.lines().filter((l) => l.account === account && (aux === undefined || l.aux === aux) && !l.letter);
  }
}
