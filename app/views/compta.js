/**
 * Écran « compta ».
 */

import { JOURNALS } from '../../core/ledger.js?v=d415f7a';
import { generalLedger, journalReport, trialBalance } from '../../core/reports.js?v=d415f7a';
import { field, html, raw } from '../html.js?v=d415f7a';
import { eur, frDate, today, ui, ws } from '../state.js?v=d415f7a';
import { badge, viewHeader } from '../ui/common.js?v=d415f7a';
import { archivesView } from './archives.js?v=d415f7a';

// ------------------------------------------------------------------ comptabilité (mode avancé)

export function viewCompta() {
  if (ui.mode !== 'avance')
    return html`<div class="empty-state">
      <p>Activez le mode avancé dans les paramètres.</p>
      <button class="btn btn-primary" data-href="#/parametres/affichage">Paramètres</button>
    </div>`;
  const tab = ui.comptaTab;
  const tabs = [
    ['balance', 'Balance'],
    ['grand-livre', 'Grand livre'],
    ['journaux', 'Journaux'],
    ['cloture', 'Validation et FEC'],
    ['archives', 'Exercices clos'],
  ];
  let body;
  if (tab === 'balance') {
    const tb = trialBalance(ws.ledger);
    body = html`<div class="card table-card">
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Compte</th>
              <th>Libellé</th>
              <th class="num">Débit</th>
              <th class="num">Crédit</th>
              <th class="num">Solde débiteur</th>
              <th class="num">Solde créditeur</th>
            </tr>
          </thead>
          <tbody>
            ${tb.rows.map(
              (r) =>
                html`<tr>
                  <td class="mono">${r.account}</td>
                  <td>${r.label}<br /><span class="text-muted" style="font-size:12px">${r.plainLabel}</span></td>
                  <td class="num">${eur(r.debit)}</td>
                  <td class="num">${eur(r.credit)}</td>
                  <td class="num">${r.soldeDebiteur ? eur(r.soldeDebiteur) : ''}</td>
                  <td class="num">${r.soldeCrediteur ? eur(r.soldeCrediteur) : ''}</td>
                </tr>`,
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">Total ${tb.balanced ? '(équilibrée)' : '(DÉSÉQUILIBRÉE)'}</td>
              <td class="num">${eur(tb.totals.debit)}</td>
              <td class="num">${eur(tb.totals.credit)}</td>
              <td class="num">${eur(tb.totals.soldeDebiteur)}</td>
              <td class="num">${eur(tb.totals.soldeCrediteur)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
  } else if (tab === 'grand-livre') {
    body = generalLedger(ws.ledger).map(
      (b) =>
        html`<div class="card table-card">
          <h3 style="padding:14px 16px 0"><span class="mono">${b.account}</span> ${b.label}</h3>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Jnl</th>
                  <th>N°</th>
                  <th>Pièce</th>
                  <th>Libellé</th>
                  <th>Let.</th>
                  <th class="num">Débit</th>
                  <th class="num">Crédit</th>
                  <th class="num">Solde</th>
                </tr>
              </thead>
              <tbody>
                ${b.lines.map(
                  (l) =>
                    html`<tr>
                      <td>${frDate(l.date)}</td>
                      <td>${l.journal}</td>
                      <td>${l.number ?? badge('brouillon')}</td>
                      <td class="mono">${l.pieceRef.length > 14 ? `${l.pieceRef.slice(0, 12)}…` : l.pieceRef}</td>
                      <td>${l.label}</td>
                      <td class="mono">${l.letter}</td>
                      <td class="num">${l.debit ? eur(l.debit) : ''}</td>
                      <td class="num">${l.credit ? eur(l.credit) : ''}</td>
                      <td class="num">${eur(l.runningBalance)}</td>
                    </tr>`,
                )}
              </tbody>
            </table>
          </div>
        </div>`,
    );
  } else if (tab === 'journaux') {
    body = Object.entries(JOURNALS).map(([code, label]) => {
      const entries = journalReport(ws.ledger, code);
      if (!entries.length) return '';
      return html`<div class="card table-card">
        <h3 style="padding:14px 16px 0">${code} — ${label}</h3>
        <table class="table">
          <tbody>
            ${entries.map(
              (e) =>
                html`<tr>
                  <td style="width:100px">${frDate(e.date)}</td>
                  <td style="width:60px">${e.number ?? '—'}</td>
                  <td>${e.label}</td>
                  <td>${e.lines.map((l) => html`<div class="mono">${l.account} ${l.debit ? `D ${eur(l.debit)}` : `C ${eur(l.credit)}`}</div>`)}</td>
                </tr>`,
            )}
          </tbody>
        </table>
      </div>`;
    });
  } else if (tab === 'archives') {
    body = archivesView();
  } else {
    const drafts = ws.ledger.entries.filter((e) => e.status === 'draft').length;
    body = html`<div class="card" style="display:flex;flex-direction:column;gap:14px">
      <p>
        Écritures en brouillon : <strong>${drafts}</strong>. Période verrouillée jusqu'au :
        <strong>${ws.ledger.lockedThrough ? frDate(ws.ledger.lockedThrough) : 'aucune'}</strong>.
      </p>
      <div class="notice-gold">
        La validation numérote définitivement les écritures dans l'ordre chronologique et verrouille la période : une écriture validée ne se modifie plus
        (correction par contre-passation).
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        ${field("Valider jusqu'au", html`<input class="input" type="date" data-validate-date value="${today()}" />`)}<button
          class="btn btn-primary"
          data-action="validate"
          style="margin-bottom:2px"
        >
          Valider la période
        </button>
      </div>
      <h3 class="form-subsection-title">Fichier des écritures comptables (FEC)</h3>
      <p class="text-muted">
        Export conforme à l'article A47 A-1 du LPF, à contrôler avec l'outil Test Compta Demat de la DGFiP. Toutes les écritures doivent être validées.
      </p>
      <div>
        <button class="btn btn-secondary" data-action="fec" ${drafts ? raw('disabled title="Validez d’abord toutes les écritures"') : ''}>
          Télécharger le FEC
        </button>
      </div>
    </div>`;
  }
  const exportable = tab !== 'cloture' && tab !== 'archives';
  return html` ${viewHeader('Comptabilité', 'Vue avancée pour vous et votre expert-comptable.', exportable ? html`<button class="btn btn-secondary no-print" data-action="export-state" data-tab="${tab}">Exporter (Excel)</button><button class="btn btn-secondary no-print" data-action="print">Imprimer / PDF</button>` : '')}
    <div class="tabs no-print" style="margin-bottom:14px">
      ${tabs.map(([k, l]) => html`<button class="tab ${k === tab ? 'active' : ''}" data-action="compta-tab" data-tab="${k}">${l}</button>`)}
    </div>
    ${body}`;
}
