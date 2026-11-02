/**
 * Micro-entrepreneur (§1, §3.7) : livre des recettes (encaissements), registre des achats,
 * montant à déclarer à l'URSSAF par période, suivi des seuils.
 * Les seuils sont des paramètres datés, à faire valider par l'expert-comptable référent (§2) avant
 * mise en service : la réforme de la franchise en base a été plusieurs fois modifiée en 2025.
 */

import { divRound, sum } from './money.js?v=a619ec1';

export const THRESHOLDS_2026 = {
  // Franchise en base de TVA (CGI art. 293 B) — seuil de base / seuil majoré
  vatFranchise: {
    biens: { base: 8500000, majore: 9350000 },
    services: { base: 3750000, majore: 4125000 },
  },
  // Plafonds de chiffre d'affaires du régime micro, revalorisés pour 2026-2028 (203 100 € / 83 600 €,
  // contre 188 700 € / 77 700 € en 2023-2025 ; CGI art. 50-0 et 102 ter) — à valider par l'expert-comptable.
  microRegime: { biens: 20310000, services: 8360000 },
};

/** Activité URSSAF : vente de marchandises (BIC), prestations BIC, prestations BNC. */
export const ACTIVITY_TYPES = {
  'bic-vente': { label: 'Ventes de marchandises (BIC)', family: 'biens' },
  'bic-services': { label: 'Prestations de services commerciales ou artisanales (BIC)', family: 'services' },
  bnc: { label: 'Prestations de services libérales (BNC)', family: 'services' },
};

/**
 * Livre des recettes : une ligne par encaissement (date, référence, client, montant, mode).
 * @param {{date, invoiceNumber, clientName, amount, method, activity}[]} receipts
 */
export function receiptsBook(receipts, { from, to } = {}) {
  const rows = receipts.filter((r) => (!from || r.date >= from) && (!to || r.date <= to)).sort((a, b) => a.date.localeCompare(b.date));
  return { rows, total: sum(rows.map((r) => r.amount)) };
}

export function purchasesRegister(purchases, { from, to } = {}) {
  const rows = purchases.filter((p) => (!from || p.date >= from) && (!to || p.date <= to)).sort((a, b) => a.date.localeCompare(b.date));
  return { rows, total: sum(rows.map((p) => p.amount)) };
}

/** Périodes de déclaration URSSAF : mensuelle ou trimestrielle. */
export function declarationPeriods(year, frequency = 'trimestrielle') {
  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = (m) => new Date(Date.UTC(year, m, 0)).getUTCDate();
  if (frequency === 'mensuelle') {
    return Array.from({ length: 12 }, (_, i) => ({
      label: `${pad(i + 1)}/${year}`,
      from: `${year}-${pad(i + 1)}-01`,
      to: `${year}-${pad(i + 1)}-${lastDay(i + 1)}`,
    }));
  }
  return [1, 2, 3, 4].map((q) => ({ label: `T${q} ${year}`, from: `${year}-${pad(q * 3 - 2)}-01`, to: `${year}-${pad(q * 3)}-${lastDay(q * 3)}` }));
}

/**
 * Date limite de déclaration et de paiement URSSAF d'une période : dernier jour du mois qui suit
 * la fin du trimestre (30 avril, 31 juillet, 31 octobre, 31 janvier) ou du mois déclaré.
 */
export function urssafDeadline(period) {
  const [y, m] = period.to.split('-').map(Number);
  return new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
}

/** Montants à déclarer à l'URSSAF par type d'activité sur une période (chiffre d'affaires encaissé). */
export function urssafDeclaration(receipts, period) {
  const inPeriod = receipts.filter((r) => r.date >= period.from && r.date <= period.to);
  const byActivity = {};
  for (const type of Object.keys(ACTIVITY_TYPES)) {
    byActivity[type] = sum(inPeriod.filter((r) => r.activity === type).map((r) => r.amount));
  }
  return { period, byActivity, total: sum(Object.values(byActivity)) };
}

/**
 * Suivi des seuils sur l'année civile : alerte à 80 % du seuil de base, dépassement du seuil de
 * base (franchise maintenue l'année suivante perdue) et du seuil majoré (perte immédiate).
 */
export function thresholdStatus(receipts, year, thresholds = THRESHOLDS_2026) {
  const inYear = receipts.filter((r) => r.date.startsWith(String(year)));
  const ca = { biens: 0, services: 0 };
  for (const r of inYear) ca[ACTIVITY_TYPES[r.activity]?.family || 'services'] += r.amount;
  const status = (amount, t) => {
    if (amount > t.majore) return 'depasse-majore';
    if (amount > t.base) return 'depasse-base';
    if (amount >= divRound(t.base * 80, 100)) return 'alerte-80';
    return 'ok';
  };
  const mixed = ca.biens > 0 && ca.services > 0;
  const total = ca.biens + ca.services;
  return {
    ca,
    vat: {
      // Activité mixte : le total ne doit pas dépasser le seuil « biens » et la part services le seuil « services ».
      biens: status(mixed ? total : ca.biens, thresholds.vatFranchise.biens),
      services: status(ca.services, thresholds.vatFranchise.services),
    },
    microRegime: {
      biens: (mixed ? total : ca.biens) > thresholds.microRegime.biens ? 'depasse' : 'ok',
      services: ca.services > thresholds.microRegime.services ? 'depasse' : 'ok',
    },
  };
}

// ------------------------------------------------------------------ estimation des cotisations

/**
 * Taux de cotisations du micro-entrepreneur, en points de base du chiffre d'affaires encaissé.
 * Paramètres datés : À VALIDER PAR L'EXPERT-COMPTABLE RÉFÉRENT (§2) avant mise en service.
 * Relevés au 29/09/2026 (URSSAF, service-public.gouv.fr, sources concordantes) ; le taux BNC du
 * régime général a été arrêté à 25,6 % par le décret n° 2025-943 (et non 26,1 % comme prévu).
 * `null` = valeur non encore validée : l'estimation l'exclut et le signale dans `missing`.
 */
export const CONTRIBUTION_RATES_2026 = {
  validFrom: '2026-01-01',
  // Cotisations et contributions sociales (dont CSG-CRDS)
  social: { 'bic-vente': 1230, 'bic-services': 2120, bnc: { general: 2560, cipav: 2320 } },
  // Contribution à la formation professionnelle — à valider (valeur non fournie)
  cfp: { commercant: null, artisan: null, liberal: null },
  // Versement libératoire de l'impôt sur le revenu — à valider (valeur non fournie)
  liberatoire: { 'bic-vente': null, 'bic-services': null, bnc: null },
  // Taxe pour frais de chambre consulaire (CCI, CMA) — à valider (valeur non fournie)
  chamber: { commercant: null, artisan: null },
};

/**
 * ACRE : exonération partielle des cotisations sociales en début d'activité.
 * À VALIDER PAR L'EXPERT-COMPTABLE RÉFÉRENT. Taux selon la date de début d'activité (décret
 * n° 2026-69 du 6 février 2026 : 25 % pour les créations à compter du 1er juillet 2026, 50 % avant).
 * `duration` (nombre de trimestres civils suivant celui du début) : non fournie, à valider ; en
 * attendant, la date de fin est celle que l'utilisateur recopie de son attestation URSSAF.
 */
export const ACRE_2026 = {
  exemption: [
    { startedTo: '2026-06-30', bp: 5000 },
    { startedFrom: '2026-07-01', bp: 2500 },
  ],
  duration: null,
};

/**
 * Professions libérales réglementées relevant de la CIPAV (art. L.640-1 du code de la sécurité
 * sociale) — à valider par l'expert-comptable référent : liste non encore fournie.
 */
export const CIPAV_PROFESSIONS = [];

export const DEFAULT_MICRO_PARAMS = { rates: CONTRIBUTION_RATES_2026, acre: ACRE_2026 };

/** Ce qu'une estimation n'a pas pu inclure, en langage courant. */
export const ESTIMATE_MISSING_LABELS = {
  cfp: 'la contribution à la formation professionnelle',
  liberatoire: 'le versement libératoire de l’impôt',
  chambre: 'la taxe pour frais de chambre consulaire',
  'acre-fin': 'la date de fin de votre ACRE',
};

/** Fin de l'ACRE calculée par la règle datée (fin du N-ième trimestre civil suivant le début), ou null si la règle n'est pas validée. */
export function acreEndDate(acreStart, params = DEFAULT_MICRO_PARAMS) {
  const n = params.acre.duration;
  if (!acreStart || !Number.isSafeInteger(n)) return null;
  const [y, m] = acreStart.split('-').map(Number);
  const quarterEndMonth = Math.ceil(m / 3) * 3 + n * 3; // mois (1-12, puis au-delà) de fin du trimestre visé
  return new Date(Date.UTC(y, quarterEndMonth, 0)).toISOString().slice(0, 10);
}

const cfpFamily = (activity, artisan) => (activity === 'bnc' ? 'liberal' : activity === 'bic-services' && artisan ? 'artisan' : 'commercant');
const part = (base, bp) => divRound(base * bp, 10000);

/**
 * Estimation des cotisations dues sur un chiffre d'affaires encaissé (centimes).
 * options : { acreStart, acreEnd, versementLiberatoire, retraite: 'general' | 'cipav', artisan }.
 * `date` : fin de la période estimée (l'ACRE ne s'applique que pendant sa durée).
 * Renvoie le détail en centimes et `missing` : ce qui n'a pas pu être inclus faute de valeur validée.
 */
export function estimateContributions(turnover, activity, options = {}, date, params = DEFAULT_MICRO_PARAMS) {
  if (!Number.isSafeInteger(turnover) || turnover < 0) throw new Error('Le chiffre d’affaires doit être un montant positif.');
  if (!ACTIVITY_TYPES[activity]) throw new Error('Choisissez votre activité dans les paramètres (vente, prestations commerciales ou libérales).');
  const { rates, acre } = params;
  const missing = [];
  const socialBp = activity === 'bnc' ? rates.social.bnc[options.retraite === 'cipav' ? 'cipav' : 'general'] : rates.social[activity];
  const social = part(turnover, socialBp);

  let acreBp = 0;
  if (options.acreStart && date && date >= options.acreStart) {
    const end = options.acreEnd || acreEndDate(options.acreStart, params);
    if (!end) missing.push('acre-fin');
    if (!end || date <= end) {
      acreBp =
        acre.exemption.find((r) => (!r.startedTo || options.acreStart <= r.startedTo) && (!r.startedFrom || options.acreStart >= r.startedFrom))?.bp || 0;
    }
  }
  const acreReduction = part(social, acreBp);

  const family = cfpFamily(activity, options.artisan);
  const cfpBp = rates.cfp[family];
  if (cfpBp === null || cfpBp === undefined) missing.push('cfp');
  const cfp = cfpBp ? part(turnover, cfpBp) : 0;

  let liberatoireBp = 0;
  if (options.versementLiberatoire) {
    liberatoireBp = rates.liberatoire[activity];
    if (liberatoireBp === null || liberatoireBp === undefined) missing.push('liberatoire');
  }
  const liberatoire = liberatoireBp ? part(turnover, liberatoireBp) : 0;

  // Les professions libérales ne relèvent d'aucune chambre consulaire.
  const chamberBp = family === 'liberal' ? 0 : rates.chamber[family];
  if (chamberBp === null || chamberBp === undefined) missing.push('chambre');
  const chamber = chamberBp ? part(turnover, chamberBp) : 0;

  return {
    turnover,
    social,
    acreReduction,
    cfp,
    liberatoire,
    chamber,
    total: social - acreReduction + cfp + liberatoire + chamber,
    rates: { socialBp, acreBp, cfpBp: cfpBp || 0, liberatoireBp: liberatoireBp || 0, chamberBp: chamberBp || 0 },
    missing,
  };
}

// ------------------------------------------------------------------ franchise de TVA : réponses directes

export const FRANCHISE_INVOICE_MENTION = 'TVA non applicable, art. 293 B du CGI';

/**
 * Message en langage courant sur la franchise de TVA, selon le statut renvoyé par thresholdStatus.
 * Règle appliquée (art. 293 B du CGI) — À VALIDER PAR L'EXPERT-COMPTABLE RÉFÉRENT : la franchise
 * s'applique l'année N si le chiffre d'affaires N-1 ne dépasse pas le seuil de base, ou s'il ne
 * dépasse pas le seuil majoré et que celui de N-2 ne dépassait pas le seuil de base. Le dépassement
 * du seuil majoré met fin à la franchise dès l'opération qui le fait dépasser.
 * Régime appliqué par défaut à la sortie : réel simplifié (CA12 annuelle et deux acomptes).
 * @param {'ok'|'alerte-80'|'depasse-base'|'depasse-majore'} status
 * @param {'biens'|'services'} family
 * @param {{ year: number, previousYearOverBase: boolean|null, thresholds? }} ctx  null = année précédente inconnue de Nexus
 */
export function vatFranchiseMessage(status, family, { year, previousYearOverBase = null, thresholds = THRESHOLDS_2026 } = {}) {
  const t = thresholds.vatFranchise[family];
  const eur = (c) => `${((c - (c % 100)) / 100).toLocaleString('fr-FR')} €`;
  const inFranchise = 'Vous êtes en franchise de TVA : aucune déclaration de TVA à faire.';
  const mention = `Vos factures doivent porter la mention « ${FRANCHISE_INVOICE_MENTION} » (Nexus l’ajoute automatiquement).`;
  const regimeAfter =
    'Régime appliqué par défaut : le réel simplifié, avec une déclaration de TVA annuelle (CA12) et deux acomptes, en juillet et en décembre.';
  const action = 'Parlez-en à votre expert-comptable avant la date de sortie : il vous dira si ce régime vous convient et comment adapter vos prix.';
  if (status === 'ok') return { level: 'ok', headline: inFranchise, consequence: mention, regimeAfter: null, action: null };
  if (status === 'alerte-80') {
    return {
      level: 'alerte',
      headline: inFranchise,
      consequence: `Vous avez atteint 80 % du seuil de ${eur(t.base)}. ${mention}`,
      regimeAfter: null,
      action: `Au-delà de ${eur(t.base)} cette année, vous risquez de devoir facturer la TVA : surveillez vos encaissements des prochains mois.`,
    };
  }
  if (status === 'depasse-majore') {
    return {
      level: 'sortie',
      headline: 'Vous n’êtes plus en franchise de TVA.',
      consequence: `Votre chiffre d’affaires de l’année dépasse le seuil majoré de ${eur(t.majore)} : la franchise prend fin dès l’opération qui a fait dépasser ce seuil. À partir de là, vos factures doivent comporter la TVA et vous devez la déclarer.`,
      regimeAfter,
      action:
        'Parlez-en rapidement à votre expert-comptable : il vous aidera à facturer la TVA à partir de cette date et à choisir votre régime de déclaration.',
    };
  }
  // Dépassement du seuil de base seulement : tout dépend de l'année précédente.
  const next = year ? `au 1er janvier ${year + 1}` : 'au 1er janvier prochain';
  const consequence =
    previousYearOverBase === true
      ? `Votre chiffre d’affaires dépasse le seuil de ${eur(t.base)} pour la deuxième année de suite : la franchise prend fin ${next}. Vous restez en franchise jusqu’au 31 décembre.`
      : previousYearOverBase === false
        ? `Votre chiffre d’affaires dépasse le seuil de ${eur(t.base)} (sans dépasser ${eur(t.majore)}) : vous restez en franchise cette année et l’an prochain. Si vous le dépassez encore l’an prochain, la franchise prendra fin le 1er janvier suivant.`
        : `Votre chiffre d’affaires dépasse le seuil de ${eur(t.base)} (sans dépasser ${eur(t.majore)}) : vous restez en franchise jusqu’au 31 décembre. Si votre chiffre d’affaires de l’an dernier dépassait déjà ce seuil, la franchise prend fin ${next} ; sinon, elle est maintenue un an de plus.`;
  return { level: previousYearOverBase === false ? 'alerte' : 'sortie', headline: 'Seuil de franchise de TVA dépassé.', consequence, regimeAfter, action };
}

// ---------------------------------------------------------------- rappels et déclaration de revenus

/**
 * Cotisation foncière des entreprises : paiement au 15 décembre, rappel à partir de la mi-novembre ;
 * pas de CFE l'année de création. Paramètres datés, à valider par l'expert-comptable.
 */
export const CFE_2026 = { year: 2026, reminderFrom: '11-15', paymentDeadline: '12-15', firstYearExempt: true, validation: 'à valider par l’expert-comptable' };

/**
 * Déclaration annuelle des revenus : période de rappel (les dates limites varient selon le
 * département). Paramètre daté, à valider par l'expert-comptable.
 */
export const INCOME_DECLARATION_2026 = { year: 2026, from: '04-10', to: '06-10', validation: 'à valider par l’expert-comptable' };

const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const plusDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Rappel CFE dans « À faire », ou null. */
export function cfeReminder({ today, activityStart = null, params = CFE_2026 }) {
  const year = today.slice(0, 4);
  const deadline = `${year}-${params.paymentDeadline}`;
  if (today < `${year}-${params.reminderFrom}` || today > deadline) return null;
  if (params.firstYearExempt && activityStart && activityStart.slice(0, 4) === year) return null;
  const note = activityStart ? '' : ' (sauf l’année de création)';
  return {
    urgency: 2,
    kind: 'cfe',
    view: 'urssaf',
    text: `CFE à payer avant le ${ddmm(deadline)}${note} : avis dans votre espace professionnel impots.gouv.fr`,
  };
}

/** Rappel de fin d'ACRE dans les 60 jours qui précèdent, ou null. */
export function acreReminder({ today, acreEnd }) {
  if (!acreEnd || today > acreEnd || plusDays(today, 60) < acreEnd) return null;
  return {
    urgency: 1,
    kind: 'acre',
    view: 'urssaf',
    text: `Fin de votre ACRE le ${ddmm(acreEnd)} : vos cotisations passeront ensuite au taux normal, prévoyez-le`,
  };
}

/** Chiffre d'affaires encaissé d'une année, par activité, à reporter sur la déclaration de revenus. */
export function incomeDeclaration(receipts, year) {
  const byActivity = new Map();
  for (const r of receipts) if (r.date.startsWith(String(year))) byActivity.set(r.activity, (byActivity.get(r.activity) || 0) + r.amount);
  const list = [...byActivity]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([activity, amount]) => ({ activity, label: ACTIVITY_TYPES[activity]?.label || activity, amount }));
  return { year, byActivity: list, total: sum(list.map((a) => a.amount)) };
}

/** Rappel de la déclaration de revenus (avril à juin), ou null. */
export function incomeDeclarationReminder({ today, declaration, params = INCOME_DECLARATION_2026 }) {
  const year = today.slice(0, 4);
  if (!declaration?.total || today < `${year}-${params.from}` || today > `${year}-${params.to}`) return null;
  return {
    urgency: 1,
    kind: 'revenus',
    view: 'urssaf',
    text: `Déclaration de revenus : reportez votre chiffre d’affaires ${declaration.year} (détail dans « URSSAF et seuils »)`,
  };
}
