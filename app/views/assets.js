/**
 * Écran « assets ».
 */

import { fixedAssets } from '../../core/assets.js?v=3bfbbd4';
import { html, opt, raw } from '../html.js?v=3bfbbd4';
import { ICONS } from '../icons.js?v=3bfbbd4';
import { eur, frDate, ws } from '../state.js?v=3bfbbd4';
import { term } from '../ui/common.js?v=3bfbbd4';

// ------------------------------------------------------------------ immobilisations

export function viewAssets() {
  const assets = fixedAssets(ws.purchases, ws.company, ws.company.fiscalYear);
  const fyYear = ws.company.fiscalYear.end.slice(0, 4);
  if (!assets.length) {
    return html`<div class="card">
      <div class="empty-state">
        <div class="empty-icon">${raw(ICONS.package)}</div>
        <h3>${term('Aucun équipement', 'Aucune immobilisation')}</h3>
        <p class="text-muted">
          Un équipement acheté plus de 500 € HT (ordinateur, mobilier…) est inscrit ici automatiquement quand vous enregistrez la dépense.
        </p>
      </div>
    </div>`;
  }
  return html` <div class="notice-gold" style="margin-bottom:14px">
      Un équipement durable ne passe pas en charge d'un coup : son coût est réparti sur sa durée d'usage (amortissement). Les dotations sont passées à la
      clôture de l'exercice ; durées par défaut à confirmer avec votre expert-comptable.
    </div>
    <div class="card table-card">
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Bien</th>
              <th>Acquis le</th>
              <th class="num">Coût</th>
              <th>Durée</th>
              <th class="num">Dotation ${fyYear}</th>
              <th class="num">Valeur nette fin ${fyYear}</th>
            </tr>
          </thead>
          <tbody>
            ${assets.map(
              (a) =>
                html`<tr>
                  <td>
                    ${a.label}
                    <details style="margin-top:4px">
                      <summary class="text-muted" style="cursor:pointer;font-size:12px">Plan d'amortissement</summary>
                      <table class="table" style="margin-top:6px">
                        <tbody>
                          ${a.schedule.map(
                            (s) =>
                              html`<tr>
                                <td>${s.year}</td>
                                <td class="num">${eur(s.dotation)}</td>
                                <td class="num text-muted">reste ${eur(s.vnc)}</td>
                              </tr>`,
                          )}
                        </tbody>
                      </table>
                    </details>
                  </td>
                  <td>${frDate(a.date)}</td>
                  <td class="num">${eur(a.cost)}</td>
                  <td>
                    <select
                      class="input input-sm"
                      data-action="asset-years"
                      data-id="${a.id}"
                      aria-label="Durée d’amortissement de ${a.label}"
                      style="width:auto"
                    >
                      ${[1, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20].map((n) => opt(n, `${n} an${n > 1 ? 's' : ''}`, a.years === n))}
                    </select>
                  </td>
                  <td class="num">${eur(a.dotationThisYear)}</td>
                  <td class="num">${eur(a.netBookValue)}</td>
                </tr>`,
            )}
          </tbody>
        </table>
      </div>
    </div>`;
}
