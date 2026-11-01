/**
 * Pont vers Supabase : authentification (mot de passe + code TOTP obligatoire), chargement de l'état
 * depuis la base et file d'envoi des opérations produites par core/sync.js.
 *
 * Modèle : cache local optimiste. Chaque action du dirigeant s'applique immédiatement au Workspace
 * (l'interface reste synchrone), puis son plan d'opérations rejoint une file persistée dans le
 * navigateur et envoyée dans l'ordre. En cas de refus serveur, la file s'arrête (jamais d'envoi
 * dans le désordre) et l'interface affiche le problème ; en cas de divergence (numéro de facture,
 * nombre d'écritures validées), l'état est rechargé depuis la base, qui fait foi.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=d415f7a';
import { stateFromRows, refusedUpdate } from '../core/sync.js?v=d415f7a';
import { Outbox as CoreOutbox, memoryLock, purgeOutboxes, pendingOutboxOps, OUTBOX_PREFIX } from '../core/outbox.js?v=d415f7a';
import { ACCOUNTS } from '../core/pcg.js?v=d415f7a';
import { mfaState, canRemoveFactor } from '../core/mfa.js?v=d415f7a';

// supabase-js (copie locale, app/vendor/) n'est chargé qu'en mode connecté : la démonstration et
// le site public ne téléchargent pas ces 220 Ko.
let client = null;
const authListeners = [];
async function connect() {
  if (!client) {
    const { createClient } = await import('./vendor/supabase.js?v=d415f7a');
    // Session gardée dans le navigateur et renouvelée automatiquement : on reste connecté d'une visite
    // à l'autre, jusqu'à « Se déconnecter » (comme Nexus RH).
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage },
    });
    for (const cb of authListeners) client.auth.onAuthStateChange(cb);
  }
  return client;
}

/** Client supabase-js (chargé à la demande) pour les modules qui lisent leurs propres tables (Articles). */
export const supabaseClient = connect;

/** Une session est enregistrée dans ce navigateur (l'utilisateur ne s'est pas déconnecté). */
export function hasStoredSession() {
  try {
    return Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k));
  } catch {
    return false;
  }
}

/** Panne passagère (réseau, service lent) : la session n'est pas en cause, on réessaie. */
export function isTransient(error) {
  const msg = `${error?.name || ''} ${error?.message || error || ''}`;
  return (
    error?.message === UNREACHABLE_MESSAGE || /Retryable|Failed to fetch|NetworkError|Load failed|fetch failed|timeout|ERR_/i.test(msg) || error?.status >= 500
  );
}

/** Une session (ou un retour de lien e-mail) peut exister : sinon, inutile de charger supabase-js. */
function mayHaveSession() {
  try {
    if (Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k))) return true;
  } catch {
    return true;
  }
  return /access_token|refresh_token|error_description|type=recovery/.test(location.hash) || /[?&](code|error)=/.test(location.search);
}

const siteBase = () => window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

// ------------------------------------------------------------------ messages d'erreur lisibles

const AUTH_MESSAGES = [
  [/Invalid login credentials/i, 'E-mail ou mot de passe incorrect.'],
  [/Email not confirmed/i, 'Votre adresse e-mail n’est pas encore confirmée : cliquez sur le lien reçu par e-mail.'],
  [/User already registered/i, 'Un compte existe déjà avec cette adresse : connectez-vous.'],
  [/Password should be at least/i, 'Le mot de passe doit contenir au moins 8 caractères.'],
  [/rate limit|too many/i, 'Trop de tentatives : patientez quelques minutes avant de réessayer.'],
  [/Invalid TOTP code|invalid.*code/i, 'Code incorrect : vérifiez l’heure de votre téléphone et saisissez le code affiché.'],
  [/Failed to fetch|NetworkError|Load failed|fetch failed/i, 'Connexion impossible : vérifiez votre accès à internet. La démonstration reste disponible.'],
];
export function friendly(error) {
  const msg = error?.message || String(error);
  return AUTH_MESSAGES.find(([re]) => re.test(msg))?.[1] || msg;
}
const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// ------------------------------------------------------------------ authentification

export async function signUp(email, password) {
  const supabase = await connect();
  return check(await supabase.auth.signUp({ email, password, options: { emailRedirectTo: siteBase() } }));
}
export async function signIn(email, password) {
  const supabase = await connect();
  return check(await supabase.auth.signInWithPassword({ email, password }));
}
/** Déconnexion : session fermée sur le serveur si possible, et dans tous les cas effacée du navigateur. */
export async function signOut() {
  const supabase = await connect();
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: 'local' });
  purgeOutboxes(localStorage);
}
/** Modifications pas encore envoyées, toutes entreprises confondues (perdues si l'on se déconnecte). */
export function pendingEverywhere() {
  try {
    return pendingOutboxOps(localStorage);
  } catch {
    return 0;
  }
}
export async function resendConfirmation(email) {
  const supabase = await connect();
  return check(await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: siteBase() } }));
}
export async function resetPassword(email) {
  const supabase = await connect();
  return check(await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteBase() }));
}
export async function updatePassword(password) {
  const supabase = await connect();
  return check(await supabase.auth.updateUser({ password }));
}
/** Au-delà, la base est considérée comme injoignable (le renouvellement de session réessaie sinon longtemps). */
export const SESSION_TIMEOUT_MS = 8000;
export const UNREACHABLE_MESSAGE =
  'Le service Nexus Gestion est momentanément injoignable : vérifiez votre connexion ou réessayez dans quelques minutes. La démonstration reste disponible.';

export async function currentSession() {
  if (!client && !mayHaveSession()) return null;
  const supabase = await connect();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(UNREACHABLE_MESSAGE)), SESSION_TIMEOUT_MS);
  });
  try {
    return check(await Promise.race([supabase.auth.getSession(), timeout])).session;
  } finally {
    clearTimeout(timer);
  }
}
export function onAuthChange(cb) {
  const listener = (event, session) => cb(event, session);
  authListeners.push(listener);
  if (client) client.auth.onAuthStateChange(listener);
}

/** État de la double authentification (core/mfa.js) : 'enroll', 'challenge' ou 'ok', appareils enregistrés. */
export async function mfaStatus() {
  const supabase = await connect();
  const aal = check(await supabase.auth.mfa.getAuthenticatorAssuranceLevel());
  const factors = check(await supabase.auth.mfa.listFactors());
  return mfaState(aal, factors.totp);
}

/** Retire un appareil ; jamais le dernier (sinon la double authentification serait à refaire). */
export async function mfaRemove(factorId) {
  const supabase = await connect();
  const factors = check(await supabase.auth.mfa.listFactors());
  if (!canRemoveFactor(factors.totp, factorId)) throw new Error('Gardez au moins une application d’authentification.');
  return check(await supabase.auth.mfa.unenroll({ factorId }));
}

export async function mfaEnroll(name = `Nexus Gestion ${new Date().toISOString().slice(0, 10)}`) {
  const supabase = await connect();
  // Nettoie un éventuel enrôlement commencé puis abandonné (facteur non vérifié).
  const factors = check(await supabase.auth.mfa.listFactors());
  for (const f of factors.all || []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  const data = check(await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: name }));
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function mfaVerify(factorId, code) {
  const supabase = await connect();
  return check(await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') }));
}

// ------------------------------------------------------------------ structure et chargement

/** Structure(s) accessibles à l'utilisateur connecté (RLS : uniquement les siennes). */
export async function listStructures() {
  const supabase = await connect();
  return check(await supabase.from('structures').select('id, name, siren').order('created_at'));
}

export async function createStructure(company) {
  const supabase = await connect();
  const { name, siren, legalForm, taxRegime, vatRegime, fiscalYear, ...settings } = company;
  return check(
    await supabase.rpc('create_structure', {
      p_siren: siren,
      p_name: name,
      p_legal_form: legalForm,
      p_tax_regime: taxRegime,
      p_vat_regime: vatRegime,
      p_fy_start: fiscalYear.start,
      p_fy_end: fiscalYear.end,
      p_accounts: ACCOUNTS,
      p_settings: settings,
    }),
  );
}

async function all(query) {
  // PostgREST plafonne les réponses (1000 lignes par défaut) : lecture par pages.
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(await query().range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function loadStructure(structureId) {
  const supabase = await connect();
  const eq =
    (table, cols = '*') =>
    () =>
      supabase.from(table).select(cols).eq('structure_id', structureId);
  // Exercice ouvert d'abord : seules ses écritures sont chargées (les exercices clos restent en base).
  const fiscalYears = check(
    await supabase.from('fiscal_years').select('*').eq('structure_id', structureId).is('closed_at', null).order('start_date', { ascending: false }),
  );
  const fiscalYear = fiscalYears[0];
  if (!fiscalYear) throw new Error('Aucun exercice ouvert pour cette entreprise.');
  const [structure, banks, entries, invoices, counters, settlements, clients, purchases, transactions, recurring, documents, events] = await Promise.all([
    supabase.from('structures').select('*').eq('id', structureId).single().then(check),
    supabase.from('bank_accounts').select('*').eq('structure_id', structureId).order('created_at').then(check),
    all(() => eq('entries', '*, entry_lines(*)')().eq('fiscal_year_id', fiscalYear.id).order('seq')),
    all(() => eq('invoices')().order('created_at')),
    supabase.from('invoice_counters').select('*').eq('structure_id', structureId).then(check),
    all(() => eq('settlements')().order('created_at')),
    all(() => eq('clients')().order('created_at')),
    all(() => eq('purchases')().order('created_at')),
    all(() => eq('bank_transactions')().order('imported_at')),
    all(() => eq('recurring_invoices')().order('created_at')),
    all(() => eq('documents')().order('uploaded_at')),
    all(() => eq('invoice_events')().order('position')),
  ]);
  // Paies importées de Nexus RH (table absente avant 0030 ; vide pour un collaborateur, données confidentielles).
  const payrolls = await all(() => eq('payrolls')().order('created_at')).catch((err) => {
    if (['42P01', 'PGRST205'].includes(err?.code)) return [];
    throw err;
  });
  // Relances parties par e-mail (dont les relances automatiques du matin) : table absente avant 0022.
  const emails = await all(() => eq('email_log', 'invoice_id, level, sent_at')().eq('kind', 'relance').eq('status', 'envoye').order('sent_at')).catch((err) => {
    if (['42P01', 'PGRST205'].includes(err?.code)) return [];
    throw err;
  });
  const primary = banks.find((b) => b.gl_account === '512000') || banks[0];
  const meta = { structureId, fiscalYearId: fiscalYear.id, bankAccountId: primary?.id };
  const state = stateFromRows({
    structure,
    fiscalYear,
    bankAccounts: banks,
    entries,
    invoices,
    counters,
    settlements,
    clients,
    purchases,
    transactions,
    recurring,
    events,
    emails,
    payrolls,
  });
  return { meta, state, documents };
}

// ------------------------------------------------------------------ exercices clos

/** Exercices clos de la structure, du plus récent au plus ancien. */
export async function closedFiscalYears(structureId) {
  const supabase = await connect();
  return check(
    await supabase.from('fiscal_years').select('*').eq('structure_id', structureId).not('closed_at', 'is', null).order('start_date', { ascending: false }),
  );
}

/** Écritures d'un exercice (lecture seule, pagination PostgREST). */
export async function fiscalYearEntries(structureId, fiscalYearId) {
  const supabase = await connect();
  return all(() => supabase.from('entries').select('*, entry_lines(*)').eq('structure_id', structureId).eq('fiscal_year_id', fiscalYearId).order('seq'));
}

// ------------------------------------------------------------------ clôture et membres

/** Clôture en base (contrôles serveur : tout validé, expert-comptable pour une société) ; renvoie l'id du nouvel exercice. */
export async function closeFiscalYear(fiscalYearId) {
  const supabase = await connect();
  return check(await supabase.rpc('close_fiscal_year', { p_fiscal_year: fiscalYearId }));
}
export async function inviteMember(structureId, email, role) {
  const supabase = await connect();
  return check(await supabase.rpc('invite_member', { p_structure: structureId, p_email: email, p_role: role }));
}
export async function removeMember(structureId, userId) {
  const supabase = await connect();
  return check(await supabase.rpc('remove_member', { p_structure: structureId, p_user: userId }));
}
// ------------------------------------------------------------------ e-mails (Brevo, migration 0022)

/** L'envoi d'e-mails par Nexus Gestion est-il en service ? (sinon : messagerie de l'utilisateur) */
export async function emailConfigured() {
  try {
    const supabase = await connect();
    return Boolean(check(await supabase.rpc('email_configured')));
  } catch {
    return false;
  }
}
/** Contenu binaire en base64, par morceaux (un PDF dépasse la taille d'argument de String.fromCharCode). */
function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
/** État de l'envoi : configuré, adresse d'expéditeur, extension http active (migration 0024). */
export async function emailStatus() {
  const supabase = await connect();
  const { data, error } = await supabase.rpc('email_status');
  if (!error) return data;
  // Base sans la migration 0024 : seul « configuré » est connu.
  return { configured: await emailConfigured(), sender: null, http: null };
}
/** E-mail de test à l'adresse du dirigeant connecté ; renvoie { ok, recipient, sender, detail }. */
export async function sendTestEmail() {
  const supabase = await connect();
  return check(await supabase.rpc('send_test_email'));
}
/** Facture envoyée au client de la facture, PDF joint ; renvoie { ok, recipient, detail }. */
export async function sendInvoiceEmail(invoiceId, { subject, body, pdf, name }) {
  const supabase = await connect();
  return check(
    await supabase.rpc('send_invoice_email', {
      p_invoice: invoiceId,
      p_subject: subject,
      p_body: body,
      p_pdf: toBase64(new Uint8Array(pdf)),
      p_pdf_name: name,
    }),
  );
}
/** Relance envoyée au client de la facture ; renvoie { ok, recipient, detail }. */
export async function sendReminderEmail(invoiceId, level, { subject, body }) {
  const supabase = await connect();
  return check(await supabase.rpc('send_reminder_email', { p_invoice: invoiceId, p_level: level, p_subject: subject, p_body: body }));
}
/** Derniers e-mails envoyés par l'entreprise (factures, relances manuelles et automatiques). */
export async function listEmails(structureId) {
  const supabase = await connect();
  return check(await supabase.from('email_log').select('*').eq('structure_id', structureId).order('sent_at', { ascending: false }).limit(30));
}

/** Export complet de l'entreprise (RGPD), réservé au dirigeant (migration 0019). */
export async function exportStructure(structureId) {
  const supabase = await connect();
  return check(await supabase.rpc('export_structure', { p_structure: structureId }));
}
/** Références Nexus RH déjà enregistrées sur le serveur (dépenses et paies), import fait depuis un autre appareil. */
export async function importedRefs(structureId) {
  const supabase = await connect();
  const purchases = check(await supabase.from('purchases').select('external_ref').eq('structure_id', structureId).not('external_ref', 'is', null));
  // Paies : invisibles pour un collaborateur (données confidentielles), table absente avant 0030.
  const payrolls = await supabase
    .from('payrolls')
    .select('ref')
    .eq('structure_id', structureId)
    .then((r) => (r.error ? [] : r.data));
  return [...purchases.map((p) => p.external_ref), ...payrolls.map((p) => p.ref)];
}
/** Import d'un fichier Nexus RH inscrit au journal d'audit (migration 0029). */
export async function logNexusRhImport(structureId, detail) {
  const supabase = await connect();
  return check(await supabase.rpc('log_nexus_rh_import', { p_structure: structureId, p_detail: detail }));
}
// ------------------------------------------------------------------ espace client (migration 0034)

const missingTable = (err) => ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(err?.code);

/** Devis acceptés en ligne : { [id du devis]: { by, at } } ; vide si la migration n'est pas appliquée. */
export async function quoteAcceptances(structureId) {
  const supabase = await connect();
  const { data, error } = await supabase.from('quote_acceptances').select('invoice_id, accepted_by, accepted_at').eq('structure_id', structureId);
  if (error) {
    if (missingTable(error)) return {};
    throw error;
  }
  return Object.fromEntries(data.map((a) => [a.invoice_id, { by: a.accepted_by, at: a.accepted_at }]));
}
/** Liens actifs de l'espace d'un client (sous-compte 411…). */
export async function listClientLinks(structureId, clientAux) {
  const supabase = await connect();
  return check(
    await supabase
      .from('client_links')
      .select('id, created_at, expires_at')
      .eq('structure_id', structureId)
      .eq('client_aux', clientAux)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  );
}
/** Nouveau lien : le secret n'est rendu qu'une fois (seule son empreinte est gardée en base). */
export async function createClientLink(structureId, clientAux, clientName) {
  const supabase = await connect();
  return check(await supabase.rpc('create_client_link', { p_structure: structureId, p_client_aux: clientAux, p_client_name: clientName }));
}
export async function revokeClientLink(linkId) {
  const supabase = await connect();
  return check(await supabase.rpc('revoke_client_link', { p_link: linkId }));
}
/** Téléchargement du dossier de clôture inscrit au journal d'audit (migration 0027). */
export async function logClosingPackage(structureId, detail) {
  const supabase = await connect();
  return check(await supabase.rpc('log_closing_package', { p_structure: structureId, p_detail: detail }));
}
export async function listMembers(structureId) {
  const supabase = await connect();
  return check(await supabase.rpc('list_members', { p_structure: structureId }));
}
export async function myRole(structureId) {
  const supabase = await connect();
  return check(await supabase.rpc('member_role', { p_structure: structureId }));
}

// ------------------------------------------------------------------ pièces justificatives

async function sha256Hex(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Dépose une pièce au format d'origine, nommée par son empreinte SHA-256 (valeur probante : un
 * fichier altéré ne correspondrait plus à son nom ni à l'empreinte enregistrée), puis la référence
 * dans la table documents. Un même fichier déposé deux fois n'est stocké qu'une fois.
 */
/** Type d'un fichier que le navigateur n'a pas reconnu (photo HEIC sous Windows…), d'après son extension. */
const TYPE_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  xml: 'application/xml',
};

export async function uploadReceipt(structureId, file, { entity, id }) {
  const supabase = await connect();
  const type = file.type || TYPE_BY_EXT[(file.name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
  const sha = await sha256Hex(file);
  const ext =
    (file.name.split('.').pop() || 'bin')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 5) || 'bin';
  const path = `${structureId}/${sha}.${ext}`;
  const { error } = await supabase.storage.from('justificatifs').upload(path, file, { contentType: type, upsert: false });
  if (error && !/exists|duplicate/i.test(error.message)) throw error;
  return check(
    await supabase
      .from('documents')
      .insert({
        structure_id: structureId,
        storage_path: path,
        sha256: sha,
        mime_type: type,
        original_name: file.name,
        linked_entity: entity,
        linked_id: id,
      })
      .select()
      .single(),
  );
}

/** Lien temporaire (5 minutes) vers une pièce privée. */
export async function receiptUrl(path) {
  const supabase = await connect();
  return check(await supabase.storage.from('justificatifs').createSignedUrl(path, 300)).signedUrl;
}

// ------------------------------------------------------------------ file d'envoi

async function run(op) {
  const supabase = await connect();
  if (op.kind === 'upsert') {
    return check(await supabase.from(op.table).upsert(op.rows, { onConflict: op.onConflict, ignoreDuplicates: Boolean(op.ignoreDuplicates) }));
  }
  if (op.kind === 'update') {
    // Une mise à jour refusée par les droits ne renvoie pas d'erreur, seulement 0 ligne : la signaler.
    const rows = check(await supabase.from(op.table).update(op.values).match(op.match).select('id'));
    if (!rows?.length) throw refusedUpdate(op);
    return null;
  }
  if (op.kind === 'delete') return check(await supabase.from(op.table).delete().match(op.match));
  const result = check(await supabase.rpc(op.fn, op.args));
  if (op.expect?.type === 'invoiceNumber' && result !== op.expect.value) {
    throw Object.assign(new Error(`Numéro attribué par le serveur (${result}) différent de ${op.expect.value}`), { divergence: true });
  }
  // Validation rejouée (la réponse précédente s'est perdue) : 0 écriture cette fois, mais la période est
  // bien verrouillée jusqu'à la date demandée — l'opération était déjà faite.
  if (op.expect?.type === 'count' && result !== op.expect.value && op.fn === 'validate_through' && result === 0) {
    const fy = check(await supabase.from('fiscal_years').select('locked_through').eq('id', op.args.p_fiscal_year).single());
    if (fy?.locked_through && fy.locked_through >= op.args.p_date) return result;
  }
  if (op.expect?.type === 'count' && result !== op.expect.value) {
    throw Object.assign(new Error(`Le serveur a validé ${result} écriture(s) au lieu de ${op.expect.value}`), { divergence: true });
  }
  return result;
}

/** Verrou partagé entre les onglets du navigateur (Web Locks), repli en mémoire. */
const fallbackLock = memoryLock();
const browserLock = (name, fn) => (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(name, fn) : fallbackLock(name, fn));

export { OUTBOX_PREFIX };

/** File d'envoi (core/outbox.js) branchée sur Supabase, le stockage du navigateur et Web Locks. */
export class Outbox extends CoreOutbox {
  constructor({ key, onStatus, onResult }) {
    super({ key, run, storage: localStorage, lock: browserLock, friendly, onStatus, onResult });
  }
}
