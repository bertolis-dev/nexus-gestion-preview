/**
 * Mode connecté : ouverture d’une entreprise, file d’envoi, état de la synchronisation.
 */

import { loadAccess } from './platform.js?v=e821f3b';
import { pickStructure } from '../core/company.js?v=e821f3b';
import { applySyncResult, ledgerStateFromRows } from '../core/sync.js?v=e821f3b';
import { Workspace } from '../core/workspace.js?v=e821f3b';
import * as cloud from './cloud.js?v=e821f3b';
import { html } from './html.js?v=e821f3b';
import { render } from './render.js?v=e821f3b';
import { cloudState, newId, setWs, ui, ws } from './state.js?v=e821f3b';
import { toast } from './store.js?v=e821f3b';
import { startTour } from './ui/tour.js?v=e821f3b';

// ------------------------------------------------------------------ synchronisation

/** Réponse du serveur : le numéro d'ordre attribué à une écriture est repris localement (et dans la copie synchronisée, pour ne pas la renvoyer). */
export function onSyncResult(op, result) {
  if (!applySyncResult(ws, op, result)) return;
  const synced = cloudState.synced?.ledger?.entries?.find((e) => e.id === op.args.p.id);
  if (synced) synced.seq = Number(result.seq);
  if (cloudState.synced?.ledger) cloudState.synced.ledger.seq = Math.max(cloudState.synced.ledger.seq || 0, Number(result.seq));
}

/** Facture émise localement dont la base n'a pas encore confirmé le numéro (mode connecté). */
export function isUnconfirmed(inv) {
  return Boolean(!ui.demo && inv?.status === 'issued' && cloudState.outbox?.unconfirmedInvoices().has(inv.id));
}

export function onSyncStatus(status) {
  const wasPending = cloudState.status?.pending > 0;
  cloudState.status = status;
  // Numéros confirmés : la fiche de la facture affichée devient imprimable.
  if (wasPending && !status.pending && /^#\/ventes\/(?!modifier-|nouve)[^/]+$/.test(location.hash)) render();
  const el = document.getElementById('sync-status');
  if (el) el.outerHTML = syncStatusHtml().s;
  if (status.error) toast(`Enregistrement refusé : ${status.error}`, true);
  if (status.warning) toast(status.warning, true);
}

export function syncStatusHtml() {
  const s = cloudState.status;
  if (ui.demo) return html`<div id="sync-status" class="sync-status">Démonstration : données dans ce navigateur</div>`;
  if (s.error) {
    return html`<div id="sync-status" class="sync-status sync-error">
      Non enregistré : ${s.error}<br />
      <button class="btn btn-gold btn-sm" data-action="sync-retry">Réessayer</button>
      ${s.refused ? html` <button class="btn btn-secondary btn-sm" data-action="sync-skip">Écarter cette modification</button>` : ''}
      ${s.divergence && !s.refused ? html` <button class="btn btn-secondary btn-sm" data-action="sync-reload">Recharger depuis la base</button>` : ''}
    </div>`;
  }
  return html`<div id="sync-status" class="sync-status">${s.pending ? `Enregistrement… (${s.pending})` : 'Toutes les modifications sont enregistrées'}</div>`;
}

/**
 * Dernier exercice clos (société à l'IS) : sert à l'échéancier des acomptes d'impôt de la trésorerie
 * prévisionnelle (core/istax.js). Les autres entreprises n'en ont pas besoin ; un échec n'empêche pas
 * l'ouverture.
 */
async function lastClosedYear(structureId, company) {
  if (company.taxRegime !== 'is-reel') return [];
  try {
    const [year] = await cloud.closedFiscalYears(structureId);
    if (!year) return [];
    const entries = await cloud.fiscalYearEntries(structureId, year.id);
    return [{ fiscalYear: { start: year.start_date, end: year.end_date }, ledger: ledgerStateFromRows(entries, year) }];
  } catch {
    return [];
  }
}

export async function openStructure(structureId) {
  ui.emails = null;
  ui.members = null;
  const { meta, state, documents } = await cloud.loadStructure(structureId);
  cloudState.meta = meta;
  cloudState.documents = documents || [];
  cloudState.role = await cloud.myRole(structureId).catch(() => null);
  await loadAccess(structureId); // droits par module, modules souscrits, console (migration 0036)
  ui.clientLinks = {};
  ui.freshClientLink = null;
  // Devis acceptés en ligne par les clients (espace client, migration 0034) : absents avant la migration.
  ui.quoteAcceptances = await cloud.quoteAcceptances(structureId).catch(() => ({}));
  cloudState.outbox = new cloud.Outbox({ key: `${cloud.OUTBOX_PREFIX}${structureId}`, onStatus: onSyncStatus, onResult: onSyncResult });
  setWs(new Workspace({ company: state.company, state, newId }));
  ws.archives = await lastClosedYear(structureId, state.company);
  cloudState.synced = JSON.parse(JSON.stringify(ws));
  if (cloudState.outbox.queue.length) {
    await cloudState.outbox.flush();
    if (!cloudState.outbox.error) return openStructure(structureId);
  }
}

/** Après connexion : double authentification, puis entreprise (ou assistant d'installation). */
const LAST_STRUCTURE_KEY = 'nexus_gestion_last_structure';
const lastStructureId = () => {
  try {
    return localStorage.getItem(LAST_STRUCTURE_KEY);
  } catch {
    return null;
  }
};

/** État de l'envoi d'e-mails relu depuis la base ; renvoie vrai s'il a changé. */
export async function refreshEmailStatus() {
  try {
    const st = await cloud.emailStatus();
    const ready = Boolean(st?.configured) && st?.http !== false;
    const changed = ready !== cloudState.emailReady || st?.sender !== cloudState.emailStatus?.sender;
    cloudState.emailStatus = st;
    cloudState.emailReady = ready;
    return changed;
  } catch {
    return false;
  }
}

/** Ouvre une entreprise, la mémorise comme dernière ouverte et affiche son accueil. */
export async function openStructureAndShow(id) {
  ui.picking = false;
  await openStructure(id);
  // Envoi d'e-mails par Nexus (Brevo) en service ? Sinon, factures et relances passent par la messagerie.
  refreshEmailStatus().then((changed) => changed && render());
  try {
    localStorage.setItem(LAST_STRUCTURE_KEY, id);
  } catch {}
  ui.screen = 'app';
  if (!location.hash.startsWith('#/')) location.hash = '#/accueil';
  render();
  // Visite guidée à la première ouverture de ce compte sur cet appareil, une fois l'accueil affiché.
  setTimeout(() => startTour({ cle: cloudState.session?.user?.id || id }), 900);
}

export async function afterSignIn() {
  const mfa = await cloud.mfaStatus();
  if (mfa.step !== 'ok') {
    ui.mfa = mfa.step === 'enroll' ? { step: 'enroll', ...(await cloud.mfaEnroll()) } : { step: 'challenge', factorId: mfa.factorId, factors: mfa.factors };
    ui.screen = 'login';
    return render();
  }
  ui.mfa = null;
  const structures = await cloud.listStructures();
  ui.structures = structures;
  if (structures.length) {
    // Plusieurs entreprises (expert-comptable, dirigeant de plusieurs sociétés) : la dernière ouverte
    // est reprise, sinon l'utilisateur choisit.
    const chosen = pickStructure(structures, lastStructureId());
    if (!chosen) {
      setWs(null);
      ui.picking = true;
      ui.screen = 'login';
      return render();
    }
    await openStructureAndShow(chosen);
    return;
  } else {
    setWs(null);
    ui.screen = 'login'; // l'assistant s'affiche dans le même cadre que la connexion
  }
  render();
}
