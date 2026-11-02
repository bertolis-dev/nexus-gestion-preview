/**
 * Import des relevés bancaires (§3.4, secours de la synchronisation Qonto / agrégateur) : CSV des
 * principales banques françaises et OFX.
 *
 * Lecture tolérante mais jamais hasardeuse :
 *  - colonnes reconnues par leur nom exact (après normalisation), dans un ordre de priorité : la date
 *    d'opération prime sur la date de valeur, le libellé long sur le libellé court ;
 *  - lignes d'introduction (compte, solde) ignorées jusqu'à la ligne d'en-tête ;
 *  - guillemets, séparateur et retours à la ligne dans un libellé respectés ;
 *  - une ligne illisible est rejetée avec son numéro, sans faire échouer le fichier.
 *
 * L'import est idempotent : chaque transaction porte un identifiant stable (FITID OFX, ou empreinte
 * compte|date|montant|libellé|rang pour le CSV), et un ré-import ne crée aucun doublon.
 */

import { parisDateOf } from './dates.js?v=a619ec1';
import { parseEuros } from './money.js?v=a619ec1';

// ------------------------------------------------------------------ outils

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Identifiants d'une opération sans référence de la banque : empreinte 64 bits (deux FNV-1a de sens
 * opposés). L'ancienne empreinte 32 bits (`legacyId`) faisait se confondre des opérations distinctes
 * au-delà de quelques milliers ; elle sert encore à reconnaître les relevés déjà importés.
 */
function fingerprint(prefix, base) {
  let h = 0x6c62272e;
  for (let i = base.length - 1; i >= 0; i--) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return { id: `${prefix}-${fnv1a(base)}${h.toString(16).padStart(8, '0')}`, legacyId: `${prefix}-${fnv1a(base)}` };
}

/** Date d'un relevé → AAAA-MM-JJ ; refuse une date impossible (31/02). */
export function toIsoDate(s) {
  const t = String(s ?? '').trim();
  let y, mo, d;
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(t);
  if (m) [d, mo, y] = [m[1], m[2], m[3].length === 2 ? `20${m[3]}` : m[3]];
  else if ((m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(t))) [y, mo, d] = [m[1], m[2], m[3]];
  else throw new Error(`Date non reconnue : « ${s} »`);
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso) throw new Error(`Date impossible : « ${s} »`);
  return iso;
}

/** Octets d'un fichier → texte : UTF-8 si valide, sinon Windows-1252 (exports de nombreuses banques). */
export function decodeStatement(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    text = new TextDecoder('windows-1252').decode(data);
  }
  return text.replace(/^\uFEFF/, '');
}

/** Nom de colonne normalisé : sans accents, ponctuation, parenthèses ni unité (« Débit euros » → « debit »). */
const normHeader = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/ (eur|euro|euros)$/, '');

const cleanLabel = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Découpage CSV (RFC 4180) : guillemets doublés, séparateur et retours à la ligne entre guillemets.
 * Chaque enregistrement garde le numéro de sa première ligne dans le fichier.
 */
export function parseCsv(text, sep) {
  const records = [];
  let fields = [];
  let cur = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  const endField = () => {
    fields.push(cur);
    cur = '';
  };
  const endRecord = () => {
    endField();
    records.push({ line: start, fields: fields.map((f) => f.trim()) });
    fields = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else {
        if (ch === '\n') line++;
        cur += ch;
      }
    } else if (ch === '"') quoted = true;
    else if (ch === sep) endField();
    else if (ch === '\r' && text[i + 1] === '\n') continue;
    else if (ch === '\n' || ch === '\r') {
      endRecord();
      line++;
      start = line;
    } else cur += ch;
  }
  if (cur || fields.length) endRecord();
  // Excel : ="00012345" (valeur forcée en texte).
  for (const r of records) r.fields = r.fields.map((f) => f.replace(/^="(.*)"$/, '$1').replace(/^=/, ''));
  return records.filter((r) => r.fields.some((f) => f !== ''));
}

/** Séparateurs candidats, du plus fréquent au moins fréquent (hors guillemets, premières lignes). */
function separatorsByFrequency(text) {
  const sample = text
    .split(/\r?\n/)
    .slice(0, 30)
    .join('\n')
    .replace(/"[^"]*"/g, '');
  const count = (c) => sample.split(c).length - 1;
  return [';', '\t', ','].sort((a, b) => count(b) - count(a));
}

// ------------------------------------------------------------------ colonnes et profils de banques

// Noms reconnus, par ordre de priorité (le premier présent l'emporte).
const COLUMNS = {
  date: [
    'date operation',
    'date de l operation',
    'date d operation',
    'date de operation',
    'date de la transaction',
    'date transaction',
    'dateop',
    'operation date',
    'date comptable',
    'booking date',
    'date',
    'date de valeur',
    'date valeur',
    'dateval',
    'value date',
  ],
  label: [
    'libelle operation',
    'libelle de l operation',
    'libelle',
    'label',
    'intitule',
    'description',
    'libelle court',
    'nom de la contrepartie',
    'counterparty name',
    'tiers',
  ],
  detail: ['detail de l ecriture', 'detail', 'details', 'complement', 'libelle complementaire', 'reference', 'memo'],
  amount: ['montant', 'montant operation', 'montant de l operation', 'montant total ttc', 'montant total', 'amount', 'total amount incl vat', 'total amount'],
  debit: ['debit', 'montant debit', 'sortie', 'sorties'],
  credit: ['credit', 'montant credit', 'entree', 'entrees'],
  status: ['statut', 'status'],
};

const REJECTED_STATUS = new Set(['refuse', 'rejete', 'annule', 'declined', 'canceled', 'cancelled', 'reverted', 'en attente', 'pending']);

/**
 * Profils : banque reconnue à ses en-têtes caractéristiques, et règles propres (libellé composé,
 * opérations à ignorer). Formats à confirmer avec un vrai export (voir test/fixtures/banques).
 */
const PROFILES = [
  {
    bank: 'Qonto',
    match: (h) => h.includes('nom de la contrepartie') || h.includes('counterparty name'),
    label: ['nom de la contrepartie', 'counterparty name'],
  },
  { bank: 'Boursorama', match: (h) => h.includes('dateop') && h.includes('accountnum') },
  { bank: 'BNP Paribas', match: (h) => h.includes('libelle court') && h.includes('type operation') },
  { bank: 'Société Générale', match: (h) => h.includes('detail de l ecriture') },
  { bank: 'Crédit Agricole', match: (h, raw) => raw.includes('debit euros') && raw.includes('credit euros') },
  { bank: 'Shine', match: (h) => h.includes('date de la transaction') && h.includes('debit') },
];

function resolveColumns(header, profile) {
  const pick = (names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const label = pick(profile?.label || COLUMNS.label);
  const detail = pick(COLUMNS.detail);
  return {
    date: pick(COLUMNS.date),
    label,
    detail: detail === label ? -1 : detail,
    amount: pick(COLUMNS.amount),
    debit: pick(COLUMNS.debit),
    credit: pick(COLUMNS.credit),
    status: pick(COLUMNS.status),
  };
}

const usable = (c) => c.date >= 0 && c.label >= 0 && (c.amount >= 0 || c.debit >= 0 || c.credit >= 0);

/** Fichier sans en-tête (LCL) : date ; montant ; puis colonnes de texte. */
const looksHeaderless = (records) =>
  records.length > 0 &&
  records.slice(0, 5).every((r) => {
    try {
      toIsoDate(r.fields[0]);
      parseEuros(r.fields[1]);
      return r.fields.length >= 3;
    } catch {
      return false;
    }
  });

// ------------------------------------------------------------------ CSV

/** Ligne d'en-tête parmi les premières lignes : [indice, colonnes, profil de banque] ou [-1]. */
function findHeader(records) {
  for (let i = 0; i < Math.min(records.length, 15); i++) {
    const header = records[i].fields.map(normHeader);
    const raw = records[i].fields
      .map((f) =>
        f
          .normalize('NFD')
          .replace(/[\u0300-\u036F]/g, '')
          .toLowerCase(),
      )
      .join(';');
    const p = PROFILES.find((x) => x.match(header, raw)) || null;
    const c = resolveColumns(header, p);
    if (usable(c)) return [i, c, p];
  }
  return [-1, null, null];
}

/** Date « (UTC) » avec heure (Qonto) → date civile à Paris. */
function utcToParisDate(s) {
  const time = /[ T](\d{1,2}:\d{2}(?::\d{2})?)$/.exec(String(s).trim());
  if (!time) return toIsoDate(s);
  const [h, rest] = time[1].split(/:(.*)/);
  return parisDateOf(`${toIsoDate(s)}T${h.padStart(2, '0')}:${rest.length === 2 ? `${rest}:00` : rest}Z`);
}

function readCsv(text, accountId) {
  // Le séparateur le plus fréquent peut être celui des libellés (« DUPONT, JEAN, LOYER ») : on garde
  // le premier qui fait apparaître un en-tête utilisable.
  const separators = separatorsByFrequency(text);
  let records;
  let headerAt = -1;
  let cols = null;
  let profile = null;
  for (const sep of separators) {
    records = parseCsv(text, sep);
    [headerAt, cols, profile] = findHeader(records);
    if (headerAt >= 0) break;
  }
  if (headerAt < 0) records = parseCsv(text, separators[0]);
  const utcDates = headerAt >= 0 && /utc/i.test(records[headerAt].fields[cols.date] || '');
  let rows;
  let bank = profile?.bank || null;
  if (headerAt < 0) {
    if (!looksHeaderless(records)) throw new Error('Colonnes attendues introuvables : date, libellé et montant (ou débit/crédit)');
    bank = 'LCL';
    rows = records.map((r) => ({
      line: r.line,
      date: r.fields[0],
      amount: r.fields[1],
      label: r.fields
        .slice(2)
        .filter((f) => f && !/^-?\d+([.,]\d+)?$/.test(f))
        .slice(-1)
        .join(' '),
    }));
  } else {
    const at = (r, i) => (i >= 0 ? r.fields[i] || '' : '');
    rows = records.slice(headerAt + 1).map((r) => {
      const label = cleanLabel(at(r, cols.label));
      const detail = cleanLabel(at(r, cols.detail));
      return {
        line: r.line,
        date: at(r, cols.date),
        label: detail && !label.includes(detail) ? `${label} ${detail}` : label,
        amount: at(r, cols.amount),
        debit: at(r, cols.debit),
        credit: at(r, cols.credit),
        status: at(r, cols.status),
      };
    });
  }

  const transactions = [];
  const errors = [];
  let skipped = 0;
  const seen = new Map();
  for (const row of rows) {
    // Ligne sans date (total, solde, pied de relevé) : ce n'est pas une opération.
    if (!row.date) continue;
    if (row.status && REJECTED_STATUS.has(normHeader(row.status))) {
      skipped++;
      continue;
    }
    try {
      const date = utcDates ? utcToParisDate(row.date) : toIsoDate(row.date);
      let amount;
      if (row.amount) amount = parseEuros(row.amount);
      else if (row.debit || row.credit) amount = (row.credit ? Math.abs(parseEuros(row.credit)) : 0) - (row.debit ? Math.abs(parseEuros(row.debit)) : 0);
      else throw new Error('Montant manquant');
      const label = cleanLabel(row.label);
      if (!label) throw new Error('Libellé manquant');
      const base = `${accountId}|${date}|${amount}|${label}`;
      const rank = (seen.get(base) || 0) + 1;
      seen.set(base, rank);
      transactions.push({ ...fingerprint('csv', `${base}|${rank}`), accountId, date, label, amount, status: 'open' });
    } catch (err) {
      errors.push({ line: row.line, message: err.message });
    }
  }
  return { format: 'csv', bank, transactions, errors, skipped };
}

// ------------------------------------------------------------------ OFX

/**
 * OFX (SGML ou XML) : blocs <STMTTRN>, identifiant FITID, unique pour un compte seulement (d'où le
 * compte dans l'identifiant) ; à défaut de FITID, empreinte comme pour le CSV. Une ligne illisible
 * est signalée sans faire échouer le reste du fichier.
 */
function readOfx(text, accountId) {
  const tag = (block, name) => {
    const m = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block);
    return m ? m[1].trim() : '';
  };
  const transactions = [];
  const errors = [];
  const seen = new Map();
  for (const m of text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi)) {
    const b = m[1];
    try {
      const date = toIsoDate(tag(b, 'DTPOSTED'));
      const amount = parseEuros(tag(b, 'TRNAMT'));
      const label = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).map(xmlDecode).join(' ');
      const fitid = tag(b, 'FITID');
      let ids;
      if (fitid) ids = { id: `ofx-${accountId}-${fitid}`, legacyId: `ofx-${fitid}` };
      else {
        const base = `${accountId}|${date}|${amount}|${label}`;
        const rank = (seen.get(base) || 0) + 1;
        seen.set(base, rank);
        ids = fingerprint('ofx', `${base}|${rank}`);
      }
      transactions.push({ ...ids, accountId, date, label, amount, status: 'open' });
    } catch (err) {
      errors.push({ line: text.slice(0, m.index).split('\n').length, message: err.message });
    }
  }
  return { format: 'ofx', bank: null, transactions, errors, skipped: 0 };
}

/** OFX strict (démonstration, tests) : la moindre ligne illisible fait échouer. */
export function parseOfx(text, { accountId = 'default' } = {}) {
  const r = readOfx(text, accountId);
  if (r.errors.length) throw new Error(r.errors[0].message);
  return r.transactions;
}

// ------------------------------------------------------------------ CAMT.053 (ISO 20022)

// Caractère codé en chiffres (&#233; ou &#xE9;) ; hors Unicode : remplacé par « ? ».
const codePoint = (n) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '?');
const xmlDecode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#([0-9]{1,7});/g, (_, d) => codePoint(Number(d)))
    .replace(/&amp;/g, '&');

/** Contenu des éléments `name` (nom local, préfixe d'espace de noms ignoré), dans l'ordre. */
function xmlAll(xml, name) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]);
}
/** Texte du premier élément au bout du chemin (ex. 'BookgDt', 'Dt'). */
const xmlFirst = (xml, ...path) => {
  let cur = xml;
  for (const n of path) {
    cur = xmlAll(cur, n)[0];
    if (cur === undefined) return '';
  }
  return xmlDecode(cur.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
};
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * Relevé CAMT.053 (norme ISO 20022, proposé par la plupart des banques en remplacement de l'AFB120) :
 * une opération par <Ntry> ; seules les opérations comptabilisées (BOOK) sont importées.
 */
function readCamt(text, accountId) {
  const transactions = [];
  const errors = [];
  let skipped = 0;
  const seen = new Map();
  const re = /<(?:[\w.-]+:)?Ntry(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?Ntry>/g;
  for (const m of text.matchAll(re)) {
    const entry = m[1];
    const line = lineOf(text, m.index);
    try {
      const status = xmlFirst(entry, 'Sts');
      if (status && status !== 'BOOK') {
        skipped++;
        continue;
      }
      const amt = /<(?:[\w.-]+:)?Amt\s[^>]*Ccy="([A-Z]{3})"[^>]*>([^<]+)</.exec(entry);
      if (!amt) throw new Error('Montant manquant');
      if (amt[1] !== 'EUR') throw new Error(`Opération en ${amt[1]} : seuls les relevés en euros sont pris en charge`);
      const sign = xmlFirst(entry, 'CdtDbtInd');
      if (sign !== 'CRDT' && sign !== 'DBIT') throw new Error('Sens de l’opération (crédit ou débit) manquant');
      const abs = Math.abs(parseEuros(amt[2].trim()));
      const amount = sign === 'DBIT' ? -abs : abs;
      const date = toIsoDate(xmlFirst(entry, 'BookgDt', 'Dt') || xmlFirst(entry, 'BookgDt', 'DtTm') || xmlFirst(entry, 'ValDt', 'Dt'));
      const party = sign === 'DBIT' ? xmlFirst(entry, 'RltdPties', 'Cdtr', 'Nm') : xmlFirst(entry, 'RltdPties', 'Dbtr', 'Nm');
      const remittance = xmlAll(entry, 'Ustrd')
        .map((u) => xmlDecode(u).trim())
        .join(' ');
      const label = cleanLabel([party, remittance].filter(Boolean).join(' ') || xmlFirst(entry, 'AddtlNtryInf') || xmlFirst(entry, 'AddtlTxInf'));
      if (!label) throw new Error('Libellé manquant');
      // Référence de la banque : identifiant stable ; à défaut, empreinte comme pour le CSV.
      const ref = xmlFirst(entry, 'AcctSvcrRef');
      // La référence n'est unique que pour un compte : le compte fait partie de l'identifiant.
      let ids;
      if (ref) ids = { id: `camt-${accountId}-${ref}`, legacyId: `camt-${ref}` };
      else {
        const base = `${accountId}|${date}|${amount}|${label}`;
        const rank = (seen.get(base) || 0) + 1;
        seen.set(base, rank);
        ids = fingerprint('camt', `${base}|${rank}`);
      }
      transactions.push({ ...ids, accountId, date, label, amount, status: 'open' });
    } catch (err) {
      errors.push({ line, message: err.message });
    }
  }
  return { format: 'camt.053', bank: null, iban: xmlFirst(text, 'Acct', 'Id', 'IBAN') || null, transactions, errors, skipped };
}

// ------------------------------------------------------------------ QIF

/**
 * QIF (Quicken) : un enregistrement par bloc terminé par « ^ » ; D date, T montant, P tiers, M mémo.
 * Les banques françaises écrivent JJ/MM/AAAA ; le format américain M/J'AA est reconnu à l'apostrophe.
 */
function readQif(text, accountId) {
  const transactions = [];
  const errors = [];
  const seen = new Map();
  let rec = {};
  let start = 1;
  const flush = () => {
    if (!rec.D && !rec.T) return;
    try {
      const us = /^(\d{1,2})\/(\d{1,2})'(\d{2}|\d{4})$/.exec((rec.D || '').trim());
      const date = us ? toIsoDate(`${us[2]}/${us[1]}/${us[3].length === 2 ? `20${us[3]}` : us[3]}`) : toIsoDate(rec.D);
      if (!rec.T) throw new Error('Montant manquant');
      const amount = parseEuros(rec.T);
      const label = cleanLabel([rec.P, rec.M].filter(Boolean).join(' '));
      if (!label) throw new Error('Libellé manquant');
      const base = `${accountId}|${date}|${amount}|${label}`;
      const rank = (seen.get(base) || 0) + 1;
      seen.set(base, rank);
      transactions.push({ ...fingerprint('qif', `${base}|${rank}`), accountId, date, label, amount, status: 'open' });
    } catch (err) {
      errors.push({ line: start, message: err.message });
    }
  };
  text.split(/\r?\n/).forEach((raw, i) => {
    const l = raw.trim();
    if (!l || l.startsWith('!')) return;
    if (l === '^') {
      flush();
      rec = {};
      return;
    }
    if (!Object.keys(rec).length) start = i + 1;
    const key = l[0];
    if ('DTPM'.includes(key) && rec[key] === undefined) rec[key] = l.slice(1);
  });
  flush();
  return { format: 'qif', bank: null, transactions, errors, skipped: 0 };
}

// ------------------------------------------------------------------ point d'entrée

/**
 * Lit un relevé (texte déjà décodé, voir decodeStatement) : format détecté automatiquement.
 * @returns {{ format: string, bank: string|null, iban?: string|null, transactions: object[], errors: {line:number,message:string}[], skipped: number }}
 */
export function importStatement(text, { accountId = 'default' } = {}) {
  const t = String(text).replace(/^\uFEFF/, '');
  if (/<OFX|<STMTTRN/i.test(t)) return readOfx(t, accountId);
  if (/camt\.053|<(?:[\w.-]+:)?BkToCstmrStmt/.test(t)) return readCamt(t, accountId);
  if (/^\s*!Type:/i.test(t)) return readQif(t, accountId);
  return readCsv(t, accountId);
}

/** Import CSV strict (démonstration, tests) : la moindre ligne illisible fait échouer. */
export function parseBankCsv(text, { accountId = 'default' } = {}) {
  const r = readCsv(String(text).replace(/^\uFEFF/, ''), accountId);
  if (r.errors.length) throw new Error(`Relevé illisible, ligne ${r.errors[0].line} : ${r.errors[0].message}`);
  return r.transactions;
}
