/**
 * Console de la plateforme, réservée à l'équipe BERTOLIS (platform_operators, migration 0036) :
 * organisations clientes, utilisateurs actifs, activité, modules souscrits. Aucune donnée métier du
 * client : pour l'aider, il faut un accès support qu'il accorde lui-même (support_grants).
 */

import { MODULES } from '../../core/platform.js?v=269c883';
import { html, raw } from '../html.js?v=269c883';
import { enabledModules, isOperator, platformStructures } from '../platform.js?v=269c883';
import { frDate, ui, ws } from '../state.js?v=269c883';
import { badge, viewHeader } from '../ui/common.js?v=269c883';

const OPTIONAL = MODULES.filter((m) => !m.soon && !m.alwaysOn);
const days = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

function load(st) {
  if (ui.demo) {
    st.rows = [
      {
        id: 'demo',
        name: ws.company.name,
        siren: ws.company.siren,
        created_at: null,
        members_active: 1,
        admins_active: 1,
        modules: [...enabledModules()],
        last_activity: new Date().toISOString(),
        activity_30d: null,
      },
    ];
    return;
  }
  if (st.rows || st.loading) return;
  st.loading = platformStructures()
    .then((rows) => Object.assign(st, { rows, error: null }))
    .catch((err) => Object.assign(st, { rows: [], error: err.message }))
    .finally(() => {
      st.loading = null;
      import('../render.js?v=269c883').then((m) => m.render());
    });
}

export function viewPlatform() {
  if (!isOperator())
    return html`${viewHeader('Plateforme', '')}
      <div class="card"><p>Réservé à l’équipe BERTOLIS.</p></div>`;
  const st = (ui.console ||= {});
  load(st);
  const rows = st.rows || [];
  const quiet = rows.filter((r) => (days(r.last_activity) ?? 999) > 30).length;
  return html`${viewHeader(
      'Plateforme',
      'Les organisations clientes : utilisateurs, activité, modules souscrits. Les données des clients ne sont pas visibles ici.',
      html`<button type="button" class="btn btn-secondary" data-action="platform-console-reload">Actualiser</button>`,
    )}
    ${ui.demo ? html`<div class="alert alert-warning">Démonstration : une seule organisation, celle de la démonstration. En service, la liste vient de la base.</div>` : ''}
    ${st.error ? html`<div class="alert alert-warning">${st.error}</div>` : ''}
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-value">${rows.length}</div>
        <div class="kpi-label">Organisations</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${rows.reduce((s, r) => s + (r.members_active || 0), 0)}</div>
        <div class="kpi-label">Utilisateurs actifs</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${rows.filter((r) => r.modules.includes('articles')).length}</div>
        <div class="kpi-label">Avec le module Articles</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${quiet}</div>
        <div class="kpi-label">Sans activité depuis 30 jours</div>
      </div>
    </div>
    <div class="card table-card">
      ${st.loading && !st.rows ? html`<p class="text-muted" style="padding:16px" role="status">Chargement…</p>` : ''}
      <div class="table-scroll">
        <table class="table cards-mobile">
          <thead>
            <tr>
              <th>Organisation</th>
              <th class="num">Utilisateurs</th>
              <th>Dernière activité</th>
              <th class="num">Actions sur 30 jours</th>
              <th>Mise en service</th>
              ${OPTIONAL.map((m) => html`<th>${m.label}</th>`)}
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              const d = days(r.last_activity);
              return html`<tr>
                <td data-label="Organisation">
                  <strong>${r.name}</strong><br /><span class="text-muted"
                    >${r.siren || ''}${r.created_at ? ` · depuis le ${frDate(String(r.created_at).slice(0, 10))}` : ''}</span
                  >
                </td>
                <td class="num" data-label="Utilisateurs">${r.members_active}</td>
                <td data-label="Dernière activité">${d === null ? '—' : d === 0 ? 'aujourd’hui' : `il y a ${d} jour${d > 1 ? 's' : ''}`}</td>
                <td class="num" data-label="Actions sur 30 jours">${r.activity_30d ?? '—'}</td>
                <td data-label="Mise en service">${r.admins_active ? badge('Prête', 'success') : badge('Sans administrateur actif', 'danger')}</td>
                ${OPTIONAL.map(
                  (m) =>
                    html`<td data-label="${m.label}">
                      <input
                        type="checkbox"
                        aria-label="${m.label} pour ${r.name}"
                        data-action="platform-module"
                        data-id="${r.id}"
                        data-module="${m.code}"
                        ${r.modules.includes(m.code) ? raw('checked') : ''}
                      />
                    </td>`,
                )}
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
    </div>
    <p class="text-muted">
      Un module coché apparaît aussitôt aux utilisateurs de l’organisation qui en ont le droit. Chaque activation est inscrite au journal de l’organisation.
    </p>`;
}
