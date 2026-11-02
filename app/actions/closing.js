/**
 * Écran « closing ».
 */

import { allocationProposal } from '../../core/closing.js?v=3bfbbd4';
import { closingPackage } from '../../core/closing-package.js?v=3bfbbd4';
import * as cloud from '../cloud.js?v=3bfbbd4';
import { parseEuros } from '../../core/money.js?v=3bfbbd4';
import { render } from '../render.js?v=3bfbbd4';
import { cloudState, today, ui, ws } from '../state.js?v=3bfbbd4';
import { download, save, toast } from '../store.js?v=3bfbbd4';
import { closeYearFlow } from '../views/closing.js?v=3bfbbd4';

/** Actions « closing » : data-action → fonction. */
export const actionsTable = {
  // Dossier de clôture (FEC, balance, grand livre, check-list) en un ZIP, inscrit au journal d'audit.
  'closing-package': async () => {
    let pkg;
    try {
      pkg = closingPackage(ws, { today: today() });
    } catch (err) {
      return toast(err.message, true);
    }
    if (!ui.demo && cloudState.meta) {
      const digest = await crypto.subtle.digest('SHA-256', pkg.zip);
      const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
      try {
        await cloud.logClosingPackage(cloudState.meta.structureId, { fiscalYear: pkg.fiscalYear, files: pkg.files.map((f) => f.name), sha256 });
      } catch (err) {
        return toast(`Dossier non téléchargé : ${cloud.friendly(err)}`, true);
      }
    }
    download(pkg.fileName, pkg.zip, 'application/zip');
    const fec = pkg.fecIncluded ? '' : ' Le FEC n’y est pas encore : validez d’abord les écritures.';
    return toast(
      ui.demo
        ? `Démonstration : dossier téléchargé. En mode connecté, le téléchargement est inscrit au journal d’audit.${fec}`
        : `Dossier de clôture téléchargé et inscrit au journal d’audit : envoyez-le à votre expert-comptable.${fec}`,
      !pkg.fecIncluded,
    );
  },
  'inventory-add': async () => {
    const f = ui.inventoryForm || { type: 'prepaid' };
    const form = Object.fromEntries([...document.querySelectorAll('[data-inv]')].map((e) => [e.dataset.inv, e.value]));
    try {
      const amount = parseEuros(form.amount || '');
      ws.addInventory({
        type: form.type || f.type,
        account: form.account,
        aux: form.aux,
        amount,
        vatRateBp: Number(form.vatRateBp || 0),
        label: form.label?.trim() || undefined,
      });
      ui.inventoryForm = { type: form.type };
      save();
      render();
      toast('Écriture d’inventaire ajoutée.');
    } catch (err) {
      toast(err.message.startsWith('Montant invalide') ? 'Le montant saisi n’est pas valide.' : err.message, true);
    }
    return;
  },
  'inventory-delete': async ({ id }) => {
    ws.ledger.deleteDraft(id);
    save();
    return render();
  },
  'depreciation-book': async () => {
    try {
      ws.bookDepreciation();
      save();
      render();
      toast('Dotations aux amortissements passées.');
    } catch (err) {
      toast(err.message, true);
    }
    return;
  },
  'is-book': async ({ el }) => {
    try {
      ws.bookCorporateTax(Number(el.dataset.tax));
      save();
      render();
      toast('Impôt sur les sociétés comptabilisé.');
    } catch (err) {
      toast(err.message, true);
    }
    return;
  },
  'allocate-result': async () => {
    const { result } = allocationProposal(ws.ledger, ws.company);
    const read = (k) => {
      const e = document.querySelector(`[data-alloc="${k}"]`);
      return e && e.value ? parseEuros(e.value) : 0;
    };
    try {
      const parts =
        ws.company.legalForm === 'EI'
          ? { owner: result }
          : {
              legalReserve: read('legalReserve'),
              otherReserves: read('otherReserves'),
              dividends: read('dividends'),
              retained: result < 0 ? -Math.abs(read('retained')) : read('retained'),
            };
      const fy = ws.company.fiscalYear;
      ws.allocateResult(parts, today() < fy.start ? fy.start : today() > fy.end ? fy.end : today());
      ui.allocationForm = null;
      save();
      render();
      toast('Affectation du résultat enregistrée.');
    } catch (err) {
      toast(err.message.startsWith('Montant invalide') ? 'Un des montants n’est pas valide.' : err.message, true);
    }
    return;
  },
  'close-year': async () => {
    return closeYearFlow();
  },
};
