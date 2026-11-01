/**
 * Passage entre les objets du module Articles (core/commerce) et les lignes des tables de la
 * migration 0035. Même charge utile pour l'application (supabase-js) et les tests (PGlite).
 *
 * Un article est enregistré en deux lignes : la fiche de vente (commerce_articles, lisible par tous
 * les membres, y compris pour le scan en magasin) et ses coûts (commerce_article_costs, lisible par
 * le dirigeant et l'expert seulement). La fiche de vente ne garde des fournisseurs que leur identifiant.
 */

/** Champs de coût : jamais dans la fiche de vente. */
export const COST_FIELDS = ['purchasePrice', 'pmpa', 'suppliers', 'kezia'];

// ------------------------------------------------------------------ objets → lignes

export function supplierRow(s, structureId) {
  const { id, name, brands, profiles, ...data } = s;
  return { id, structure_id: structureId, name, brands: brands || [], data };
}

export const profileRow = (supplierId, p, structureId) => ({
  structure_id: structureId,
  supplier_id: supplierId,
  version: p.version,
  signature: p.signature,
  profile: p.profile,
});

export const pricelistRow = (p, structureId) => ({
  id: p.id,
  structure_id: structureId,
  supplier_id: p.supplierId,
  effective_date: p.effectiveDate,
  file_name: p.fileName,
  file_hash: p.fileHash,
  profile_version: p.profileVersion,
  line_count: p.lines.length,
  lines: p.lines,
});

/** Fiche de vente et coûts d'un article. */
export function articleRows(a, structureId) {
  const { id, label, ean, ...rest } = a;
  const data = Object.fromEntries(Object.entries(rest).filter(([k]) => !COST_FIELDS.includes(k)));
  data.supplierIds = [...(a.suppliers || [])].sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0)).map((s) => s.supplierId);
  const cost = Object.fromEntries(COST_FIELDS.filter((k) => a[k] !== undefined).map((k) => [k, a[k]]));
  return { article: { id, structure_id: structureId, label, ean: ean || null, data }, cost: { article_id: id, structure_id: structureId, data: cost } };
}

export const historyRow = (h, structureId) => ({
  id: h.id,
  structure_id: structureId,
  article_id: h.articleId,
  price_date: h.date,
  kind: h.kind,
  supplier_id: h.supplierId,
  before_cents: h.before,
  after_cents: h.after,
  source: h.source,
});

export const stockMoveRow = (m, structureId) => ({
  id: m.id,
  structure_id: structureId,
  article_id: m.articleId,
  move_date: m.date,
  kind: m.kind,
  qty: m.qty,
  note: m.note || null,
});

export const proposalRow = (p, structureId) => ({
  id: p.id,
  structure_id: structureId,
  article_id: p.articleId,
  current_cents: p.current,
  proposed_cents: p.proposed,
  reason: p.reason || null,
});

// ------------------------------------------------------------------ lignes → état

/**
 * État du module à partir des lignes lues en base. Sans droits sur les coûts, `costs` est vide :
 * les articles n'ont alors ni prix d'achat ni références fournisseurs (vue simple).
 */
export function commerceFromRows({ suppliers = [], profiles = [], pricelists = [], articles = [], costs = [], history = [], moves = [], proposals = [] }) {
  const bySupplier = new Map();
  for (const p of [...profiles].sort((a, b) => a.version - b.version))
    bySupplier.set(p.supplier_id, [
      ...(bySupplier.get(p.supplier_id) || []),
      { version: p.version, signature: p.signature, profile: p.profile, createdAt: p.created_at },
    ]);
  const costOf = new Map(costs.map((c) => [c.article_id, c.data]));
  return {
    suppliers: suppliers
      .map((r) => ({ ...r.data, id: r.id, name: r.name, brands: r.brands || [], profiles: bySupplier.get(r.id) || [] }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    pricelists: pricelists.map((r) => ({
      id: r.id,
      supplierId: r.supplier_id,
      effectiveDate: r.effective_date,
      importedAt: r.imported_at,
      fileName: r.file_name,
      fileHash: r.file_hash,
      profileVersion: r.profile_version,
      lineCount: r.line_count,
      lines: r.lines,
    })),
    articles: articles.map((r) => {
      const c = costOf.get(r.id);
      const a = { ...r.data, ...(c || {}), id: r.id, label: r.label, ean: r.ean };
      // Sans coûts : les fournisseurs restent connus (nom sur la fiche), sans référence ni prix.
      if (!c) a.suppliers = (r.data.supplierIds || []).map((supplierId, rank) => ({ supplierId, rank }));
      return a;
    }),
    history: history.map((r) => ({
      id: r.id,
      articleId: r.article_id,
      date: r.price_date,
      kind: r.kind,
      supplierId: r.supplier_id,
      before: r.before_cents,
      after: r.after_cents,
      source: r.source,
    })),
    moves: moves.map((r) => ({
      id: r.id,
      articleId: r.article_id,
      date: r.move_date,
      kind: r.kind,
      qty: Number(r.qty),
      note: r.note,
      createdAt: r.created_at,
    })),
    proposals: proposals.map((r) => ({
      id: r.id,
      articleId: r.article_id,
      current: r.current_cents,
      proposed: r.proposed_cents,
      reason: r.reason,
      status: r.status,
      proposedAt: r.proposed_at,
      decidedAt: r.decided_at,
    })),
  };
}
