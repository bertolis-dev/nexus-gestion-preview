/**
 * Espace de travail d'une structure : orchestre les modules du moteur (ventes, achats, banque,
 * écritures) derrière les actions du dirigeant (§3 : « chaque action génère l'écriture en arrière-plan »).
 * Sans DOM ni stockage : l'interface (app/) le sérialise, les tests l'utilisent tel quel.
 */

import { buildChart, categoryById } from './pcg.js?v=e821f3b';
import { Ledger } from './ledger.js?v=e821f3b';
import { InvoiceBook, clientAux } from './invoices.js?v=e821f3b';
import { purchaseEntry, findDuplicates, knownVatOnDebits, ttcLine } from './purchases.js?v=e821f3b';
import { mergeTransactions, suggestMatches, settlementEntry, directEntry, DEFAULT_BANK_ACCOUNT } from './bank.js?v=e821f3b';
export { DEFAULT_BANK_ACCOUNT };
import { creditsOf, originalOf, groupBalance } from './receipts.js?v=e821f3b';
import { divRound, splitTtc, sum } from './money.js?v=e821f3b';
import { openingEntry } from './fecimport.js?v=e821f3b';
import { creditTargetsAsset } from './assets.js?v=e821f3b';
import { LIFECYCLE, currentStatus } from './lifecycle.js?v=e821f3b';
import { SCHEMA_VERSION, migrateState } from './schema.js?v=e821f3b';

/** Entrées d'argent sans facture de vente, proposées en langage courant. */
export const INCOME_CATEGORIES = [
  { id: 'apport', label: 'Apport personnel', account: '108000' },
  { id: 'apport-associe', label: 'Apport en compte courant d’associé', account: '455000' },
  { id: 'emprunt', label: 'Emprunt reçu', account: '164000' },
  { id: 'virement-interne', label: 'Virement entre mes comptes', account: '580000' },
  { id: 'remboursement', label: 'Remboursement reçu', account: '758000' },
  { id: 'interets', label: 'Intérêts reçus', account: '768000' },
];

/** Sorties d'argent sans facture ni charge : dettes réglées, prélèvements du dirigeant. */
export const OUTFLOW_CATEGORIES = [
  { id: 'paiement-tva', label: 'Paiement de la TVA', account: '445510' },
  { id: 'acompte-tva', label: 'Acompte de TVA (régime simplifié, juillet ou décembre)', account: '445810' },
  { id: 'acompte-is', label: 'Acompte ou solde d’impôt sur les sociétés', account: '444000' },
  { id: 'cotisations-urssaf', label: 'Cotisations URSSAF', account: '646000' },
  { id: 'salaires-verses', label: 'Salaires versés aux salariés', account: '421000' },
  { id: 'cotisations-salaries', label: 'Cotisations URSSAF des salariés', account: '431000' },
  { id: 'organismes-sociaux', label: 'Retraite complémentaire, mutuelle, prévoyance', account: '437000' },
  { id: 'remboursement-emprunt', label: "Remboursement d'emprunt (capital)", account: '164000' },
  { id: 'prelevement-personnel', label: 'Prélèvement personnel du dirigeant', account: '108000' },
  { id: 'remboursement-associe', label: 'Remboursement du compte courant d’associé', account: '455000' },
  { id: 'virement-interne-sortant', label: 'Virement vers un autre de mes comptes', account: '580000' },
];

/** Somme de plusieurs estimations de cotisations (activité mixte). */
export function combineEstimates(list) {
  const total = (k) => sum(list.map((e) => e[k]));
  return {
    turnover: total('turnover'),
    social: total('social'),
    acreReduction: total('acreReduction'),
    cfp: total('cfp'),
    liberatoire: total('liberatoire'),
    chamber: total('chamber'),
    total: total('total'),
    rates: list[0].rates,
    missing: [...new Set(list.flatMap((e) => e.missing))],
    byActivity: list,
  };
}

export const MAX_BANK_ACCOUNTS = 10;

import { recurringMethods } from './workspace/recurring.js?v=e821f3b';
import { vatMethods } from './workspace/vat.js?v=e821f3b';
import { receiptVatMethods } from './workspace/receipt-vat.js?v=e821f3b';
import { paymentVatMethods } from './workspace/payment-vat.js?v=e821f3b';
import { nexusRhMethods } from './workspace/nexusrh.js?v=e821f3b';
import { letteringMethods } from './workspace/lettering.js?v=e821f3b';
import { closingMethods } from './workspace/closing.js?v=e821f3b';
import { pilotageMethods } from './workspace/pilotage.js?v=e821f3b';
import { microMethods } from './workspace/micro.js?v=e821f3b';
import { depositMethods } from './deposit.js?v=e821f3b';
import { categorizationMethods, learnRule } from './categorization.js?v=e821f3b';
import { reminderMethods } from './reminders.js?v=e821f3b';

export class Workspace {
  constructor({ company, state: saved = {}, now, newId } = {}) {
    // État enregistré par une version précédente : mis au format actuel (core/schema.js).
    const state = migrateState(saved);
    this.company = company;
    this.newId = newId;
    this.now = now;
    this.chart = buildChart(state.extraAccounts || []);
    this.ledger = new Ledger({ chart: this.chart, fiscalYear: company.fiscalYear, now, state: state.ledger, newId });
    this.book = new InvoiceBook({ company, state: state.book, newId });
    this.clients = state.clients || [];
    this.purchases = state.purchases || [];
    this.transactions = state.transactions || [];
    this.bankAccounts = state.bankAccounts || [{ ...DEFAULT_BANK_ACCOUNT }];
    this.recurring = state.recurring || [];
    this.archives = state.archives || [];
    this.payrolls = state.payrolls || [];
    this.seq = state.seq || 0;
  }

  toJSON() {
    return {
      schemaVersion: SCHEMA_VERSION,
      company: this.company,
      ledger: this.ledger.toJSON(),
      book: this.book.toJSON(),
      clients: this.clients,
      purchases: this.purchases,
      transactions: this.transactions,
      bankAccounts: this.bankAccounts,
      recurring: this.recurring,
      archives: this.archives,
      payrolls: this.payrolls,
      seq: this.seq,
    };
  }

  /**
   * Opération atomique : en cas d'erreur en cours de route, l'état revient exactement à ce qu'il était
   * (pas d'écriture orpheline ni de règlement enregistré à moitié). Les opérations imbriquées
   * (catégorisation d'un équipement → dépense → rapprochement) partagent la même sauvegarde.
   */
  _atomic(fn) {
    if (this._atomicDepth) return fn();
    const snapshot = structuredClone(this.toJSON());
    this._atomicDepth = 1;
    try {
      return fn();
    } catch (err) {
      this._restore(snapshot);
      throw err;
    } finally {
      this._atomicDepth = 0;
    }
  }

  /** Remet l'état d'une sauvegarde (entreprise modifiée sur place : d'autres objets la référencent). */
  _restore(s) {
    for (const k of Object.keys(this.company)) delete this.company[k];
    Object.assign(this.company, s.company);
    this.ledger = new Ledger({ chart: this.chart, fiscalYear: this.company.fiscalYear, now: this.now, state: s.ledger, newId: this.newId });
    this.book = new InvoiceBook({ company: this.company, state: s.book, newId: this.newId });
    Object.assign(this, {
      clients: s.clients,
      purchases: s.purchases,
      transactions: s.transactions,
      bankAccounts: s.bankAccounts,
      recurring: s.recurring,
      archives: s.archives,
      payrolls: s.payrolls,
      seq: s.seq,
    });
  }

  _id(prefix) {
    const n = ++this.seq;
    return this.newId ? this.newId(n) : `${prefix}${n}`;
  }

  // ---------------------------------------------------------------- clients

  saveClient(data) {
    const code =
      data.code ||
      data.name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8) ||
      'CLIENT';
    if (data.id) {
      const idx = this.clients.findIndex((c) => c.id === data.id);
      this.clients[idx] = { ...this.clients[idx], ...data };
      return this.clients[idx];
    }
    const taken = new Set(this.clients.map((c) => c.code));
    let unique = code;
    for (let i = 2; taken.has(unique); i++) unique = `${code.slice(0, 6)}${i}`;
    const client = { type: 'B2B', country: 'FR', ...data, id: this._id('C'), code: unique };
    this.clients.push(client);
    return client;
  }

  // ---------------------------------------------------------------- ventes

  issueInvoice(id) {
    this._assertNotDeclared(this.book.get(id));
    const issued = this.book.issue(id, { ledger: this.ledger });
    // Un avoir modifie la TVA exigible et le restant dû de la facture qu'il corrige.
    const original = issued.type === 'credit' ? originalOf(this.book.invoices, issued) : null;
    if (original) {
      this._syncReceiptVat(original, issued.issueDate);
      this.#letterGroupIfSettled(original, issued.issueDate);
    }
    return issued;
  }

  /** Groupe soldé (facture + avoirs + règlements) : lettrage de toutes ses lignes client. */
  #letterGroupIfSettled(inv, date) {
    if (groupBalance(this.book.invoices, this.book.payments, inv) !== 0) return;
    const docs = [inv, ...creditsOf(this.book.invoices, inv)];
    const refs = [
      ...docs.filter((d) => this.ledger.entries.some((e) => e.id === d.entryId)).map((d) => ({ entryId: d.entryId, lineIndex: 0 })),
      ...docs.flatMap((d) => (this.book.payments[d.id] || []).map((p) => ({ entryId: p.entryId, lineIndex: p.lineIndex }))),
    ]
      .filter((r) => this.ledger.entries.some((e) => e.id === r.entryId))
      // Lignes déjà lettrées (facture soldée avant l'avoir) : seules les autres restent à lettrer ensemble.
      .filter((r) => !this.ledger.entries.find((e) => e.id === r.entryId).lines[r.lineIndex]?.letter);
    if (refs.length < 2) return;
    try {
      this.ledger.letter(refs, date);
    } catch {
      // Solde non nul dans l'exercice (pièce d'un exercice précédent, écart absorbé) : lettrage manuel.
    }
  }

  invoiceAux(inv) {
    // Facture d'un exercice précédent : son écriture n'est plus dans le grand livre de l'année.
    return this.ledger.entries.find((e) => e.id === inv.entryId)?.lines[0].aux || clientAux(inv.client);
  }

  /** Factures clients avec restant dû et ancienneté (§3.5). */
  receivables(today) {
    return this.book.invoices
      .filter((i) => i.status === 'issued' && i.type !== 'credit' && i.type !== 'quote')
      .map((i) => {
        const outstanding = this.book.outstanding(i);
        const lateDays = Math.floor((Date.parse(today) - Date.parse(i.dueDate)) / 86400000);
        let bucket = 'a-echoir';
        if (outstanding <= 0) bucket = 'payee';
        else if (lateDays > 60) bucket = '+60';
        else if (lateDays > 30) bucket = '31-60';
        else if (lateDays > 0) bucket = '0-30';
        return { invoice: i, outstanding, lateDays, bucket };
      });
  }

  // ---------------------------------------------------------------- reprise d'historique

  /** Importe un bilan d'ouverture (fecimport.js) : écriture d'à-nouveaux et clients repris. */
  importOpening(opening) {
    if (this.ledger.entries.some((e) => e.source?.kind === 'fec-import')) throw new Error('Un bilan d’ouverture a déjà été repris pour cet exercice.');
    const entry = this.ledger.addDraft(openingEntry(opening, this.company.fiscalYear.start));
    let clientsCreated = 0;
    for (const c of opening.clients) {
      if (this.clients.some((x) => x.code === c.code || x.aux === c.aux)) continue;
      this.saveClient({ code: c.code, aux: c.aux, name: c.name || c.code, type: 'B2B', country: 'FR' });
      clientsCreated++;
    }
    return { entry, clientsCreated };
  }

  // ---------------------------------------------------------------- achats

  /**
   * Enregistre une dépense saisie en TTC (le cas courant d'une facture papier ou photo).
   * @param {{supplier, date, number, categoryId, ttc, vatRateBp}} data
   * @param {{force?: boolean}} opts enregistrer malgré un doublon probable
   */
  addPurchase(
    { supplier, date, number = '', categoryId, ttc, vatRateBp = 2000, documentName = '', type = 'invoice', reverseCharge = false },
    { force = false } = {},
  ) {
    // Fournisseur étranger (autoliquidation) : sa facture ne porte pas de TVA française, le montant
    // saisi est donc déjà le HT — la TVA due est calculée à part par purchaseEntry.
    const foreign = reverseCharge || (supplier.country || 'FR') !== 'FR';
    const line = foreign ? { categoryId, ht: ttc, vatRateBp } : { categoryId, ...ttcLine(ttc, vatRateBp) };
    return this.addPurchaseLines({ supplier, date, number, documentName, type, reverseCharge, lines: [line] }, { force });
  }

  /**
   * Enregistre une dépense à plusieurs lignes (HT par taux), cas d'une facture électronique reçue.
   * @param {{supplier, date, number, lines: {categoryId, ht, vatRateBp}[], documentName?, einvoice?}} data
   * @param {{force?: boolean}} opts enregistrer malgré un doublon probable
   */
  addPurchaseLines(
    { supplier, date, number = '', lines, documentName = '', einvoice = null, type = 'invoice', reverseCharge = false },
    { force = false } = {},
  ) {
    const p = { id: this._id('P'), supplier: { country: 'FR', ...supplier }, date, number, documentName, lines: structuredClone(lines) };
    // Option pour les débits non précisée (facture électronique reçue) : celle connue du fournisseur.
    if (p.supplier.vatOnDebits === undefined && knownVatOnDebits(this.purchases, p.supplier.name)) p.supplier.vatOnDebits = true;
    if (reverseCharge) p.reverseCharge = true;
    if (type === 'credit') {
      p.type = 'credit';
      // Avoir sur un équipement du registre : il diminue le compte du bien d'origine.
      for (const l of p.lines) {
        if (
          categoryById(l.categoryId).fixedAsset &&
          creditTargetsAsset(this.purchases, this.company, { supplierName: p.supplier.name, categoryId: l.categoryId, date })
        )
          l.assetCredit = true;
      }
    }
    if (einvoice) p.einvoice = einvoice;
    const duplicates = findDuplicates(p, this.purchases);
    // Doublon probable : rien n'est enregistré tant que l'utilisateur n'a pas confirmé (force).
    if (duplicates.length && !force) return { purchase: null, duplicates };
    const entry = purchaseEntry(p, this.company);
    entry.date = this._undeclaredDate(entry.date); // facture reçue après la déclaration de son mois
    const created = this.ledger.addDraft(entry);
    p.entryId = created.id;
    p.totalTtc = entry.meta.totalTtc;
    p.paid = 0;
    p.aux = entry.lines.at(-1).aux;
    p.thirdPartyAccount = entry.lines.at(-1).account;
    this.purchases.push(p);
    return { purchase: p, duplicates };
  }

  // ---------------------------------------------------------------- banque

  importTransactions(list) {
    return mergeTransactions(this.transactions, list);
  }

  /** Compte bancaire supplémentaire : sous-compte 512100, 512200… (10 comptes au plus). */
  addBankAccount({ label, iban = '', provider = 'manual' }) {
    const name = String(label ?? '').trim();
    if (!name) throw new Error('Donnez un nom à ce compte (par exemple « Qonto » ou « Livret »).');
    if (this.bankAccounts.length >= MAX_BANK_ACCOUNTS) throw new Error(`${MAX_BANK_ACCOUNTS} comptes bancaires au plus.`);
    const used = new Set(this.bankAccounts.map((a) => a.glAccount));
    const glAccount = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `512${n}00`).find((a) => !used.has(a));
    const digits = String(iban).replace(/\s/g, '');
    const account = { id: this._id('bank'), label: name, glAccount, provider, ibanLast4: digits.length >= 4 ? digits.slice(-4) : null };
    this.bankAccounts.push(account);
    return account;
  }

  /** Sous-compte 512 du compte d'une transaction (compte principal par défaut). */
  bankGlOf(tx) {
    return this.bankAccounts.find((a) => a.id === (tx.accountId || 'default'))?.glAccount || '512000';
  }

  /** Solde comptable d'un compte bancaire. */
  bankBalance(accountId, opts) {
    const account = this.bankAccounts.find((a) => a.id === accountId);
    if (!account) throw new Error('Compte bancaire inconnu');
    return this.ledger.balanceOf(account.glAccount, opts);
  }

  openDocs() {
    // Sous-comptes clients dont la créance est en 416 (client douteux), solde positif.
    const owed416 = new Map();
    for (const l of this.ledger.lines()) if (l.account === '416000') owed416.set(l.aux, (owed416.get(l.aux) || 0) + l.debit - l.credit);
    const doubtful = new Set([...owed416].filter(([, v]) => v > 0).map(([aux]) => aux));
    const sales = this.book.invoices
      .filter((i) => i.status === 'issued' && i.type !== 'credit' && i.type !== 'quote' && this.book.outstanding(i) > 0)
      .map((i) => ({
        id: i.id,
        kind: 'invoice',
        number: i.number,
        partyName: i.client.name,
        date: i.issueDate,
        dueDate: i.dueDate,
        outstanding: this.book.outstanding(i),
        // Client passé en douteux à la clôture : sa créance est en 416, le règlement la solde.
        thirdPartyAccount: doubtful.has(this.invoiceAux(i)) && !this.ledger.entries.some((e) => e.id === i.entryId) ? '416000' : '411000',
        aux: this.invoiceAux(i),
      }));
    const buys = this.purchases
      .filter((p) => p.totalTtc - p.paid > 0)
      .map((p) => ({
        id: p.id,
        kind: p.type === 'credit' ? 'purchase-credit' : 'purchase',
        number: p.number || p.id,
        partyName: p.supplier.name,
        date: p.date,
        dueDate: p.date,
        outstanding: p.totalTtc - p.paid,
        thirdPartyAccount: p.thirdPartyAccount,
        aux: p.aux,
      }));
    const refunds = this.book.invoices
      .filter((c) => c.type === 'credit' && c.status === 'issued' && this.book.outstanding(c) < 0)
      .map((c) => ({
        id: c.id,
        kind: 'credit',
        number: c.number,
        partyName: c.client.name,
        date: c.issueDate,
        dueDate: c.issueDate,
        outstanding: -this.book.outstanding(c),
        thirdPartyAccount: '411000',
        aux: this.invoiceAux(originalOf(this.book.invoices, c) || c),
      }));
    return [...sales, ...buys, ...refunds];
  }

  suggestionsFor(txId, docs = this.openDocs()) {
    const tx = this.transactions.find((t) => t.id === txId);
    return suggestMatches(tx, docs);
  }

  /** Propositions pour plusieurs mouvements : pièces ouvertes calculées une seule fois. */
  suggestionsForMany(txIds) {
    const docs = this.openDocs();
    return new Map(txIds.map((id) => [id, this.suggestionsFor(id, docs)]));
  }

  /**
   * Rapproche une transaction de pièces : écriture de règlement, TVA sur encaissements, lettrage
   * automatique des pièces soldées (§3.4 « lettrage automatique à chaque rapprochement »).
   */
  matchTransaction(txId, allocations) {
    const tx = this.transactions.find((t) => t.id === txId);
    if (!tx || tx.status !== 'open') throw new Error('Transaction déjà traitée');
    const entry = this.ledger.addDraft(settlementEntry(tx, allocations, { bankAccount: this.bankGlOf(tx) }));
    // Rapproché après la déclaration de TVA de son mois : la TVA sur encaissement passe dans la première
    // période non déclarée (elle ne serait sinon déclarée nulle part).
    const undeclared = this._firstUndeclaredDay();
    const vatDate = undeclared && tx.date < undeclared ? { vatDate: undeclared } : {};
    allocations.forEach(({ doc, amount }, i) => {
      const lineIndex = i + 1; // ligne 0 = banque, puis une ligne par pièce dans l'ordre des allocations
      if (doc.kind === 'credit') {
        // Remboursement d'un avoir au client : règlement négatif sur l'avoir.
        const cn = this.book.get(doc.id);
        this.book.recordPayment(cn.id, { amount: -amount, date: tx.date, ref: tx.id, entryId: entry.id, lineIndex, ...vatDate });
        const original = originalOf(this.book.invoices, cn);
        if (original) {
          this._syncReceiptVat(original, tx.date);
          this.#letterGroupIfSettled(original, tx.date);
        }
      } else if (doc.kind === 'invoice') {
        const inv = this.book.get(doc.id);
        const left = this.book.recordPayment(inv.id, { amount, date: tx.date, ref: tx.id, entryId: entry.id, lineIndex, ...vatDate });
        this._syncReceiptVat(inv, tx.date);
        if (left === 0) {
          if (creditsOf(this.book.invoices, inv).length) this.#letterGroupIfSettled(inv, tx.date);
          else if (this.ledger.entries.some((e) => e.id === inv.entryId))
            this.#letterSettled({ entryId: inv.entryId, lineIndex: 0 }, this.book.payments[inv.id], tx.date);
          // Facture d'un exercice précédent : sa ligne d'à-nouveau avec ses règlements, sinon (réglée en partie
          // l'an passé) tout le compte du client dès qu'il revient à zéro.
          else this._letterPriorYear(inv, doc, this.book.payments[inv.id] || [], tx.date);
          const events = this.book.lifecycle[inv.id] || [];
          const last = currentStatus(events);
          // Pas de statut automatique après un statut final (facture refusée puis payée : à traiter à la main).
          if (!last || !LIFECYCLE[last.status].final)
            this.book.recordStatus(inv.id, { status: 'encaissee', date: tx.date, source: 'banque', detail: tx.label });
        }
      } else {
        const p = this.purchases.find((x) => x.id === doc.id);
        p.paid += amount;
        (p.payments ||= []).push({ amount, date: tx.date, ref: tx.id, entryId: entry.id, lineIndex });
        this._syncPurchaseVat(p, tx.date);
        const purchaseEntryRow = this.ledger.entries.find((e) => e.id === p.entryId);
        if (p.paid === p.totalTtc && purchaseEntryRow) {
          this.#letterSettled({ entryId: p.entryId, lineIndex: purchaseEntryRow.lines.length - 1 }, p.payments, tx.date);
        }
      }
    });
    tx.status = 'matched';
    tx.entryId = entry.id;
    return entry;
  }

  #letterSettled(docRef, payments, date) {
    const refs = [docRef, ...payments.map((p) => ({ entryId: p.entryId, lineIndex: p.lineIndex }))];
    try {
      this.ledger.letter(refs, date);
    } catch {
      // Solde non nul (écart absorbé ailleurs, trop-perçu) : la pièce reste à lettrer manuellement.
    }
  }

  /** Transaction sans facture : dépense ou recette catégorisée directement, signalée sans justificatif. */
  categorizeTransaction(txId, { categoryId, vatRateBp = 0, hasReceipt = false }) {
    const tx = this.transactions.find((t) => t.id === txId);
    if (!tx || tx.status !== 'open') throw new Error('Transaction déjà traitée');
    // Choix retenu pour les prochains mouvements semblables (annulé avec l'opération si elle échoue).
    this.company.categoryRules = learnRule(this.company.categoryRules, tx, { categoryId, vatRateBp });
    const income = INCOME_CATEGORIES.find((c) => c.id === categoryId) || OUTFLOW_CATEGORIES.find((c) => c.id === categoryId);
    if (income) {
      const e = this.ledger.addDraft(directEntry(tx, { account: income.account, missingReceipt: false, bankAccount: this.bankGlOf(tx) }));
      tx.status = 'matched';
      tx.entryId = e.id;
      if (categoryId === 'cotisations-urssaf') this._markUrssafPaid(tx);
      return e;
    }
    const cat = categoryById(categoryId);
    if (cat.fixedAsset) {
      // Équipement payé par carte ou virement : même circuit qu'une facture d'achat (seuil
      // d'immobilisation, registre, compte 404), puis rapprochement du paiement. Sans facture, la TVA
      // n'est pas récupérable : elle fait partie du coût.
      const amount = Math.abs(tx.amount);
      const rate = hasReceipt ? vatRateBp : 0;
      const { purchase } = this.addPurchaseLines(
        { supplier: { name: tx.label }, date: tx.date, lines: [{ categoryId, ...ttcLine(amount, rate) }] },
        { force: true },
      );
      const doc = this.openDocs().find((d) => d.kind === 'purchase' && d.id === purchase.id);
      const entry = this.matchTransaction(txId, [{ doc, amount }]);
      tx.missingReceipt = !hasReceipt;
      purchase.missingReceipt = !hasReceipt;
      return entry;
    }
    const franchise = this.company.vatRegime === 'franchise';
    const { tva } = splitTtc(Math.abs(tx.amount), vatRateBp);
    // Sans facture, la TVA n'est pas déductible : seule une pièce justificative ouvre droit à déduction.
    const deductible = franchise || !hasReceipt ? 0 : divRound(tva * cat.vatDeductiblePct, 100);
    const vatAccount = cat.fixedAsset ? '445620' : '445660';
    const later = this._undeclaredDate(tx.date) !== tx.date;
    const entry = this.ledger.addDraft(
      directEntry(tx, { account: cat.account, vatAccount, vatAmount: later ? 0 : deductible, missingReceipt: !hasReceipt, bankAccount: this.bankGlOf(tx) }),
    );
    if (later && deductible) this._deferredVat(tx, cat.account, vatAccount, deductible);
    tx.status = 'matched';
    tx.entryId = entry.id;
    tx.missingReceipt = !hasReceipt;
    return entry;
  }

  /** Justificatif ajouté après coup (photo, PDF) : la transaction n'est plus signalée « sans justificatif ». */
  markReceiptAttached(txId) {
    const tx = this.transactions.find((t) => t.id === txId);
    if (!tx) throw new Error('Transaction introuvable');
    tx.missingReceipt = false;
  }

  ignoreTransaction(txId) {
    const tx = this.transactions.find((t) => t.id === txId);
    tx.status = 'ignored';
  }

  dashboard(today) {
    const year = this.company.fiscalYear;
    const revenue = -this.ledger.balanceOf('70', { from: year.start, to: today });
    const expenses = this.ledger.balanceOf('6', { from: year.start, to: today });
    return {
      cash: this.ledger.balanceOf('512'),
      receivable: this.ledger.balanceOf('411'),
      payable: -this.ledger.balanceOf('40'),
      revenue,
      expenses,
      result: revenue - expenses,
    };
  }
}

// Méthodes réparties par domaine (même `this`, même API) : voir core/workspace/.
for (const methods of [
  recurringMethods,
  vatMethods,
  receiptVatMethods,
  paymentVatMethods,
  nexusRhMethods,
  letteringMethods,
  closingMethods,
  pilotageMethods,
  microMethods,
  depositMethods,
  categorizationMethods,
  reminderMethods,
]) {
  Object.defineProperties(Workspace.prototype, Object.getOwnPropertyDescriptors(methods));
}

// Opérations qui modifient plusieurs éléments à la fois : atomiques (voir _atomic). La génération des
// factures récurrentes n'est pas enveloppée : chaque facture émise l'est déjà.
for (const name of [
  'saveClient',
  'issueInvoice',
  'importOpening',
  'addPurchase',
  'addPurchaseLines',
  'importNexusRh',
  'importTransactions',
  'addBankAccount',
  'matchTransaction',
  'categorizeTransaction',
  'ignoreTransaction',
  'saveRecurring',
  'deleteRecurring',
  'declareVat',
  'addInventory',
  'bookDepreciation',
  'bookCorporateTax',
  'allocateResult',
  'closeYear',
  'recordUrssafDeclaration',
  'markDeposited',
  'recordReminder',
]) {
  const original = Workspace.prototype[name];
  if (typeof original !== 'function') throw new Error(`Workspace.${name} introuvable`);
  Object.defineProperty(Workspace.prototype, name, {
    value: function atomic(...args) {
      return this._atomic(() => original.apply(this, args));
    },
    writable: true,
    configurable: true,
  });
}
