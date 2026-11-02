/**
 * Workspace — pilotage : indemnités kilométriques, temps passé facturable, stock, budget, et
 * rapprochement en un clic des paiements reconnus sans ambiguïté.
 * Méthodes installées sur Workspace.prototype (voir core/workspace.js).
 */

import { kmBeforeTrip, tripAllowance } from '../mileage.js?v=17f2ba9';
import { isBilled, timeEntry, timeInvoiceLines } from '../timesheet.js?v=17f2ba9';
import { stockMove } from '../stock.js?v=17f2ba9';
import { addDays } from '../dates.js?v=17f2ba9';

/** Score minimal et écart avec la deuxième proposition pour rapprocher sans demander. */
const SURE_SCORE = 90;
const SURE_GAP = 20;

export const pilotageMethods = {
  /**
   * Trajet professionnel avec le véhicule personnel du dirigeant : dépense au barème kilométrique,
   * due au dirigeant (compte courant d'associé, ou compte de l'exploitant pour une EI), sans TVA.
   */
  addMileage({ date, km, from = '', to = '', purpose = '', horsepower, electric = false, vehicle = 'Véhicule personnel', driver }) {
    const who = String(driver || '').trim();
    if (!who) throw new Error('Indiquez le nom du conducteur.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Indiquez la date du trajet.');
    const distance = Math.round(Number(String(km).replace(',', '.')) * 10) / 10;
    const kmBefore = kmBeforeTrip(this.purchases, { date, vehicle });
    const { amount, scaleYear } = tripAllowance({ km: distance, horsepower: Number(horsepower), electric, kmBefore, year: Number(date.slice(0, 4)) });
    const trip = [from, to]
      .map((s) => String(s).trim())
      .filter(Boolean)
      .join(' → ');
    const label = ['Trajet', trip, purpose && `(${String(purpose).trim()})`].filter(Boolean).join(' ');
    return this.addPurchaseLines(
      {
        supplier: { name: who, kind: 'dirigeant' },
        date,
        number: `IK-${date}-${this.purchases.filter((p) => p.lines[0]?.mileage).length + 1}`,
        lines: [
          {
            categoryId: 'indemnites-km',
            ht: amount,
            vatRateBp: 0,
            label: label.slice(0, 200),
            mileage: { km: distance, horsepower: Number(horsepower), electric: Boolean(electric), vehicle, scaleYear },
          },
        ],
      },
      { force: true },
    ).purchase;
  },

  /** Trajets enregistrés (les plus récents d'abord). */
  mileageTrips() {
    return this.purchases.filter((p) => p.lines[0]?.mileage).sort((a, b) => b.date.localeCompare(a.date));
  },

  get timeEntries() {
    return this.company.timeEntries || [];
  },

  saveTimeEntry(data) {
    const client = this.clients.find((c) => c.id === data.clientId);
    const entry = timeEntry({ ...data, id: data.id || this._id('T'), clientName: client?.name });
    const list = this.timeEntries.filter((e) => e.id !== entry.id);
    this.company.timeEntries = [...list, entry].sort((a, b) => b.date.localeCompare(a.date));
    return entry;
  },

  deleteTimeEntry(id) {
    const e = this.timeEntries.find((x) => x.id === id);
    if (e && isBilled(e, this._invoiceIds())) throw new Error('Ce temps est déjà facturé : supprimez d’abord le brouillon de facture.');
    this.company.timeEntries = this.timeEntries.filter((x) => x.id !== id);
  },

  _invoiceIds() {
    return new Set(this.book.invoices.map((i) => i.id));
  },

  /** Brouillon de facture à partir des temps non facturés d'un client ; les saisies retiennent la facture. */
  invoiceTime(clientId, today) {
    const client = this.clients.find((c) => c.id === clientId);
    if (!client) throw new Error('Client introuvable.');
    const ids = this._invoiceIds();
    const entries = this.timeEntries.filter((e) => e.clientId === clientId && !isBilled(e, ids));
    if (!entries.length) throw new Error('Aucun temps à facturer pour ce client.');
    const vatRateBp = this.company.vatRegime === 'franchise' ? 0 : 2000;
    const draft = this.book.createDraft({
      client: structuredClone(client),
      issueDate: today,
      dueDate: addDays(today, this.company.paymentTermsDays || 30),
      lines: timeInvoiceLines(entries, { vatRateBp }),
    });
    const billed = new Set(entries.map((e) => e.id));
    this.company.timeEntries = this.timeEntries.map((e) => (billed.has(e.id) ? { ...e, invoiceId: draft.id } : e));
    return draft;
  },

  get stockMoves() {
    return this.company.stockMoves || [];
  },

  addStockMove(data) {
    const move = stockMove({ ...data, id: this._id('S') });
    if (!(this.company.catalog || []).some((i) => i.id === move.itemId && i.tracked)) throw new Error('Article introuvable ou non suivi en stock.');
    this.company.stockMoves = [...this.stockMoves, move];
    return move;
  },

  /** Budget de l'exercice en cours (rubriques en centimes). */
  saveBudget(lines) {
    this.company.budget = { ...(this.company.budget || {}), [this.company.fiscalYear.start]: lines };
  },

  currentBudget() {
    return (this.company.budget || {})[this.company.fiscalYear.start] || {};
  },

  /**
   * Transactions dont la proposition est sûre : une seule pièce, montant exact, score élevé et nettement
   * devant la suivante. Renvoie [{ tx, suggestion }] sans rien enregistrer.
   */
  sureMatches() {
    const open = this.transactions.filter((t) => t.status === 'open');
    const all = this.suggestionsForMany(open.map((t) => t.id));
    const out = [];
    const used = new Set();
    for (const tx of open) {
      const [best, second] = all.get(tx.id) || [];
      if (!best || best.docs.length !== 1 || best.score < SURE_SCORE || (second && best.score - second.score < SURE_GAP)) continue;
      if (best.amounts[0] !== Math.abs(tx.amount) || best.docs[0].outstanding !== Math.abs(tx.amount)) continue;
      const key = `${best.docs[0].kind}:${best.docs[0].id}`;
      if (used.has(key)) continue; // deux paiements pour la même pièce : laissés au choix de l'utilisateur
      used.add(key);
      out.push({ tx, suggestion: best });
    }
    return out;
  },

  /** Rapproche toutes les propositions sûres ; renvoie le nombre de transactions rapprochées. */
  matchAllSure() {
    let n = 0;
    for (const { tx, suggestion } of this.sureMatches()) {
      this.matchTransaction(tx.id, [{ doc: suggestion.docs[0], amount: suggestion.amounts[0] }]);
      n++;
    }
    return n;
  },
};
