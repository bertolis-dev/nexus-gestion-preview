/**
 * Paramètres › Utilisateurs, Rôles et droits, Modules (plateforme multi-organisation, migration 0036).
 * Chaque organisation a ses rôles ; un rôle donne un niveau par module (Aucun, Lecture, Écriture,
 * Administration). Le rôle Administrateur a tout, ne se modifie pas, et l'organisation en garde toujours un.
 */

import { LEVELS, MODULES, SPACES, levelOf } from '../../core/platform.js?v=a619ec1';
import { field, html, opt, raw } from '../html.js?v=a619ec1';
import { canManageUsers, enabledModules, listMembers, listRoles } from '../platform.js?v=a619ec1';
import { cloudState, frDate, ui } from '../state.js?v=a619ec1';
import { badge } from '../ui/common.js?v=a619ec1';

const BASE_LABEL = { dirigeant: 'Dirigeant', collaborateur: 'Collaborateur', expert: 'Expert-comptable' };
const STATUS = { active: ['Actif', 'success'], invited: ['Invité', 'warning'], suspended: ['Suspendu', 'muted'] };
const editable = () => MODULES.filter((m) => !m.soon && m.code !== 'organisation');

/** Rôles de la démonstration : ceux proposés à toute nouvelle organisation. */
function demoRoles() {
  const p = (codes, actions) => codes.flatMap((c) => actions.map((a) => `${c}:${a}`));
  const finance = MODULES.filter((m) => m.space === 'finance').map((m) => m.code);
  return [
    { id: 'admin', name: 'Administrateur', baseRole: 'dirigeant', isAdmin: true, members: 1, permissions: [] },
    {
      id: 'collab',
      name: 'Collaborateur',
      baseRole: 'collaborateur',
      members: 0,
      permissions: p(['factures', 'clients', 'depenses', 'banque', 'articles'], ['view', 'edit']),
    },
    {
      id: 'expert',
      name: 'Expert-comptable',
      baseRole: 'expert',
      members: 0,
      permissions: [...p(finance, ['view', 'edit', 'validate', 'export']), ...p(['factures', 'clients', 'articles'], ['view', 'export'])],
    },
    { id: 'vendeur', name: 'Vendeur en magasin', baseRole: 'collaborateur', members: 0, permissions: p(['articles'], ['view', 'edit']) },
  ];
}

/** Charge membres et rôles une fois par organisation ouverte. */
export function platformData() {
  const st = (ui.platform ||= {});
  if (ui.demo) {
    st.roles ||= demoRoles();
    st.members ||= [{ user_id: 'moi', email: 'vous (démonstration)', role_id: 'admin', role_name: 'Administrateur', is_admin: true, status: 'active' }];
    return st;
  }
  if (!st.loading && (!st.members || st.for !== cloudState.meta?.structureId)) {
    st.loading = Promise.all([listMembers(), listRoles()])
      .then(([members, roles]) => Object.assign(st, { members, roles, for: cloudState.meta.structureId, error: null }))
      .catch((err) => Object.assign(st, { members: [], roles: [], error: err.message }))
      .finally(() => {
        st.loading = null;
        import('../render.js?v=a619ec1').then((m) => m.render());
      });
  }
  return st;
}

export function usersTab() {
  const st = platformData();
  if (!st.members) return html`<div class="card"><p class="text-muted" role="status">Chargement des utilisateurs…</p></div>`;
  const manage = canManageUsers();
  const me = cloudState.session?.user?.id || 'moi';
  const roleOptions = (selected) => (st.roles || []).map((r) => opt(r.id, r.name, r.id === selected));
  return html`${st.error ? html`<div class="alert alert-warning">${st.error}</div>` : ''}
    <div class="card table-card">
      <h2 style="padding:16px 16px 0">Utilisateurs de l’organisation (${st.members.length})</h2>
      <p class="text-muted" style="padding:0 16px">
        Chaque personne a un rôle, qui fixe ce qu’elle voit et fait dans chaque module. Un accès peut être suspendu ou s’arrêter à une date (expert-comptable en
        mission, intérimaire).
      </p>
      <div class="table-scroll">
        <table class="table cards-mobile">
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Fin d’accès</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${st.members.map((m) => {
              const self = m.user_id === me;
              const [label, kind] = STATUS[m.status] || [m.status, 'muted'];
              if (!manage || self || ui.demo)
                return html`<tr>
                  <td data-label="Utilisateur">${m.email || '—'}${self ? html` ${badge('vous', 'muted')}` : ''}</td>
                  <td data-label="Rôle">${m.role_name || BASE_LABEL[m.role]}</td>
                  <td data-label="Statut">${badge(label, kind)}</td>
                  <td data-label="Fin d’accès">${m.access_until ? frDate(m.access_until) : '—'}</td>
                  <td></td>
                </tr>`;
              return html`<tr>
                <td data-label="Utilisateur">${m.email || '—'}</td>
                <td data-label="Rôle">
                  <select class="input" form="m-${m.user_id}" name="role" aria-label="Rôle">
                    ${roleOptions(m.role_id)}
                  </select>
                </td>
                <td data-label="Statut">
                  <select class="input" form="m-${m.user_id}" name="status" aria-label="Statut">
                    ${opt('active', 'Actif', m.status !== 'suspended')}${opt('suspended', 'Suspendu', m.status === 'suspended')}
                  </select>
                </td>
                <td data-label="Fin d’accès">
                  <input class="input" type="date" form="m-${m.user_id}" name="accessUntil" value="${m.access_until || ''}" aria-label="Fin d’accès" />
                </td>
                <td>
                  <form id="m-${m.user_id}" data-form="platform-member" data-id="${m.user_id}" style="display:flex;gap:6px">
                    <button class="btn btn-primary btn-sm" type="submit">Enregistrer</button>
                    <button class="btn btn-secondary btn-sm" type="button" data-action="platform-member-remove" data-id="${m.user_id}">Retirer</button>
                  </form>
                </td>
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
    </div>
    ${
      manage && !ui.demo
        ? html`<form class="card" data-form="platform-invite" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
            <h2 style="width:100%;margin:0">Inviter une personne</h2>
            ${field('Adresse e-mail', html`<input class="input" type="email" name="email" required placeholder="prenom@entreprise.fr" />`)}
            ${field(
              'Rôle',
              html`<select class="input" name="role">
                ${roleOptions((st.roles || []).find((r) => !r.isAdmin)?.id)}
              </select>`,
            )}
            ${field('Fin d’accès (facultatif)', html`<input class="input" type="date" name="accessUntil" />`)}
            <button class="btn btn-primary" type="submit">Donner accès</button>
            <p class="form-hint" style="width:100%;margin:0">La personne doit d’abord créer son compte Nexus avec cette adresse.</p>
          </form>`
        : ''
    }
    ${ui.demo ? html`<p class="text-muted">En démonstration, vous êtes seul, administrateur. Les rôles se règlent dans « Rôles et droits ».</p>` : ''}`;
}

function roleCard(r, manage) {
  const perms = new Set(r.permissions || []);
  const mods = editable();
  return html`<form class="card" data-form="platform-role" data-id="${r.id || ''}" style="display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      ${field('Nom du rôle', html`<input class="input" name="name" value="${r.name || ''}" required maxlength="60" ${r.isAdmin || !manage ? raw('disabled') : ''} />`)}
      ${
        r.isAdmin
          ? html`<p style="margin:0">${badge('Tous les droits', 'success')} sur tous les modules souscrits. Ce rôle ne se modifie pas.</p>`
          : field(
              'Rôle de base',
              html`<select class="input" name="baseRole" ${manage ? '' : raw('disabled')}>
                ${opt('collaborateur', 'Collaborateur', r.baseRole !== 'expert')}${opt('expert', 'Expert-comptable (valide les écritures et la clôture)', r.baseRole === 'expert')}
              </select>`,
              { hint: 'Ce que la comptabilité autorise : saisir (collaborateur) ou valider (expert-comptable).' },
            )
      }
      ${r.members !== undefined ? html`<span class="text-muted">${r.members} personne${r.members > 1 ? 's' : ''}</span>` : ''}
    </div>
    ${
      r.isAdmin
        ? ''
        : html`<div class="role-grid">
            ${SPACES.filter((s) => mods.some((m) => m.space === s.code)).map(
              (s) =>
                html`<fieldset class="role-space">
                  <legend>${s.label}</legend>
                  ${mods
                    .filter((m) => m.space === s.code)
                    .map((m) =>
                      field(
                        m.label,
                        html`<select class="input" name="lvl-${m.code}" ${manage ? '' : raw('disabled')}>
                          ${LEVELS.map((l) => opt(l.key, l.label, levelOf(perms, m.code) === l.key))}
                        </select>`,
                      ),
                    )}
                </fieldset>`,
            )}
          </div>`
    }
    ${
      manage && !r.isAdmin
        ? html`<div style="display:flex;gap:8px">
            <button class="btn btn-primary" type="submit">${r.id ? 'Enregistrer le rôle' : 'Créer le rôle'}</button>
            ${r.id ? html`<button class="btn btn-secondary" type="button" data-action="platform-role-delete" data-id="${r.id}">Supprimer</button>` : ''}
          </div>`
        : ''
    }
  </form>`;
}

export function rolesTab() {
  const st = platformData();
  if (!st.roles) return html`<div class="card"><p class="text-muted" role="status">Chargement des rôles…</p></div>`;
  const manage = canManageUsers();
  return html`<p class="text-muted">
      Un niveau par module : <strong>Lecture</strong> (voir, exporter), <strong>Écriture</strong> (en plus saisir et valider),
      <strong>Administration</strong> (en plus régler le module). Un module non souscrit n’apparaît à
      personne.${ui.demo ? ' En démonstration, les changements ne sont pas enregistrés.' : ''}
    </p>
    ${st.roles.map((r) => roleCard(r, manage))}
    ${
      manage
        ? html`<h2>Nouveau rôle</h2>
            ${roleCard({ name: '', baseRole: 'collaborateur', permissions: [] }, manage)}`
        : ''
    }`;
}

export function modulesTab() {
  const on = enabledModules();
  return html`<div class="card" style="display:flex;flex-direction:column;gap:14px">
    <h2>Modules de l’organisation</h2>
    <p class="text-muted" style="margin:0">
      Les modules souscrits apparaissent dans le menu, pour les personnes qui en ont le droit. Pour en ajouter un, contactez l’équipe BERTOLIS.
    </p>
    ${SPACES.filter((s) => s.code !== 'parametres').map(
      (s) =>
        html`<div>
          <h3 style="margin:0 0 6px">${s.label}</h3>
          <ul class="module-list">
            ${MODULES.filter((m) => m.space === s.code).map(
              (m) =>
                html`<li>
                  <span>${m.label}</span>
                  ${m.soon ? badge('Bientôt (aujourd’hui dans Nexus RH)', 'muted') : on.has(m.code) ? badge('Souscrit', 'success') : badge('Non souscrit', 'muted')}
                  ${
                    ui.demo && m.code === 'articles'
                      ? html`<label style="margin-left:8px"
                            ><input type="checkbox" data-action="commerce-module" ${on.has('articles') ? raw('checked') : ''} /> activer en démonstration</label
                          >
                          <button type="button" class="btn btn-secondary btn-sm" data-action="commerce-file-pick" data-id="snapshot">
                            Charger un jeu de données
                          </button>
                          <input type="file" accept=".json,application/json" data-action="commerce-snapshot-file" hidden aria-label="Jeu de données Nexus" />`
                      : ''
                  }
                </li>`,
            )}
          </ul>
        </div>`,
    )}
  </div>`;
}
