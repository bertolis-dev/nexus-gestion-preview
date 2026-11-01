/**
 * Plateforme multi-organisation (migration 0036, modèle Hadaly) : espaces, modules, droits.
 * Un droit est un couple module × action ; à l'écran, quatre niveaux par module. Le catalogue est
 * le même qu'en base (platform_spaces, platform_modules) : la base fait foi, ce fichier sert à
 * l'affichage et à la démonstration.
 */

export const ACTIONS = ['view', 'edit', 'validate', 'export', 'configure'];

export const SPACES = [
  { code: 'ventes', label: 'Ventes' },
  { code: 'exploitation', label: 'Exploitation' },
  { code: 'finance', label: 'Finance' },
  { code: 'rh', label: 'RH' },
  { code: 'parametres', label: 'Paramètres' },
];

export const MODULES = [
  { code: 'factures', space: 'ventes', label: 'Devis et factures' },
  { code: 'clients', space: 'ventes', label: 'Clients' },
  { code: 'articles', space: 'exploitation', label: 'Articles, tarifs et stock' },
  { code: 'depenses', space: 'finance', label: 'Dépenses' },
  { code: 'banque', space: 'finance', label: 'Banque' },
  { code: 'tva', space: 'finance', label: 'TVA et déclarations' },
  { code: 'comptabilite', space: 'finance', label: 'Comptabilité' },
  { code: 'cloture', space: 'finance', label: 'Clôture' },
  { code: 'pilotage', space: 'finance', label: 'Pilotage' },
  { code: 'rh_salaries', space: 'rh', label: 'Salariés', soon: true },
  { code: 'rh_conges', space: 'rh', label: 'Congés et absences', soon: true },
  { code: 'rh_planning', space: 'rh', label: 'Planning', soon: true },
  { code: 'rh_frais', space: 'rh', label: 'Notes de frais', soon: true },
  { code: 'rh_paie', space: 'rh', label: 'Export paie', soon: true },
  { code: 'organisation', space: 'parametres', label: 'Organisation', alwaysOn: true },
  { code: 'utilisateurs', space: 'parametres', label: 'Utilisateurs et droits', alwaysOn: true },
];

export const moduleByCode = (code) => MODULES.find((m) => m.code === code) || null;

/** Niveaux affichés (comme Hadaly) et actions qu'ils accordent. */
export const LEVELS = [
  { key: 'aucun', label: 'Aucun', actions: [] },
  { key: 'lecture', label: 'Lecture', actions: ['view', 'export'] },
  { key: 'ecriture', label: 'Écriture', actions: ['view', 'export', 'edit', 'validate'] },
  { key: 'admin', label: 'Administration', actions: ACTIONS },
];

export const actionsOf = (level) => LEVELS.find((l) => l.key === level)?.actions || [];

/**
 * Niveau d'un module d'après une liste « module:action », lu sur l'action qui le caractérise :
 * configurer → Administration, modifier → Écriture, voir → Lecture.
 */
export function levelOf(permissions, module) {
  const has = (a) => [...permissions].includes(`${module}:${a}`);
  if (has('configure')) return 'admin';
  if (has('edit')) return 'ecriture';
  if (has('view')) return 'lecture';
  return 'aucun';
}

/** Droits d'un rôle à partir des niveaux choisis par module : [{ module, action }]. */
export function permissionsFromLevels(levels) {
  return Object.entries(levels).flatMap(([module, level]) => actionsOf(level).map((action) => ({ module, action })));
}

/** Module dont dépend chaque écran de l'application (accueil, paramètres : communs). */
export const ROUTE_MODULE = {
  ventes: 'factures',
  clients: 'clients',
  articles: 'articles',
  depenses: 'depenses',
  banque: 'banque',
  tva: 'tva',
  urssaf: 'tva',
  compta: 'comptabilite',
  cloture: 'cloture',
  pilotage: 'pilotage',
};

/** Droits complets sur des modules donnés (administrateur, démonstration). */
export const allPermissions = (modules) => new Set(modules.flatMap((m) => ACTIONS.map((a) => `${m}:${a}`)));

/** Modules de Gestion ouverts à toute organisation (migration 0036). */
export const DEFAULT_MODULES = MODULES.filter((m) => ['ventes', 'finance'].includes(m.space) && !m.soon).map((m) => m.code);
