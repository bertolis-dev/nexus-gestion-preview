/**
 * Mode « dépôt » : les factures émises sont transmises par la plateforme agréée gratuite de
 * l'entreprise (Qonto, Shine, Pennylane, Tiime…) — export groupé des PDF Factur-X, puis marquage
 * « Déposée ».
 */

import { depositCandidates, PLATFORMS } from '../../core/deposit.js?v=d415f7a';
import { field, html, opt } from '../html.js?v=d415f7a';
import { ui, ws } from '../state.js?v=d415f7a';

export function depositCard() {
  const todo = depositCandidates(ws.book);
  const platform = ws.company.paPlatform || '';
  const pending = ui.pendingDeposit;
  if (!todo.length && !pending) return '';
  return html`<div class="card" style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
    <h2>Transmettre vos factures par votre plateforme agréée</h2>
    <p class="text-muted" style="margin:0">
      Déposez vos factures (PDF Factur-X, qui contient la facture électronique) dans l’espace facturation de la plateforme agréée que vous utilisez déjà,
      souvent gratuite avec votre banque ou votre logiciel. Nexus les marque ensuite « Déposée ».
    </p>
    ${
      pending
        ? html`<div class="notice-gold" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <span>${pending.ids.length} facture(s) prête(s) à déposer sur ${PLATFORMS[pending.platform]} (fichier ${pending.fileName}).</span>
            <button class="btn btn-primary btn-sm" data-action="deposit-confirm">J’ai déposé ces factures</button>
            <button class="btn btn-secondary btn-sm" data-action="deposit-cancel">Pas encore</button>
          </div>`
        : html`<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
            ${field(
              'Votre plateforme agréée',
              html`<select class="input" data-pa-platform>
                ${opt('', 'Choisir…', !platform)}${Object.entries(PLATFORMS).map(([k, label]) => opt(k, label, platform === k))}
              </select>`,
            )}
            <button class="btn btn-primary" data-action="deposit-prepare" style="margin-bottom:2px" ${platform ? '' : 'disabled'}>
              Préparer le dépôt (${todo.length} facture${todo.length > 1 ? 's' : ''})
            </button>
          </div>`
    }
  </div>`;
}
