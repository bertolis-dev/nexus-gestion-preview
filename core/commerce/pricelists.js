/**
 * Fournisseurs et grilles tarifaires historisées. Une grille importée est une VERSION datée et figée
 * (fichier d'origine, empreinte, profil utilisé) : rien n'est écrasé, on compare deux versions pour
 * voir ce qui a changé et à quelle date. La base le garantit aussi (trigger, migration 0035).
 */

import { isCalendarDate } from '../dates.js?v=a619ec1';
import { fold, validateProfile } from './sheet.js?v=a619ec1';

export class PricelistError extends Error {}

const clean = (s, max) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** Clé d'une ligne dans une grille : l'EAN, à défaut la référence fournisseur. */
export const lineKey = (l) => l.ean || (l.ref ? `ref:${fold(l.ref)}` : '');

// ------------------------------------------------------------------ fournisseurs

/** Rôle commercial du fournisseur : qui facture, et à quel titre. */
export const SUPPLIER_ROLES = {
  fabricant: 'Fabricant',
  distributeur: 'Distributeur, grossiste',
  groupement: 'Groupement, centrale d’achat',
  marque: 'Marque d’un autre fournisseur',
};

/** Site web : l'adresse saisie avec ou sans « https:// » ; null si ce n'en est pas une. */
export function normalizeWebsite(s) {
  const v = clean(s, 200);
  if (!v) return null;
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  if (!/^https?:\/\/[^\s/.]+\.[^\s]+$/i.test(url)) throw new PricelistError(`Site web illisible : « ${v} ».`);
  return url;
}

/** SIREN : 9 chiffres (les espaces sont acceptés à la saisie) ; null si vide. */
export function normalizeSiren(s) {
  const v = String(s ?? '').replace(/[\s.]/g, '');
  if (!v) return null;
  if (!/^\d{9}$/.test(v)) throw new PricelistError('Le SIREN compte 9 chiffres.');
  return v;
}

/**
 * Fiche fournisseur. `profiles` garde chaque version du paramétrage d'import : si le fournisseur
 * change la mise en page de sa grille, la nouvelle version n'efface pas l'ancienne.
 */
export function saveSupplier(list = [], input, { newId, now = new Date() } = {}) {
  const name = clean(input.name, 120);
  if (!name) throw new PricelistError('Indiquez le nom du fournisseur.');
  const dup = list.find((s) => s.id !== input.id && fold(s.name) === fold(name));
  if (dup) throw new PricelistError(`Le fournisseur « ${dup.name} » existe déjà.`);
  const prev = list.find((s) => s.id === input.id);
  const coef = input.defaultCoefBp === null || input.defaultCoefBp === undefined || input.defaultCoefBp === '' ? null : Number(input.defaultCoefBp);
  if (coef !== null && (!Number.isInteger(coef) || coef < 10000 || coef > 100000))
    throw new PricelistError('Coefficient par défaut invalide (entre 1,00 et 10,00).');
  const supplier = {
    ...(prev || {}),
    id: prev?.id || input.id || newId(),
    name,
    legalName: clean(input.legalName, 160) || null,
    role: SUPPLIER_ROLES[input.role] ? input.role : null,
    group: clean(input.group, 120) || null,
    siren: normalizeSiren(input.siren),
    website: normalizeWebsite(input.website),
    address: clean(input.address, 300) || null,
    accountNumber: clean(input.accountNumber, 40) || null,
    brands: [...new Set((input.brands || []).map((b) => clean(b, 60)).filter(Boolean))],
    contact: clean(input.contact, 120) || null,
    email: clean(input.email, 160) || null,
    orderEmail: clean(input.orderEmail, 160) || null,
    phone: clean(input.phone, 40) || null,
    priceType: ['net', 'brut', 'inconnu'].includes(input.priceType) ? input.priceType : prev?.priceType || 'inconnu',
    defaultCoefBp: coef,
    francoCents: Number.isSafeInteger(input.francoCents) ? input.francoCents : (prev?.francoCents ?? null),
    leadDays: Number.isInteger(input.leadDays) ? input.leadDays : (prev?.leadDays ?? null),
    notes: clean(input.notes, 2000) || null,
    // Pages d'où viennent les coordonnées (site officiel, annuaire des entreprises) : gardées telles quelles.
    sources: Array.isArray(input.sources)
      ? input.sources
          .map((u) => clean(u, 300))
          .filter((u) => /^https?:\/\//i.test(u))
          .slice(0, 10)
      : prev?.sources || [],
    profiles: prev?.profiles || [],
    createdAt: prev?.createdAt || now.toISOString(),
  };
  return [...list.filter((s) => s.id !== supplier.id), supplier].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Paramétrage d'import courant (dernière version) ou null. */
export const currentProfile = (supplier) => supplier?.profiles?.at(-1) || null;

/**
 * Enregistre le paramétrage d'import d'un fournisseur ; une nouvelle version seulement s'il change.
 * `signature` (profileSignature) permet de détecter plus tard un changement de mise en page.
 */
export function saveProfile(supplier, profile, { signature, now = new Date() } = {}) {
  validateProfile(profile);
  const { labels, ...stored } = profile; // les intitulés lus ne font pas partie du paramétrage
  const last = currentProfile(supplier);
  if (last && JSON.stringify(last.profile) === JSON.stringify(stored)) return supplier;
  const version = (last?.version || 0) + 1;
  return { ...supplier, profiles: [...(supplier.profiles || []), { version, createdAt: now.toISOString(), signature: signature || null, profile: stored }] };
}

// ------------------------------------------------------------------ grilles

/** Nouvelle version de grille, contrôlée et figée. */
export function buildPricelist({ supplier, effectiveDate, fileName, fileHash, lines, profileVersion = null }, { newId, now = new Date() } = {}) {
  if (!supplier?.id) throw new PricelistError('Choisissez le fournisseur de cette grille.');
  if (!isCalendarDate(effectiveDate)) throw new PricelistError('Indiquez la date d’effet de la grille (date d’application des prix).');
  if (!lines?.length) throw new PricelistError('Aucune ligne lisible : vérifiez l’onglet et les colonnes.');
  if (lines.length > 20000) throw new PricelistError('Grille trop longue (20 000 lignes au plus).');
  if (fileHash && !/^[0-9a-f]{64}$/.test(fileHash)) throw new PricelistError('Empreinte du fichier invalide.');
  const kept = lines.map(({ row, eanRepaired, previousNetPrice, ...l }) => l);
  return Object.freeze({
    id: newId(),
    supplierId: supplier.id,
    effectiveDate,
    importedAt: now.toISOString(),
    fileName: clean(fileName, 200) || null,
    fileHash: fileHash || null,
    profileVersion,
    lineCount: kept.length,
    lines: Object.freeze(kept.map((l) => Object.freeze(l))),
  });
}

/**
 * Une grille qui porte aussi l'ancien prix (colonne « prix précédent », cas BLANCHON et EXPERT
 * CLEAN : tarif de janvier et révision de mai) donne deux versions : la précédente, puis l'actuelle.
 */
export function pricelistsFromImport(input, { previousEffectiveDate = null, ...opts } = {}) {
  const current = buildPricelist(input, opts);
  const withPrev = input.lines.filter((l) => Number.isSafeInteger(l.previousNetPrice));
  if (!previousEffectiveDate || !withPrev.length) return [current];
  if (!isCalendarDate(previousEffectiveDate) || previousEffectiveDate >= input.effectiveDate)
    throw new PricelistError('La date du tarif précédent doit être antérieure à la date d’effet.');
  const previous = buildPricelist(
    { ...input, effectiveDate: previousEffectiveDate, lines: withPrev.map((l) => ({ ...l, netPrice: l.previousNetPrice, retailPrice: null })) },
    opts,
  );
  return [previous, current];
}

/** Grilles d'un fournisseur, de la plus ancienne à la plus récente (date d'effet, puis date d'import). */
export const supplierPricelists = (pricelists, supplierId) =>
  pricelists
    .filter((p) => p.supplierId === supplierId)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.importedAt.localeCompare(b.importedAt));

/** Grille en vigueur à une date (la plus récente dont la date d'effet est passée). */
export function pricelistAt(pricelists, supplierId, date) {
  return (
    supplierPricelists(pricelists, supplierId)
      .filter((p) => p.effectiveDate <= date)
      .at(-1) || null
  );
}

const variation = (a, b) => (a > 0 ? Math.round(((b - a) * 10000) / a) : null);

/**
 * Comparatif de deux versions : hausses, baisses, inchangés, nouveautés, retraits, variation moyenne.
 * Le prix comparé est le net (ou le brut si le fournisseur ne donne que le brut).
 */
export function comparePricelists(before, after) {
  const price = (l) => (Number.isSafeInteger(l.netPrice) ? l.netPrice : l.grossPrice);
  const old = new Map(before.lines.map((l) => [lineKey(l), l]));
  const out = { up: [], down: [], same: [], added: [], removed: [] };
  const seen = new Set();
  for (const l of after.lines) {
    const k = lineKey(l);
    seen.add(k);
    const o = old.get(k);
    if (!o) {
      out.added.push({ key: k, line: l });
      continue;
    }
    const [a, b] = [price(o), price(l)];
    const row = { key: k, line: l, before: a, after: b, variationBp: variation(a, b) };
    if (a === null || b === null || a === b) out.same.push(row);
    else (b > a ? out.up : out.down).push(row);
  }
  for (const [k, l] of old) if (!seen.has(k)) out.removed.push({ key: k, line: l });
  out.up.sort((x, y) => y.variationBp - x.variationBp);
  out.down.sort((x, y) => x.variationBp - y.variationBp);
  const changed = [...out.up, ...out.down, ...out.same].filter((r) => r.variationBp !== null);
  const totalBefore = changed.reduce((s, r) => s + r.before, 0);
  const totalAfter = changed.reduce((s, r) => s + r.after, 0);
  out.summary = {
    from: before.effectiveDate,
    to: after.effectiveDate,
    up: out.up.length,
    down: out.down.length,
    same: out.same.length,
    added: out.added.length,
    removed: out.removed.length,
    // Moyenne pondérée par les prix : une hausse de 10 % sur un pot de 200 € pèse plus que sur une brosse.
    averageBp: variation(totalBefore, totalAfter),
  };
  return out;
}

/** Évolution du prix d'une ligne (EAN ou référence) d'une version à l'autre, pour la fiche article. */
export function priceTimeline(pricelists, supplierId, key) {
  return supplierPricelists(pricelists, supplierId)
    .map((p) => {
      const l = p.lines.find((x) => lineKey(x) === key);
      return l ? { date: p.effectiveDate, pricelistId: p.id, netPrice: l.netPrice ?? null, grossPrice: l.grossPrice ?? null } : null;
    })
    .filter(Boolean);
}
