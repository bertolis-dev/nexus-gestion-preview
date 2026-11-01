/**
 * Facturation de vente (§3.2) : calcul, contrôle de conformité, numérotation continue et
 * génération de l'écriture comptable. Une facture émise est figée (`Object.freeze`) :
 * la seule correction possible est l'avoir lié.
 */

import { assertCents, divRound, formatEuros, sum, vatFromHt } from './money.js?v=d415f7a';
import { REVENUE_ACCOUNT_BY_NATURE } from './pcg.js?v=d415f7a';
import { LIFECYCLE, currentStatus } from './lifecycle.js?v=d415f7a';
import { tradeZone } from './countries.js?v=d415f7a';
import { creditsOf, originalOf, groupBalance } from './receipts.js?v=d415f7a';
import { addDays } from './dates.js?v=d415f7a';

export const VAT_RATES_BP = [2000, 1000, 550, 210, 0];

export const FRANCHISE_MENTION = 'TVA non applicable, art. 293 B du CGI';
export const LATE_PAYMENT_MENTION =
  "En cas de retard de paiement : pénalités au taux de 3 fois le taux d'intérêt légal et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 du Code de commerce). Pas d'escompte pour paiement anticipé.";

const SIREN_RE = /^\d{9}$/;

/** Clé de Luhn : un SIREN valide passe le contrôle (hors cas particulier de La Poste). */
export function isValidSiren(siren) {
  if (!SIREN_RE.test(siren || '')) return false;
  if (siren === '356000000') return true;
  let total = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(siren[8 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
  }
  return total % 10 === 0;
}

/** Validité proposée d'un devis (usage commercial, modifiable sur chaque devis). */
export const QUOTE_VALIDITY_DAYS = 30;

/**
 * Échéance proposée à la création : délai de paiement de l'entreprise (30 jours par défaut) pour une
 * facture, validité pour un devis, paiement à réception pour une facture d'acompte.
 */
export function defaultDueDate({ type = 'invoice', issueDate, paymentTermsDays }) {
  const days = type === 'quote' ? QUOTE_VALIDITY_DAYS : type === 'deposit' ? 0 : paymentTermsDays || 30;
  return addDays(issueDate, days);
}

export function lineHt(line) {
  assertCents(line.unitPrice, 'prix unitaire');
  const qtyMilli = Math.round(Number(line.qty) * 1000);
  const gross = divRound(qtyMilli * line.unitPrice, 1000);
  const discountBp = line.discountBp || 0;
  return gross - divRound(gross * discountBp, 10000);
}

/**
 * Totaux par taux : la TVA est calculée sur la base agrégée par taux (et non ligne à ligne), ce qui
 * évite l'accumulation d'écarts d'arrondi et correspond au récapitulatif imposé par taux.
 */
export function computeTotals(invoice, { franchise = false } = {}) {
  const byRate = new Map();
  for (const line of invoice.lines) {
    const rate = franchise ? 0 : line.vatRateBp;
    const ht = lineHt(line);
    const row = byRate.get(rate) || { rateBp: rate, base: 0, vat: 0 };
    row.base += ht;
    byRate.set(rate, row);
  }
  const vatBreakdown = [...byRate.values()].map((r) => ({ ...r, vat: vatFromHt(r.base, r.rateBp) })).sort((a, b) => b.rateBp - a.rateBp);
  const totalHt = sum(vatBreakdown.map((r) => r.base));
  const totalVat = sum(vatBreakdown.map((r) => r.vat));
  const depositsDeducted = sum((invoice.deposits || []).map((d) => d.amountTtc));
  return {
    vatBreakdown,
    totalHt,
    totalVat,
    totalTtc: totalHt + totalVat,
    depositsDeducted,
    netToPay: totalHt + totalVat - depositsDeducted,
  };
}

/**
 * Facture sans TVA française : franchise en base (293 B), ou client professionnel établi hors de
 * France (autoliquidation des services, livraison intracommunautaire exonérée). Dans ces cas, tous
 * les taux sont ramenés à 0 : la mention légale correspondante est ajoutée par legalMentions().
 */
export function isVatExempt(invoice, company) {
  const c = invoice.client || {};
  if (company.vatRegime === 'franchise') return true;
  const zone = tradeZone(c.country);
  if (c.type !== 'B2C') return zone !== 'FR';
  // Particulier hors UE : l'exportation de biens est exonérée (art. 262 I) ; ses prestations restent
  // en principe taxées en France.
  return zone === 'HORS_UE' && operationNature(invoice.lines || []) === 'biens';
}

/** Nature des opérations (mention obligatoire au 01/09/2027, activée dès la V1). */
export function operationNature(lines) {
  const natures = new Set(lines.map((l) => (l.nature === 'services' ? 'services' : 'biens')));
  if (natures.size === 2) return 'mixte';
  return natures.has('services') ? 'services' : 'biens';
}

/**
 * Contrôle de conformité : renvoie la liste des problèmes en langage courant (§5, « blocages
 * bienveillants »). Une facture avec au moins un problème ne peut pas être émise.
 */
export function checkInvoice(invoice, company) {
  const issues = [];
  const c = invoice.client || {};
  const need = (cond, message, field) => {
    if (!cond) issues.push({ field, message });
  };
  const isCompany = company.legalForm && company.legalForm !== 'EI';

  need(company.name, 'Le nom de votre entreprise est manquant (Paramètres).', 'company.name');
  need(isValidSiren(company.siren), 'Votre SIREN est manquant ou invalide (Paramètres).', 'company.siren');
  need(company.address, 'L’adresse de votre entreprise est manquante (Paramètres).', 'company.address');
  if (isCompany) {
    need(company.capital, 'Le capital social de votre société doit figurer sur la facture (Paramètres).', 'company.capital');
    need(
      company.registration?.trim(),
      'L’immatriculation de votre société (RCS ou RM et ville, par exemple « RCS Lyon ») doit figurer sur la facture (Paramètres).',
      'company.registration',
    );
  }
  if (company.vatRegime !== 'franchise') {
    need(
      /^FR[0-9A-Z]{2}\d{9}$/.test(company.vatNumber || ''),
      'Votre numéro de TVA intracommunautaire est manquant ou invalide (Paramètres).',
      'company.vatNumber',
    );
  }

  need(c.name, 'Le nom du client est manquant.', 'client.name');
  need(c.address, 'L’adresse du client est manquante.', 'client.address');
  const b2bFrance = c.type !== 'B2C' && (c.country || 'FR') === 'FR';
  if (b2bFrance && invoice.type !== 'quote') {
    need(isValidSiren(c.siren), 'Le SIREN de ce client est manquant : il est obligatoire pour envoyer la facture.', 'client.siren');
  }
  if (c.type !== 'B2C' && tradeZone(c.country) === 'UE' && company.vatRegime !== 'franchise') {
    need(c.vatNumber, 'Le numéro de TVA intracommunautaire de ce client européen est manquant (autoliquidation).', 'client.vatNumber');
  }

  need(invoice.issueDate, "La date d'émission est manquante.", 'issueDate');
  need(invoice.dueDate, invoice.type === 'quote' ? 'La date de validité du devis est manquante.' : "La date d'échéance est manquante.", 'dueDate');
  if (invoice.issueDate && invoice.dueDate) {
    need(invoice.dueDate >= invoice.issueDate, "La date d'échéance est antérieure à la date d'émission.", 'dueDate');
  }
  need(invoice.lines?.length > 0, 'Ajoutez au moins une ligne à la facture.', 'lines');
  (invoice.lines || []).forEach((l, i) => {
    need(l.label && l.label.trim(), `Ligne ${i + 1} : la désignation est vide.`, `lines.${i}.label`);
    need(Number(l.qty) > 0, `Ligne ${i + 1} : la quantité doit être positive.`, `lines.${i}.qty`);
    // Le calcul se fait au millième : au-delà, la quantité imprimée et le montant ne concorderaient plus.
    need(Number.isInteger(Math.round(Number(l.qty) * 1e6) / 1000), `Ligne ${i + 1} : la quantité accepte 3 décimales au plus.`, `lines.${i}.qty`);
    need(Number.isSafeInteger(l.unitPrice) && l.unitPrice >= 0, `Ligne ${i + 1} : le prix est invalide.`, `lines.${i}.unitPrice`);
    if (company.vatRegime !== 'franchise') {
      need(VAT_RATES_BP.includes(l.vatRateBp), `Ligne ${i + 1} : choisissez un taux de TVA.`, `lines.${i}.vatRateBp`);
    }
  });
  if (invoice.type === 'credit') {
    need(invoice.creditOf, "Un avoir doit mentionner la facture qu'il corrige.", 'creditOf');
  }
  for (const l of invoice.lines || [])
    if ((l.discountBp || 0) < 0 || (l.discountBp || 0) > 10000) need(false, 'Une remise doit être comprise entre 0 et 100 %.', 'lines');
  return issues;
}

/** Mentions légales imprimées automatiquement selon le contexte. */
export function legalMentions(invoice, company) {
  const m = [];
  if (company.vatRegime === 'franchise') m.push(FRANCHISE_MENTION);
  if (company.vatOnDebits) m.push('Option pour le paiement de la TVA d’après les débits');
  const c = invoice.client || {};
  const zone = tradeZone(c.country);
  const nature = operationNature(invoice.lines);
  if (company.vatRegime !== 'franchise' && zone !== 'FR' && (c.type !== 'B2C' || isVatExempt(invoice, company))) {
    const goods = nature !== 'services';
    const services = nature !== 'biens';
    if (zone === 'UE') {
      if (goods) m.push('Exonération de TVA, art. 262 ter I du CGI (livraison intracommunautaire)');
      if (services) m.push('Autoliquidation — art. 283-2 du CGI / art. 196 de la directive 2006/112/CE');
    } else {
      if (goods) m.push('Exonération de TVA, art. 262 I du CGI (exportation hors de l’Union européenne)');
      if (services && c.type !== 'B2C') m.push('TVA non applicable, art. 259-1 du CGI (prestation réalisée hors de France)');
    }
  }
  if (invoice.type === 'quote')
    m.push(`Devis valable jusqu'au ${invoice.dueDate.split('-').reverse().join('/')}. Bon pour accord : date et signature du client.`);
  else if (c.type !== 'B2C') m.push(LATE_PAYMENT_MENTION);
  if (invoice.quoteRef) m.push(`Selon devis ${invoice.quoteRef}`);
  return m;
}

export class InvoiceError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.issues = issues;
  }
}

function deepFreeze(o) {
  Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v));
  return Object.freeze(o);
}

/**
 * Registre des factures d'une structure : numérotation chronologique continue par série et par
 * année (« F2026-0001 »), sans trou — un numéro n'est attribué qu'à l'émission, jamais au brouillon.
 */
export class InvoiceBook {
  constructor({ company, state, newId } = {}) {
    this.company = company;
    this.newId = newId || ((n) => `I${n}`);
    this.invoices = state?.invoices || [];
    this.counters = state?.counters || {};
    this.seq = state?.seq || 0;
    // Les paiements vivent hors de la facture émise (qui est figée) : { [invoiceId]: [{ amount, date, ref }] }.
    this.payments = state?.payments || {};
    // Cycle de vie (déposée, reçue, refusée, encaissée…) : { [invoiceId]: [{ status, date, source, detail }] }.
    this.lifecycle = state?.lifecycle || {};
  }

  toJSON() {
    return { invoices: this.invoices, counters: this.counters, seq: this.seq, payments: this.payments, lifecycle: this.lifecycle };
  }

  createDraft(data) {
    const inv = {
      id: this.newId(++this.seq),
      type: 'invoice',
      series: data.type === 'quote' ? 'D' : 'F',
      status: 'draft',
      number: null,
      deposits: [],
      ...structuredClone(data),
    };
    this.invoices.push(inv);
    return inv;
  }

  get(id) {
    const inv = this.invoices.find((x) => x.id === id);
    if (!inv) throw new InvoiceError(`Facture introuvable : ${id}`);
    return inv;
  }

  updateDraft(id, patch) {
    const idx = this.invoices.findIndex((x) => x.id === id);
    if (idx < 0) throw new InvoiceError(`Facture introuvable : ${id}`);
    if (this.invoices[idx].status !== 'draft') throw new InvoiceError('Une facture émise ne se modifie plus : créez un avoir.');
    this.invoices[idx] = { ...this.invoices[idx], ...structuredClone(patch), id, status: 'draft', number: null };
    return this.invoices[idx];
  }

  deleteDraft(id) {
    const inv = this.get(id);
    if (inv.status !== 'draft') throw new InvoiceError('Une facture émise ne se supprime pas.');
    this.invoices = this.invoices.filter((x) => x.id !== id);
  }

  /** Émet la facture : contrôle, numéro, figement. Renvoie la facture émise. */
  issue(id, { ledger } = {}) {
    const idx = this.invoices.findIndex((x) => x.id === id);
    const draft = this.invoices[idx];
    if (!draft) throw new InvoiceError(`Facture introuvable : ${id}`);
    if (draft.status !== 'draft') throw new InvoiceError('Facture déjà émise.');
    const issues = checkInvoice(draft, this.company);
    if (issues.length) throw new InvoiceError('Facture incomplète', issues);

    const year = draft.issueDate.slice(0, 4);
    const lastIssued = this.invoices
      .filter((x) => x.status === 'issued' && x.series === draft.series)
      .reduce((max, x) => (x.issueDate > max ? x.issueDate : max), '');
    if (lastIssued && draft.issueDate < lastIssued) {
      throw new InvoiceError(
        `La date d'émission ne peut pas être antérieure à la dernière facture émise (${lastIssued}) : la numérotation doit rester chronologique.`,
      );
    }
    const key = `${draft.series}${year}`;
    const n = (this.counters[key] || 0) + 1;
    const totals = computeTotals(draft, { franchise: isVatExempt(draft, this.company) });
    if (draft.type === 'credit') {
      const original = this.invoices.find((i) => i.status === 'issued' && i.number === draft.creditOf);
      if (original) {
        // Un acompte déjà déduit d'une facture finale se corrige par un avoir sur cette facture finale.
        const final = this.invoices.find((i) => i.status === 'issued' && (i.deposits || []).some((d) => d.id === original.id));
        if (final)
          throw new InvoiceError(`L'acompte ${original.number} est déjà déduit de la facture ${final.number} : faites l'avoir sur la facture ${final.number}.`);
        const already = sum(
          this.invoices.filter((c) => c.type === 'credit' && c.status === 'issued' && c.creditOf === original.number).map((c) => c.totals.totalTtc),
        );
        if (already + totals.totalTtc > original.totals.totalTtc)
          throw new InvoiceError(
            `Cet avoir dépasse ce qui reste à créditer sur la facture ${original.number} (${formatEuros(original.totals.totalTtc - already)}).`,
          );
      }
    }
    const issued = {
      ...draft,
      status: 'issued',
      number: `${key}-${String(n).padStart(4, '0')}`,
      issuer: structuredClone({
        ...this.company,
        logo: undefined,
        categoryRules: undefined,
        reminders: undefined,
        reminderTemplates: undefined,
        catalog: undefined,
        autoReminders: undefined,
        ...{ timeEntries: undefined, stockMoves: undefined, budget: undefined, vatReturns: undefined, urssafDeclarations: undefined },
      }),
      operationNature: operationNature(draft.lines),
      mentions: legalMentions(draft, this.company),
      totals,
    };
    if (issued.deposits?.length) this.#checkDeposits(issued);
    if (ledger && issued.type !== 'quote') {
      const creditOfDeposit =
        issued.type === 'credit' && this.invoices.some((i) => i.type === 'deposit' && i.status === 'issued' && i.number === issued.creditOf);
      issued.entryId = ledger.addDraft(invoiceEntry(issued, this.company, { creditOfDeposit })).id;
    }
    this.counters[key] = n;
    this.invoices[idx] = deepFreeze(issued);
    return this.invoices[idx];
  }

  /** Acomptes déductibles : factures d'acompte émises pour ce client et pas encore déduites. */
  availableDeposits(clientCode, { exceptId } = {}) {
    const used = new Set(this.invoices.filter((i) => i.id !== exceptId).flatMap((i) => (i.deposits || []).map((d) => d.id)));
    // Un acompte diminué par avoir n'est déductible que pour ce qu'il en reste ; annulé, il disparaît.
    const credited = (dep, key) =>
      sum(this.invoices.filter((c) => c.type === 'credit' && c.status === 'issued' && c.creditOf === dep.number).map((c) => c.totals[key]));
    return this.invoices
      .filter((i) => i.type === 'deposit' && i.status === 'issued' && i.client.code === clientCode && !used.has(i.id))
      .map((i) => ({
        id: i.id,
        number: i.number,
        amountHt: i.totals.totalHt - credited(i, 'totalHt'),
        amountVat: i.totals.totalVat - credited(i, 'totalVat'),
        amountTtc: i.totals.totalTtc - credited(i, 'totalTtc'),
        // Ventilation par taux, nette des avoirs : déduite taux par taux de la facture finale.
        vatBreakdown: i.totals.vatBreakdown
          .map((v) => {
            const credits = this.invoices.filter((c) => c.type === 'credit' && c.status === 'issued' && c.creditOf === i.number);
            const of = (c) => c.totals.vatBreakdown.find((x) => x.rateBp === v.rateBp) || { base: 0, vat: 0 };
            return { rateBp: v.rateBp, base: v.base - sum(credits.map((c) => of(c).base)), vat: v.vat - sum(credits.map((c) => of(c).vat)) };
          })
          .filter((v) => v.base || v.vat),
      }))
      .filter((d) => d.amountTtc > 0);
  }

  #checkDeposits(inv) {
    if (inv.type !== 'invoice') throw new InvoiceError('Seule une facture finale peut déduire un acompte.');
    const available = new Map(this.availableDeposits(inv.client.code, { exceptId: inv.id }).map((d) => [d.id, d]));
    for (const d of inv.deposits) {
      const ref = available.get(d.id);
      if (!ref || ref.amountTtc !== d.amountTtc)
        throw new InvoiceError(`L'acompte ${d.number || d.id} n'est pas déductible sur cette facture (autre client ou déjà déduit).`);
    }
    if (inv.totals.netToPay < 0) throw new InvoiceError('Les acomptes déduits dépassent le montant de la facture.');
  }

  /** Transforme un devis émis en brouillon de facture (mêmes client et lignes, référence au devis). */
  convertQuote(quoteId, { issueDate, dueDate }) {
    const q = this.get(quoteId);
    if (q.type !== 'quote' || q.status !== 'issued') throw new InvoiceError('Seul un devis envoyé se transforme en facture.');
    return this.createDraft({
      type: 'invoice',
      series: 'F',
      client: structuredClone(q.client),
      lines: structuredClone(q.lines),
      issueDate,
      dueDate,
      quoteRef: q.number,
    });
  }

  /** Avoir total ou partiel lié à une facture émise. */
  createCreditNote(invoiceId, { issueDate, lines, reason = '' }) {
    const original = this.get(invoiceId);
    if (original.status !== 'issued' || original.type === 'credit' || original.type === 'quote')
      throw new InvoiceError('Un avoir se rattache à une facture émise.');
    return this.createDraft({
      type: 'credit',
      series: original.series,
      creditOf: original.number,
      client: structuredClone(original.client),
      issueDate,
      dueDate: issueDate,
      reason,
      lines: structuredClone(lines || original.lines),
    });
  }

  /**
   * Restant dû d'une pièce émise. Une facture et ses avoirs forment un tout : l'avoir diminue le
   * restant dû de la facture ; s'il dépasse ce qui reste à payer, c'est le dernier avoir qui porte le
   * remboursement dû au client (montant négatif).
   */
  outstanding(inv) {
    if (inv.status !== 'issued' || inv.type === 'quote') return 0;
    const own = (sign) => sign * inv.totals.netToPay - sum((this.payments[inv.id] || []).map((p) => p.amount));
    if (inv.type === 'credit') {
      const original = originalOf(this.invoices, inv);
      if (!original) return own(-1);
      const balance = groupBalance(this.invoices, this.payments, original);
      return balance < 0 && creditsOf(this.invoices, original).at(-1)?.id === inv.id ? balance : 0;
    }
    if (!creditsOf(this.invoices, inv).length) return own(1);
    return Math.max(0, groupBalance(this.invoices, this.payments, inv));
  }

  /** Ajoute un statut de cycle de vie à une facture émise (jamais à un brouillon ni à un devis). */
  recordStatus(invoiceId, { status, date, source = 'manuel', detail = '' }) {
    const inv = this.get(invoiceId);
    if (inv.status !== 'issued' || inv.type === 'quote') throw new InvoiceError('Seule une facture émise a un cycle de vie.');
    if (!LIFECYCLE[status]) throw new InvoiceError(`Statut inconnu : ${status}`);
    const events = (this.lifecycle[invoiceId] ||= []);
    const last = currentStatus(events);
    if (last && LIFECYCLE[last.status].final) throw new InvoiceError(`La facture est déjà « ${LIFECYCLE[last.status].label} ».`);
    const event = { status, date, source, detail };
    events.push(event);
    return event;
  }

  recordPayment(invoiceId, payment) {
    const inv = this.get(invoiceId);
    if (inv.status !== 'issued') throw new InvoiceError('Seule une facture émise reçoit un paiement.');
    (this.payments[invoiceId] ||= []).push(structuredClone(payment));
    return this.outstanding(inv);
  }
}

/** Sous-compte client : celui repris d'un FEC s'il existe (client.aux), sinon 411 + code client. */
export function clientAux(client) {
  return client.aux || `411${client.code || client.name.slice(0, 8)}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const DOCUMENT_LABELS = { invoice: 'Facture', credit: 'Avoir', deposit: "Facture d'acompte", quote: 'Devis' };

/** Compte de TVA d'une vente : services sans option débits → TVA exigible à l'encaissement (445800). */
/**
 * TVA d'une facture répartie par nature d'opération et par taux : { biens: [...], services: [...] },
 * chaque élément { rateBp, base, vat }. La part des services est calculée au prorata de sa base,
 * celle des biens prend le reste : la somme égale toujours le total de la facture.
 */
export function vatByNature(inv) {
  const out = { biens: [], services: [] };
  for (const v of inv.totals.vatBreakdown) {
    if (!v.vat) continue;
    const servicesBase = sum(inv.lines.filter((l) => l.nature === 'services' && l.vatRateBp === v.rateBp).map(lineHt));
    const servicesVat = v.base ? divRound(v.vat * servicesBase, v.base) : 0;
    if (servicesBase) out.services.push({ rateBp: v.rateBp, base: servicesBase, vat: servicesVat });
    if (v.base - servicesBase) out.biens.push({ rateBp: v.rateBp, base: v.base - servicesBase, vat: v.vat - servicesVat });
  }
  return out;
}

/** Répartition exacte d'un montant entier selon des poids (le reste d'arrondi sur le dernier). */
function allocate(total, weights) {
  const all = sum(weights);
  if (!all) return weights.map((_, i) => (i === weights.length - 1 ? total : 0));
  let left = total;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return left;
    const part = divRound(total * w, all);
    left -= part;
    return part;
  });
}

/**
 * Acomptes déduits d'une facture finale, par taux : ventilation de chaque acompte (enregistrée avec
 * lui), sinon au prorata de la TVA de la facture (factures enregistrées avant cette ventilation).
 */
export function depositsByRate(inv) {
  const out = new Map();
  for (const d of inv.deposits || []) {
    let rows = d.vatBreakdown;
    if (!rows?.length) {
      const rates = inv.totals.vatBreakdown.filter((v) => v.vat);
      const weights = rates.map((v) => v.vat);
      const bases = allocate(d.amountHt, weights);
      const vats = allocate(d.amountVat, weights);
      rows = rates.map((v, i) => ({ rateBp: v.rateBp, base: bases[i], vat: vats[i] }));
    }
    for (const r of rows) {
      const o = out.get(r.rateBp) || { base: 0, vat: 0 };
      o.base += r.base;
      o.vat += r.vat;
      out.set(r.rateBp, o);
    }
  }
  return out;
}

/**
 * TVA d'une facture nette de ses acomptes, par taux, répartie entre la part exigible à la facturation
 * (`issue`) et celle exigible à l'encaissement (`receipt`) :
 *  - prestations de services : à l'encaissement, sauf option pour les débits ;
 *  - livraisons de biens : à la facturation, sauf un acompte (et l'avoir qui l'annule), exigible à son
 *    encaissement (CGI art. 269-2-a, depuis le 01/01/2023) — `receiptGoods`.
 * Le total des deux parts vaut exactement la TVA de la facture moins celle des acomptes déduits.
 */
export function vatSplit(inv, { vatOnDebits = inv.issuer?.vatOnDebits, receiptGoods = inv.type === 'deposit' } = {}) {
  const deposits = depositsByRate(inv);
  const rates = new Map(inv.totals.vatBreakdown.filter((v) => v.vat || deposits.has(v.rateBp)).map((v) => [v.rateBp, v]));
  for (const rateBp of deposits.keys()) if (!rates.has(rateBp)) rates.set(rateBp, { rateBp, base: 0, vat: 0 });
  const issue = [];
  const receipt = [];
  for (const v of rates.values()) {
    const d = deposits.get(v.rateBp) || { base: 0, vat: 0 };
    const base = v.base - d.base;
    const vat = v.vat - d.vat;
    if (!base && !vat) continue;
    // Part « services » du taux, d'après les lignes ; un taux présent seulement dans l'acompte suit la
    // nature de la facture.
    const servicesBase = sum(inv.lines.filter((l) => l.nature === 'services' && l.vatRateBp === v.rateBp).map(lineHt));
    const share = v.base ? [servicesBase, v.base] : inv.operationNature === 'services' ? [1, 1] : [0, 1];
    const services = { rateBp: v.rateBp, base: divRound(base * share[0], share[1]), vat: divRound(vat * share[0], share[1]) };
    const goods = { rateBp: v.rateBp, base: base - services.base, vat: vat - services.vat };
    if (services.base || services.vat) (vatOnDebits ? issue : receipt).push(services);
    if (goods.base || goods.vat) (receiptGoods ? receipt : issue).push(goods);
  }
  return { issue, receipt };
}

/**
 * Nom de l'émetteur tel qu'il doit figurer sur ses documents : un entrepreneur individuel ajoute « EI »
 * (ou « entrepreneur individuel ») à son nom (C. com. art. L.526-22 et R.526-26).
 */
export function issuerName(company) {
  const name = company.name || '';
  if (company.legalForm !== 'EI' || /(^|[\s,(])EI([\s,)]|$)|entrepreneur individuel/i.test(name)) return name;
  return `${name} EI`;
}

export function saleVatAccount(inv, company) {
  return inv.operationNature === 'services' && !company.vatOnDebits ? '445800' : '445710';
}

/**
 * Écriture de vente. Montants tenus en « crédit net » par compte (produits, TVA, acomptes reçus),
 * le 411 du client équilibrant au débit ; un avoir inverse tous les sens.
 *  - facture : produits (706/707 selon la nature) + TVA ;
 *  - facture d'acompte : acomptes reçus (4191) + TVA — aucun chiffre d'affaires avant la vente ;
 *  - facture finale avec acomptes : 4191 soldé au débit du HT déjà facturé, TVA diminuée d'autant,
 *    le 411 ne porte plus que le net à payer.
 * TVA sur les prestations de services exigible à l'encaissement sauf option débits : elle transite
 * par 445800 et bascule en 445710 au paiement (bank.js, vatOnReceiptEntry).
 */
export function invoiceEntry(inv, company, { creditOfDeposit = false } = {}) {
  const sign = inv.type === 'credit' ? -1 : 1;
  const aux = clientAux(inv.client);
  const label = `${DOCUMENT_LABELS[inv.type] || 'Facture'} ${inv.number} ${inv.client.name}`;
  const credits = new Map();
  const add = (account, amount) => amount && credits.set(account, (credits.get(account) || 0) + amount);

  // Facture d'acompte, ou avoir qui l'annule : l'acompte reçu (4191), pas du chiffre d'affaires.
  if (inv.type === 'deposit' || creditOfDeposit) {
    add('419100', inv.totals.totalHt);
  } else {
    const byAccount = new Map();
    for (const l of inv.lines) {
      const acc = REVENUE_ACCOUNT_BY_NATURE[l.nature === 'services' ? 'services' : 'biens'];
      byAccount.set(acc, (byAccount.get(acc) || 0) + lineHt(l));
    }
    // Reporte l'écart éventuel d'arrondi entre somme des lignes et base agrégée sur le premier compte.
    const drift = inv.totals.totalHt - sum([...byAccount.values()]);
    [...byAccount].forEach(([account, ht], i) => add(account, i === 0 ? ht + drift : ht));
  }
  // TVA nette des acomptes : exigible à la facturation en 445710, à l'encaissement en 445800 (bascule
  // en 445710 au paiement). La TVA d'un acompte déduit est retirée là où la facture finale l'enregistre.
  const split = vatSplit(inv, { vatOnDebits: company.vatOnDebits, receiptGoods: inv.type === 'deposit' || creditOfDeposit });
  add('445710', sum(split.issue.map((v) => v.vat)));
  add('445800', sum(split.receipt.map((v) => v.vat)));
  for (const d of inv.deposits || []) add('419100', -d.amountHt);

  const receivable = sum([...credits.values()]);
  const toSide = (amount) => (amount * sign >= 0 ? { debit: 0, credit: Math.abs(amount) } : { debit: Math.abs(amount), credit: 0 });
  const lines = [{ account: '411000', aux, auxLabel: inv.client.name, label, ...toSide(-receivable) }];
  for (const [account, amount] of credits) if (amount) lines.push({ account, label, ...toSide(amount) });
  return {
    journal: 'VE',
    date: inv.issueDate,
    label,
    pieceRef: inv.number,
    pieceDate: inv.issueDate,
    source: { kind: 'invoice', id: inv.id },
    lines,
  };
}
