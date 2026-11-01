/**
 * Données du module Articles (catalogue, fournisseurs, grilles, stock, propositions de prix), à part
 * de l'état comptable : chargées à l'ouverture de l'écran, enregistrées table par table.
 *  - démonstration : tout l'état dans le navigateur (IndexedDB, clé « commerce ») ;
 *  - connecté : tables de la migration 0035 ; sans droits sur les coûts (collaborateur), la base ne
 *    renvoie ni prix d'achat, ni grilles, ni historique : la vue simple n'a rien à cacher.
 */

import { articleRows, commerceFromRows, historyRow, pricelistRow, profileRow, proposalRow, stockMoveRow, supplierRow } from '../../core/commerce/rows.js?v=d415f7a';
import { supabaseClient } from '../cloud.js?v=d415f7a';
import { getDemoKey, setDemoKey } from '../demo-store.js?v=d415f7a';
import { can } from '../platform.js?v=d415f7a';
import { cloudState, ui } from '../state.js?v=d415f7a';

const empty = () => ({ suppliers: [], pricelists: [], articles: [], history: [], moves: [], proposals: [] });
export const commerce = { loaded: false, loading: null, error: null, ...empty() };

/** Module souscrit et visible pour cet utilisateur (démonstration : activé dans Paramètres › Modules). */
export const commerceEnabled = () => can('articles', 'view');

/** Dirigeant ou expert-comptable : prix d'achat, grilles, catalogue (vue experte). */
export const canManage = () => ui.demo || ['dirigeant', 'expert'].includes(cloudState.role) || can('articles', 'configure');

/** Seul le dirigeant valide un nouveau prix de vente. */
export const canDecide = () => ui.demo || cloudState.role === 'dirigeant';

const structureId = () => cloudState.meta?.structureId;

async function readAll(supabase, table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('structure_id', structureId())
      .range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

/** Charge (une fois) les données du module ; `force` relit tout. */
export function loadCommerce(force = false) {
  // Autre entreprise ouverte (ou démonstration) : les données chargées ne sont plus les bonnes.
  const key = ui.demo ? 'demo' : structureId();
  if (commerce.loaded && commerce.for !== key) resetCommerce();
  if (commerce.loaded && !force) return Promise.resolve(commerce);
  if (commerce.loading) return commerce.loading;
  commerce.loading = (async () => {
    try {
      if (ui.demo) Object.assign(commerce, empty(), (await getDemoKey('commerce')) || {});
      else {
        const supabase = await supabaseClient();
        const tables = {
          suppliers: 'commerce_suppliers',
          profiles: 'commerce_import_profiles',
          pricelists: 'commerce_pricelists',
          articles: 'commerce_articles',
          costs: 'commerce_article_costs',
          history: 'commerce_price_history',
          moves: 'commerce_stock_moves',
          proposals: 'commerce_price_proposals',
        };
        const rows = {};
        await Promise.all(Object.entries(tables).map(async ([k, t]) => (rows[k] = await readAll(supabase, t))));
        Object.assign(commerce, commerceFromRows(rows));
      }
      commerce.loaded = true;
      commerce.for = key;
      commerce.error = null;
    } catch (err) {
      commerce.error = err.message || String(err);
    } finally {
      commerce.loading = null;
    }
    return commerce;
  })();
  return commerce.loading;
}

/** Oublie les données (changement d'entreprise, déconnexion). */
export function resetCommerce() {
  Object.assign(commerce, { loaded: false, loading: null, error: null }, empty());
}

const snapshot = () => ({
  suppliers: commerce.suppliers,
  pricelists: commerce.pricelists,
  articles: commerce.articles,
  history: commerce.history,
  moves: commerce.moves,
  proposals: commerce.proposals,
});

async function upsert(supabase, table, rows, onConflict = 'id') {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw error;
  }
}
async function insert(supabase, table, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + 200));
    if (error) throw error;
  }
}

/**
 * Enregistre des changements déjà appliqués à `commerce` :
 * { suppliers, profiles: [{ supplierId, entry }], pricelists, articles, history, moves, proposals }.
 * L'ordre suit les clés étrangères (fournisseurs avant grilles, articles avant leurs coûts et mouvements).
 */
export async function persist(changes = {}) {
  if (ui.demo) return setDemoKey('commerce', structuredClone(snapshot()));
  const supabase = await supabaseClient();
  const sid = structureId();
  if (changes.suppliers?.length)
    await upsert(
      supabase,
      'commerce_suppliers',
      changes.suppliers.map((s) => supplierRow(s, sid)),
    );
  if (changes.profiles?.length)
    await insert(
      supabase,
      'commerce_import_profiles',
      changes.profiles.map((p) => profileRow(p.supplierId, p.entry, sid)),
    );
  if (changes.pricelists?.length)
    await insert(
      supabase,
      'commerce_pricelists',
      changes.pricelists.map((p) => pricelistRow(p, sid)),
    );
  if (changes.articles?.length) {
    const rows = changes.articles.map((a) => articleRows(a, sid));
    await upsert(
      supabase,
      'commerce_articles',
      rows.map((r) => r.article),
    );
    if (canManage())
      await upsert(
        supabase,
        'commerce_article_costs',
        rows.map((r) => r.cost),
        'article_id',
      );
  }
  if (changes.history?.length)
    await insert(
      supabase,
      'commerce_price_history',
      changes.history.map((h) => historyRow(h, sid)),
    );
  if (changes.moves?.length)
    await insert(
      supabase,
      'commerce_stock_moves',
      changes.moves.map((m) => stockMoveRow(m, sid)),
    );
  if (changes.proposals?.length)
    await insert(
      supabase,
      'commerce_price_proposals',
      changes.proposals.map((p) => proposalRow(p, sid)),
    );
}

/** Décision sur une proposition de prix : en base par decide_price_proposal (dirigeant), localement en démonstration. */
export async function decideProposal(proposal, accept, { newId, date }) {
  if (!ui.demo) {
    const supabase = await supabaseClient();
    const { error } = await supabase.rpc('decide_price_proposal', { p_proposal: proposal.id, p_accept: accept });
    if (error) throw error;
  }
  proposal.status = accept ? 'validee' : 'refusee';
  proposal.decidedAt = new Date().toISOString();
  if (accept) {
    const a = commerce.articles.find((x) => x.id === proposal.articleId);
    if (a) {
      commerce.history.push({
        id: newId(),
        articleId: a.id,
        date,
        kind: 'vente',
        supplierId: null,
        before: a.salePrice ?? null,
        after: proposal.proposed,
        source: `proposition:${proposal.id}`,
      });
      a.salePrice = proposal.proposed;
    }
  }
  if (ui.demo) await persist();
}
