/**
 * Écran « compta ».
 */

import { generalLedgerCsv, journalsCsv, trialBalanceCsv } from '../../core/exports.js?v=d415f7a';
import { checkFEC, encodeLatin9, exportFEC } from '../../core/reports.js?v=d415f7a';
import * as cloud from '../cloud.js?v=d415f7a';
import { render } from '../render.js?v=d415f7a';
import { frDate, today, ui, ws } from '../state.js?v=d415f7a';
import { download, save, toast } from '../store.js?v=d415f7a';
import { openArchive } from '../views/archives.js?v=d415f7a';

/** Actions « compta » : data-action → fonction. */
export const actionsTable = {
  'opening-import': async () => {
    try {
      const r = ws.importOpening(ui.pendingOpening.opening);
      ui.pendingOpening = null;
      save();
      render();
      toast(`Bilan d'ouverture repris (${r.clientsCreated} client(s) recréé(s)).`);
    } catch (err) {
      toast(err.message, true);
    }
    return;
  },
  'opening-cancel': async () => {
    ui.pendingOpening = null;
    return render();
  },
  'export-state': async ({ el }) => {
    const t = el.dataset.tab;
    const [make, name] = t === 'balance' ? [trialBalanceCsv, 'balance'] : t === 'grand-livre' ? [generalLedgerCsv, 'grand-livre'] : [journalsCsv, 'journaux'];
    return download(`${name}-${ws.company.siren}-${today()}.csv`, make(ws.ledger), 'text/csv;charset=utf-8');
  },
  'archive-open': async ({ el }) => {
    return openArchive(el.dataset.key).catch((err) => toast(cloud.friendly(err), true));
  },
  'archive-fec': async () => {
    try {
      const fec = exportFEC(ui.archive.ledger, { siren: ws.company.siren, closingDate: ui.archive.fiscalYear.end });
      return download(fec.fileName, encodeLatin9(fec.content), 'text/plain;charset=iso-8859-15');
    } catch (err) {
      return toast(err.message, true);
    }
  },
  'compta-tab': async ({ el }) => {
    ui.comptaTab = el.dataset.tab;
    return render();
  },
  validate: async () => {
    const date = document.querySelector('[data-validate-date]').value;
    if (date >= ws.company.fiscalYear.end)
      return toast('Le dernier jour de l’exercice est validé par la clôture (page Clôture), après les écritures d’inventaire et le résultat.', true);
    if (!confirm(`Valider définitivement toutes les écritures jusqu'au ${frDate(date)} ? Elles ne pourront plus être modifiées.`)) return;
    try {
      const n = ws.ledger.validateThrough(date, { today: today() });
      save();
      render();
      toast(`${n} écriture(s) validée(s).`);
    } catch (err) {
      toast(err.message, true);
    }
    return;
  },
  fec: async () => {
    try {
      const fec = exportFEC(ws.ledger, { siren: ws.company.siren });
      const check = checkFEC(fec.content);
      download(fec.fileName, encodeLatin9(fec.content), 'text/plain;charset=iso-8859-15');
      toast(check.ok ? 'FEC téléchargé (contrôles internes OK).' : `FEC téléchargé avec ${check.errors.length} anomalie(s).`, !check.ok);
    } catch (err) {
      toast(err.message, true);
    }
    return;
  },
};
