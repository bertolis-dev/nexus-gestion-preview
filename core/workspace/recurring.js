/**
 * Workspace — Factures récurrentes : modèles et génération des factures à échéance.
 * Méthodes installées sur Workspace.prototype (voir core/workspace.js).
 */

import { dueOccurrences, periodLabel, validateTemplate } from '../recurring.js?v=e821f3b';
import { addDays } from '../dates.js?v=e821f3b';

export const recurringMethods = {
  saveRecurring(data) {
    const problems = validateTemplate(data);
    if (problems.length) throw new Error(problems[0]);
    if (data.id) {
      const idx = this.recurring.findIndex((r) => r.id === data.id);
      this.recurring[idx] = { ...this.recurring[idx], ...structuredClone(data) };
      return this.recurring[idx];
    }
    const t = { active: true, autoIssue: false, paymentDays: 30, nextIndex: 0, ...structuredClone(data), id: this._id('R') };
    this.recurring.push(t);
    return t;
  },

  deleteRecurring(id) {
    this.recurring = this.recurring.filter((r) => r.id !== id);
  },

  /**
   * Prépare (ou émet, si le modèle le demande) les factures des échéances arrivées à la date `today`.
   * Idempotent : chaque échéance n'est facturée qu'une fois (nextIndex avance).
   */
  generateRecurring(today) {
    const result = { drafts: [], issued: [] };
    // Parcours par identifiant : une émission refusée restaure l'état (Workspace._atomic) et remplace la
    // liste des modèles ; on relit donc chaque modèle après chaque échéance.
    for (const id of this.recurring.map((r) => r.id)) {
      const occurrences = dueOccurrences(
        this.recurring.find((r) => r.id === id),
        today,
      );
      for (const occ of occurrences) {
        const t = this.recurring.find((r) => r.id === id);
        const due = addDays(today, t.paymentDays ?? 30);
        const period = periodLabel(occ.date, t.frequency);
        const draft = this.book.createDraft({
          type: 'invoice',
          client: structuredClone(t.client),
          issueDate: today,
          dueDate: due,
          lines: t.lines.map((l) => ({ ...l, label: `${l.label} — ${period}` })),
          recurringId: t.id,
          period,
        });
        t.nextIndex = occ.index + 1;
        t.lastRun = today;
        if (t.autoIssue) {
          try {
            result.issued.push(this.issueInvoice(draft.id));
            continue;
          } catch {
            // Non conforme (SIREN manquant…) : la facture reste en brouillon, visible dans « À faire ».
          }
        }
        result.drafts.push(draft);
      }
    }
    return result;
  },
};
