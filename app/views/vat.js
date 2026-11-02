/**
 * Écran « vat ».
 */

import { html, raw } from '../html.js?v=17f2ba9';
import { ICONS } from '../icons.js?v=17f2ba9';
import { eur, frDate, today, ui, ws } from '../state.js?v=17f2ba9';
import { viewHeader } from '../ui/common.js?v=17f2ba9';
import { franchiseBanner, thresholdCard } from './micro.js?v=17f2ba9';

// ------------------------------------------------------------------ TVA (§3.6)

export function viewVat(arg) {
  // Lien depuis « À faire » : #/tva/AAAA-MM-JJ ouvre la période concernée, une seule fois (les onglets
  // restent ensuite utilisables).
  if (/^\d{4}-\d{2}-\d{2}$/.test(arg || '') && ui.vatLink !== arg) {
    ui.vatLink = arg;
    ui.vatPeriod = arg;
  }
  if (ws.company.vatRegime === 'franchise') {
    return html`${viewHeader('TVA', 'Vous êtes en franchise en base : vous ne facturez pas de TVA.')}${franchiseBanner()}
      <div class="card">${thresholdCard()}</div>`;
  }
  if (ws.company.vatRegime === 'reel-simplifie') return viewCa12();
  const quarterly = ws.company.vatPeriodicity === 'trimestrielle';
  return viewCa3(
    ws.vatPeriods().map((p) => ({
      ...p,
      label: quarterly ? p.label : new Date(`${p.from}T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
    })),
  );
}

/** Encadré pour le non-comptable : comment se calcule la TVA à reverser. */
export const vatExplainer = () =>
  html`<div class="notice-gold" style="margin-bottom:14px">
    Comment lire ces montants : la <strong>TVA due</strong> est celle que vous avez facturée à vos clients ; la <strong>TVA récupérable</strong> est celle payée
    sur vos achats. Vous reversez la différence. Exemple : 200 € dus − 50 € récupérables = 150 € à payer.
  </div>`;

/** « À payer avant le JJ/MM », « Crédit de TVA » ou « Rien à payer ». */
export function vatDueLabel(toPay, credit, deadline) {
  if (toPay > 0) return `À payer avant le ${deadline.slice(8, 10)}/${deadline.slice(5, 7)}`;
  if (credit > 0) return 'Crédit de TVA : rien à payer';
  return 'Rien à payer';
}

/** Régime simplifié : déclaration annuelle CA12 et acomptes de juillet et décembre. */
export function viewCa12() {
  const fy = ws.company.fiscalYear;
  const ended = fy.end < today();
  const period = { from: fy.start, to: ended ? fy.end : today() };
  const record = ws.vatReturns.find((r) => r.from === fy.start && r.kind === 'CA12');
  const ca12 = ws.prepareVatReturn(period);
  const b = record ? record.boxes : ca12.boxes;
  const advances = ws.vatAdvancesDue();
  const status = record ? `Déclarée le ${frDate(record.declaredAt)}` : ended ? 'À déclarer' : 'Exercice en cours';
  const rows = [
    ['Ventes et prestations imposables (HT)', b['01']],
    ['TVA due', b['16']],
    ['TVA récupérable sur les équipements', b['19']],
    ['TVA récupérable sur les autres dépenses', b['20']],
    ['Acomptes déjà versés (juillet, décembre)', b.acomptes],
    [b['28'] ? 'TVA restant à payer' : 'Crédit de TVA', b['28'] || b['25']],
  ];
  return html` ${viewHeader('TVA', 'Régime simplifié : une déclaration annuelle (CA12), avec deux acomptes en juillet et en décembre.')}
    <div class="kpi-grid">
      <div class="kpi-card kpi-card-hero">
        <div class="kpi-icon">${raw(ICONS.percent)}</div>
        <div class="kpi-value">${eur(b['28'] || -(b['25'] || 0))}</div>
        <div class="kpi-label">${ended ? 'Solde de l’exercice' : 'Estimation à ce jour'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">${raw(ICONS.calendar)}</div>
        <div class="kpi-value" style="font-size:18px">${advances ? eur(advances.july) : '—'}</div>
        <div class="kpi-label">Acompte de juillet</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">${raw(ICONS.calendar)}</div>
        <div class="kpi-value" style="font-size:18px">${advances ? eur(advances.december) : '—'}</div>
        <div class="kpi-label">Acompte de décembre</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">${raw(record ? ICONS.checkCircle : ICONS.hourglass)}</div>
        <div class="kpi-value" style="font-size:18px">${status}</div>
        <div class="kpi-label">CA12 ${fy.start.slice(0, 4)}</div>
      </div>
    </div>
    ${vatExplainer()}
    ${
      !record && ca12.warnings.length
        ? html`<div class="notice-gold" style="margin-bottom:14px">
            <ul style="margin:0;padding-left:18px">
              ${ca12.warnings.map((w) => html`<li>${w}</li>`)}
            </ul>
          </div>`
        : ''
    }
    <div class="card table-card">
      <table class="table">
        <tbody>
          ${rows.map(
            ([l, v]) =>
              html`<tr>
                <td>${l}</td>
                <td class="num">${eur(v || 0)}</td>
              </tr>`,
          )}
        </tbody>
      </table>
    </div>
    ${!advances ? html`<p class="form-hint">Les acomptes de l'année suivante (55 % en juillet, 40 % en décembre) sont calculés dès la première CA12 validée ; aucun acompte si la TVA de l'année est inférieure à 1 000 €.</p>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${ended && !record ? html`<button class="btn btn-primary" data-action="vat-declare" data-from="${period.from}" data-to="${period.to}">Valider la CA12 ${fy.start.slice(0, 4)}</button>` : ''}
      <button class="btn btn-secondary" data-action="vat-justification" data-from="${period.from}" data-to="${period.to}">
        Exporter le détail par facture (Excel)
      </button>
    </div>
    <p class="form-hint">
      Versez les acomptes depuis votre banque puis classez le prélèvement en « Acompte de TVA » : ils seront déduits automatiquement de la CA12. Cases du
      formulaire 3517-S à reporter, millésime à confirmer avec votre expert-comptable.
    </p>`;
}

/** Libellés en langage courant des cases de la CA3 affichées (le numéro officiel reste visible). */
export const CA3_ROWS = [
  ['01', 'Ventes et prestations imposables (HT)'],
  ['3B', 'Achats de services à l’étranger, autoliquidés (HT)'],
  ['F2', 'Livraisons de biens dans l’Union européenne, exonérées (HT)'],
  ['E2', 'Autres opérations non imposables (HT)'],
  ['08-base', 'Base à 20 %'],
  ['08-taxe', 'TVA à 20 %'],
  ['9B-base', 'Base à 10 %'],
  ['9B-taxe', 'TVA à 10 %'],
  ['09-base', 'Base à 5,5 %'],
  ['09-taxe', 'TVA à 5,5 %'],
  ['10-base', 'Base à 2,1 %'],
  ['10-taxe', 'TVA à 2,1 %'],
  ['17', 'TVA due sur les achats autoliquidés'],
  ['16', 'Total de la TVA due'],
  ['19', 'TVA récupérable sur les équipements'],
  ['20', 'TVA récupérable sur les autres dépenses'],
  ['22', 'Crédit de TVA reporté du mois précédent'],
  ['23', 'Total de la TVA récupérable'],
  ['25', 'Crédit de TVA (à reporter ou à rembourser)'],
  ['28', 'TVA nette due'],
];

export function viewCa3(months) {
  const closed = months.filter((mo) => mo.to < today());
  const declared = new Map(ws.vatReturns.map((r) => [r.from, r]));
  const selected = closed.find((mo) => mo.from === ui.vatPeriod) || closed.at(-1);
  const header = viewHeader(
    'TVA',
    `Déclaration ${ws.company.vatPeriodicity === 'trimestrielle' ? 'trimestrielle' : 'mensuelle'} (CA3) préparée à partir de vos factures et de votre banque. Recopiez les montants sur votre espace professionnel impots.gouv.fr.`,
  );
  if (!selected)
    return html`${header}
      <div class="card">
        <div class="empty-state"><p class="text-muted">La première déclaration sera prête au lendemain de la fin du premier mois.</p></div>
      </div>`;
  const record = declared.get(selected.from);
  const ca3 = ws.prepareVatReturn({ from: selected.from, to: selected.to });
  const boxes = record ? record.boxes : ca3.boxes;
  const shown = CA3_ROWS.filter(([k]) => boxes[k] || ['01', '16', '23', '28'].includes(k));
  const strong = new Set(['16', '23', '25', '28']);
  // Numéros de case du formulaire officiel : utiles à l'expert-comptable, du bruit pour le dirigeant.
  const advanced = ui.mode === 'avance';
  return html` ${header}
    <div class="tabs" style="margin-bottom:14px;flex-wrap:wrap">
      ${closed.map((mo) => html`<button class="tab ${mo.from === selected.from ? 'active' : ''}" data-action="vat-period" data-from="${mo.from}" style="text-transform:capitalize">${mo.label}${declared.has(mo.from) ? ' ✓' : ''}</button>`)}
    </div>
    <div class="kpi-grid">
      <div class="kpi-card kpi-card-hero">
        <div class="kpi-icon">${raw(ICONS.percent)}</div>
        <div class="kpi-value">${eur(boxes['28'] || -(boxes['25'] || 0))}</div>
        <div class="kpi-label">
          ${record ? (boxes['28'] ? 'TVA payée' : 'Crédit de TVA') : vatDueLabel(boxes['28'] || 0, boxes['25'] || 0, ws.vatDeadline(selected))} —
          ${selected.label}
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">${raw(ICONS.receipt)}</div>
        <div class="kpi-value">${eur(boxes['16'])}</div>
        <div class="kpi-label">TVA due</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">${raw(ICONS.paperclip)}</div>
        <div class="kpi-value">${eur(boxes['23'])}</div>
        <div class="kpi-label">TVA récupérable</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">${raw(record ? ICONS.checkCircle : ICONS.hourglass)}</div>
        <div class="kpi-value" style="font-size:18px">${record ? `Déclarée le ${frDate(record.declaredAt)}` : 'À déclarer'}</div>
        <div class="kpi-label">Statut</div>
      </div>
    </div>
    ${
      !record && ca3.warnings.length
        ? html`<div class="notice-gold" style="margin-bottom:14px">
            <strong>Avant de valider :</strong>
            <ul style="margin:6px 0 0;padding-left:18px">
              ${ca3.warnings.map((w) => html`<li>${w}</li>`)}
            </ul>
          </div>`
        : ''
    }
    ${vatExplainer()}
    <div class="card table-card">
      <table class="table">
        <thead>
          <tr>
            ${advanced ? html`<th>Case</th>` : ''}
            <th>Libellé</th>
            <th class="num">Montant</th>
          </tr>
        </thead>
        <tbody>
          ${shown.map(
            ([k, label]) =>
              html`<tr>
                ${advanced ? html`<td class="mono">${k.replace('-base', '').replace('-taxe', '')}</td>` : ''}
                <td>${strong.has(k) ? html`<strong>${label}</strong>` : label}</td>
                <td class="num">${strong.has(k) ? html`<strong>${eur(boxes[k] || 0)}</strong>` : eur(boxes[k] || 0)}</td>
              </tr>`,
          )}
        </tbody>
      </table>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      ${record ? '' : html`<button class="btn btn-primary" data-action="vat-declare" data-from="${selected.from}" data-to="${selected.to}">Valider la déclaration de ${selected.label}</button>`}
      <button class="btn btn-secondary" data-action="vat-justification" data-from="${selected.from}" data-to="${selected.to}">
        Exporter le détail par facture (Excel)
      </button>
      <button class="btn btn-secondary" data-action="print">Imprimer / PDF</button>
    </div>
    <div class="card table-card">
      <h2 style="padding:16px 16px 0">Détail par facture</h2>
      ${
        ca3.justification.length
          ? html`<div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    ${advanced ? html`<th>Case</th>` : ''}
                    <th>Facture</th>
                    <th>Client</th>
                    <th>Exigible le</th>
                    <th class="num">Base HT</th>
                    <th class="num">TVA</th>
                  </tr>
                </thead>
                <tbody>
                  ${ca3.justification.map(
                    (j) =>
                      html`<tr>
                        ${advanced ? html`<td class="mono">${j.line}</td>` : ''}
                        <td class="mono">${j.number}</td>
                        <td>${j.client}</td>
                        <td>${frDate(j.date)} <span class="text-muted" style="font-size:12px">(${j.reason})</span></td>
                        <td class="num">${eur(j.base)}</td>
                        <td class="num">${eur(j.vat)}</td>
                      </tr>`,
                  )}
                </tbody>
              </table>
            </div>`
          : html`<div class="empty-state"><p class="text-muted">Aucune vente taxable ce mois-ci.</p></div>`
      }
    </div>
    <p class="form-hint">Les numéros de case suivent le formulaire 3310-CA3 ; le millésime en vigueur est à confirmer avec votre expert-comptable.</p>`;
}
