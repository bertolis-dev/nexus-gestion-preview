/**
 * Mode « dépôt » : l'entreprise transmet ses factures par la plateforme agréée gratuite de son choix
 * (celle de sa banque ou de son logiciel), en y déposant les PDF Factur-X exportés par Nexus ; les
 * factures déposées sont marquées « Déposée » (cycle de vie, voir lifecycle.js).
 */

export const PLATFORMS = {
  qonto: 'Qonto',
  shine: 'Shine',
  pennylane: 'Pennylane',
  tiime: 'Tiime',
  autre: 'Autre plateforme agréée',
};

/** Factures émises (factures, avoirs, acomptes) pas encore déposées, dans l'ordre de numérotation. */
export function depositCandidates(book) {
  return book.invoices
    .filter((i) => i.status === 'issued' && i.type !== 'quote' && !(book.lifecycle[i.id] || []).some((e) => e.status === 'deposee'))
    .sort((a, b) => (a.number || '').localeCompare(b.number || ''));
}

/** Méthodes installées sur Workspace.prototype (voir core/workspace.js). */
export const depositMethods = {
  /** Marque des factures comme déposées sur la plateforme agréée. */
  markDeposited(ids, { date, platform }) {
    const label = PLATFORMS[platform] || PLATFORMS.autre;
    for (const id of ids) {
      const inv = this.book.get(id);
      if (inv.status !== 'issued' || inv.type === 'quote') throw new Error('Seule une facture émise se dépose.');
      const events = (this.book.lifecycle[id] ||= []);
      if (events.some((e) => e.status === 'deposee')) continue;
      // Toujours ajouté en fin de liste, même après un statut final (voir currentStatus) : une insertion
      // au milieu décalerait les positions déjà enregistrées en base et le dépôt s'y perdrait.
      events.push({ status: 'deposee', date, source: 'depot', detail: `Déposée sur ${label}` });
    }
  },
};
