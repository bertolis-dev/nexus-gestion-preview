/**
 * Écran « bank ».
 */

import { decodeStatement, importStatement } from '../../core/bank-import.js?v=a619ec1';
import { reconciliationStatement } from '../../core/bank.js?v=a619ec1';
import { VAT_RATES_BP } from '../../core/invoices.js?v=a619ec1';
import { parseEuros } from '../../core/money.js?v=a619ec1';
import { CHOOSABLE_EXPENSE_CATEGORIES } from '../../core/pcg.js?v=a619ec1';
import { INCOME_CATEGORIES, MAX_BANK_ACCOUNTS, OUTFLOW_CATEGORIES } from '../../core/workspace.js?v=a619ec1';
import { field, html, opt, raw } from '../html.js?v=a619ec1';
import { ICONS } from '../icons.js?v=a619ec1';
import { cloudState, eur, frDate, pct, today, ui, ws } from '../state.js?v=a619ec1';
import { dataVersion, save, toast } from '../store.js?v=a619ec1';
import * as cloud from '../cloud.js?v=a619ec1';
import { render } from '../render.js?v=a619ec1';
import { preparePhoto } from '../ui/photo.js?v=a619ec1';
import { badge, icon, term, viewHeader } from '../ui/common.js?v=a619ec1';

// ------------------------------------------------------------------ banque (§3.4)

/** Nature d'une pièce proposée au rapprochement, en langage courant. */
export const DOC_KIND_LABELS = { invoice: 'Facture', purchase: 'Dépense', 'purchase-credit': 'Avoir fournisseur', credit: 'Remboursement de l’avoir' };

/** Mouvements affichés par page sur l'écran Banque. */
export const BANK_PAGE_SIZE = 25;

/** Listes de catégories (dépense / recette), construites une seule fois. */
export const categoryOptionsCache = new Map();

export function categoryOptions(outflow, selected = null) {
  // Catégorie proposée d'après les choix précédents : liste construite pour cette ligne.
  if (selected) {
    const mark = (list) => list.map((c) => opt(c.id, c.label, c.id === selected));
    return outflow
      ? html`<optgroup label="Dépenses">${mark(CHOOSABLE_EXPENSE_CATEGORIES)}</optgroup>
          <optgroup label="Autres sorties d’argent">${mark(OUTFLOW_CATEGORIES)}</optgroup>`
      : html`${mark(INCOME_CATEGORIES)}`;
  }
  if (!categoryOptionsCache.has(outflow)) {
    categoryOptionsCache.set(
      outflow,
      outflow
        ? html`<optgroup label="Dépenses">${CHOOSABLE_EXPENSE_CATEGORIES.map((c) => opt(c.id, c.label))}</optgroup>
            <optgroup label="Autres sorties d’argent">${OUTFLOW_CATEGORIES.map((c) => opt(c.id, c.label))}</optgroup>`
        : html`${INCOME_CATEGORIES.map((c) => opt(c.id, c.label))}`,
    );
  }
  return categoryOptionsCache.get(outflow);
}

/** Propositions de rapprochement mémorisées tant que les données ne changent pas (voir save()). */
export let suggestionsCache = { version: -1, map: new Map() };

export function bankSuggestions(txs) {
  if (suggestionsCache.version !== dataVersion) suggestionsCache = { version: dataVersion, map: new Map() };
  const missing = txs.filter((t) => !suggestionsCache.map.has(t.id)).map((t) => t.id);
  if (missing.length) for (const [id, s] of ws.suggestionsForMany(missing)) suggestionsCache.map.set(id, s);
  return suggestionsCache.map;
}

/** Carte « À justifier » : une page de mouvements, avec pagination. */
export function bankOpenCard(open) {
  const pages = Math.max(1, Math.ceil(open.length / BANK_PAGE_SIZE));
  ui.bankPage = Math.min(Math.max(0, ui.bankPage || 0), pages - 1);
  const from = ui.bankPage * BANK_PAGE_SIZE;
  const visible = open.slice(from, from + BANK_PAGE_SIZE);
  const suggestions = bankSuggestions(visible);
  const franchise = ws.company.vatRegime === 'franchise';
  const pager =
    open.length > BANK_PAGE_SIZE
      ? html`<div class="bank-pager">
          <span>Mouvements ${from + 1} à ${from + visible.length} sur ${open.length}</span>
          <button class="btn btn-secondary btn-sm" data-action="bank-page" data-index="-1" ${ui.bankPage === 0 ? raw('disabled') : ''}>Précédents</button>
          <button class="btn btn-secondary btn-sm" data-action="bank-page" data-index="1" ${ui.bankPage >= pages - 1 ? raw('disabled') : ''}>Suivants</button>
        </div>`
      : '';
  return html`<h2 style="padding:16px 16px 0">À justifier (${open.length})</h2>
    ${pager}
    ${
      open.length
        ? html`<table class="table bank-open-table">
            <tbody>
              ${visible.map((t) => {
                const sugg = (suggestions.get(t.id) || []).slice(0, 2);
                // Proposition apprise seulement quand aucune pièce ne correspond (une facture prime).
                const learned = sugg.length ? null : ws.categorySuggestion(t.id);
                return html`<tr>
                  <td style="width:110px">${frDate(t.date)}</td>
                  <td>
                    <strong>${t.label}</strong>
                    ${sugg.map(
                      (s, si) =>
                        html`<div class="match-suggestion">
                          <span
                            >${s.docs.map((d) => `${DOC_KIND_LABELS[d.kind] || 'Dépense'} ${d.number} — ${d.partyName} (${eur(d.outstanding)})`).join(' + ')}<br /><span
                              class="match-reasons"
                              >${s.reasons.join(', ')} · confiance ${s.score} %</span
                            ></span
                          ><button class="btn btn-primary btn-sm" data-action="tx-match" data-id="${t.id}" data-index="${si}">Associer</button>
                        </div>`,
                    )}
                    ${learned ? html`<p class="form-hint" style="margin:6px 0 0">Catégorie proposée d’après vos choix précédents (« ${learned.key} ») : vérifiez puis validez.</p>` : ''}
                    <div class="tx-actions">
                      <select class="input input-sm" data-cat="${t.id}" aria-label="Catégorie">
                        ${opt('', sugg.length ? 'Ou choisir une catégorie…' : 'Choisir une catégorie…', !learned)}${categoryOptions(t.amount < 0, learned?.categoryId)}
                      </select>
                      ${
                        t.amount < 0 && !franchise
                          ? html`<select class="input input-sm" data-vat="${t.id}" aria-label="TVA" style="min-width:110px;flex:0">
                              ${VAT_RATES_BP.map((r) => opt(r, `TVA ${pct(r)}`, r === (learned ? learned.vatRateBp : 0)))}
                            </select>`
                          : ''
                      }
                      ${t.amount < 0 ? html`<label><input type="checkbox" data-receipt="${t.id}" />J'ai la facture</label>` : ''}
                      <button class="btn btn-secondary btn-sm" data-action="tx-categorize" data-id="${t.id}">Valider</button>
                      <button class="btn-link" data-action="tx-ignore" data-id="${t.id}" title="Mouvement déjà comptabilisé par ailleurs">Ignorer</button>
                    </div>
                  </td>
                  <td class="num" style="width:120px"><strong>${eur(t.amount)}</strong></td>
                </tr>`;
              })}
            </tbody>
          </table>`
        : html`<div class="empty-state">
            <div class="empty-icon">${raw(ICONS.card)}</div>
            <p class="text-muted">
              ${ws.transactions.length ? 'Toutes vos transactions sont justifiées.' : 'Importez votre premier relevé bancaire pour commencer.'}
            </p>
          </div>`
    }
    ${pager}`;
}

export function viewBank() {
  const account = currentBankAccount();
  const mine = ws.transactions.filter((t) => (t.accountId || 'default') === account.id);
  const open = mine.filter((t) => t.status === 'open').sort((a, b) => b.date.localeCompare(a.date));
  const done = mine.filter((t) => t.status !== 'open').sort((a, b) => b.date.localeCompare(a.date));
  let stmt = null;
  if (ui.statementBalance) {
    try {
      stmt = reconciliationStatement(ws.ledger, ws.transactions, { date: today(), statementBalance: parseEuros(ui.statementBalance), account });
    } catch {}
  }
  return html` ${viewHeader('Banque', 'Associez chaque mouvement à une facture, ou choisissez une catégorie.', html`<label class="btn btn-primary" style="margin:0" tabindex="0" data-file-picker>${icon('upload', 14)} Importer un relevé (CSV, OFX, CAMT.053, QIF)<input type="file" accept=".csv,.ofx,.qfx,.xml,.qif,.txt" data-action="bank-file" hidden /></label>`)}
    ${bankAccountsBar()} ${bankImportReport()} ${sureMatchesNotice()}
    <div class="card table-card" id="bank-open">${bankOpenCard(open)}</div>
    <div class="card">
      <h2>${term('Votre solde bancaire est-il juste ?', 'État de rapprochement')}</h2>
      ${field("Solde affiché par votre banque aujourd'hui", html`<input class="input" data-statement value="${ui.statementBalance}" inputmode="decimal" placeholder="0,00" style="max-width:240px" />`)}
      ${
        stmt
          ? html`<table class="table" style="max-width:520px;margin-top:10px">
                <tbody>
                  <tr>
                    <td>Solde banque</td>
                    <td class="num">${eur(stmt.statementBalance)}</td>
                  </tr>
                  <tr>
                    <td>Solde comptable</td>
                    <td class="num">${eur(stmt.bookBalance)}</td>
                  </tr>
                  <tr>
                    <td>Mouvements à justifier (${stmt.pendingCount})</td>
                    <td class="num">${eur(stmt.pendingTotal)}</td>
                  </tr>
                  <tr>
                    <td><strong>Écart inexpliqué</strong></td>
                    <td class="num"><strong>${eur(stmt.difference)}</strong></td>
                  </tr>
                </tbody>
              </table>
              <p class="form-hint">
                ${stmt.difference ? 'Un écart indique un mouvement non importé ou saisi deux fois.' : 'Aucun écart : votre banque et votre comptabilité concordent.'}
              </p>`
          : ''
      }
    </div>
    ${
      done.length
        ? html`<div class="card table-card" tabindex="0" role="region" aria-label="Transactions déjà justifiées">
            <h2 style="padding:16px 16px 0">Déjà justifiées</h2>
            <table class="table">
              <tbody>
                ${done.slice(0, 50).map(
                  (t) =>
                    html`<tr>
                      <td style="width:110px">${frDate(t.date)}</td>
                      <td>
                        ${t.label}
                        <span class="badge-row" style="display:inline-flex"
                          >${t.status === 'ignored' ? badge('Ignorée') : ''}${t.missingReceipt ? badge('Sans justificatif', 'warning') : ''}</span
                        >
                      </td>
                      <td class="no-print">${txReceiptCell(t)}</td>
                      <td class="num">${eur(t.amount)}</td>
                    </tr>`,
                )}
              </tbody>
            </table>
          </div>`
        : ''
    }`;
}

/** Justificatif d'une transaction : voir la pièce, ou en ajouter une (photo prise avec le téléphone, PDF). */
function txReceiptCell(t) {
  const doc = cloudState.documents.find((d) => d.linked_entity === 'transaction' && d.linked_id === t.id);
  if (doc) return html`<button class="btn-link" data-action="receipt-open" data-path="${doc.storage_path}">Voir le justificatif</button>`;
  if (!t.missingReceipt) return '';
  return html`<label class="btn btn-secondary btn-sm" style="margin:0" tabindex="0" data-file-picker
    >${icon('camera', 14)} Ajouter le justificatif<input
      type="file"
      accept="image/*,application/pdf"
      capture="environment"
      data-action="tx-receipt-file"
      data-id="${t.id}"
      aria-label="Ajouter le justificatif de ${t.label}"
      hidden
  /></label>`;
}

/**
 * Justificatif ajouté à une transaction déjà classée : photo réduite dans le navigateur, déposée au
 * stockage (mode connecté), puis la transaction n'est plus signalée « sans justificatif ».
 */
export async function attachTxReceipt(txId, file) {
  if (!file) return;
  try {
    if (!ui.demo && cloudState.meta) {
      const ready = await preparePhoto(file);
      cloudState.documents.push(await cloud.uploadReceipt(cloudState.meta.structureId, ready, { entity: 'transaction', id: txId }));
    }
    ws.markReceiptAttached(txId);
    save();
    render();
    toast(ui.demo ? 'Démonstration : justificatif pris en compte (il n’est pas conservé).' : 'Justificatif enregistré.');
  } catch (err) {
    toast(`Justificatif non enregistré : ${cloud.friendly(err)}`, true);
  }
}

/**
 * Relevé choisi par l'utilisateur : encodage et format détectés, lignes illisibles signalées. Un
 * relevé CAMT.053 portant l'IBAN d'un autre compte enregistré est rattaché à ce compte.
 */
export async function importBankFile(file, accountId = 'default') {
  const text = decodeStatement(await file.arrayBuffer());
  const result = importStatement(text, { accountId });
  const last4 = result.iban?.slice(-4);
  const byIban = last4 && ws?.bankAccounts.find((a) => a.ibanLast4 === last4);
  if (byIban && byIban.id !== accountId) return { ...importStatement(text, { accountId: byIban.id }), accountId: byIban.id };
  return { ...result, accountId };
}

/** Compte bancaire affiché (et destinataire des imports). */
export function currentBankAccount() {
  return ws.bankAccounts.find((a) => a.id === ui.bankAccountId) || ws.bankAccounts[0];
}

/** Sélecteur de compte et ajout d'un compte bancaire. */
export function bankAccountsBar() {
  const accounts = ws.bankAccounts;
  const current = currentBankAccount();
  const label = (a) => `${a.label}${a.ibanLast4 ? ` (…${a.ibanLast4})` : ''}`;
  return html`<div class="card" style="display:flex;gap:10px;align-items:${accounts.length > 1 ? 'flex-end' : 'center'};flex-wrap:wrap">
    ${
      accounts.length > 1
        ? field(
            'Compte affiché',
            html`<select class="input" id="f-bank-account" data-bank-account>
              ${accounts.map((a) => opt(a.id, label(a), a.id === current.id))}
            </select>`,
            { id: 'f-bank-account' },
          )
        : html`<p style="margin:0">Compte : <strong>${label(current)}</strong></p>`
    }
    <span class="text-muted" style="margin-bottom:${accounts.length > 1 ? 8 : 0}px">Solde comptable : <strong>${eur(ws.bankBalance(current.id))}</strong></span>
    ${
      ui.addingBank
        ? html`<form data-form="bank-account-add" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
            ${field('Nom du compte', html`<input class="input" id="f-bank-label" name="label" required placeholder="Qonto, Livret…" />`, { id: 'f-bank-label' })}
            ${field('IBAN (facultatif)', html`<input class="input" id="f-bank-iban" name="iban" placeholder="FR76 …" />`, { id: 'f-bank-iban' })}
            <button class="btn btn-primary" type="submit" style="margin-bottom:2px">Ajouter</button>
            <button class="btn btn-secondary" type="button" data-action="bank-account-cancel" style="margin-bottom:2px">Annuler</button>
          </form>`
        : accounts.length < MAX_BANK_ACCOUNTS
          ? html`<button class="btn btn-secondary" data-action="bank-account-new" style="margin-left:auto">Ajouter un compte bancaire</button>`
          : ''
    }
  </div>`;
}

/** Compte rendu du dernier import : banque reconnue, lignes rejetées avec leur numéro. */
export function bankImportReport() {
  const r = ui.bankImport;
  if (!r) return '';
  return html`<div class="${r.errors.length ? 'notice-gold' : 'card'}" style="display:flex;flex-direction:column;gap:6px">
    <strong
      >${r.fileName}${r.bank ? ` (relevé ${r.bank})` : ''} : ${r.added} nouvelle(s)
      opération(s)${r.skipped ? `, ${r.skipped} opération(s) refusée(s) ou en attente ignorée(s)` : ''}</strong
    >
    ${
      r.errors.length
        ? html`<span>${r.errors.length} ligne(s) n'ont pas pu être lues et n'ont pas été importées :</span>
            <ul style="margin:0;padding-left:18px">
              ${r.errors.slice(0, 10).map((e) => html`<li>ligne ${e.line} : ${e.message}</li>`)}
            </ul>
            ${r.errors.length > 10 ? html`<span>… et ${r.errors.length - 10} autre(s).</span>` : ''}`
        : ''
    }
    <div><button class="btn btn-secondary btn-sm" data-action="bank-import-dismiss">Fermer</button></div>
  </div>`;
}

/** Paiements reconnus sans ambiguïté (montant exact, une seule pièce) : rapprochés en un clic. */
function sureMatchesNotice() {
  const sure = ws.sureMatches();
  if (sure.length < 2) return '';
  return html`<div class="notice-gold" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
    <span><strong>${sure.length} paiements</strong> correspondent exactement à une facture ou une dépense (même montant, même tiers).</span>
    <button type="button" class="btn btn-gold btn-sm" data-action="bank-match-sure">Tout rapprocher</button>
  </div>`;
}
