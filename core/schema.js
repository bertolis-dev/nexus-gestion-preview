/**
 * Version du format de l'état local (Workspace.toJSON, enregistré dans le navigateur pour la
 * démonstration). Chaque changement de format ajoute une migration ; un état écrit par une version
 * plus récente de l'application n'est jamais interprété au hasard.
 */

import { DEFAULT_BANK_ACCOUNT } from './bank.js?v=e821f3b';

export const SCHEMA_VERSION = 2;

/** Migration de la version n vers n + 1. */
const MIGRATIONS = {
  // 1 → 2 : plusieurs comptes bancaires (chaque mouvement est rattaché à un compte).
  1: (s) => ({
    ...s,
    bankAccounts: s.bankAccounts || [{ ...DEFAULT_BANK_ACCOUNT }],
    transactions: (s.transactions || []).map((t) => ({ ...t, accountId: t.accountId || 'default' })),
  }),
};

export function migrateState(state = {}) {
  let version = state.schemaVersion || 1;
  if (version > SCHEMA_VERSION) {
    throw new Error('Ces données ont été enregistrées par une version plus récente de Nexus Gestion : rechargez la page.');
  }
  let s = state;
  while (version < SCHEMA_VERSION) s = MIGRATIONS[version++](s);
  return { ...s, schemaVersion: SCHEMA_VERSION };
}
