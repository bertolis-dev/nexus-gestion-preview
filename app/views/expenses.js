/**
 * Écran « expenses ».
 */

import { VAT_RATES_BP } from '../../core/invoices.js?v=a619ec1';
import { LIFECYCLE, nextStatuses } from '../../core/lifecycle.js?v=a619ec1';
import { CHOOSABLE_EXPENSE_CATEGORIES, EXPENSE_CATEGORIES } from '../../core/pcg.js?v=a619ec1';
import * as cloud from '../cloud.js?v=a619ec1';
import { field, html, opt, raw } from '../html.js?v=a619ec1';
import { ICONS } from '../icons.js?v=a619ec1';
import { isMicro, render } from '../render.js?v=a619ec1';
import { cloudState, eur, frDate, pct, today, ui, ws } from '../state.js?v=a619ec1';
import { toast } from '../store.js?v=a619ec1';
import { badge, icon, term, viewHeader } from '../ui/common.js?v=a619ec1';
import { preparePhoto } from '../ui/photo.js?v=a619ec1';
import { nexusRhButton, nexusRhPanel } from './nexusrh-import.js?v=a619ec1';
import { viewAssets } from './assets.js?v=a619ec1';
import { viewMileage } from './pilotage.js?v=a619ec1';

// ------------------------------------------------------------------ dépenses (§3.3)

export function viewExpenses() {
  const pending = ui.pendingPurchase;
  const f = pending?.form || {};
  const franchise = ws.company.vatRegime === 'franchise';
  const list = [...ws.purchases].reverse();
  const tabs = html`<div class="tabs" style="margin-bottom:14px">
    <button class="tab ${ui.expensesTab === 'immobilisations' || ui.expensesTab === 'trajets' ? '' : 'active'}" data-action="expenses-tab" data-tab="depenses">
      Dépenses
    </button>
    <button class="tab ${ui.expensesTab === 'immobilisations' ? 'active' : ''}" data-action="expenses-tab" data-tab="immobilisations">
      ${term('Équipements', 'Immobilisations')}
    </button>
    ${isMicro() ? '' : html`<button class="tab ${ui.expensesTab === 'trajets' ? 'active' : ''}" data-action="expenses-tab" data-tab="trajets">Trajets en voiture</button>`}
  </div>`;
  if (ui.expensesTab === 'trajets' && !isMicro())
    return html`${viewHeader('Dépenses', 'Vos trajets professionnels avec votre véhicule personnel, au barème kilométrique.')}${tabs}${viewMileage()}`;
  if (ui.expensesTab === 'immobilisations') return html`${viewHeader('Dépenses', 'Vos équipements durables et leur amortissement.')}${tabs}${viewAssets()}`;
  return html` ${viewHeader('Dépenses', 'Ajoutez vos factures d’achat : la catégorie suffit, Nexus fait le reste.', html`<label class="btn btn-secondary" style="margin:0" tabindex="0" data-file-picker>${icon('upload', 14)} Importer des factures reçues (XML, PDF Factur-X ou ZIP)<input type="file" accept=".xml,.pdf,.zip,application/xml,text/xml,application/pdf,application/zip" multiple data-action="einvoice-in-file" hidden /></label>${nexusRhButton()}${ws.purchases.length ? html`<button class="btn btn-secondary" data-action="export-purchases-csv">Exporter (Excel)</button>` : ''}`)}
    ${tabs} ${ui.nexusRh ? nexusRhPanel() : ''} ${ui.pendingEinvoice ? einvoicePreview(ui.pendingEinvoice) : ''}
    <form class="card" data-form="purchase" style="display:flex;flex-direction:column;gap:14px">
      <h2>Ajouter une dépense</h2>
      ${pending?.duplicates?.length ? html`<div class="notice-gold">Cette dépense ressemble à une facture déjà enregistrée (${pending.duplicates.map((p) => `${p.supplier.name} du ${frDate(p.date)}`).join(', ')}). <button type="button" class="btn btn-gold btn-sm" data-action="purchase-force">L'enregistrer quand même</button> <button type="button" class="btn btn-secondary btn-sm" data-action="purchase-cancel">Annuler</button></div>` : ''}
      ${pending?.error ? html`<div class="issues-box">${pending.error}</div>` : ''}
      <div class="form-grid">
        ${field('Fournisseur', html`<input class="input" name="supplier" required value="${f.supplier || ''}" placeholder="Ex. : Orange" />`)}
        ${field('Date de la facture', html`<input class="input" type="date" name="date" value="${f.date || today()}" />`)}
        ${field('N° de facture', html`<input class="input" name="number" value="${f.number || ''}" />`, { hint: 'Sert à détecter les doublons et à rapprocher le paiement.' })}
        ${field(
          'Type de pièce',
          html`<select class="input" name="docType">
            ${opt('invoice', 'Facture', f.docType !== 'credit')}${opt('credit', 'Avoir (remboursement ou remise)', f.docType === 'credit')}
          </select>`,
        )}
        ${field(
          'Catégorie',
          html`<select class="input" name="categoryId">
            ${CHOOSABLE_EXPENSE_CATEGORIES.map((c) => opt(c.id, c.label, f.categoryId === c.id))}
          </select>`,
        )}
        ${field('Montant TTC', html`<input class="input" name="ttc" inputmode="decimal" placeholder="0,00" value="${f.ttc || ''}" required />`)}
        ${
          franchise
            ? ''
            : field(
                'Taux de TVA',
                html`<select class="input" name="vatRateBp">
                  ${VAT_RATES_BP.map((r) => opt(r, pct(r), Number(f.vatRateBp ?? 2000) === r))}
                </select>`,
              )
        }
        ${field('Justificatif', html`<input class="input" type="file" name="document" accept="image/*,application/pdf" capture="environment" />`, { hint: 'Photo prise avec le téléphone ou PDF. Une grande photo est allégée avant l’envoi ; un PDF est conservé tel quel.' })}
      </div>
      ${
        franchise
          ? ''
          : html`<label class="form-field-checkbox" style="display:flex;gap:8px;align-items:center"
                ><input type="checkbox" name="reverseCharge" ${f.reverseCharge ? raw('checked') : ''} />Facture reçue sans TVA à reverser par moi
                (autoliquidation : sous-traitance dans le bâtiment)</label
              >
              <label class="form-field-checkbox" style="display:flex;gap:8px;align-items:center"
                ><input type="checkbox" name="vatOnDebits" ${f.vatOnDebits ? raw('checked') : ''} />Sa facture porte la mention « TVA d’après les débits » : la
                TVA d’une prestation est récupérable dès la facture, et non à son paiement</label
              >`
      }
      <div><button class="btn btn-primary" type="submit">Enregistrer la dépense</button></div>
    </form>
    <div class="card table-card">
      ${
        list.length
          ? html`<div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Fournisseur</th>
                    <th>Catégorie</th>
                    <th class="num">Montant TTC</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  ${list.map(
                    (p) =>
                      html`<tr>
                        <td>${frDate(p.date)}</td>
                        <td>
                          ${p.supplier.name}${
                            p.externalRef
                              ? html` <span class="text-muted">${p.lines[0].label || ''}</span>`
                              : p.number
                                ? html` <span class="text-muted mono">${p.number}</span>`
                                : ''
                          }
                        </td>
                        <td>
                          ${p.supplier.kind === 'titres-restaurant' ? 'Titres-restaurant' : EXPENSE_CATEGORIES.find((c) => c.id === p.lines[0].categoryId)?.label}
                        </td>
                        <td class="num">${eur(p.type === 'credit' ? -p.totalTtc : p.totalTtc)}</td>
                        <td>
                          <div class="badge-row">
                            ${p.type === 'credit' ? badge('Avoir', 'primary') : ''}${p.paid >= p.totalTtc ? badge(p.type === 'credit' ? 'Remboursé' : 'Payée', 'success') : badge(p.type === 'credit' ? 'À recevoir' : 'À payer', 'warning')}${receiptCell(p)}
                          </div>
                        </td>
                      </tr>`,
                  )}
                </tbody>
              </table>
            </div>`
          : html`<div class="empty-state">
              <div class="empty-icon">${raw(ICONS.paperclip)}</div>
              <h3>Aucune dépense enregistrée</h3>
            </div>`
      }
    </div>`;
}

/** Suivi des statuts d'une facture émise (cycle de vie de la facturation électronique). */
export function lifecycleCard(inv) {
  const events = ws.book.lifecycle[inv.id] || [];
  const next = nextStatuses(events);
  const sourceLabel = { manuel: 'saisi', banque: 'paiement rapproché', PA: 'plateforme agréée' };
  const kind = (s) => (LIFECYCLE[s].alert ? 'warning' : s === 'encaissee' ? 'success' : 'info');
  return html`<div class="card no-print" style="margin-top:20px;display:flex;flex-direction:column;gap:10px">
    <h2>Suivi de la facture</h2>
    ${
      events.length
        ? html`<table class="table">
            <tbody>
              ${events.map(
                (e) =>
                  html`<tr>
                    <td style="width:110px">${frDate(e.date)}</td>
                    <td>${badge(LIFECYCLE[e.status].label, kind(e.status))}${e.detail ? html` <span class="text-muted">${e.detail}</span>` : ''}</td>
                    <td class="text-muted" style="font-size:12px">${sourceLabel[e.source] || e.source}</td>
                  </tr>`,
              )}
            </tbody>
          </table>`
        : html`<p class="text-muted">
            Aucun statut pour l'instant. Ajoutez ci-dessous ceux qu'affiche votre plateforme agréée (déposée, reçue, approuvée…) ; « Encaissée » se pose tout
            seul au paiement.
          </p>`
    }
    ${
      next.length
        ? html`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            ${field(
              'Ajouter un statut',
              html`<select class="input" data-status-select>
                ${next.map((k) => opt(k, LIFECYCLE[k].label))}
              </select>`,
            )}
            ${field('Précision (facultatif)', html`<input class="input" data-status-detail placeholder="Ex. : motif du refus" />`)}
            <button class="btn btn-secondary" data-action="status-add" data-id="${inv.id}" style="margin-bottom:2px">Ajouter</button>
          </div>`
        : ''
    }
  </div>`;
}

/** Aperçu d'une facture électronique reçue, avant enregistrement de la dépense. */
export function einvoicePreview({ inv, duplicates }) {
  const blocked = inv.currency !== 'EUR';
  return html`<div class="card" style="display:flex;flex-direction:column;gap:12px;border:2px solid var(--landing-gold-500)">
    <h2>Facture électronique reçue (${inv.format})</h2>
    <table class="table">
      <tbody>
        <tr>
          <td>Fournisseur</td>
          <td><strong>${inv.seller.name}</strong>${inv.seller.siren ? html` <span class="text-muted">SIREN ${inv.seller.siren}</span>` : ''}</td>
        </tr>
        <tr>
          <td>Facture</td>
          <td class="mono">${inv.number} du ${frDate(inv.issueDate)}${inv.dueDate ? ` · échéance ${frDate(inv.dueDate)}` : ''}</td>
        </tr>
        ${inv.taxes.map(
          (t) =>
            html`<tr>
              <td>Base à ${pct(t.rateBp)}</td>
              <td class="num">${eur(t.base)} HT · TVA ${eur(t.vat)}</td>
            </tr>`,
        )}
        <tr>
          <td><strong>Total TTC</strong></td>
          <td class="num"><strong>${eur(inv.totalTtc)}</strong></td>
        </tr>
      </tbody>
    </table>
    ${inv.type === 'credit' ? html`<div class="notice-gold">Avoir fournisseur : la charge et la TVA récupérable seront diminuées d'autant ; le remboursement sera proposé en face du virement reçu.</div>` : ''}
    ${
      inv.warnings.length
        ? html`<div class="notice-gold">
            <ul style="margin:0;padding-left:18px">
              ${inv.warnings.map((w) => html`<li>${w}</li>`)}
            </ul>
          </div>`
        : ''
    }
    ${duplicates?.length ? html`<div class="notice-gold">Cette facture semble déjà enregistrée (${duplicates.map((p) => `${p.supplier.name} du ${frDate(p.date)}`).join(', ')}).</div>` : ''}
    ${
      blocked
        ? ''
        : html`<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
            ${field(
              'Catégorie',
              html`<select class="input" data-einvoice-cat>
                ${CHOOSABLE_EXPENSE_CATEGORIES.map((cat) => opt(cat.id, cat.label))}
              </select>`,
            )}
            <button class="btn btn-primary" data-action="einvoice-in-save" style="margin-bottom:2px">
              ${duplicates?.length ? 'Enregistrer quand même' : 'Enregistrer la dépense'}
            </button>
          </div>`
    }
    <div><button class="btn-link" data-action="einvoice-in-cancel">Annuler</button></div>
  </div>`;
}

/** Justificatif d'une dépense : lien vers la pièce stockée, ou signalement de son absence. */
export function receiptCell(p) {
  // Pièce jointe à la dépense, ou ajoutée depuis la Banque sur le paiement de cette dépense.
  const paidBy = new Set((p.payments || []).map((x) => x.ref));
  const doc = cloudState.documents.find(
    (d) => (d.linked_entity === 'purchase' && d.linked_id === p.id) || (d.linked_entity === 'transaction' && paidBy.has(d.linked_id)),
  );
  if (doc) return html`<button class="btn-link" data-action="receipt-open" data-path="${doc.storage_path}">Voir le justificatif</button>`;
  // Note de frais importée de Nexus RH : la pièce reste conservée par Nexus RH.
  if (p.receiptUrl) return html`<a class="btn-link" href="${p.receiptUrl}" target="_blank" rel="noopener">Voir le justificatif (Nexus RH)</a>`;
  if (p.externalRef?.startsWith('nexus-rh:') && p.documentName) return badge('Justificatif dans Nexus RH', 'info');
  if (ui.demo && p.documentName) return badge('Justificatif joint', 'info');
  return badge('Sans justificatif');
}

/** Envoie la pièce jointe d'une dépense vers le stockage (mode connecté uniquement). */
export async function attachReceipt(purchase, file) {
  if (!file || ui.demo || !cloudState.meta) return;
  try {
    const ready = await preparePhoto(file); // photo du téléphone réduite avant l'envoi
    cloudState.documents.push(await cloud.uploadReceipt(cloudState.meta.structureId, ready, { entity: 'purchase', id: purchase.id }));
    render();
    toast('Justificatif enregistré.');
  } catch (err) {
    toast(`Justificatif non enregistré : ${cloud.friendly(err)}`, true);
  }
}
