/**
 * Écran « micro ».
 */

import { toCsv } from '../../core/exports.js?v=e821f3b';
import { receiptsBook } from '../../core/micro.js?v=e821f3b';
import { formatDecimalComma, parseEuros } from '../../core/money.js?v=e821f3b';
import { render } from '../render.js?v=e821f3b';
import { frDate, today, ui, ws } from '../state.js?v=e821f3b';
import { download, save, toast } from '../store.js?v=e821f3b';
import { microReceipts } from '../views/micro.js?v=e821f3b';

/** Actions « micro » : data-action → fonction. */
export const actionsTable = {
  'urssaf-declare-open': async ({ el }) => {
    ui.urssafDeclare = el.dataset.from;
    return render();
  },
  'urssaf-declare-cancel': async () => {
    ui.urssafDeclare = null;
    return render();
  },
  'urssaf-copy': async ({ el }) => {
    try {
      await navigator.clipboard.writeText(el.dataset.amount);
      toast(`Montant copié : ${el.dataset.amount} €`);
    } catch {
      toast(`Montant à déclarer : ${el.dataset.amount} €`);
    }
    return;
  },
  'urssaf-declare': async ({ el }) => {
    const p = ws.urssafPeriods(Number(el.dataset.from.slice(0, 4)), today()).find((x) => x.from === el.dataset.from);
    const raw = document.querySelector('[data-urssaf-contributions]').value.trim();
    if (!raw) return toast('Indiquez le montant des cotisations calculé par l’URSSAF (0 si aucun chiffre d’affaires).', true);
    try {
      ws.recordUrssafDeclaration({ from: p.from, to: p.to, turnover: p.turnover, contributions: parseEuros(raw), date: today() });
    } catch (err) {
      return toast(err.message.startsWith('Montant invalide') ? 'Le montant des cotisations n’est pas valide.' : err.message, true);
    }
    ui.urssafDeclare = null;
    save();
    render();
    return toast(`Déclaration ${p.label} enregistrée.`);
  },
  'export-receipts': async () => {
    // Même format protégé que les autres exports (guillemets, formules neutralisées, montants à virgule).
    const rows = receiptsBook(microReceipts()).rows.map((r) => [frDate(r.date), r.invoiceNumber, r.clientName, r.method, formatDecimalComma(r.amount)]);
    return download('livre-des-recettes.csv', toCsv(['Date', 'Facture', 'Client', 'Mode', 'Montant'], rows), 'text/csv;charset=utf-8');
  },
};
