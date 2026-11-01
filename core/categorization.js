/**
 * Catégorisation apprenante : chaque mouvement bancaire catégorisé par l'utilisateur devient une
 * règle « fournisseur (ou libellé) → catégorie et taux de TVA », proposée ensuite pour les mouvements
 * semblables. Une proposition n'est jamais appliquée seule : l'utilisateur la valide. Les règles
 * sont enregistrées avec l'entreprise (company.categoryRules).
 */

// Mots techniques des relevés, formes juridiques et mots vides : ils ne désignent pas le fournisseur.
const NOISE = new Set(
  'cb carte prlv prelevement sepa vir virement recu recue emis emise paiement achat retrait dab facture fact ref sa sas sasu sarl eurl sci ei de du des la le les et en au aux'.split(
    ' ',
  ),
);

/** Clé de fournisseur tirée d'un libellé de relevé (au plus 3 mots significatifs), ou chaîne vide. */
export function merchantKey(label) {
  const words = String(label || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !/\d/.test(w)) // dates, références, numéros de carte
    .flatMap((w) => w.split(/[^a-z]+/))
    .filter((w) => w.length > 1 && !NOISE.has(w));
  return words.slice(0, 3).join(' ');
}

const direction = (tx) => (tx.amount < 0 ? 'out' : 'in');

/** Règles mises à jour après une catégorisation validée par l'utilisateur. */
export function learnRule(rules = [], tx, { categoryId, vatRateBp = 0 }) {
  const key = merchantKey(tx.label);
  if (!key) return rules;
  const dir = direction(tx);
  const existing = rules.find((r) => r.key === key && r.direction === dir);
  const others = rules.filter((r) => r !== existing);
  const same = existing && existing.categoryId === categoryId && existing.vatRateBp === vatRateBp;
  return [...others, { key, direction: dir, categoryId, vatRateBp, count: same ? existing.count + 1 : 1 }];
}

/** Proposition pour un mouvement : la règle la plus précise dont tous les mots figurent dans le libellé. */
export function suggestCategory(rules = [], tx) {
  const words = new Set(merchantKey(tx.label).split(' ').filter(Boolean));
  if (!words.size) return null;
  const dir = direction(tx);
  const hit = rules
    .filter((r) => r.direction === dir && r.key.split(' ').every((w) => words.has(w)))
    .sort((a, b) => b.key.length - a.key.length || b.count - a.count)[0];
  return hit ? { categoryId: hit.categoryId, vatRateBp: hit.vatRateBp, key: hit.key, count: hit.count } : null;
}

export const forgetRule = (rules = [], key, dir) => rules.filter((r) => !(r.key === key && r.direction === dir));

/** Méthodes installées sur Workspace.prototype (voir core/workspace.js). */
export const categorizationMethods = {
  /** Catégorie et taux proposés pour un mouvement, d'après les choix précédents, ou null. */
  categorySuggestion(txId) {
    const tx = this.transactions.find((t) => t.id === txId);
    return tx ? suggestCategory(this.company.categoryRules, tx) : null;
  },
};
