/**
 * Import du fichier mensuel de Nexus RH (Dépenses) : aperçu ligne par ligne avant validation ; rien
 * n'est enregistré avant le clic sur « Importer ». Contrôles et règles : core/nexusrh-import.js.
 */

import { previewNexusRhImport } from '../../core/nexusrh-import.js?v=a619ec1';
import { EXPENSE_CATEGORIES } from '../../core/pcg.js?v=a619ec1';
import * as cloud from '../cloud.js?v=a619ec1';
import { html } from '../html.js?v=a619ec1';
import { render } from '../render.js?v=a619ec1';
import { cloudState, eur, frDate, ui, ws } from '../state.js?v=a619ec1';
import { save, toast, whenSaved } from '../store.js?v=a619ec1';
import { badge, icon } from '../ui/common.js?v=a619ec1';

const STATUS = { new: ['À importer', 'info'], already: ['Déjà importée', 'muted'], error: ['À corriger', 'warning'], skip: ['Non importée', 'warning'] };
const TICKETS_STATUS = { ...STATUS, already: ['Déjà importés', 'muted'], skip: ['Non importés', 'warning'] };
const categoryLabel = (id) => EXPENSE_CATEGORIES.find((c) => c.id === id)?.label || '—';

/** Bouton d'en-tête de l'écran Dépenses. */
export function nexusRhButton() {
  return html`<label class="btn btn-secondary" style="margin:0" tabindex="0" data-file-picker
    >${icon('upload', 14)} Importer depuis Nexus RH<input type="file" accept=".json,application/json" data-action="nexusrh-file" hidden
  /></label>`;
}

/** Fichier choisi : lu et contrôlé, puis présenté en aperçu. */
export async function readNexusRhFile(file) {
  const text = await file.text();
  // Mode connecté : ce qu'un autre appareil a déjà importé compte comme « déjà importé ».
  let serverRefs = [];
  if (!ui.demo && cloudState.meta) {
    try {
      serverRefs = await cloud.importedRefs(cloudState.meta.structureId);
    } catch {
      return toast('Vérification des imports précédents impossible (connexion ?) : réessayez dans un instant.', true);
    }
  }
  const preview = previewNexusRhImport(ws, text, { serverRefs });
  // Salaires : données confidentielles, réservées au dirigeant et à l'expert-comptable (comme en base).
  if (preview.payroll && cloudState.role === 'collaborateur')
    preview.errors.push(
      'Ce fichier contient les salaires : seul le dirigeant ou l’expert-comptable peut l’importer. Demandez à Nexus RH un export sans la paie.',
    );
  ui.nexusRh = { fileName: file.name, preview };
  ui.expensesTab = 'depenses';
  render();
  // Le panneau d'aperçu reçoit le focus (annoncé aux lecteurs d'écran).
  document.getElementById('nexusrh-title')?.focus();
}

export function nexusRhPanel() {
  const { fileName, preview: p } = ui.nexusRh;
  const blocked = p.errors.length > 0;
  // Fichier illisible ou vide : seuls les messages d'erreur et « Annuler » sont utiles.
  const empty = blocked && !p.notes.length && !p.tickets && !p.payroll;
  return html`<div class="card" style="display:flex;flex-direction:column;gap:12px" id="nexusrh-import">
    <h2 id="nexusrh-title" tabindex="-1">Import depuis Nexus RH${p.period ? ` — ${p.period.slice(5)}/${p.period.slice(0, 4)}` : ''}</h2>
    <p class="form-hint" style="margin:0">Fichier : ${fileName}. Vérifiez les lignes ci-dessous : rien n’est enregistré avant votre confirmation.</p>
    ${
      blocked
        ? html`<div class="issues-box" role="alert">
            <strong>Import impossible :</strong>
            <ul style="margin:6px 0 0">
              ${p.errors.map((e) => html`<li>${e}</li>`)}
            </ul>
          </div>`
        : ''
    }
    ${
      p.notes.length
        ? html`<div class="table-scroll" tabindex="0" role="region" aria-label="Notes de frais du fichier">
            <table class="table cards-mobile">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Salarié</th>
                  <th>Catégorie</th>
                  <th>Libellé</th>
                  <th class="num">Montant TTC</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                ${p.notes.map(
                  (n) =>
                    html`<tr>
                      <td data-label="Date">${n.date ? frDate(n.date) : '—'}</td>
                      <td data-label="Salarié">${n.employee || '—'}</td>
                      <td data-label="Catégorie">${n.categoryId ? categoryLabel(n.categoryId) : n.category || '—'}</td>
                      <td data-label="Libellé">${n.label}</td>
                      <td class="num" data-label="Montant TTC">${n.ttc === null ? '—' : eur(n.ttc)}</td>
                      <td data-label="État">
                        ${badge(...STATUS[n.status])}${n.message && n.message !== 'Déjà importée.' ? html`<div class="form-hint">${n.message}</div>` : ''}
                      </td>
                    </tr>`,
                )}
              </tbody>
            </table>
          </div>`
        : blocked
          ? ''
          : html`<p style="margin:0">Aucune note de frais dans ce fichier.</p>`
    }
    ${
      p.tickets
        ? html`<p style="margin:0">
            <strong>Tickets restaurant :</strong> ${p.tickets.count} titres, ${eur(p.tickets.total ?? 0)} payés à l’émetteur le
            ${p.tickets.date ? frDate(p.tickets.date) : '—'}, dont ${eur(p.tickets.employer ?? 0)} à la charge de l’entreprise.
            ${badge(...TICKETS_STATUS[p.tickets.status])}${p.tickets.message ? html` <span class="form-hint">${p.tickets.message}</span>` : ''}
          </p>`
        : ''
    }
    ${
      p.payroll
        ? html`<p style="margin:0">
            <strong>Salaires :</strong> ${eur(p.payroll.net)} nets versés le ${frDate(p.payroll.payDate)}, cotisations
            ${eur(p.payroll.employeeCharges + p.payroll.employerCharges)} à payer le ${frDate(p.payroll.organisms[0].dueDate)}.
            ${badge(...TICKETS_STATUS[p.payroll.status])}${p.payroll.message ? html` <span class="form-hint">${p.payroll.message}</span>` : ''} <br /><span
              class="form-hint"
              >${
                ws.company.payrollBy === 'nexus'
                  ? 'Ils seront enregistrés en comptabilité (réglage « Qui saisit les salaires ? » : Nexus).'
                  : 'Ils serviront seulement à prévoir votre trésorerie : votre expert-comptable les enregistre depuis le journal de paie (modifiable dans les Paramètres).'
              }</span
            >
          </p>`
        : ''
    }
    ${
      empty
        ? ''
        : html`<p class="form-hint" style="margin:0">
            Chaque note devient une dépense à rembourser au salarié ; sa TVA est récupérée selon la catégorie. Le remboursement se rapproche ensuite du virement
            dans l’écran Banque.
          </p>`
    }
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${
        empty
          ? ''
          : html`<button class="btn btn-primary" data-action="nexusrh-save" ${blocked || !p.toCreate ? 'disabled' : ''}>
              ${p.toCreate ? `Importer ${p.toCreate} ligne${p.toCreate > 1 ? 's' : ''}` : 'Rien de nouveau à importer'}
            </button>`
      }
      <button class="btn btn-secondary" data-action="nexusrh-cancel">Annuler</button>
    </div>
  </div>`;
}

/** Confirmation : enregistrement, puis trace de l'import dans le journal d'audit (mode connecté). */
export async function saveNexusRhImport() {
  const { fileName, preview } = ui.nexusRh;
  let result;
  try {
    result = ws.importNexusRh(preview);
  } catch (err) {
    return toast(err.message, true);
  }
  ui.nexusRh = null;
  save();
  render();
  toast(
    `${result.created} ligne${result.created > 1 ? 's' : ''} importée${result.created > 1 ? 's' : ''} depuis Nexus RH${result.ignored ? ` (${result.ignored} déjà importée${result.ignored > 1 ? 's' : ''})` : ''}.`,
  );
  if (ui.demo || !cloudState.meta) return;
  try {
    await whenSaved();
    await cloud.logNexusRhImport(cloudState.meta.structureId, {
      file: fileName.slice(0, 200),
      period: preview.period,
      created: result.created,
      ignored: result.ignored,
    });
  } catch (err) {
    toast(`Import enregistré, mais sa trace n’a pas pu être inscrite au journal d’audit : ${cloud.friendly(err)}`, true);
  }
}
