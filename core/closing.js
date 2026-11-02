/**
 * Clôture de l'exercice (lot 3, §3.8).
 *
 *  - check-list guidée : transactions justifiées, justificatifs, TVA déclarée, créances anciennes… ;
 *  - écritures d'inventaire assistées (journal OD, au dernier jour de l'exercice) : charges et
 *    produits constatés d'avance (486 / 487), factures non parvenues (408), produits à recevoir
 *    (418), dotations aux amortissements (681 / 28), provision pour créance douteuse (681 / 491),
 *    impôt sur les sociétés (695 / 444) ;
 *  - bilan et compte de résultat au format PCG simplifié (rubriques de la liasse 2033-A / 2033-B,
 *    correspondance compte → rubrique à faire valider par l'expert-comptable) ;
 *  - détermination du résultat (soldes des classes 6 et 7 portés en 120 / 129) et bilan d'ouverture
 *    de l'exercice suivant, avec contre-passation (« extourne ») des écritures d'inventaire au
 *    premier jour — la charge constatée d'avance redevient une charge de l'année suivante.
 *
 * Pour une société, la clôture n'est proposée qu'avec la validation d'un expert-comptable (choix du
 * cahier des charges pour limiter la responsabilité de BERTOLIS) : ce contrôle est fait en base.
 */

import { divRound, sum, vatFromHt } from './money.js?v=3bfbbd4';
import { fixedAssets, assetsCrossCheck } from './assets.js?v=3bfbbd4';
import { balancesOf } from './statements.js?v=3bfbbd4';

/** Nom d'un exercice : « 2026 », ou « 2025-2026 » s'il est à cheval sur deux années civiles. */
export function fiscalYearLabel(fy) {
  const a = fy.start.slice(0, 4);
  const b = fy.end.slice(0, 4);
  return a === b ? a : `${a}-${b}`;
}

// ------------------------------------------------------------------ check-list

/**
 * @returns {{ id, label, ok: boolean, detail: string, view?: string }[]}
 */
export function closingChecklist(ws, { today }) {
  const fy = ws.company.fiscalYear;
  const inYear = (d) => d >= fy.start && d <= fy.end;
  const items = [];
  const add = (id, label, ok, detail, view) => items.push({ id, label, ok, detail, view });

  const assetGaps = assetsCrossCheck(ws);
  add(
    'assets-register',
    'Le registre des immobilisations concorde avec la comptabilité',
    !assetGaps.length,
    assetGaps.length
      ? assetGaps.map((g) => `compte ${g.account} : registre ${g.register / 100} €, comptabilité ${g.ledger / 100} €`).join(' ; ')
      : 'Aucun écart',
    null,
  );

  const openTx = ws.transactions.filter((t) => t.status === 'open' && inYear(t.date));
  add(
    'bank',
    'Toutes les opérations bancaires de l’exercice sont justifiées',
    !openTx.length,
    openTx.length ? `${openTx.length} opération(s) à justifier` : 'Aucune opération en attente',
    'banque',
  );

  const noReceipt = ws.transactions.filter((t) => t.missingReceipt && inYear(t.date)).length;
  add(
    'receipts',
    'Chaque dépense a son justificatif',
    !noReceipt,
    noReceipt ? `${noReceipt} dépense(s) sans justificatif` : 'Tous les justificatifs sont joints',
    'banque',
  );

  const drafts = ws.book.invoices.filter((i) => i.status === 'draft' && i.type !== 'quote' && inYear(i.issueDate || '')).length;
  add(
    'drafts',
    'Aucune facture de l’exercice ne reste en brouillon',
    !drafts,
    drafts ? `${drafts} brouillon(s) à émettre ou supprimer` : 'Aucun brouillon',
    'ventes',
  );

  const old = ws.receivables(fy.end).filter((r) => r.outstanding > 0 && r.lateDays > 90);
  add(
    'doubtful',
    'Créances de plus de 90 jours examinées (provision éventuelle)',
    !old.length,
    old.length ? `${old.length} facture(s) impayée(s) depuis plus de 90 jours à la clôture` : 'Aucune créance ancienne',
  );

  if (ws.company.vatRegime === 'reel-normal') {
    // Seules les périodes terminées comptent (pas les mois à venir de l'exercice).
    const quarterly = ws.company.vatPeriodicity === 'trimestrielle';
    const missing = ws.vatPeriods().filter((p) => p.to < today && !ws.vatReturns.some((r) => r.from === p.from));
    const unit = quarterly ? ['trimestre non déclaré', 'trimestres non déclarés'] : ['mois non déclaré', 'mois non déclarés'];
    add(
      'vat',
      'Toutes les déclarations de TVA de l’exercice sont validées',
      !missing.length,
      missing.length ? `${missing.length} ${unit[missing.length > 1 ? 1 : 0]}` : 'TVA déclarée pour chaque période échue',
      'tva',
    );
  } else if (ws.company.vatRegime === 'reel-simplifie') {
    const done = ws.vatReturns.some((r) => r.kind === 'CA12' && r.from === fy.start);
    add('vat', 'La déclaration annuelle de TVA (CA12) est validée', done, done ? 'CA12 validée' : 'CA12 à valider (page TVA)', 'tva');
  }

  const assets = fixedAssets(ws.purchases, ws.company, fy).filter((a) => a.dotationThisYear);
  const booked = ws.ledger.entries.some((e) => e.source?.kind === 'inventory' && e.source.type === 'depreciation');
  add(
    'depreciation',
    'Dotations aux amortissements passées',
    !assets.length || booked,
    assets.length ? (booked ? 'Dotations passées' : `${assets.length} bien(s) à amortir`) : 'Aucune immobilisation à amortir',
  );

  add(
    'period',
    'L’exercice est terminé',
    today > fy.end,
    today > fy.end ? `Terminé le ${fy.end.split('-').reverse().join('/')}` : `Se termine le ${fy.end.split('-').reverse().join('/')}`,
  );
  return items;
}

// ------------------------------------------------------------------ écritures d'inventaire

const INVENTORY = {
  prepaid: { label: 'Charge constatée d’avance', help: 'Une dépense payée cette année mais qui concerne l’an prochain (loyer, assurance…).' },
  deferred: { label: 'Produit constaté d’avance', help: 'Une recette facturée cette année pour une prestation de l’an prochain.' },
  accrued: { label: 'Facture fournisseur à recevoir', help: 'Une dépense de cette année dont la facture n’est pas encore arrivée.' },
  receivable: { label: 'Vente à facturer', help: 'Une prestation réalisée cette année mais facturée l’an prochain.' },
  doubtful: { label: 'Provision pour client douteux', help: 'Une facture qu’un client risque de ne jamais payer (part hors taxes).' },
};
export const INVENTORY_TYPES = INVENTORY;

/**
 * Écriture d'inventaire saisie par l'utilisateur.
 * @param {{ type: keyof INVENTORY, account: string, amount: number, label?: string, aux?: string }} item
 *   account : compte de charge (prepaid, accrued) ou de produit (deferred, receivable) concerné ;
 *   pour doubtful, aux = sous-compte du client.
 */
export function inventoryEntry(item, fy, { receivableTtc = 0 } = {}) {
  const { type, account, amount } = item;
  if (!INVENTORY[type]) throw new Error(`Type d'écriture d'inventaire inconnu : ${type}`);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Le montant doit être positif.');
  const label = item.label || INVENTORY[type].label;
  // TVA des factures non parvenues (44586) et à établir (44587), sur le montant HT saisi.
  const vat = item.vatRateBp ? vatFromHt(amount, item.vatRateBp) : 0;
  const aux = item.aux || '';
  const pairs = {
    prepaid: [
      ['486000', amount, 0],
      [account, 0, amount],
    ],
    deferred: [
      [account, amount, 0],
      ['487000', 0, amount],
    ],
    accrued: [[account, amount, 0], ...(vat ? [['445860', vat, 0]] : []), ['408000', 0, amount + vat]],
    receivable: [['418000', amount + vat, 0], [account, 0, amount], ...(vat ? [['445870', 0, vat]] : [])],
    // Client douteux : sa créance TTC passe en 416 (clients douteux), la provision HT en 491.
    doubtful: [
      ...(receivableTtc > 0
        ? [
            ['416000', receivableTtc, 0],
            ['411000', 0, receivableTtc],
          ]
        : []),
      ['681740', amount, 0],
      ['491000', 0, amount],
    ],
  };
  return {
    journal: 'OD',
    date: fy.end,
    label,
    pieceRef: 'INVENTAIRE',
    pieceDate: fy.end,
    source: { kind: 'inventory', type, reverse: ['prepaid', 'deferred', 'accrued', 'receivable'].includes(type) },
    lines: pairs[type].map(([acc, debit, credit]) => ({ account: acc, debit, credit, label, aux: ['491000', '416000', '411000'].includes(acc) ? aux : '' })),
  };
}

/** Dotations aux amortissements de l'exercice, une ligne par bien (plan linéaire, assets.js). */
export function depreciationEntry(ws) {
  const fy = ws.company.fiscalYear;
  const assets = fixedAssets(ws.purchases, ws.company, fy).filter((a) => a.dotationThisYear);
  if (!assets.length) return null;
  return {
    journal: 'OD',
    date: fy.end,
    label: `Dotations aux amortissements ${fiscalYearLabel(fy)}`,
    pieceRef: 'INVENTAIRE',
    pieceDate: fy.end,
    source: { kind: 'inventory', type: 'depreciation' },
    lines: [
      // Logiciels et autres biens incorporels (20…) en 68111, équipements (21…) en 68112.
      ...[
        ['681110', sum(assets.filter((a) => a.account.startsWith('20')).map((a) => a.dotationThisYear))],
        ['681120', sum(assets.filter((a) => !a.account.startsWith('20')).map((a) => a.dotationThisYear))],
      ]
        .filter(([, amount]) => amount)
        .map(([account, amount]) => ({ account, debit: amount, credit: 0, label: 'Dotations aux amortissements' })),
      ...assets.map((a) => ({ account: a.depreciationAccount, debit: 0, credit: a.dotationThisYear, label: a.label })),
    ],
  };
}

// États financiers (compte de résultat, bilan) : core/statements.js, réexportés ici.
export { incomeStatement, balanceSheet, pnlRubric } from './statements.js?v=3bfbbd4';

// ------------------------------------------------------------------ impôt sur les sociétés

export const IS_RATES = { reduced: 1500, normal: 2500, reducedCap: 4250000 };

/**
 * Impôt sur les sociétés (CGI art. 219) : 15 % jusqu'à 42 500 € de bénéfice pour une PME éligible
 * (chiffre d'affaires < 10 M€, capital entièrement libéré et détenu à 75 % au moins par des personnes
 * physiques), 25 % au-delà ; plafond du taux réduit proratisé si l'exercice ne dure pas 12 mois.
 * Arrondi à l'euro. La contribution sociale (IS > 763 000 €) est hors champ des TPE visées.
 * @param {{ resultBeforeTax, addBacks?, deductions?, previousLosses?, reducedRateEligible?, days? }} p
 */
/**
 * Durée d'un exercice en mois entiers (du 1er d'un mois au dernier jour d'un mois), sinon null.
 */
export function fiscalYearMonths({ start, end }) {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const lastDay = new Date(Date.UTC(ey, em, 0)).getUTCDate();
  if (sd !== 1 || ed !== lastDay) return null;
  return (ey - sy) * 12 + (em - sm) + 1;
}

export function corporateTax({ resultBeforeTax, addBacks = 0, deductions = 0, previousLosses = 0, reducedRateEligible = true, days = 365, months = null }) {
  const taxableBeforeLosses = resultBeforeTax + addBacks - deductions;
  // Report en avant des déficits : imputation dans la limite de 1 M€ + 50 % au-delà (CGI art. 209-I).
  const cap = taxableBeforeLosses > 100000000 ? 100000000 + divRound((taxableBeforeLosses - 100000000) * 50, 100) : taxableBeforeLosses;
  const lossesUsed = taxableBeforeLosses > 0 ? Math.min(previousLosses, cap) : 0;
  const taxable = Math.max(0, taxableBeforeLosses - lossesUsed);
  // Plafond du taux réduit ajusté à la durée de l'exercice : en mois quand l'exercice compte des mois
  // entiers (aucun prorata pour 12 mois, même une année bissextile), sinon en jours.
  const reducedCap = !reducedRateEligible ? 0 : months ? divRound(IS_RATES.reducedCap * months, 12) : divRound(IS_RATES.reducedCap * days, 365);
  const atReduced = Math.min(taxable, reducedCap);
  const atNormal = taxable - atReduced;
  const raw = divRound(atReduced * IS_RATES.reduced, 10000) + divRound(atNormal * IS_RATES.normal, 10000);
  const tax = Math.round(raw / 100) * 100;
  const newLosses = taxableBeforeLosses < 0 ? previousLosses - taxableBeforeLosses : previousLosses - lossesUsed;
  return { taxableBeforeLosses, lossesUsed, taxable, atReduced, atNormal, tax, lossesCarriedForward: newLosses };
}

/** Écriture de l'IS de l'exercice : charge 695 contre dette 444 (les acomptes versés sont déjà au débit de 444). */
export function corporateTaxEntry(tax, fy) {
  if (!tax) return null;
  return {
    journal: 'OD',
    date: fy.end,
    label: `Impôt sur les sociétés ${fiscalYearLabel(fy)}`,
    pieceRef: 'INVENTAIRE',
    pieceDate: fy.end,
    source: { kind: 'inventory', type: 'corporate-tax' },
    lines: [
      { account: '695000', debit: tax, credit: 0 },
      { account: '444000', debit: 0, credit: tax },
    ],
  };
}

// ------------------------------------------------------------------ détermination du résultat et à-nouveaux

/** Solde des comptes de gestion (classes 6 et 7) sur 120 (bénéfice) ou 129 (perte). */
export function resultEntry(ledger, fy) {
  const b = balancesOf(ledger);
  const lines = [];
  let result = 0;
  for (const [acc, v] of [...b].sort()) {
    if (!/^[67]/.test(acc) || !v) continue;
    lines.push({ account: acc, debit: v < 0 ? -v : 0, credit: v > 0 ? v : 0, label: 'Solde des comptes de gestion' });
    result -= v;
  }
  if (!lines.length) return null;
  lines.push(
    result >= 0
      ? { account: '120000', debit: 0, credit: result, label: 'Bénéfice de l’exercice' }
      : { account: '129000', debit: -result, credit: 0, label: 'Perte de l’exercice' },
  );
  return {
    journal: 'OD',
    date: fy.end,
    label: `Détermination du résultat ${fiscalYearLabel(fy)}`,
    pieceRef: 'CLOTURE',
    pieceDate: fy.end,
    source: { kind: 'closing-result' },
    lines,
  };
}

/**
 * Bilan d'ouverture de l'exercice suivant (journal AN) : soldes des classes 1 à 5 compte par compte
 * et tiers par tiers, plus les contre-passations des écritures d'inventaire à extourner.
 * @returns {{ opening, reversals: object[] }}
 */
export function nextYearOpening(ledger, nextStart) {
  const byKey = new Map();
  const detailed = [];
  for (const l of ledger.lines()) {
    if (!/^[1-5]/.test(l.account)) continue;
    // Clients et fournisseurs : une ligne par pièce restée ouverte (non lettrée), avec sa référence,
    // pour pouvoir la lettrer à son règlement l'exercice suivant.
    if (/^4[01]/.test(l.account) && l.aux) {
      if (!l.letter && l.debit - l.credit) {
        detailed.push({
          account: l.account,
          aux: l.aux,
          auxLabel: l.auxLabel || '',
          // Ligne déjà reportée : son libellé porte la référence de la pièce d'origine.
          label: l.entry.source?.kind === 'opening' && l.label ? l.label : `Report à nouveau ${l.entry.pieceRef || l.entry.label}`.trim(),
          debit: l.debit,
          credit: l.credit,
        });
      }
      continue;
    }
    const key = `${l.account}|${l.aux || ''}`;
    const row = byKey.get(key) || { account: l.account, aux: l.aux || '', auxLabel: l.auxLabel || '', balance: 0 };
    row.balance += l.debit - l.credit;
    byKey.set(key, row);
  }
  const lines = [...byKey.values()]
    .filter((r) => r.balance)
    .map((r) => ({
      account: r.account,
      aux: r.aux,
      auxLabel: r.auxLabel,
      label: 'Report à nouveau des soldes',
      debit: r.balance > 0 ? r.balance : 0,
      credit: r.balance < 0 ? -r.balance : 0,
    }))
    .concat(detailed);
  const opening = {
    journal: 'AN',
    date: nextStart,
    label: 'Bilan d’ouverture',
    pieceRef: 'OUVERTURE',
    pieceDate: nextStart,
    source: { kind: 'opening' },
    lines,
  };
  const reversals = ledger.entries
    .filter((e) => e.source?.kind === 'inventory' && e.source.reverse)
    .map((e) => ({
      journal: 'OD',
      date: nextStart,
      label: `Extourne : ${e.label}`,
      pieceRef: 'EXTOURNE',
      pieceDate: nextStart,
      source: { kind: 'reversal', of: e.id },
      lines: e.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit, letter: '', letterDate: '' })),
    }));
  return { opening, reversals };
}

// ------------------------------------------------------------------ affectation du résultat

/** Montant du capital social saisi en texte libre (« 5 000 € ») → centimes. */
export function capitalCents(text) {
  const digits = String(text || '')
    .replace(/[^\d,.]/g, '')
    .replace(/[.\s](?=\d{3}\b)/g, '')
    .replace(',', '.');
  const n = Number(digits);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Proposition d'affectation du résultat de l'exercice précédent, décidée par l'assemblée (ou le
 * dirigeant d'une entreprise individuelle). Société : 5 % du bénéfice (diminué des pertes antérieures)
 * en réserve légale tant qu'elle n'atteint pas 10 % du capital (C. com. art. L232-10) ; le reste en
 * report à nouveau par défaut. Entreprise individuelle : le résultat rejoint le compte de l'exploitant.
 * @returns {{ result, legalReserveMin, proposal: { legalReserve, otherReserves, dividends, retained, owner } }}
 */
export function allocationProposal(ledger, company) {
  const result = -(ledger.balanceOf('120') + ledger.balanceOf('129'));
  const priorLosses = Math.max(0, ledger.balanceOf('119') - Math.max(0, -ledger.balanceOf('110')));
  if (company.legalForm === 'EI') {
    return { result, legalReserveMin: 0, proposal: { legalReserve: 0, otherReserves: 0, dividends: 0, retained: 0, owner: result } };
  }
  let legalReserveMin = 0;
  if (result > 0) {
    const cap = divRound(capitalCents(company.capital) * 10, 100);
    const room = Math.max(0, cap + ledger.balanceOf('1061'));
    legalReserveMin = Math.min(room, divRound(Math.max(0, result - priorLosses) * 5, 100));
  }
  return { result, legalReserveMin, proposal: { legalReserve: legalReserveMin, otherReserves: 0, dividends: 0, retained: result - legalReserveMin, owner: 0 } };
}

/**
 * Écriture d'affectation : solde 120 (ou 129) vers les réserves, le report à nouveau, les dividendes à
 * payer ou le compte de l'exploitant. Refuse une répartition qui ne tombe pas juste ou qui distribue
 * une perte.
 */
export function allocationEntry(ledger, company, { legalReserve = 0, otherReserves = 0, dividends = 0, retained = 0, owner = 0 }, date) {
  const { result, legalReserveMin } = allocationProposal(ledger, company);
  if (!result) throw new Error('Aucun résultat en attente d’affectation.');
  const parts = [legalReserve, otherReserves, dividends, retained, owner];
  if (parts.some((p) => !Number.isSafeInteger(p))) throw new Error('Montants invalides.');
  if (parts.reduce((s, p) => s + p, 0) !== result) throw new Error('La répartition doit être égale au résultat à affecter.');
  if (result > 0 && legalReserve < legalReserveMin)
    throw new Error(`La réserve légale doit recevoir au moins ${(legalReserveMin / 100).toFixed(2).replace('.', ',')} €.`);
  if (result < 0 && (legalReserve || otherReserves || dividends))
    throw new Error('Une perte ne se distribue pas : elle va en report à nouveau (ou sur le compte de l’exploitant).');
  const label = 'Affectation du résultat';
  // 120 et 129 sont soldés en entier (deux résultats non affectés de signes opposés s'additionnent),
  // puis le résultat net est réparti.
  const profit = Math.max(0, -ledger.balanceOf('120'));
  const loss = Math.max(0, ledger.balanceOf('129'));
  const lines = [];
  if (profit) lines.push({ account: '120000', debit: profit, credit: 0, label });
  if (loss) lines.push({ account: '129000', debit: 0, credit: loss, label });
  if (result > 0) {
    if (legalReserve) lines.push({ account: '106100', debit: 0, credit: legalReserve, label });
    if (otherReserves) lines.push({ account: '106800', debit: 0, credit: otherReserves, label });
    if (dividends) lines.push({ account: '457000', debit: 0, credit: dividends, label });
    if (retained) lines.push({ account: retained > 0 ? '110000' : '119000', debit: retained < 0 ? -retained : 0, credit: retained > 0 ? retained : 0, label });
    if (owner) lines.push({ account: '108000', debit: 0, credit: owner, label });
  } else {
    if (retained) lines.push({ account: '119000', debit: -retained, credit: 0, label });
    if (owner) lines.push({ account: '108000', debit: -owner, credit: 0, label });
  }
  return { journal: 'OD', date, label, pieceRef: 'AFFECTATION', pieceDate: date, source: { kind: 'allocation' }, lines };
}
