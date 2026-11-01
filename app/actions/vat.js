/**
 * Écran « vat ».
 */

import { toCsv } from '../../core/exports.js?v=e821f3b';
import { justificationRows } from '../../core/vatreturn.js?v=e821f3b';
import { render } from '../render.js?v=e821f3b';
import { eur, frDate, today, ui, ws } from '../state.js?v=e821f3b';
import { download, save, toast } from '../store.js?v=e821f3b';

/** Actions « vat » : data-action → fonction. */
export const actionsTable = {
  'vat-period': async ({ el }) => {
    ui.vatPeriod = el.dataset.from;
    return render();
  },
  'vat-declare': async ({ el }) => {
    const period = { from: el.dataset.from, to: el.dataset.to };
    const ca3 = ws.prepareVatReturn(period);
    const amount = ca3.balance >= 0 ? `${eur(ca3.balance)} de TVA à payer` : `un crédit de ${eur(-ca3.balance)}`;
    if (
      !confirm(
        `Valider la déclaration (${amount}) ? L'écriture de liquidation sera passée et la période marquée comme déclarée.${ca3.warnings.length ? ' Attention : ' + ca3.warnings.join(' ') : ''}`,
      )
    )
      return;
    try {
      ws.declareVat(period, today());
      save();
      render();
      toast('Déclaration validée. Pensez à la déposer sur impots.gouv.fr avant la date limite.');
    } catch (err) {
      toast(err.message, true);
    }
    return;
  },
  'vat-justification': async ({ el }) => {
    const ca3 = ws.prepareVatReturn({ from: el.dataset.from, to: el.dataset.to });
    const rows = justificationRows(ca3).map(([line, number, client, date, reason, base, vat]) => [
      line,
      number,
      client,
      frDate(date),
      reason,
      (base / 100).toFixed(2).replace('.', ','),
      (vat / 100).toFixed(2).replace('.', ','),
    ]);
    return download(
      `tva-${el.dataset.from.slice(0, 7)}-detail.csv`,
      toCsv(['Case', 'Facture', 'Client', 'Exigible le', 'Motif', 'Base HT', 'TVA'], rows),
      'text/csv;charset=utf-8',
    );
  },
};
