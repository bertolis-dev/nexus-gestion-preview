/**
 * États comptables (§3.7) et export FEC (art. A47 A-1 du LPF). Ils lisent tous la même source
 * (`ledger.lines`), ce qui garantit le critère de recette « aucun écart entre grand livre,
 * balance et FEC ».
 */

import { formatDecimalComma, sum } from './money.js?v=a619ec1';
import { JOURNALS } from './ledger.js?v=a619ec1';
import { isCalendarDate, parisDateOf } from './dates.js?v=a619ec1';

/** Balance générale : totaux débit/crédit et solde par compte, triés par numéro. */
export function trialBalance(ledger, opts = {}) {
  const byAccount = new Map();
  for (const l of ledger.lines(opts)) {
    const row = byAccount.get(l.account) || { account: l.account, debit: 0, credit: 0 };
    row.debit += l.debit;
    row.credit += l.credit;
    byAccount.set(l.account, row);
  }
  const rows = [...byAccount.values()]
    .sort((a, b) => a.account.localeCompare(b.account))
    .map((r) => {
      const acc = ledger.chart.get(r.account);
      const solde = r.debit - r.credit;
      return {
        ...r,
        label: acc.label,
        plainLabel: acc.plainLabel,
        soldeDebiteur: solde > 0 ? solde : 0,
        soldeCrediteur: solde < 0 ? -solde : 0,
      };
    });
  const totals = {
    debit: sum(rows.map((r) => r.debit)),
    credit: sum(rows.map((r) => r.credit)),
    soldeDebiteur: sum(rows.map((r) => r.soldeDebiteur)),
    soldeCrediteur: sum(rows.map((r) => r.soldeCrediteur)),
  };
  return { rows, totals, balanced: totals.debit === totals.credit };
}

/** Balance auxiliaire (clients ou fournisseurs) par tiers. */
export function auxiliaryBalance(ledger, collective, opts = {}) {
  const byAux = new Map();
  for (const l of ledger.lines(opts)) {
    if (l.account !== collective || !l.aux) continue;
    const row = byAux.get(l.aux) || { aux: l.aux, auxLabel: l.auxLabel, debit: 0, credit: 0 };
    row.debit += l.debit;
    row.credit += l.credit;
    byAux.set(l.aux, row);
  }
  return [...byAux.values()].map((r) => ({ ...r, solde: r.debit - r.credit })).sort((a, b) => a.aux.localeCompare(b.aux));
}

/** Grand livre : lignes par compte avec solde progressif. */
export function generalLedger(ledger, opts = {}) {
  const byAccount = new Map();
  const lines = ledger
    .lines(opts)
    .sort((a, b) => a.account.localeCompare(b.account) || a.entry.date.localeCompare(b.entry.date) || (a.entry.number ?? 1e12) - (b.entry.number ?? 1e12));
  for (const l of lines) {
    if (!byAccount.has(l.account)) {
      const acc = ledger.chart.get(l.account);
      byAccount.set(l.account, { account: l.account, label: acc.label, plainLabel: acc.plainLabel, lines: [], debit: 0, credit: 0 });
    }
    const block = byAccount.get(l.account);
    block.debit += l.debit;
    block.credit += l.credit;
    block.lines.push({
      date: l.entry.date,
      journal: l.entry.journal,
      number: l.entry.number,
      pieceRef: l.entry.pieceRef,
      label: l.label,
      aux: l.aux,
      debit: l.debit,
      credit: l.credit,
      letter: l.letter,
      runningBalance: block.debit - block.credit,
      entryId: l.entry.id,
    });
  }
  return [...byAccount.values()];
}

/** Journal : écritures d'un journal dans l'ordre de numérotation. */
export function journalReport(ledger, journal, opts = {}) {
  return ledger.entries
    .filter((e) => e.journal === journal && (!opts.from || e.date >= opts.from) && (!opts.to || e.date <= opts.to))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.number ?? 1e12) - (b.number ?? 1e12));
}

// ------------------------------------------------------------------ FEC

export const FEC_COLUMNS = [
  'JournalCode',
  'JournalLib',
  'EcritureNum',
  'EcritureDate',
  'CompteNum',
  'CompteLib',
  'CompAuxNum',
  'CompAuxLib',
  'PieceRef',
  'PieceDate',
  'EcritureLib',
  'Debit',
  'Credit',
  'EcritureLet',
  'DateLet',
  'ValidDate',
  'Montantdevise',
  'Idevise',
];

const fecDate = (iso) => (iso ? iso.slice(0, 10).replaceAll('-', '') : '');
/** Le séparateur (tabulation) et les retours à la ligne sont interdits dans les zones texte. */
const fecText = (s) =>
  String(s ?? '')
    .replace(/[\t\r\n|]+/g, ' ')
    .trim();

/**
 * Fichier des écritures comptables : écritures validées uniquement, triées par numéro,
 * séparateur tabulation, montants à virgule, dates AAAAMMJJ. Nom : <SIREN>FEC<AAAAMMJJ>.txt
 */
export function exportFEC(ledger, { siren, closingDate }) {
  if (!/^\d{9}$/.test(siren || '')) throw new Error('SIREN à 9 chiffres obligatoire pour le FEC');
  const drafts = ledger.entries.filter((e) => e.status !== 'validated');
  if (drafts.length) {
    throw new Error(`${drafts.length} écriture(s) non validée(s) : validez la période avant d'exporter le FEC`);
  }
  const rows = [FEC_COLUMNS.join('\t')];
  const entries = [...ledger.entries].sort((a, b) => a.number - b.number);
  for (const e of entries) {
    for (const l of e.lines) {
      const acc = ledger.chart.get(l.account);
      rows.push(
        [
          e.journal,
          JOURNALS[e.journal],
          String(e.number),
          fecDate(e.date),
          l.account,
          fecText(acc.label),
          l.aux,
          fecText(l.aux ? l.auxLabel : ''),
          fecText(e.pieceRef || String(e.number)),
          fecDate(e.pieceDate || e.date),
          fecText(l.label),
          formatDecimalComma(l.debit),
          formatDecimalComma(l.credit),
          l.letter,
          fecDate(l.letterDate),
          fecDate(parisDateOf(e.validatedAt)), // horodatage UTC → date civile à Paris
          '',
          '',
        ].join('\t'),
      );
    }
  }
  return {
    fileName: `${siren}FEC${fecDate(closingDate || ledger.fiscalYear.end)}.txt`,
    content: rows.join('\r\n') + '\r\n',
  };
}

/**
 * Contrôles de cohérence repris de Test Compta Demat (non exhaustifs : la recette passe par l'outil
 * officiel de la DGFiP, §2) : colonnes, dates, numérotation continue, équilibre par écriture.
 */
export function checkFEC(content) {
  const errors = [];
  const lines = content.replace(/\r\n$/, '').split('\r\n');
  if (lines[0] !== FEC_COLUMNS.join('\t')) errors.push('En-tête non conforme');
  const byNum = new Map();
  let prevDate = '';
  lines.slice(1).forEach((line, i) => {
    const cols = line.split('\t');
    if (cols.length !== FEC_COLUMNS.length) {
      errors.push(`Ligne ${i + 2} : ${cols.length} colonnes au lieu de ${FEC_COLUMNS.length}`);
      return;
    }
    const [, , num, date, , , , , , , , debit, credit] = cols;
    if (!/^\d{8}$/.test(date) || !isCalendarDate(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`)) errors.push(`Ligne ${i + 2} : date invalide`);
    if (date < prevDate) errors.push(`Ligne ${i + 2} : ordre chronologique non respecté`);
    prevDate = date;
    // Montants toujours à 2 décimales : retirer la virgule donne directement des centimes.
    const toCents = (s) => Number(s.replace(',', ''));
    const agg = byNum.get(num) || 0;
    byNum.set(num, agg + toCents(debit) - toCents(credit));
  });
  const nums = [...byNum.keys()].map(Number);
  nums.forEach((n, i) => {
    if (n !== i + 1) errors.push(`Numérotation discontinue : ${n} à la position ${i + 1}`);
  });
  for (const [num, balance] of byNum) if (balance !== 0) errors.push(`Écriture ${num} déséquilibrée`);
  return { ok: errors.length === 0, errors };
}

/**
 * Encodage ISO 8859-15 (Latin-9) du FEC, jeu de caractères cité par l'article A47 A-1 du LPF (à
 * valider par l'expert-comptable, avec un fichier testé dans l'outil Test Compta Demat de la DGFiP).
 * Latin-9 = Latin-1 sauf huit positions (€, Š, š, Ž, ž, Œ, œ, Ÿ) ; un caractère hors jeu devient « ? ».
 */
const LATIN9 = { '€': 0xa4, Š: 0xa6, š: 0xa8, Ž: 0xb4, ž: 0xb8, Œ: 0xbc, œ: 0xbd, Ÿ: 0xbe };
const LATIN1_REPLACED = new Set([0xa4, 0xa6, 0xa8, 0xb4, 0xb8, 0xbc, 0xbd, 0xbe]);
/** Ponctuation typographique hors Latin-9, remplacée par son équivalent simple (au lieu de « ? »). */
const TYPO = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2026': '...',
  '\u202f': ' ',
  '\u2009': ' ',
  '\u00a0': ' ',
};
export function encodeLatin9(text) {
  const out = [];
  for (const raw of text) {
    for (const ch of TYPO[raw] ?? raw) {
      const code = ch.codePointAt(0);
      if (LATIN9[ch] !== undefined) out.push(LATIN9[ch]);
      else if (code < 0x100 && !LATIN1_REPLACED.has(code)) out.push(code);
      else out.push(0x3f);
    }
  }
  return Uint8Array.from(out);
}
