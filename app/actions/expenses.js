/**
 * Écran « expenses ».
 */

import { purchaseLinesFrom } from '../../core/einvoice-in.js?v=d415f7a';
import * as cloud from '../cloud.js?v=d415f7a';
import { render } from '../render.js?v=d415f7a';
import { eur, ui, ws } from '../state.js?v=d415f7a';
import { save, toast } from '../store.js?v=d415f7a';
import { attachReceipt } from '../views/expenses.js?v=d415f7a';
import { saveNexusRhImport } from '../views/nexusrh-import.js?v=d415f7a';

/** Actions « expenses » : data-action → fonction. */
export const actionsTable = {
  'nexusrh-save': () => saveNexusRhImport(),
  'nexusrh-cancel': async () => {
    ui.nexusRh = null;
    return render();
  },
  'purchase-force': async () => {
    const res = ws.addPurchase(ui.pendingPurchase.data, { force: true });
    const pendingFile = ui.pendingPurchase.file;
    ui.pendingPurchase = null;
    if (res.purchase) attachReceipt(res.purchase, pendingFile);
    save();
    render();
    return toast(res.purchase ? 'Dépense enregistrée.' : 'Enregistrement impossible.', !res.purchase);
  },
  'purchase-cancel': async () => {
    ui.pendingPurchase = null;
    return render();
  },
  'expenses-tab': async ({ el }) => {
    ui.expensesTab = el.dataset.tab;
    return render();
  },
  'einvoice-in-save': async () => {
    const { inv, file, duplicates } = ui.pendingEinvoice;
    const categoryId = document.querySelector('[data-einvoice-cat]').value;
    const data = {
      supplier: { name: inv.seller.name, siren: inv.seller.siren, country: inv.seller.country },
      date: inv.issueDate,
      number: inv.number,
      documentName: file.name,
      lines: purchaseLinesFrom(inv, categoryId),
      type: inv.type === 'credit' ? 'credit' : 'invoice',
      einvoice: { format: inv.format, totalTtc: inv.totalTtc },
    };
    const res = ws.addPurchaseLines(data, { force: Boolean(duplicates?.length) });
    if (!res.purchase) {
      ui.pendingEinvoice.duplicates = res.duplicates;
      return render();
    }
    ui.pendingEinvoice = ui.pendingEinvoices.shift() || null;
    save();
    render();
    if (res.purchase.totalTtc !== inv.totalTtc)
      toast(
        `Dépense enregistrée, mais le total recalculé (${eur(res.purchase.totalTtc)}) diffère de la facture (${eur(inv.totalTtc)}) : vérifiez la catégorie.`,
        true,
      );
    else toast('Facture électronique enregistrée en dépense.');
    attachReceipt(res.purchase, file);
    return;
  },
  'einvoice-in-cancel': async () => {
    ui.pendingEinvoice = ui.pendingEinvoices.shift() || null;
    return render();
  },
  'receipt-open': async ({ el }) => {
    try {
      window.open(await cloud.receiptUrl(el.dataset.path), '_blank', 'noopener');
    } catch (err) {
      toast(`Justificatif indisponible : ${cloud.friendly(err)}`, true);
    }
    return;
  },
};
