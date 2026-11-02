/**
 * Achats (§3.3) : écriture d'achat à partir d'une facture fournisseur catégorisée en langage courant,
 * TVA non déductible appliquée automatiquement, détection des immobilisations et des doublons.
 */

import { divRound, splitTtc, sum, vatFromHt } from './money.js?v=269c883';
import { categoryById } from './pcg.js?v=269c883';

/** Ligne d'achat saisie TTC : HT et TVA dont la somme redonne exactement le TTC. */
export function ttcLine(ttc, vatRateBp) {
  const { ht, tva } = splitTtc(ttc, vatRateBp);
  return { ht, vat: tva, vatRateBp };
}

export const FIXED_ASSET_THRESHOLD_HT = 50000; // 500 € HT, paramétrable par structure

/**
 * @param {object} p facture d'achat : { id, supplier: {name, code, country}, date, number,
 *   lines: [{ categoryId, ht, vatRateBp, nature? }], giftBeneficiaries? } — `supplier.vatOnDebits` :
 *   fournisseur ayant opté pour le paiement de la TVA d'après les débits.
 * @param {object} company { vatRegime, fixedAssetThreshold? }
 */
export function purchaseEntry(p, company) {
  const franchise = company.vatRegime === 'franchise';
  const threshold = company.fixedAssetThreshold ?? FIXED_ASSET_THRESHOLD_HT;
  // Autoliquidation : fournisseur étranger, ou case cochée (sous-traitance dans le bâtiment, CGI art.
  // 283-2 nonies) — la facture reçue est alors hors taxes et la TVA est due par l'acheteur.
  const reverseCharge = p.reverseCharge === true || (p.supplier.country || 'FR') !== 'FR';
  const label = `${p.supplier.name} ${p.number || ''}`.trim();
  // Salarié (note de frais) : nom complet sans accents, pour que deux homonymes de prénom aient deux
  // sous-comptes 421 distincts ; fournisseur : code ou 8 premiers caractères (inchangé).
  const supplierCode =
    (p.supplier.kind === 'salarie' || p.supplier.kind === 'dirigeant') && !p.supplier.code
      ? p.supplier.name
          .normalize('NFD')
          .replace(/\p{M}/gu, '')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 24) || 'SALARIE'
      : `${p.supplier.code || p.supplier.name.slice(0, 8)}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const lines = [];
  let totalTtc = 0;
  let hasFixedAsset = false;
  // 445680 : TVA d'une prestation de services, déductible seulement au paiement (CGI art. 271-I-2),
  // sauf fournisseur ayant opté pour les débits ; elle bascule en 445660 à chaque règlement.
  const deductibleByAccount = { 445660: 0, 445620: 0, 445680: 0 };
  let reverseChargeVat = 0;

  for (const l of p.lines) {
    const cat = categoryById(l.categoryId);
    // TVA imposée (dépense saisie TTC) : HT + TVA redonne exactement le montant tapé.
    const vat = Number.isSafeInteger(l.vat) ? l.vat : vatFromHt(l.ht, l.vatRateBp || 0);
    let pct = franchise ? 0 : cat.vatDeductiblePct;
    if (cat.giftVatThreshold && p.giftBeneficiaries) {
      const perBeneficiaryTtc = divRound(l.ht + vat, p.giftBeneficiaries);
      if (perBeneficiaryTtc > cat.giftVatThreshold) pct = 0;
    }
    // Avoir sur un bien du registre (assetCredit) : il diminue le compte du bien, quel que soit son montant.
    const isAsset = cat.fixedAsset && (l.assetCredit || l.ht >= threshold);
    hasFixedAsset ||= isAsset;
    const account = cat.fixedAsset && !isAsset ? '606300' : cat.account;

    if (reverseCharge) {
      // Autoliquidation : facture reçue HT, TVA due et (si déductible) récupérée en même temps.
      const dueVat = vatFromHt(l.ht, l.vatRateBp ?? 2000); // un taux saisi à 0 % reste 0 %
      const deductible = divRound(dueVat * pct, 100);
      reverseChargeVat += dueVat;
      deductibleByAccount[isAsset ? '445620' : '445660'] += deductible;
      lines.push({ account, label, debit: l.ht + (dueVat - deductible), credit: 0 });
      totalTtc += l.ht;
    } else {
      const deductible = divRound(vat * pct, 100);
      // Dépense avancée par un salarié (note de frais) : le fournisseur est déjà payé, TVA récupérable aussitôt.
      const onPayment =
        !isAsset && (l.nature || cat.nature) === 'services' && !p.supplier.vatOnDebits && p.supplier.kind !== 'salarie' && p.supplier.kind !== 'dirigeant';
      deductibleByAccount[isAsset ? '445620' : onPayment ? '445680' : '445660'] += deductible;
      lines.push({ account, label, debit: l.ht + (vat - deductible), credit: 0 });
      totalTtc += l.ht + vat;
    }
  }
  for (const [account, amount] of Object.entries(deductibleByAccount)) {
    if (amount) lines.push({ account, label, debit: amount, credit: 0 });
  }
  if (reverseChargeVat) lines.push({ account: '445200', label, debit: 0, credit: reverseChargeVat });
  // Frais du dirigeant (indemnités kilométriques) : dus sur son compte courant (société) ou de l'exploitant (EI).
  const payable =
    p.supplier.kind === 'salarie'
      ? '421000'
      : p.supplier.kind === 'dirigeant'
        ? company.taxRegime === 'ir-reel'
          ? '108000'
          : '455000'
        : hasFixedAsset
          ? '404000'
          : '401000';
  // Sous-compte du tiers préfixé par son collectif (401… fournisseurs, 404… fournisseurs d'immobilisations,
  // 421… salarié pour une note de frais).
  lines.push({ account: payable, aux: `${payable.slice(0, 3)}${supplierCode}`, auxLabel: p.supplier.name, label, debit: 0, credit: totalTtc });

  const merged = mergeSameAccount(lines);
  // Avoir fournisseur : mêmes comptes, sens inversés (la charge et la TVA déductible diminuent,
  // le fournisseur nous doit le montant — remboursé ou déduit d'une prochaine facture).
  if (p.type === 'credit') for (const l of merged) [l.debit, l.credit] = [l.credit, l.debit];
  return {
    journal: 'AC',
    date: p.date,
    label: p.type === 'credit' ? `Avoir ${label}` : label,
    pieceRef: p.number || p.id,
    pieceDate: p.date,
    source: { kind: 'purchase', id: p.id },
    lines: merged,
    meta: { totalTtc, hasFixedAsset, reverseCharge },
  };
}

function mergeSameAccount(lines) {
  const out = [];
  for (const l of lines) {
    const same = out.find((o) => o.account === l.account && (o.aux || '') === (l.aux || '') && o.debit && l.debit);
    if (same) same.debit += l.debit;
    else out.push({ ...l });
  }
  return out;
}

/**
 * Option du fournisseur pour le paiement de la TVA d'après les débits, telle qu'indiquée sur sa
 * dernière facture enregistrée (null si ce fournisseur n'a jamais indiqué son choix) : reprise pour ses factures suivantes.
 */
export function knownVatOnDebits(purchases, supplierName) {
  const key = String(supplierName || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const last = purchases.findLast(
    (p) =>
      String(p.supplier.name)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '') === key && p.supplier.vatOnDebits !== undefined,
  );
  return last ? Boolean(last.supplier.vatOnDebits) : null;
}

/** Doublon : même fournisseur, même montant TTC et même date ou même numéro de facture. */
export function findDuplicates(candidate, existing) {
  const norm = (s) =>
    String(s || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  const ttc = (p) => sum(p.lines.map((l) => l.ht + vatFromHt(l.ht, l.vatRateBp || 0)));
  return existing.filter(
    (p) =>
      p.id !== candidate.id &&
      (p.type || 'invoice') === (candidate.type || 'invoice') &&
      norm(p.supplier.name) === norm(candidate.supplier.name) &&
      ((candidate.number && norm(p.number) === norm(candidate.number)) || (ttc(p) === ttc(candidate) && p.date === candidate.date)),
  );
}

/** Plan d'amortissement linéaire, prorata temporis au jour (base 360 jours, usage courant). */
export function straightLineSchedule({ cost, startDate, years }) {
  const [y, m, d] = startDate.split('-').map(Number);
  const firstYearDays = (12 - m) * 30 + (30 - Math.min(d, 30) + 1);
  const annual = divRound(cost, years);
  const rows = [];
  let remaining = cost;
  let year = y;
  const first = divRound(annual * firstYearDays, 360);
  for (let i = 0; remaining > 0; i++, year++) {
    const dot = i === 0 ? first : Math.min(annual, remaining);
    const amount = Math.min(dot, remaining);
    remaining -= amount;
    rows.push({ year, dotation: amount, vnc: remaining });
  }
  return rows;
}
