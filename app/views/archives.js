/**
 * Écran « archives ».
 */

import { balanceSheet, fiscalYearLabel, incomeStatement } from '../../core/closing.js?v=e821f3b';
import { Ledger } from '../../core/ledger.js?v=e821f3b';
import { trialBalance } from '../../core/reports.js?v=e821f3b';
import { ledgerStateFromRows } from '../../core/sync.js?v=e821f3b';
import * as cloud from '../cloud.js?v=e821f3b';
import { html } from '../html.js?v=e821f3b';
import { render } from '../render.js?v=e821f3b';
import { cloudState, eur, ui, ws } from '../state.js?v=e821f3b';
import { statementTable } from './closing.js?v=e821f3b';

// ------------------------------------------------------------------ exercices clos (consultation)

/** Liste des exercices clos : archives locales en démonstration, base de données sinon. */
export function closedYears() {
  if (ui.demo) return ws.archives.map((a) => ({ key: a.fiscalYear.start, fiscalYear: a.fiscalYear }));
  if (!ui.closedYears && cloudState.meta) {
    ui.closedYears = [];
    cloud
      .closedFiscalYears(cloudState.meta.structureId)
      .then((rows) => {
        ui.closedYears = rows.map((r) => ({ key: r.start_date, id: r.id, row: r, fiscalYear: { start: r.start_date, end: r.end_date } }));
        render();
      })
      .catch(() => {});
  }
  return ui.closedYears || [];
}

export async function openArchive(key) {
  const year = closedYears().find((y) => y.key === key);
  if (!year) return;
  let state;
  if (ui.demo) state = ws.archives.find((a) => a.fiscalYear.start === key).ledger;
  else state = ledgerStateFromRows(await cloud.fiscalYearEntries(cloudState.meta.structureId, year.id), year.row);
  ui.archive = { key, fiscalYear: year.fiscalYear, ledger: new Ledger({ chart: ws.chart, fiscalYear: year.fiscalYear, state: structuredClone(state) }) };
  render();
}

export function archivesView() {
  const years = closedYears();
  if (!years.length)
    return html`<div class="card">
      <div class="empty-state"><p class="text-muted">Aucun exercice clôturé pour l'instant.</p></div>
    </div>`;
  const a = ui.archive;
  const pick = html`<div class="tabs" style="margin-bottom:14px">
    ${years.map((y) => html`<button class="tab ${a?.key === y.key ? 'active' : ''}" data-action="archive-open" data-key="${y.key}">Exercice ${fiscalYearLabel(y.fiscalYear)}</button>`)}
  </div>`;
  if (!a)
    return html`${pick}
      <p class="text-muted">Choisissez un exercice pour consulter ses comptes.</p>`;
  const pnl = incomeStatement(a.ledger);
  const bs = balanceSheet(a.ledger);
  const tb = trialBalance(a.ledger);
  return html`${pick}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <button class="btn btn-secondary" data-action="archive-fec">Télécharger le FEC ${fiscalYearLabel(a.fiscalYear)}</button
      ><button class="btn btn-secondary" data-action="print">Imprimer / PDF</button>
    </div>
    <div class="grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">
      ${statementTable('Bilan — actif', Object.entries(bs.assets), bs.totalAssets, 'Total actif')}
      ${statementTable(
        'Bilan — passif',
        Object.entries(bs.liabilities).map(([k, v]) => [k === 'Résultat antérieur en attente d’affectation' ? 'Résultat de l’exercice' : k, v]),
        bs.totalLiabilities,
        'Total passif',
      )}
    </div>
    <div class="card table-card">
      <table class="table">
        <tbody>
          <tr>
            <td>Chiffre d'affaires</td>
            <td class="num">${eur(pnl.revenue)}</td>
          </tr>
          <tr>
            <td>Résultat d'exploitation</td>
            <td class="num">${eur(pnl.operatingResult)}</td>
          </tr>
          <tr>
            <td>Impôt sur les bénéfices</td>
            <td class="num">${eur(pnl.incomeTax)}</td>
          </tr>
          <tr>
            <td><strong>Résultat net</strong></td>
            <td class="num"><strong>${eur(pnl.netResult)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="card table-card">
      <h3 style="padding:14px 16px 0">Balance de clôture</h3>
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Compte</th>
              <th>Libellé</th>
              <th class="num">Débit</th>
              <th class="num">Crédit</th>
            </tr>
          </thead>
          <tbody>
            ${tb.rows.map(
              (r) =>
                html`<tr>
                  <td class="mono">${r.account}</td>
                  <td>${r.label}</td>
                  <td class="num">${eur(r.debit)}</td>
                  <td class="num">${eur(r.credit)}</td>
                </tr>`,
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">Total</td>
              <td class="num">${eur(tb.totals.debit)}</td>
              <td class="num">${eur(tb.totals.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
}
