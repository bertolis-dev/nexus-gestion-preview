/**
 * Accès de l'utilisateur dans la plateforme : organisations, droits par module, modules souscrits,
 * console de l'équipe BERTOLIS (migration 0036). En démonstration, tout est ouvert sauf les modules
 * non activés dans les réglages de la démonstration.
 */

import { DEFAULT_MODULES, ROUTE_MODULE, allPermissions } from '../core/platform.js?v=e821f3b';
import { supabaseClient } from './cloud.js?v=e821f3b';
import { cloudState, ui, ws } from './state.js?v=e821f3b';

export const access = { structures: [], permissions: new Set(), modules: new Set(), operator: false, loaded: false };

const rpc = async (fn, args) => {
  const supabase = await supabaseClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
};

/** Modules de la démonstration : ceux de Gestion, plus Articles si activé dans Paramètres. */
const demoModules = () => [...DEFAULT_MODULES, ...(ws?.company?.modules?.commerce ? ['articles'] : [])];

/**
 * Charge les droits de l'organisation ouverte. Base sans la migration 0036 : repli sur l'ancien
 * fonctionnement (tous les modules de Gestion, droits du rôle de base) pour ne bloquer personne.
 */
export async function loadAccess(structureId) {
  try {
    const [structures, permissions, operator] = await Promise.all([
      rpc('my_structures'),
      rpc('my_permissions', { p_structure: structureId }),
      rpc('am_platform_operator'),
    ]);
    access.structures = structures || [];
    access.permissions = new Set(permissions || []);
    access.modules = new Set([...access.permissions].map((p) => p.split(':')[0]));
    access.operator = Boolean(operator);
  } catch {
    access.structures = (ui.structures || []).map((s) => ({ structure_id: s.id, name: s.name }));
    access.permissions = allPermissions(DEFAULT_MODULES);
    access.modules = new Set(DEFAULT_MODULES);
    access.operator = false;
  }
  access.loaded = true;
}

/** L'utilisateur a-t-il ce droit (module souscrit compris) ? */
export function can(module, action = 'view') {
  if (ui.demo) return demoModules().includes(module) || ['organisation', 'utilisateurs'].includes(module);
  if (!access.loaded) return DEFAULT_MODULES.includes(module);
  return access.permissions.has(`${module}:${action}`);
}

/** Écran accessible ? (accueil et paramètres : toujours). */
export const canRoute = (route) => !ROUTE_MODULE[route] || can(ROUTE_MODULE[route]);

export const isAdmin = () => ui.demo || cloudState.role === 'dirigeant';
export const canManageUsers = () => ui.demo || isAdmin() || can('utilisateurs', 'configure');
export const isOperator = () => ui.demo || access.operator;
export const enabledModules = () => (ui.demo ? new Set(demoModules()) : access.modules);

// ------------------------------------------------------------------ utilisateurs et rôles

const sid = () => cloudState.meta.structureId;
export const listMembers = () => rpc('list_members', { p_structure: sid() });
export const listRoles = () => rpc('list_roles', { p_structure: sid() });
export const inviteMember = (email, roleId, accessUntil) =>
  rpc('invite_member_role', { p_structure: sid(), p_email: email, p_role: roleId, p_access_until: accessUntil || null });
export const updateMember = (userId, roleId, status, accessUntil) =>
  rpc('update_member', { p_structure: sid(), p_user: userId, p_role: roleId, p_status: status, p_access_until: accessUntil || null });
export const removeMember = (userId) => rpc('remove_member', { p_structure: sid(), p_user: userId });
export const saveRole = (roleId, name, baseRole, permissions) =>
  rpc('save_role', { p_structure: sid(), p_role: roleId || null, p_name: name, p_base_role: baseRole, p_permissions: permissions });
export const deleteRole = (roleId) => rpc('delete_role', { p_structure: sid(), p_role: roleId });

// ------------------------------------------------------------------ console de la plateforme

export const platformStructures = () => rpc('platform_structures');
export const platformSetModule = (structureId, module, enabled) =>
  rpc('platform_set_module', { p_structure: structureId, p_module: module, p_enabled: enabled });
