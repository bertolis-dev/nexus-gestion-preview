/**
 * Trésorerie prévisionnelle à 30, 60 et 90 jours (accueil) : soldes attendus, alerte si la
 * trésorerie passe sous zéro, détail des mouvements pris en compte.
 */

import { cashForecast } from '../../core/forecast.js?v=a619ec1';
import { html } from '../html.js?v=a619ec1';
import { eur, frDate, today, ui, ws } from '../state.js?v=a619ec1';

export function forecastCard() {
  const f = cashForecast(ws, today());
  if (!f.events.length) return '';
  return html`<div class="card" id="tresorerie-prevue" tabindex="-1" style="display:flex;flex-direction:column;gap:10px">
    <h2>Trésorerie prévisionnelle</h2>
    ${
      f.firstNegative
        ? html`<div class="notice-gold" role="alert">
            Attention : votre trésorerie pourrait passer sous zéro le <strong>${frDate(f.firstNegative)}</strong>. Relancez les factures en retard ou décalez
            une dépense.
          </div>`
        : ''
    }
    <div class="table-scroll" tabindex="0" role="region" aria-label="Trésorerie prévue à 30, 60 et 90 jours">
      <table class="table">
        <thead>
          <tr>
            <th>Dans</th>
            <th class="num">Encaissements</th>
            <th class="num">Paiements</th>
            <th class="num">Trésorerie attendue</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Aujourd’hui</td>
            <td class="num"></td>
            <td class="num"></td>
            <td class="num"><strong>${eur(f.start)}</strong></td>
          </tr>
          ${f.horizons.map(
            (h) =>
              html`<tr>
                <td>${h.days} jours (${frDate(h.date)})</td>
                <td class="num">${eur(h.inflow)}</td>
                <td class="num">${eur(h.outflow)}</td>
                <td class="num"><strong>${eur(h.balance)}</strong></td>
              </tr>`,
          )}
        </tbody>
      </table>
    </div>
    <button class="btn-link" data-action="forecast-toggle" aria-expanded="${ui.forecastOpen ? 'true' : 'false'}">
      ${ui.forecastOpen ? 'Masquer le détail' : `Voir le détail (${f.events.length} mouvements)`}
    </button>
    ${
      ui.forecastOpen
        ? html`<div class="table-scroll" tabindex="0" role="region" aria-label="Détail de la trésorerie prévue">
            <table class="table">
              <tbody>
                ${f.events.map(
                  (e) =>
                    html`<tr>
                      <td style="width:110px">${frDate(e.date)}</td>
                      <td>${e.label}</td>
                      <td class="num">${eur(e.amount)}</td>
                    </tr>`,
                )}
              </tbody>
            </table>
          </div>`
        : ''
    }
    <p class="form-hint" style="margin:0">
      Prévision à partir de vos factures, dépenses, factures récurrentes, TVA et cotisations
      estimées${ws.company.taxRegime === 'is-reel' ? ', acomptes et solde d’impôt sur les sociétés (calculés sur votre dernier exercice clôturé)' : ''}.
    </p>
  </div>`;
}
