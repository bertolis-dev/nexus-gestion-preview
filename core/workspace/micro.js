/**
 * Workspace — Micro-entrepreneur : livre des recettes, franchise de TVA, déclarations URSSAF, liste « À faire ».
 * Méthodes installées sur Workspace.prototype (voir core/workspace.js).
 */

import { divRound, sum } from '../money.js?v=a619ec1';
import { lineHt } from '../invoices.js?v=a619ec1';
import {
  ACTIVITY_TYPES,
  acreReminder,
  cfeReminder,
  declarationPeriods,
  estimateContributions,
  incomeDeclaration,
  incomeDeclarationReminder,
  thresholdStatus,
  urssafDeadline,
  urssafDeclaration,
  vatFranchiseMessage,
} from '../micro.js?v=a619ec1';
import { combineEstimates } from '../workspace.js?v=a619ec1';
import { dueReminderLevel } from '../reminders.js?v=a619ec1';
import { cashForecast } from '../forecast.js?v=a619ec1';
import { fiscalTodo } from '../fiscal-calendar.js?v=a619ec1';
import { stockLevels } from '../stock.js?v=a619ec1';

export const microMethods = {
  /** Liste « À faire » classée par urgence (§5). */

  /** Encaissements de l'année (base du chiffre d'affaires à déclarer en micro-entreprise). */
  microReceipts() {
    // Chiffre d'affaires encaissé : hors taxes si l'entreprise facture la TVA ; réparti entre ventes
    // (lignes « biens ») et prestations (lignes « services ») pour une activité mixte ; les
    // remboursements d'avoirs (règlements négatifs) le diminuent.
    const franchise = this.company.vatRegime === 'franchise';
    const servicesActivity = this.company.microActivity === 'bnc' ? 'bnc' : 'bic-services';
    const out = [];
    for (const inv of this.book.invoices) {
      const payments = this.book.payments[inv.id] || [];
      if (!payments.length) continue;
      const goodsHt = sum(inv.lines.filter((l) => l.nature !== 'services').map(lineHt));
      const totalHt = sum(inv.lines.map(lineHt));
      for (const p of payments) {
        const amount = franchise || !inv.totals.totalTtc ? p.amount : divRound(p.amount * inv.totals.totalHt, inv.totals.totalTtc);
        const goods = totalHt ? divRound(amount * goodsHt, totalHt) : 0;
        const base = { date: p.date, invoiceNumber: inv.number, clientName: inv.client.name, method: 'Virement' };
        if (goods) out.push({ ...base, amount: goods, activity: 'bic-vente' });
        if (amount - goods) out.push({ ...base, amount: amount - goods, activity: servicesActivity });
      }
    }
    return out;
  },

  /**
   * SIREN, forme juridique et régime fiscal figés dès la première facture émise ou écriture validée
   * (même règle que la base de données, migration 0009) : ils figurent sur des pièces définitives.
   */
  identityLocked() {
    return this.ledger.entries.some((e) => e.status === 'validated') || this.book.invoices.some((i) => i.status === 'issued');
  },

  /** Situation du micro-entrepreneur utilisée pour estimer ses cotisations (Paramètres > Ma micro-entreprise). */
  microOptions() {
    const c = this.company;
    return {
      acreStart: c.acreStart || null,
      acreEnd: c.acreEnd || null,
      versementLiberatoire: Boolean(c.versementLiberatoire),
      retraite: c.retraite === 'cipav' ? 'cipav' : 'general',
      artisan: Boolean(c.artisan),
    };
  },

  /**
   * Situation vis-à-vis de la franchise de TVA, avec le message à afficher. L'année précédente n'est
   * connue que si Nexus tenait déjà la comptabilité au 1er janvier de cette année-là.
   */
  vatFranchiseStatus(today) {
    if (this.company.vatRegime !== 'franchise') return null;
    const year = Number(today.slice(0, 4));
    const receipts = this.microReceipts();
    const family = ACTIVITY_TYPES[this.company.microActivity]?.family || (this.company.defaultNature === 'biens' ? 'biens' : 'services');
    const current = thresholdStatus(receipts, year);
    const since = this.archives?.[0]?.fiscalYear.start || this.company.fiscalYear.start;
    const previousKnown = since <= `${year - 1}-01-01`;
    const previous = thresholdStatus(receipts, year - 1).vat[family];
    const previousYearOverBase = previousKnown ? previous === 'depasse-base' || previous === 'depasse-majore' : null;
    const status = current.vat[family];
    return { status, family, turnover: current.ca[family], message: vatFranchiseMessage(status, family, { year, previousYearOverBase }) };
  },

  get urssafDeclarations() {
    return this.company.urssafDeclarations || [];
  },

  /** Périodes de l'année avec leur montant, leur échéance et leur état (à déclarer, déclarée, payée). */
  urssafPeriods(year, today) {
    const receipts = this.microReceipts();
    // Rien avant le premier exercice tenu dans Nexus (les périodes antérieures ont été déclarées ailleurs).
    const since = this.archives?.[0]?.fiscalYear.start || this.company.fiscalYear.start;
    return declarationPeriods(year, this.company.urssafFrequency || 'trimestrielle')
      .filter((p) => p.to >= since)
      .map((p) => {
        const record = this.urssafDeclarations.find((r) => r.from === p.from);
        const deadline = urssafDeadline(p);
        const status =
          record && !record.contributions
            ? 'rien-a-payer'
            : record?.paidAt
              ? 'payee'
              : record
                ? 'declaree'
                : p.from > today
                  ? 'a-venir'
                  : p.to >= today
                    ? 'en-cours'
                    : deadline < today
                      ? 'en-retard'
                      : 'a-declarer';
        const declaration = urssafDeclaration(receipts, p);
        const turnover = declaration.total;
        // Activité mixte : chaque activité à son propre taux ; un remboursement supérieur aux
        // encaissements du trimestre ne donne rien à payer (à valider).
        const parts = Object.entries(declaration.byActivity).filter(([, amount]) => amount > 0);
        const estimates = (parts.length ? parts : [[this.company.microActivity || 'bnc', 0]]).map(([activity, amount]) =>
          estimateContributions(amount, activity, this.microOptions(), p.to),
        );
        const estimate = estimates.length === 1 ? estimates[0] : combineEstimates(estimates);
        return { ...p, turnover, estimate, deadline, record, status };
      });
  },

  /** Enregistre la déclaration faite sur autoentrepreneur.urssaf.fr (chiffre d'affaires et cotisations calculées par l'URSSAF). */
  recordUrssafDeclaration({ from, to, turnover, contributions, date }) {
    if (this.urssafDeclarations.some((r) => r.from === from)) throw new Error('Cette période a déjà été déclarée.');
    if (!Number.isSafeInteger(contributions) || contributions < 0) throw new Error('Le montant des cotisations est invalide.');
    const record = { from, to, turnover, contributions, declaredAt: date, paidAt: null, txId: null };
    this.company.urssafDeclarations = [...this.urssafDeclarations, record];
    return record;
  },

  /** Un prélèvement « Cotisations URSSAF » solde la plus ancienne déclaration non payée du même montant. */
  _markUrssafPaid(tx) {
    const record = [...this.urssafDeclarations].sort((a, b) => a.from.localeCompare(b.from)).find((r) => !r.paidAt && r.contributions === Math.abs(tx.amount));
    if (!record) return;
    this.company.urssafDeclarations = this.urssafDeclarations.map((r) => (r === record ? { ...r, paidAt: tx.date, txId: tx.id } : r));
  },

  _urssafTodo(today) {
    if (!this.company.taxRegime?.startsWith('micro')) return [];
    const year = Number(today.slice(0, 4));
    const periods = [...this.urssafPeriods(year - 1, today), ...this.urssafPeriods(year, today)];
    const pending = periods.find((p) => p.status === 'en-retard' || p.status === 'a-declarer');
    const options = this.microOptions();
    const reminders = [
      cfeReminder({ today, activityStart: this.company.activityStart || null }),
      acreReminder({ today, acreEnd: options.acreEnd }),
      incomeDeclarationReminder({ today, declaration: incomeDeclaration(this.microReceipts(), year - 1) }),
    ].filter(Boolean);
    if (!pending) return reminders;
    const fr = (d) => d.split('-').reverse().join('/');
    return [
      ...reminders,
      {
        urgency: pending.status === 'en-retard' ? 3 : 2,
        kind: 'urssaf',
        view: 'urssaf',
        text:
          pending.status === 'en-retard'
            ? `Déclaration URSSAF ${pending.label} en retard (échéance du ${fr(pending.deadline)})`
            : `Déclarer votre chiffre d'affaires ${pending.label} à l'URSSAF avant le ${fr(pending.deadline)}`,
      },
    ];
  },

  todo(today) {
    const items = [];
    const open = this.transactions.filter((t) => t.status === 'open');
    if (open.length) items.push({ urgency: 2, kind: 'bank', view: 'banque', text: `${open.length} transaction${open.length > 1 ? 's' : ''} à justifier` });
    const late = this.receivables(today).filter((r) => r.outstanding > 0 && r.lateDays > 0);
    // Relance proposée à J+3, J+15 et J+30 (core/reminders.js) ; une relance envoyée ne revient pas.
    for (const r of late) {
      const level = dueReminderLevel(r.lateDays, this.reminderHistory(r.invoice.id));
      if (!level) continue;
      items.push({
        urgency: level === 3 ? 3 : 2,
        kind: 'late',
        view: 'ventes',
        id: r.invoice.id,
        text: `Relancer ${r.invoice.client.name} — facture ${r.invoice.number} en retard de ${r.lateDays} j (relance n° ${level})`,
      });
    }
    const drafts = this.book.invoices.filter((i) => i.status === 'draft' && i.type !== 'quote');
    if (drafts.length)
      items.push({ urgency: 1, kind: 'draft', view: 'ventes', text: `${drafts.length} facture${drafts.length > 1 ? 's' : ''} en brouillon à émettre` });
    const noReceipt = this.transactions.filter((t) => t.missingReceipt);
    if (noReceipt.length)
      items.push({ urgency: 1, kind: 'receipt', view: 'banque', text: `${noReceipt.length} dépense${noReceipt.length > 1 ? 's' : ''} sans justificatif` });
    items.push(...this._vatTodo(today));
    items.push(...this._urssafTodo(today));
    items.push(...fiscalTodo(this, today));
    const low = stockLevels(this.company.catalog, this.stockMoves, this.book.invoices).filter((s) => s.low);
    if (low.length)
      items.push({ urgency: 1, kind: 'stock', view: 'parametres', arg: 'catalogue', text: `Stock bas : ${low.map((s) => s.item.label).join(', ')}` });
    // Trésorerie prévue sous zéro : en tête (tri stable), avec le montant qui manquera au point le plus bas.
    const cash = this._cashTodo(today);
    return [...(cash ? [cash] : []), ...items.sort((a, b) => b.urgency - a.urgency)];
  },

  _cashTodo(today) {
    const f = cashForecast(this, today);
    if (!f.firstNegative) return null;
    const lowest = Math.min(f.start, ...f.events.map((e) => e.balance));
    const [y, m, d] = f.firstNegative.split('-');
    return {
      urgency: 3,
      kind: 'cash',
      view: 'accueil',
      action: 'forecast-show',
      date: f.firstNegative,
      amount: -lowest,
      text: `Trésorerie prévue sous zéro le ${d}/${m}/${y} : montant à couvrir`,
    };
  },

  _vatTodo(today) {
    if (this.company.vatRegime === 'franchise') return [];
    const d = new Date(`${today}T00:00:00Z`);
    const y = d.getUTCFullYear();
    const month = d.getUTCMonth(); // 0-11
    const monthName = (m) => new Date(Date.UTC(2000, m, 1)).toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' });
    const of = (name) => (/^[aeiouyh]/i.test(name) ? `d’${name}` : `de ${name}`);
    if (this.company.vatRegime === 'reel-simplifie') {
      if (month === 6 || month === 11) return [{ urgency: 2, kind: 'vat', view: 'tva', text: `Acompte de TVA de ${monthName(month)} à payer (CA12)` }];
      if (month >= 2 && month <= 4)
        return [{ urgency: 2, kind: 'vat', view: 'tva', text: `Déclaration annuelle de TVA (CA12) de ${y - 1} à déposer début mai` }];
      return [];
    }
    const quarterly = this.company.vatPeriodicity === 'trimestrielle';
    const periods = this.vatPeriods();
    const isDeclared = (p) => this.vatReturns.some((r) => r.from === p.from);
    const name = (p) => (quarterly ? `du ${p.label}` : of(p.label));
    const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    const items = [];
    // Dernière période terminée, non déclarée alors que son échéance est passée : retard, en tête de
    // liste. Les périodes plus anciennes ne sont pas signalées : elles ont pu être déclarées avant
    // l'arrivée dans Nexus (la check-list de clôture les recense).
    const lastEnded = periods.filter((p) => p.to < today).at(-1);
    const late = lastEnded && !isDeclared(lastEnded) && this.vatDeadline(lastEnded) < today ? lastEnded : null;
    if (late) {
      items.push({
        urgency: 3,
        kind: 'vat',
        view: 'tva',
        period: late.from,
        text: `TVA ${name(late)} non déclarée : l’échéance du ${ddmm(this.vatDeadline(late))} est dépassée`,
      });
    }
    // Période à déclarer : la première dont l'échéance n'est pas passée (la période échue tant que
    // son échéance court, sinon la période en cours).
    const next = periods.find((p) => this.vatDeadline(p) >= today && p.from <= today);
    if (!next || isDeclared(next)) return items;
    const net = this.prepareVatReturn(next).balance;
    return [
      ...items,
      {
        urgency: next.to < today ? 3 : 1,
        kind: 'vat',
        view: 'tva',
        period: next.from,
        // Crédit de TVA (plus de TVA récupérable que de TVA due) : annoncé comme tel, montant positif.
        amount: Math.abs(net),
        text:
          net < 0
            ? `Crédit de TVA ${name(next)} à déclarer avant le ${ddmm(this.vatDeadline(next))}`
            : `TVA ${name(next)} à déclarer avant le ${ddmm(this.vatDeadline(next))}`,
      },
    ];
  },
};
