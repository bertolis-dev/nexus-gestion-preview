/**
 * Copie complète des données du module Articles dans un fichier JSON : passer un catalogue d'un
 * appareil à l'autre en démonstration, préparer la reprise d'un client, garder une sauvegarde.
 * Le fichier peut contenir des prix d'achat négociés : il reste chez l'utilisateur, jamais publié.
 */

export const SNAPSHOT_FORMAT = 'nexus-articles';
export const SNAPSHOT_VERSION = 1;
const PARTS = ['suppliers', 'pricelists', 'articles', 'history', 'moves', 'proposals'];

export class SnapshotError extends Error {}

/** Copie à enregistrer : organisation (nom), date, et chaque liste du module. */
export function buildSnapshot(commerce, { organisation = null, now = new Date() } = {}) {
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    createdAt: now.toISOString(),
    organisation,
    ...Object.fromEntries(PARTS.map((k) => [k, commerce[k] || []])),
  };
}

/** Lecture contrôlée d'une copie (texte JSON ou objet) ; rend { organisation, commerce, counts }. */
export function parseSnapshot(input) {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      throw new SnapshotError('Fichier illisible : ce n’est pas une copie de données Nexus.');
    }
  }
  if (data?.format !== SNAPSHOT_FORMAT) throw new SnapshotError('Ce fichier n’est pas une copie du module Articles de Nexus.');
  if (data.version > SNAPSHOT_VERSION) throw new SnapshotError('Copie faite par une version plus récente de Nexus : mettez l’application à jour.');
  for (const k of PARTS) if (!Array.isArray(data[k] ?? [])) throw new SnapshotError(`Copie abîmée : « ${k} » n’est pas une liste.`);
  const commerce = Object.fromEntries(PARTS.map((k) => [k, data[k] || []]));
  for (const a of commerce.articles) {
    if (!a?.id || typeof a.label !== 'string') throw new SnapshotError('Copie abîmée : article sans identifiant ou sans désignation.');
    for (const k of ['salePrice', 'purchasePrice', 'pmpa'])
      if (a[k] !== null && a[k] !== undefined && (!Number.isSafeInteger(a[k]) || a[k] < 0))
        throw new SnapshotError(`Copie abîmée : prix illisible pour « ${a.label} ».`);
  }
  const ids = new Set(commerce.suppliers.map((s) => s.id));
  if (commerce.pricelists.some((p) => !ids.has(p.supplierId))) throw new SnapshotError('Copie abîmée : grille rattachée à un fournisseur absent.');
  return {
    organisation: data.organisation || null,
    createdAt: data.createdAt || null,
    commerce,
    counts: Object.fromEntries(PARTS.map((k) => [k, commerce[k].length])),
  };
}
