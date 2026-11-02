/**
 * Reprise d'historique (§3.1, étape 5) : lecture d'un FEC produit par un autre logiciel et calcul du
 * bilan d'ouverture de l'exercice suivant.
 *
 *  - comptes de bilan (classes 1 à 5) : solde repris compte par compte, et tiers par tiers pour les
 *    comptes clients et fournisseurs ;
 *  - comptes de gestion (classes 6 et 7) : non repris, leur solde forme le résultat de l'exercice
 *    précédent, porté en 120 (bénéfice) ou 129 (perte) en attendant l'affectation ;
 *  - les numéros de compte sont rapprochés du plan Nexus (6 chiffres, puis préfixe le plus long) ;
 *    un compte sans équivalent va en 471 « à classer », signalé dans l'aperçu.
 * L'aperçu est toujours montré au dirigeant (ou à son expert-comptable) avant import.
 */

import { sum } from './money.js?v=17f2ba9';

const REQUIRED = ['JournalCode', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib'];

function toCents(s) {
  const t = String(s ?? '')
    .trim()
    .replace(/\s/g, '');
  if (!t) return 0;
  const m = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(t);
  if (!m) throw new Error(`Montant illisible dans le FEC : « ${s} »`);
  const cents = Number(m[2]) * 100 + Number((m[3] || '').padEnd(2, '0'));
  return m[1] ? -cents : cents;
}

/** FEC tabulé ou « pipe » (les deux sont admis par l'article A47 A-1), avec ou sans BOM. */
export function parseFec(text) {
  const rows = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (rows.length < 2) throw new Error('Fichier vide ou illisible.');
  const sep = rows[0].includes('\t') ? '\t' : '|';
  const header = rows[0].split(sep).map((h) => h.trim());
  // Montants : colonnes Débit et Crédit, ou variante « Montant + Sens » admise par l'administration.
  const amounts = header.includes('Montant') && header.includes('Sens') && !header.includes('Debit') ? [] : ['Debit', 'Credit'];
  const missing = [...REQUIRED, ...amounts].filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`Ce fichier n'est pas un FEC : colonnes manquantes (${missing.join(', ')}).`);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const hasSigned = 'Montant' in idx && 'Sens' in idx; // variante « Montant + Sens » admise par l'administration
  return rows.slice(1).map((line, n) => {
    const c = line.split(sep);
    const get = (k) => (idx[k] === undefined ? '' : (c[idx[k]] ?? '').trim());
    let debit = toCents(get('Debit'));
    let credit = toCents(get('Credit'));
    if (hasSigned && !debit && !credit) {
      const amount = toCents(get('Montant'));
      if (/^(D|\+1|1)$/i.test(get('Sens'))) debit = amount;
      else credit = amount;
    }
    if (debit < 0 || credit < 0) throw new Error(`Ligne ${n + 2} : montant négatif`);
    return {
      journal: get('JournalCode'),
      number: get('EcritureNum'),
      date: get('EcritureDate'),
      account: get('CompteNum'),
      accountLabel: get('CompteLib'),
      aux: get('CompAuxNum'),
      auxLabel: get('CompAuxLib'),
      debit,
      credit,
    };
  });
}

/** Compte Nexus correspondant : numéro sur 6 chiffres, sinon le plus long préfixe commun. */
export function mapAccount(number, chart) {
  const digits = String(number).replace(/\D/g, '');
  const six = digits.slice(0, 6).padEnd(6, '0');
  // 512100 à 512900 sont les comptes bancaires ajoutés dans Nexus : la banque de l'ancien logiciel
  // est reprise sur le compte principal (512000).
  if (/^512[1-9]/.test(six)) return { account: '512000', exact: false };
  if (chart.has(six)) return { account: six, exact: true };
  let best = null;
  for (const key of chart.keys()) {
    let n = 0;
    while (n < 6 && key[n] === six[n]) n++;
    const significant = key.replace(/0+$/, '').length;
    // Un préfixe ne compte que s'il couvre tout le numéro significatif du compte Nexus (512 couvre 5121…).
    if (n >= Math.max(3, significant) && (!best || n > best.n)) best = { account: key, n };
  }
  return best ? { account: best.account, exact: false } : { account: '471000', exact: false, unmapped: true };
}

const CLIENT_OR_SUPPLIER = /^(401|404|411|419)/;

/**
 * Bilan d'ouverture à partir des lignes d'un FEC.
 * @returns {{ lines, result, clients, suppliers, mapping, totals }}
 */
export function openingBalanceFromFec(rows, chart) {
  const byKey = new Map();
  let resultCents = 0; // produits − charges (crédit − débit des classes 6 et 7)
  const mapping = new Map();
  for (const r of rows) {
    const cls = r.account[0];
    if (cls === '6' || cls === '7') {
      resultCents += r.credit - r.debit;
      continue;
    }
    if (!/^[1-5]/.test(r.account)) continue; // classes 8/9 (engagements, analytique) : hors bilan
    const m = mapAccount(r.account, chart);
    if (!mapping.has(r.account)) mapping.set(r.account, { source: r.account, label: r.accountLabel, ...m, balance: 0 });
    mapping.get(r.account).balance += r.debit - r.credit;
    const aux = CLIENT_OR_SUPPLIER.test(m.account) && r.aux ? r.aux : '';
    const key = `${m.account}|${aux}`;
    const row = byKey.get(key) || { account: m.account, aux, auxLabel: aux ? r.auxLabel || aux : '', balance: 0 };
    row.balance += r.debit - r.credit;
    byKey.set(key, row);
  }

  const lines = [...byKey.values()]
    .filter((r) => r.balance !== 0)
    .sort((a, b) => a.account.localeCompare(b.account) || a.aux.localeCompare(b.aux))
    .map((r) => ({ account: r.account, aux: r.aux, auxLabel: r.auxLabel, debit: r.balance > 0 ? r.balance : 0, credit: r.balance < 0 ? -r.balance : 0 }));
  if (resultCents > 0) lines.push({ account: '120000', aux: '', auxLabel: '', debit: 0, credit: resultCents });
  if (resultCents < 0) lines.push({ account: '129000', aux: '', auxLabel: '', debit: -resultCents, credit: 0 });

  const tiers = (prefix) =>
    [...byKey.values()]
      .filter((r) => r.account.startsWith(prefix) && r.aux)
      .map((r) => ({
        code: r.aux
          .replace(/^(401|411)/, '')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, ''),
        aux: r.aux,
        name: r.auxLabel,
        balance: r.balance,
      }));
  const totals = { debit: sum(lines.map((l) => l.debit)), credit: sum(lines.map((l) => l.credit)) };
  return {
    lines,
    result: resultCents,
    clients: tiers('411'),
    suppliers: tiers('401'),
    mapping: [...mapping.values()].sort((a, b) => a.source.localeCompare(b.source)),
    totals,
    balanced: totals.debit === totals.credit,
  };
}

/** Écriture d'à-nouveaux (journal AN) au premier jour de l'exercice. */
export function openingEntry(opening, date) {
  if (!opening.balanced) throw new Error('Le FEC importé n’est pas équilibré : impossible de constituer le bilan d’ouverture.');
  if (!opening.lines.length) throw new Error('Aucun solde de bilan à reprendre dans ce FEC.');
  return {
    journal: 'AN',
    date,
    label: 'Bilan d’ouverture (reprise FEC)',
    pieceRef: 'REPRISE-FEC',
    pieceDate: date,
    source: { kind: 'fec-import' },
    lines: opening.lines.map((l) => ({ ...l, label: 'Reprise des soldes' })),
  };
}
