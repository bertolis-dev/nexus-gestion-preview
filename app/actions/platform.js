/**
 * Actions de la plateforme : changer d'organisation, gérer les utilisateurs et les rôles, activer des
 * modules depuis la console BERTOLIS. Formulaires et listes ont leurs propres écouteurs.
 */

import { permissionsFromLevels } from '../../core/platform.js?v=17f2ba9';
import * as cloud from '../cloud.js?v=17f2ba9';
import { deleteRole, inviteMember, isOperator, platformSetModule, removeMember, saveRole, updateMember } from '../platform.js?v=17f2ba9';
import { render } from '../render.js?v=17f2ba9';
import { cloudState, ui, ws } from '../state.js?v=17f2ba9';
import { save, toast } from '../store.js?v=17f2ba9';
import { openStructureAndShow } from '../sync-ui.js?v=17f2ba9';
import { platformData } from '../views/users.js?v=17f2ba9';

const fail = (err) => toast(cloud.friendly ? cloud.friendly(err) : err.message, true);

/** Relit membres et rôles après un changement (la base fait foi). */
function reloadUsers() {
  ui.platform = null;
  platformData();
  render();
}

export const actionsTable = {
  'platform-member-remove': async ({ id }) => {
    const m = ui.platform?.members?.find((x) => x.user_id === id);
    if (!m || !confirm(`Retirer l’accès de ${m.email || 'cette personne'} à l’organisation ?`)) return;
    try {
      await removeMember(id);
      toast('Accès retiré.');
    } catch (err) {
      fail(err);
    }
    reloadUsers();
  },
  'platform-role-delete': async ({ id }) => {
    if (ui.demo) {
      ui.platform.roles = ui.platform.roles.filter((r) => r.id !== id);
      return render();
    }
    if (!confirm('Supprimer ce rôle ?')) return;
    try {
      await deleteRole(id);
      toast('Rôle supprimé.');
    } catch (err) {
      fail(err);
    }
    reloadUsers();
  },
  'platform-console-reload': () => {
    ui.console = null;
    render();
  },
};

document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset?.action === 'org-switch' && el.value && el.value !== cloudState.meta?.structureId) {
    if (cloudState.status.pending && !confirm('Des modifications ne sont pas encore enregistrées. Changer d’organisation quand même ?')) {
      el.value = cloudState.meta.structureId;
      return;
    }
    ui.platform = null;
    ui.members = null;
    ui.emails = null;
    location.hash = '#/accueil';
    try {
      await openStructureAndShow(el.value);
    } catch (err) {
      fail(err);
    }
    return;
  }
  if (el.dataset?.action === 'platform-module' && isOperator()) {
    const { id, module } = el.dataset;
    if (ui.demo) {
      if (module !== 'articles') {
        el.checked = !el.checked;
        return toast('En démonstration, seul le module Articles s’active ou se retire.', true);
      }
      ws.company.modules = { ...(ws.company.modules || {}), commerce: el.checked };
      save();
      ui.console = null;
      return render();
    }
    try {
      await platformSetModule(id, module, el.checked);
      toast(el.checked ? 'Module activé pour cette organisation.' : 'Module retiré (ses données sont gardées).');
    } catch (err) {
      el.checked = !el.checked;
      fail(err);
    }
    ui.console = null;
    render();
  }
});

const SUBMITS = {
  'platform-member': async (f, form) => {
    try {
      await updateMember(form.dataset.id, f.role, f.status, f.accessUntil);
      toast('Accès mis à jour.');
    } catch (err) {
      fail(err);
    }
    reloadUsers();
  },
  'platform-invite': async (f) => {
    try {
      toast(await inviteMember(f.email.trim(), f.role, f.accessUntil));
    } catch (err) {
      fail(err);
    }
    reloadUsers();
  },
  'platform-role': async (f, form) => {
    const levels = Object.fromEntries(
      Object.entries(f)
        .filter(([k]) => k.startsWith('lvl-'))
        .map(([k, v]) => [k.slice(4), v]),
    );
    const permissions = permissionsFromLevels(levels);
    const name = (f.name || '').trim();
    if (!name) return toast('Donnez un nom au rôle.', true);
    if (ui.demo) {
      const st = ui.platform;
      const role = {
        id: form.dataset.id || `r-${Date.now()}`,
        name,
        baseRole: f.baseRole,
        members: 0,
        permissions: permissions.map((p) => `${p.module}:${p.action}`),
      };
      st.roles = form.dataset.id ? st.roles.map((r) => (r.id === role.id ? { ...r, ...role } : r)) : [...st.roles, role];
      toast('Rôle enregistré (démonstration : non conservé).');
      return render();
    }
    try {
      await saveRole(form.dataset.id || null, name, f.baseRole, permissions);
      toast('Rôle enregistré.');
    } catch (err) {
      fail(err);
    }
    reloadUsers();
  },
};

document.addEventListener('submit', (e) => {
  const form = e.target;
  const handler = SUBMITS[form.dataset?.form];
  if (!handler) return;
  e.preventDefault();
  handler(Object.fromEntries(new FormData(form)), form);
});
