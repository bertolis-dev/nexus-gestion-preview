/**
 * Écran « invoice-form ».
 */

import { VAT_RATES_BP, computeTotals, defaultDueDate, isVatExempt } from '../../core/invoices.js?v=e821f3b';
import { parseEuros } from '../../core/money.js?v=e821f3b';
import { field, html, opt, raw } from '../html.js?v=e821f3b';
import { ICONS } from '../icons.js?v=e821f3b';
import { issueLink } from '../render.js?v=e821f3b';
import { eur, pct, today, ui, ws } from '../state.js?v=e821f3b';
import { save } from '../store.js?v=e821f3b';
import { viewHeader } from '../ui/common.js?v=e821f3b';
import { NEW_DOC_ROUTES } from './sales.js?v=e821f3b';

export function emptyLine() {
  return {
    label: '',
    qty: 1,
    unitPrice: 0,
    priceText: '',
    vatRateBp: ws.company.vatRegime === 'franchise' ? 0 : 2000,
    nature: ws.company.defaultNature || 'services',
  };
}

export function startDraft(arg) {
  if (arg && arg.startsWith('modifier-')) {
    const inv = ws.book.get(arg.slice(9));
    ui.draft = {
      ...structuredClone(inv),
      // Un prix invalide (brouillon d'une version précédente) est repris à 0, à corriger.
      lines: inv.lines.map((l) => {
        const unitPrice = Number.isSafeInteger(l.unitPrice) ? l.unitPrice : 0;
        return { ...l, unitPrice, priceText: (unitPrice / 100).toFixed(2).replace('.', ','), discountText: discountText(l.discountBp) };
      }),
      clientId: ws.clients.find((c) => c.code === inv.client.code)?.id || '',
      savedId: inv.id,
    };
  } else {
    const type = NEW_DOC_ROUTES[arg] || 'invoice';
    const due = defaultDueDate({ type, issueDate: today(), paymentTermsDays: ws.company.paymentTermsDays });
    ui.draft = {
      type,
      issueDate: today(),
      dueDate: due,
      clientId: (ws.clients.some((c) => c.id === ui.presetClientId) && ui.presetClientId) || ws.clients[0]?.id || '__new',
      newClient: { type: 'B2B', country: 'FR' },
      lines: [emptyLine()],
      depositIds: [],
    };
    ui.presetClientId = null;
    if (type === 'deposit') ui.draft.lines[0].label = 'Acompte sur commande';
  }
  ui.draft.depositIds ||= (ui.draft.deposits || []).map((x) => x.id);
  ui.draft.key = arg;
}

export function draftClient() {
  const d = ui.draft;
  return d.clientId === '__new'
    ? { ...d.newClient, siren: (d.newClient.siren || '').replace(/\s/g, '') }
    : ws.clients.find((c) => c.id === d.clientId) || d.client;
}

/** Acomptes proposés à la déduction : ceux du client choisi, pas encore déduits ailleurs. */
export function draftAvailableDeposits() {
  const d = ui.draft;
  const client = draftClient();
  if (d.type !== 'invoice' || !client?.code) return [];
  return ws.book.availableDeposits(client.code, { exceptId: d.savedId });
}

/** Prix saisi en centimes, 0 si vide, null s'il est illisible. */
export function readPrice(text) {
  if (!String(text ?? '').trim()) return 0;
  try {
    const cents = parseEuros(text);
    return Number.isSafeInteger(cents) ? cents : null;
  } catch {
    return null;
  }
}

/** Remise saisie en % (« 10 », « 12,5 ») → points de base ; '' = pas de remise ; null = illisible. */
export function readDiscount(text) {
  const t = String(text ?? '')
    .replace('%', '')
    .trim();
  if (!t) return 0;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : null;
}
const discountText = (bp) => (bp ? String(bp / 100).replace('.', ',') : '');

export function draftInvoiceData() {
  const d = ui.draft;
  const deposits = draftAvailableDeposits().filter((x) => d.depositIds.includes(x.id));
  return {
    type: d.type || 'invoice',
    client: draftClient(),
    issueDate: d.issueDate,
    dueDate: d.dueDate,
    lines: d.lines.map(({ priceText, discountText: _d, ...l }) => l),
    deposits,
    ...(d.creditOf ? { creditOf: d.creditOf } : {}),
    ...(d.quoteRef ? { quoteRef: d.quoteRef } : {}),
    ...(d.deliveryDate ? { deliveryDate: d.deliveryDate } : {}),
    ...(d.deliveryAddress?.trim() ? { deliveryAddress: d.deliveryAddress.trim() } : {}),
  };
}

export function totalsBlock() {
  const d = draftInvoiceData();
  const t = computeTotals(d, { franchise: (Boolean(d.client) && isVatExempt(d, ws.company)) || ws.company.vatRegime === 'franchise' });
  return html`<table class="totals-table">
    <tbody>
      <tr>
        <td>Total HT</td>
        <td class="num">${eur(t.totalHt)}</td>
      </tr>
      ${t.vatBreakdown
        .filter((v) => v.vat)
        .map(
          (v) =>
            html`<tr>
              <td class="text-muted">TVA ${pct(v.rateBp)} sur ${eur(v.base)}</td>
              <td class="num">${eur(v.vat)}</td>
            </tr>`,
        )}
      <tr class="grand">
        <td>Total TTC</td>
        <td class="num">${eur(t.totalTtc)}</td>
      </tr>
      ${d.deposits.map(
        (x) =>
          html`<tr>
            <td class="text-muted">Acompte ${x.number} déduit</td>
            <td class="num">${eur(-x.amountTtc)}</td>
          </tr>`,
      )}
      ${
        d.deposits.length
          ? html`<tr class="grand">
              <td>Net à payer</td>
              <td class="num">${eur(t.netToPay)}</td>
            </tr>`
          : ''
      }
    </tbody>
  </table>`;
}

export function viewInvoiceForm(arg) {
  if (!ui.draft || ui.draft.key !== arg) startDraft(arg);
  const d = ui.draft;
  const franchise = ws.company.vatRegime === 'franchise';
  const nc = d.newClient || {};
  const kind = { invoice: 'facture', quote: 'devis', deposit: "facture d'acompte", credit: 'avoir' }[d.type || 'invoice'];
  const title = d.savedId
    ? `Modifier le brouillon (${kind})`
    : { invoice: 'Nouvelle facture', quote: 'Nouveau devis', deposit: "Nouvelle facture d'acompte", credit: 'Nouvel avoir' }[d.type || 'invoice'];
  const deposits = draftAvailableDeposits();
  return html` <button class="btn-link no-print" data-href="#/ventes">← Retour aux factures</button>
    ${viewHeader(title, d.type === 'quote' ? 'Le devis est numéroté à l’envoi (série D). Une fois accepté, il se transforme en facture en un clic.' : d.type === 'deposit' ? 'L’acompte est enregistré en « acomptes reçus » ; il sera déduit de la facture finale.' : 'Le numéro est attribué à l’émission. Une facture émise ne se modifie plus.')}
    <form class="card" data-form="invoice" novalidate style="display:flex;flex-direction:column;gap:16px">
      ${
        d.issues?.length
          ? html`<div class="issues-box" id="invoice-issues" role="alert" tabindex="-1">
              <strong>Pour émettre cette facture, complétez :</strong>
              <ul>
                ${d.issues.map((i) => html`<li>${issueLink(i, d)}</li>`)}
              </ul>
            </div>`
          : ''
      }
      <div class="form-section">
        <h3 class="form-subsection-title">Client</h3>
        <div class="form-grid">
          ${field(
            'Client',
            html`<select class="input" name="clientId" data-rerender>
              ${ws.clients.map((c) => opt(c.id, c.name, d.clientId === c.id))}${opt('__new', '+ Nouveau client', d.clientId === '__new')}
            </select>`,
          )}
          ${
            d.clientId === '__new'
              ? field(
                  'Type de client',
                  html`<select class="input" name="newClient.type" data-rerender>
                    ${opt('B2B', 'Entreprise', nc.type !== 'B2C')}${opt('B2C', 'Particulier', nc.type === 'B2C')}
                  </select>`,
                )
              : ''
          }
        </div>
        ${d.clientId !== '__new' && draftClient() ? clientEditBlock(d) : ''}
        ${
          d.clientId === '__new'
            ? html`<div class="form-grid" style="margin-top:12px">
                ${nc.type !== 'B2C' ? field('SIREN', html`<div style="display:flex;gap:8px"><input class="input" name="newClient.siren" inputmode="numeric" value="${nc.siren || ''}" /><button type="button" class="btn btn-secondary btn-sm" data-action="client-lookup">Remplir</button></div>`, { hint: 'Obligatoire pour une entreprise française.' }) : ''}
                ${field('Nom ou raison sociale', html`<input class="input" name="newClient.name" value="${nc.name || ''}" />`)}
                ${field('Email (relances)', html`<input class="input" name="newClient.email" type="email" value="${nc.email || ''}" />`)}
                ${field('Adresse', html`<input class="input" name="newClient.address" value="${nc.address || ''}" />`)}
              </div>`
            : ''
        }
      </div>
      <div class="form-section">
        <h3 class="form-subsection-title">Dates</h3>
        <div class="form-grid">
          ${field("Date d'émission", html`<input class="input" type="date" name="issueDate" value="${d.issueDate}" />`)}
          ${field(d.type === 'quote' ? 'Valable jusqu’au' : "Date d'échéance", html`<input class="input" type="date" name="dueDate" value="${d.dueDate}" />`)}
          ${field('Date de livraison ou d’exécution', html`<input class="input" type="date" name="deliveryDate" value="${d.deliveryDate || ''}" />`, { hint: 'Si elle diffère de la date d’émission.' })}
          ${field('Adresse de livraison', html`<input class="input" name="deliveryAddress" value="${d.deliveryAddress || ''}" />`, { hint: 'Si elle diffère de l’adresse du client.' })}
        </div>
      </div>
      ${
        deposits.length
          ? html`<div class="form-section">
              <h3 class="form-subsection-title">Acomptes à déduire</h3>
              ${deposits.map((x) => html`<label class="form-field-checkbox" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-action="toggle-deposit" data-id="${x.id}" ${d.depositIds.includes(x.id) ? raw('checked') : ''} />Acompte ${x.number} — ${eur(x.amountTtc)} TTC</label>`)}
            </div>`
          : ''
      }
      <div class="form-section">
        <h3 class="form-subsection-title">Lignes</h3>
        <div class="table-scroll">
          <table class="table lines-table cards-mobile">
            <thead>
              <tr>
                <th style="width:38%">Désignation</th>
                <th>Qté</th>
                <th>Prix unitaire HT</th>
                <th>Remise</th>
                ${franchise ? '' : html`<th>TVA</th>`}
                <th>Nature</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${d.lines.map(
                (l, i) =>
                  html`<tr>
                    <td class="cards-full" data-label="Désignation">
                      <input
                        class="input"
                        name="lines.${i}.label"
                        list="catalog-list"
                        autocomplete="off"
                        aria-label="Désignation, ligne ${i + 1}"
                        value="${l.label}"
                        placeholder="Ex. : Accompagnement mars"
                      />
                    </td>
                    <td style="width:80px" data-label="Quantité">
                      <input
                        class="input"
                        name="lines.${i}.qty"
                        aria-label="Quantité, ligne ${i + 1}"
                        inputmode="decimal"
                        value="${String(l.qty).replace('.', ',')}"
                      />
                    </td>
                    <td style="width:130px" data-label="Prix unitaire HT">
                      <input
                        class="input"
                        name="lines.${i}.priceText"
                        aria-label="Prix unitaire HT, ligne ${i + 1}"
                        inputmode="decimal"
                        value="${l.priceText}"
                        placeholder="0,00"
                      />
                    </td>
                    <td style="width:90px" data-label="Remise (%)">
                      <input
                        class="input"
                        name="lines.${i}.discountText"
                        aria-label="Remise en %, ligne ${i + 1}"
                        inputmode="decimal"
                        value="${l.discountText ?? ''}"
                        placeholder="0 %"
                      />
                    </td>
                    ${
                      franchise
                        ? ''
                        : html`<td style="width:100px" data-label="TVA">
                            <select class="input" name="lines.${i}.vatRateBp" aria-label="TVA, ligne ${i + 1}">
                              ${VAT_RATES_BP.map((r) => opt(r, pct(r), l.vatRateBp === r))}
                            </select>
                          </td>`
                    }
                    <td style="width:120px" data-label="Nature">
                      <select class="input" name="lines.${i}.nature" aria-label="Nature, ligne ${i + 1}">
                        ${opt('services', 'Service', l.nature === 'services')}${opt('biens', 'Bien', l.nature === 'biens')}
                      </select>
                    </td>
                    <td style="width:44px" class="cards-action">
                      ${d.lines.length > 1 ? html`<button type="button" class="btn-icon" data-action="line-remove" data-index="${i}" aria-label="Supprimer la ligne">${raw(ICONS.close)}</button>` : ''}
                    </td>
                  </tr>`,
              )}
            </tbody>
          </table>
        </div>
        <datalist id="catalog-list">${(ws.company.catalog || []).map((c) => html`<option value="${c.label}"></option>`)}</datalist>
        <button type="button" class="btn btn-secondary btn-sm" data-action="line-add" style="margin-top:10px">+ Ajouter une ligne</button>
        ${(ws.company.catalog || []).length ? '' : html`<p class="form-hint">Astuce : enregistrez vos prestations habituelles dans <a href="#/parametres/catalogue">Paramètres › Prestations et articles</a> pour les retrouver ici avec leur prix.</p>`}
      </div>
      <div id="totals">${totalsBlock()}</div>
      ${franchise ? html`<p class="form-hint">Mention ajoutée automatiquement : « TVA non applicable, art. 293 B du CGI ».</p>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-primary" data-action="invoice-issue">
          ${d.type === 'quote' ? 'Émettre le devis' : d.type === 'deposit' ? "Émettre la facture d'acompte" : d.type === 'credit' ? 'Émettre l’avoir' : 'Émettre la facture'}
        </button>
        ${d.type === 'quote' ? '' : html`<button type="button" class="btn btn-gold" data-action="invoice-issue-send">${d.type === 'credit' ? 'Émettre et envoyer l’avoir' : 'Émettre et envoyer au client'}</button>`}
        <button type="button" class="btn btn-secondary" data-action="invoice-save">Enregistrer le brouillon</button>
        <button type="button" class="btn-link" data-action="invoice-cancel">Annuler</button>
      </div>
    </form>`;
}

/** Fiche du client choisi, modifiable sans quitter la facture ; ouverte d'office s'il lui manque une mention. */
export function clientEditBlock(d) {
  const c = ws.clients.find((x) => x.id === d.clientId);
  if (!c) return '';
  const e = { ...c, ...(d.clientEdit || {}) };
  const missing = d.issues?.some((i) => i.field?.startsWith('client.'));
  return html`<details class="client-edit" style="margin-top:12px" ${missing ? raw('open') : ''}>
    <summary style="cursor:pointer;font-size:14px;color:var(--color-primary)">
      ${missing ? 'Compléter la fiche de ce client' : 'Modifier la fiche de ce client'}
    </summary>
    <div class="form-grid" style="margin-top:12px">
      ${c.type !== 'B2C' ? field('SIREN', html`<input class="input" name="clientEdit.siren" inputmode="numeric" value="${e.siren || ''}" />`, { hint: 'Obligatoire pour une entreprise française.' }) : ''}
      ${field('Nom ou raison sociale', html`<input class="input" name="clientEdit.name" value="${e.name || ''}" />`)}
      ${field('Email (relances)', html`<input class="input" name="clientEdit.email" type="email" value="${e.email || ''}" />`)}
      ${field('Adresse', html`<input class="input" name="clientEdit.address" value="${e.address || ''}" />`)}
      ${c.country && c.country !== 'FR' ? field('N° de TVA intracommunautaire', html`<input class="input" name="clientEdit.vatNumber" value="${e.vatNumber || ''}" />`) : ''}
    </div>
  </details>`;
}

export function persistDraft() {
  const d = ui.draft;
  // Modifications de la fiche du client existant, enregistrées avant de reprendre ses données dans la facture.
  if (d.clientEdit && d.clientId !== '__new') {
    const c = ws.clients.find((x) => x.id === d.clientId);
    if (c) {
      const edits = { ...d.clientEdit };
      if (edits.siren !== undefined) edits.siren = edits.siren.replace(/\s/g, '');
      ws.saveClient({ ...c, ...edits, id: c.id });
    }
    d.clientEdit = null;
  }
  const unreadable = [];
  d.lines.forEach((l, i) => {
    const price = readPrice(l.priceText);
    if (price === null) unreadable.push({ message: `Ligne ${i + 1} : prix illisible « ${l.priceText} » (exemple : 1 234,56).`, field: `lines.${i}.unitPrice` });
    l.unitPrice = price ?? 0;
    l.qty = Number(String(l.qty).replace(',', '.')) || 0;
    const discount = readDiscount(l.discountText);
    if (discount === null)
      unreadable.push({
        message: `Ligne ${i + 1} : remise illisible « ${l.discountText} » (entre 0 et 100 %, exemple : 10).`,
        field: `lines.${i}.discountText`,
      });
    if (discount) l.discountBp = discount;
    else delete l.discountBp;
  });
  // Rien n'est enregistré tant qu'un prix est illisible : la facture garderait un montant faux.
  if (unreadable.length) {
    d.issues = unreadable;
    d.focusIssues = true;
    return null;
  }
  const data = draftInvoiceData();
  if (d.clientId === '__new') {
    if (!data.client.name?.trim()) {
      d.issues = [{ message: 'Le nom du client est manquant.', field: 'client.name' }];
      d.focusIssues = true;
      return null;
    }
    const client = ws.saveClient(data.client);
    d.clientId = client.id;
    data.client = client;
  }
  const inv = d.savedId ? ws.book.updateDraft(d.savedId, data) : ws.book.createDraft(data);
  d.savedId = inv.id;
  save();
  return inv;
}
