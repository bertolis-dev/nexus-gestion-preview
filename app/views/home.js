/**
 * Écran « home ».
 */

import { html, raw } from '../html.js?v=3bfbbd4';
import { ICONS } from '../icons.js?v=3bfbbd4';
import { isMicro } from '../render.js?v=3bfbbd4';
import { eur, today, ui, ws } from '../state.js?v=3bfbbd4';
import { allocationCard } from './closing.js?v=3bfbbd4';
import { franchiseBanner } from './micro.js?v=3bfbbd4';
import { forecastCard } from './forecast.js?v=3bfbbd4';
import { activityCard } from './stats.js?v=3bfbbd4';

// ------------------------------------------------------------------ accueil

export function viewHome() {
  const t = today();
  const d = ws.dashboard(t);
  const todo = ws.todo(t);
  const kpi = (iconName, value, label, href, hero) =>
    html`<a class="kpi-card${hero ? ' kpi-card-hero' : ''}" href="${href}" style="text-decoration:none;color:inherit"
      ><div class="kpi-icon">${raw(ICONS[iconName])}</div>
      <div class="kpi-value">${eur(value)}</div>
      <div class="kpi-label">${label}</div></a
    >`;
  const todoIcon = { cash: 'coin', bank: 'card', late: 'bell', draft: 'pencil', receipt: 'paperclip', vat: 'percent', urssaf: 'scale' };
  return html` <div class="dashboard-hero">
      <div class="dashboard-hero-text">
        <h1>Accueil</h1>
        <p>Voici ce qui demande votre attention aujourd'hui.</p>
      </div>
      <div class="dashboard-hero-actions">
        <a class="btn btn-gold btn-sm" href="#/ventes/nouvelle">Créer une facture</a
        ><a class="btn btn-ghost-light btn-sm" href="#/depenses">Ajouter une dépense</a>
      </div>
    </div>
    ${franchiseBanner()}
    <div class="kpi-grid">
      ${kpi('coin', d.cash, 'Trésorerie', '#/banque', true)} ${kpi('receipt', d.receivable, 'Ce que mes clients me doivent', '#/ventes')}
      ${kpi('trendingUp', d.revenue, "Chiffre d'affaires de l'exercice", '#/ventes')}
      ${kpi('chart', d.result, 'Résultat estimé', ui.mode === 'avance' ? '#/compta' : '#/depenses')}
    </div>
    ${isMicro() ? '' : allocationCard()}
    <div class="card action-center">
      <h2>À faire</h2>
      ${
        todo.length
          ? html`<div class="action-center-list">
              ${todo.map(
                (i) =>
                  html` <button
                    type="button"
                    class="action-center-item${i.kind === 'cash' ? ' action-center-urgent' : ''}"
                    ${i.action ? html`data-action="${i.action}"` : html`data-href="#/${i.view}${i.id ? `/${i.id}` : i.period ? `/${i.period}` : ''}"`}
                  >
                    <span class="action-center-icon">${raw(ICONS[todoIcon[i.kind] || 'info'])}</span>
                    <span class="action-center-label">${i.text}${i.amount != null ? ` — ${eur(i.amount)}` : ''}</span>
                    <span class="action-center-arrow">→</span>
                  </button>`,
              )}
            </div>`
          : html`<p class="text-muted">Tout est à jour. Rien à faire pour le moment.</p>`
      }
    </div>
    ${activityCard()} ${forecastCard()}`;
}
