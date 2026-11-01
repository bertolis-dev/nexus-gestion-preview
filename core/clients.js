/**
 * Clients : synthèse par client (chiffre d'affaires, reste dû, délai de paiement, retards) et import
 * d'une liste de clients depuis un tableur (CSV exporté d'Excel, de Google Sheets ou d'un autre
 * logiciel de facturation).
 */

import { parseCsv } from './bank-import.js?v=e821f3b';
import { isValidSiren } from './invoices.js?v=e821f3b';
import { shiftMonth } from './stats.js?v=e821f3b';

const DAY = 86400000;

/** Factures, devis et avoirs émis ou en brouillon pour ce client (rattachés par son code). */
export const clientDocuments = (invoices, client) => invoices.filter((i) => i.client?.code === client.code);

/**
 * Synthèse d'un client. `book` est le carnet de factures (ws.book) : reste dû calculé par
 * book.outstanding(), qui tient compte des avoirs et des règlements partiels.
 */
export function clientSummary(book, client, today) {
  const docs = clientDocuments(book.invoices, client);
  const issued = docs.filter((i) => i.status === 'issued' && i.type !== 'quote');
  const depositNumbers = new Set(issued.filter((i) => i.type === 'deposit').map((i) => i.number));
  const sales = issued.filter((i) => i.type !== 'deposit' && !(i.type === 'credit' && depositNumbers.has(i.creditOf)));
  const since = `${shiftMonth(today.slice(0, 7), -11)}-01`;
  const ht = (i) => (i.type === 'credit' ? -1 : 1) * (i.totals?.totalHt || 0);
  const revenue12 = sales.filter((i) => i.issueDate >= since && i.issueDate <= today).reduce((s, i) => s + ht(i), 0);
  const revenueTotal = sales.reduce((s, i) => s + ht(i), 0);
  let outstanding = 0;
  let overdue = 0;
  for (const i of issued) {
    const due = book.outstanding(i);
    if (due <= 0) continue;
    outstanding += due;
    if (i.dueDate && i.dueDate < today) overdue += due;
  }
  const delays = [];
  for (const i of issued.filter((x) => x.type !== 'credit')) {
    const list = book.payments?.[i.id] || [];
    const net = i.totals?.netToPay ?? i.totals?.totalTtc ?? 0;
    if (!list.length || net <= 0 || list.reduce((s, p) => s + p.amount, 0) < net) continue;
    const last = list
      .map((p) => p.date)
      .sort()
      .at(-1);
    delays.push(Math.max(0, Math.round((Date.parse(last) - Date.parse(i.issueDate)) / DAY)));
  }
  return {
    client,
    revenue12,
    revenueTotal,
    outstanding,
    overdue,
    invoiceCount: issued.filter((i) => i.type !== 'credit').length,
    quoteCount: docs.filter((i) => i.type === 'quote').length,
    lastInvoiceDate:
      issued
        .map((i) => i.issueDate)
        .sort()
        .at(-1) || null,
    avgPaymentDays: delays.length ? Math.round(delays.reduce((s, d) => s + d, 0) / delays.length) : null,
  };
}

// ------------------------------------------------------------------ import

const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** En-têtes reconnus (sans accents ni ponctuation) pour chaque champ de la fiche client. */
const HEADERS = {
  name: ['nom', 'raisonsociale', 'client', 'societe', 'entreprise', 'name', 'denomination', 'nomduclient'],
  email: ['email', 'mail', 'courriel', 'adresseemail', 'adressemail', 'emailfacturation'],
  siren: ['siren', 'siret', 'nsiren', 'nsiret', 'numerosiren', 'numerosiret'],
  address: ['adresse', 'address', 'rue', 'adressepostale', 'adresse1'],
  postcode: ['codepostal', 'cp', 'postcode', 'zip'],
  city: ['ville', 'city', 'commune', 'localite'],
  country: ['pays', 'country', 'codepays'],
  vatNumber: ['tva', 'ntva', 'numerotva', 'tvaintracommunautaire', 'ntvaintracommunautaire', 'vat', 'vatnumber'],
  type: ['type', 'typedeclient', 'categorie'],
  firstName: ['prenom', 'firstname', 'prenomduclient'],
};

/** Noms de pays courants (sans accents ni ponctuation) → code ISO ; un code de 2 lettres est repris tel quel. */
const COUNTRY_NAMES = {
  france: 'FR',
  monaco: 'MC',
  belgique: 'BE',
  allemagne: 'DE',
  espagne: 'ES',
  italie: 'IT',
  luxembourg: 'LU',
  paysbas: 'NL',
  hollande: 'NL',
  portugal: 'PT',
  autriche: 'AT',
  irlande: 'IE',
  suede: 'SE',
  danemark: 'DK',
  finlande: 'FI',
  pologne: 'PL',
  grece: 'GR',
  tchequie: 'CZ',
  republiquetcheque: 'CZ',
  slovaquie: 'SK',
  slovenie: 'SI',
  hongrie: 'HU',
  roumanie: 'RO',
  bulgarie: 'BG',
  croatie: 'HR',
  estonie: 'EE',
  lettonie: 'LV',
  lituanie: 'LT',
  malte: 'MT',
  chypre: 'CY',
  royaumeuni: 'GB',
  angleterre: 'GB',
  grandebretagne: 'GB',
  suisse: 'CH',
  norvege: 'NO',
  etatsunis: 'US',
  usa: 'US',
  canada: 'CA',
  maroc: 'MA',
  tunisie: 'TN',
  algerie: 'DZ',
  senegal: 'SN',
  cotedivoire: 'CI',
  japon: 'JP',
  chine: 'CN',
  andorre: 'AD',
  liechtenstein: 'LI',
};

/** Code ISO du pays saisi (« FR », « France », « Pays-Bas »…), ou null s'il n'est pas reconnu. */
export function countryCode(raw) {
  const t = String(raw || '').trim();
  if (!t) return 'FR';
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return COUNTRY_NAMES[norm(t)] || null;
}

/**
 * Lit un fichier de clients. Renvoie les fiches prêtes à créer, les doublons ignorés (même SIREN ou
 * même nom qu'un client existant ou qu'une ligne précédente) et les lignes refusées avec leur motif.
 */
export function importClientsCsv(text, existing = []) {
  const firstLine = String(text).split(/\r?\n/, 1)[0];
  const sep = [';', '\t', ','].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const [head, ...rows] = parseCsv(String(text).replace(/^\uFEFF/, ''), sep);
  if (!head) return { clients: [], duplicates: [], errors: [{ line: 1, message: 'Fichier vide.' }] };
  const col = {};
  head.fields.forEach((h, i) => {
    const k = norm(h);
    for (const [field, names] of Object.entries(HEADERS)) if (col[field] === undefined && names.includes(k)) col[field] = i;
  });
  if (col.name === undefined) {
    return {
      clients: [],
      duplicates: [],
      errors: [{ line: head.line, message: 'Colonne du nom introuvable : la première ligne doit contenir un en-tête « Nom » (ou « Raison sociale »).' }],
    };
  }
  const seenSiren = new Set(existing.map((c) => c.siren).filter(Boolean));
  const seenName = new Set(existing.map((c) => norm(c.name)));
  const clients = [];
  const duplicates = [];
  const errors = [];
  for (const r of rows) {
    const get = (f) => (col[f] === undefined ? '' : (r.fields[col[f]] || '').trim());
    const firstName = get('firstName');
    const name = [firstName, get('name')].filter(Boolean).join(' ');
    if (!get('name')) {
      errors.push({ line: r.line, message: 'Nom manquant.' });
      continue;
    }
    const rawSiren = get('siren').replace(/\s/g, '');
    const siren = rawSiren ? rawSiren.slice(0, 9) : '';
    if (siren && !isValidSiren(siren)) {
      errors.push({ line: r.line, message: `${name} : SIREN ou SIRET invalide (${rawSiren}).` });
      continue;
    }
    const email = get('email');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.push({ line: r.line, message: `${name} : adresse e-mail invalide (${email}).` });
      continue;
    }
    if ((siren && seenSiren.has(siren)) || seenName.has(norm(name))) {
      duplicates.push({ line: r.line, name });
      continue;
    }
    const country = countryCode(get('country'));
    if (!country) {
      errors.push({ line: r.line, message: `${name} : pays non reconnu (${get('country')}) ; indiquez son code à 2 lettres (FR, BE, DE…).` });
      continue;
    }
    const type =
      /particulier|b2c|personne/i.test(get('type')) ||
      (!siren && (firstName || /^(m\.|mme|madame|monsieur)\s/i.test(name)) && !/entreprise|b2b|soci/i.test(get('type')))
        ? 'B2C'
        : 'B2B';
    const address = [get('address'), [get('postcode'), get('city')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const client = { name, type, country };
    if (siren) client.siren = siren;
    if (email) client.email = email;
    if (address) client.address = address;
    if (get('vatNumber')) client.vatNumber = get('vatNumber').replace(/\s/g, '').toUpperCase();
    clients.push(client);
    if (siren) seenSiren.add(siren);
    seenName.add(norm(name));
  }
  return { clients, duplicates, errors };
}
