/**
 * Banque (§3.4) : fusion des relevés importés (bank-import.js), propositions de rapprochement classées par confiance, et écritures de règlement + lettrage.
 * L'import est idempotent : chaque transaction porte un identifiant stable (FITID OFX, identifiant
 * Qonto, ou empreinte date|montant|libellé|rang pour le CSV), et un ré-import ne crée aucun doublon.
 */

import { divRound, sum } from './money.js?v=3bfbbd4';

/** Compte bancaire principal (512000), créé avec l'entreprise ; « default » le relie à sa ligne en base. */
export const DEFAULT_BANK_ACCOUNT = { id: 'default', label: 'Compte principal', glAccount: '512000', provider: 'manual', ibanLast4: null };

// Lecture des relevés (CSV, OFX…) : voir bank-import.js ; réexportée pour les appels existants.
export { parseBankCsv, parseOfx } from './bank-import.js?v=3bfbbd4';

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Fusionne un import dans la liste existante sans doublon ; renvoie les transactions ajoutées.
 * `legacyId` (identifiant des versions précédentes) reconnaît une opération déjà importée sur le
 * même compte ; il n'est pas conservé.
 */
export function mergeTransactions(existing, incoming) {
  const byId = new Map(existing.map((t) => [t.id, t]));
  const added = [];
  for (const { legacyId, ...t } of incoming) {
    const old = legacyId && byId.get(legacyId);
    if (byId.has(t.id) || (old && (old.accountId || 'default') === (t.accountId || 'default'))) continue;
    byId.set(t.id, t);
    added.push(t);
  }
  existing.push(...added);
  return added;
}

// ------------------------------------------------------------------ propositions

const tokens = (s) =>
  norm(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);

function daysBetween(a, b) {
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);
}

/**
 * Propositions de rapprochement pour une transaction, triées par confiance (0–100).
 * @param {object} tx transaction bancaire (amount > 0 = encaissement)
 * @param {object[]} openDocs pièces ouvertes { id, kind: 'invoice'|'purchase', number, partyName, date, dueDate, outstanding }
 */
export function suggestMatches(tx, openDocs, { maxGroup = 3 } = {}) {
  const wanted = Math.abs(tx.amount);
  // Encaissement : factures clients et avoirs fournisseurs remboursés ; décaissement : dépenses et
  // remboursements d'avoirs aux clients.
  const kinds = tx.amount > 0 ? ['invoice', 'purchase-credit'] : ['purchase', 'credit'];
  const docs = openDocs.filter((d) => kinds.includes(d.kind) && d.outstanding > 0);
  const label = norm(tx.label);
  const labelTokens = new Set(tokens(tx.label));
  const nameScore = (d) => {
    const t = tokens(d.partyName);
    return t.length && t.some((x) => labelTokens.has(x)) ? 20 : 0;
  };
  // Un numéro trop court (« 12 », « - ») se retrouverait dans n'importe quel libellé : au moins 4 caractères.
  const numberInLabel = (d) => {
    const n = norm(d.number || '').replace(/[^a-z0-9]/g, '');
    return n.length >= 4 && label.replace(/[^a-z0-9]/g, '').includes(n);
  };
  const dateScore = (d) => Math.max(0, 10 - Math.floor(daysBetween(tx.date, d.dueDate || d.date) / 6));

  const out = [];
  for (const d of docs) {
    let score = 0;
    const reasons = [];
    if (d.outstanding === wanted) {
      score += 50;
      reasons.push('montant identique');
    } else if (d.outstanding > wanted && d.outstanding - wanted <= WRITE_OFF_THRESHOLD) {
      // Quelques centimes d'écart (frais, arrondi) : la pièce est soldée, l'écart passe en 658 / 758.
      score += 45;
      reasons.push('montant identique à quelques centimes près (écart de règlement)');
    } else if (d.outstanding > wanted) {
      score += 15;
      reasons.push('paiement partiel possible');
    }
    if (numberInLabel(d)) {
      score += 40;
      reasons.push('numéro de facture dans le libellé');
    }
    const ns = nameScore(d);
    if (ns) reasons.push('nom du tiers dans le libellé');
    score += ns + dateScore(d);
    if (score >= 30)
      out.push({
        docs: [d],
        amounts: [d.outstanding > wanted && d.outstanding - wanted <= WRITE_OFF_THRESHOLD ? d.outstanding : Math.min(wanted, d.outstanding)],
        score: Math.min(100, score),
        reasons,
      });
  }

  // Paiement groupé : combinaisons de 2 à maxGroup factures d'un même tiers dont la somme est exacte.
  const byParty = new Map();
  for (const d of docs) byParty.set(d.partyName, [...(byParty.get(d.partyName) || []), d]);
  for (const list of byParty.values()) {
    const combos = [];
    const walk = (start, picked, total) => {
      if (picked.length >= 2 && total === wanted) combos.push([...picked]);
      if (picked.length === maxGroup || total >= wanted) return;
      for (let i = start; i < list.length && combos.length < 5; i++) walk(i + 1, [...picked, list[i]], total + list[i].outstanding);
    };
    walk(0, [], 0);
    for (const combo of combos) {
      const score = Math.min(100, 45 + nameScore(combo[0]) + (combo.every(numberInLabel) ? 30 : 0));
      out.push({ docs: combo, amounts: combo.map((d) => d.outstanding), score, reasons: [`paiement groupé de ${combo.length} factures`] });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

/** Écart de règlement absorbé en 658 / 758 : 1 € au plus (docs/regles-a-valider.md). */
export const WRITE_OFF_THRESHOLD = 100;

// ------------------------------------------------------------------ écritures de règlement

/**
 * Écriture de banque pour un règlement de pièces (clients ou fournisseurs).
 * @param {object} tx transaction
 * @param {{doc: object, amount: number}[]} allocations montants imputés par pièce
 * @param {{ writeOffThreshold?: number, bankAccount?: string }} opts écart de centimes absorbé en 658/758 (défaut 1 €), sous-compte 512 du compte bancaire
 */
export function settlementEntry(tx, allocations, { writeOffThreshold = WRITE_OFF_THRESHOLD, bankAccount = '512000' } = {}) {
  const incoming = tx.amount > 0;
  const bank = Math.abs(tx.amount);
  const allocated = sum(allocations.map((a) => a.amount));
  const gap = bank - allocated;
  if (Math.abs(gap) > writeOffThreshold && gap < 0) {
    throw new Error(`Le montant imputé (${allocated}) dépasse la transaction (${bank})`);
  }
  const lines = [];
  lines.push({ account: bankAccount, label: tx.label, debit: incoming ? bank : 0, credit: incoming ? 0 : bank });
  for (const { doc, amount } of allocations) {
    lines.push({
      account: doc.thirdPartyAccount,
      aux: doc.aux,
      auxLabel: doc.partyName,
      label: `Règlement ${doc.number}`,
      debit: incoming ? 0 : amount,
      credit: incoming ? amount : 0,
    });
  }
  if (gap !== 0) {
    if (Math.abs(gap) <= writeOffThreshold) {
      // Écart de centimes : produit (758) si on a reçu plus, charge (658) si on a reçu moins.
      const toRevenue = incoming ? gap > 0 : gap < 0;
      lines.push({
        account: toRevenue ? '758000' : '658000',
        label: 'Écart de règlement',
        debit: toRevenue ? 0 : Math.abs(gap),
        credit: toRevenue ? Math.abs(gap) : 0,
      });
    } else {
      // Trop-perçu significatif : reste sur le compte du tiers (avance), à traiter par l'utilisateur.
      const d = allocations[0].doc;
      lines.push({
        account: d.thirdPartyAccount,
        aux: d.aux,
        auxLabel: d.partyName,
        label: 'Trop-perçu',
        debit: incoming ? 0 : gap,
        credit: incoming ? gap : 0,
      });
    }
  }
  return { journal: 'BQ', date: tx.date, label: tx.label, pieceRef: tx.id, pieceDate: tx.date, source: { kind: 'bank', id: tx.id }, lines };
}

/**
 * Bascule de la TVA sur encaissements : à chaque paiement d'une facture de services, la part de TVA
 * correspondante passe de 445800 (en attente) à 445710 (collectée, exigible).
 */
export function vatOnReceiptEntry(invoice, paidAmount, date) {
  // Facture finale avec acomptes : seule la TVA restant en attente (hors acomptes) est répartie, au
  // prorata du net à payer — c'est lui que les règlements soldent.
  const pendingVat = invoice.totals.totalVat - (invoice.deposits || []).reduce((s, d) => s + d.amountVat, 0);
  const vat = divRound(pendingVat * paidAmount, invoice.totals.netToPay);
  if (!vat) return null;
  return {
    journal: 'OD',
    date,
    label: `TVA exigible sur encaissement ${invoice.number}`,
    pieceRef: invoice.number,
    pieceDate: date,
    source: { kind: 'vat-receipt', id: invoice.id },
    lines: [
      { account: '445800', debit: vat, credit: 0 },
      { account: '445710', debit: 0, credit: vat },
    ],
  };
}

/** Dépense ou recette sans pièce (frais bancaires, abonnement prélevé…), signalée si sans justificatif. */
export function directEntry(tx, { account, vatAccount, vatAmount = 0, missingReceipt = true, bankAccount = '512000' }) {
  const abs = Math.abs(tx.amount);
  const out = tx.amount < 0;
  const lines = [{ account: bankAccount, label: tx.label, debit: out ? 0 : abs, credit: out ? abs : 0 }];
  lines.push({ account, label: tx.label, debit: out ? abs - vatAmount : 0, credit: out ? 0 : abs - vatAmount });
  if (vatAmount) lines.push({ account: vatAccount, label: tx.label, debit: out ? vatAmount : 0, credit: out ? 0 : vatAmount });
  return { journal: 'BQ', date: tx.date, label: tx.label, pieceRef: tx.id, pieceDate: tx.date, source: { kind: 'bank', id: tx.id, missingReceipt }, lines };
}

/**
 * État de rapprochement : solde relevé vs solde comptable, avec les suspens. Avec `account`
 * (compte bancaire), limité à son sous-compte 512 et à ses mouvements ; sinon, tous les comptes.
 */
export function reconciliationStatement(ledger, transactions, { date, statementBalance, account = null }) {
  const bookBalance = ledger.balanceOf(account ? account.glAccount : '512', { to: date });
  const pending = transactions.filter((t) => t.date <= date && t.status === 'open' && (!account || (t.accountId || 'default') === account.id));
  return {
    date,
    statementBalance,
    bookBalance,
    pendingCount: pending.length,
    pendingTotal: sum(pending.map((t) => t.amount)),
    difference: statementBalance - bookBalance - sum(pending.map((t) => t.amount)),
  };
}
