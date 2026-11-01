/**
 * Écran « sales ».
 */

import { VAT_RATES_BP, checkInvoice, computeTotals, isVatExempt, issuerName, lineHt } from '../../core/invoices.js?v=e821f3b';
import { FREQUENCIES, nextDate } from '../../core/recurring.js?v=e821f3b';
import { field, html, opt, raw } from '../html.js?v=e821f3b';
import { ICONS } from '../icons.js?v=e821f3b';
import { cloudState, eur, frDate, pct, today, ui, ws } from '../state.js?v=e821f3b';
import { save, toast } from '../store.js?v=e821f3b';
import { isUnconfirmed } from '../sync-ui.js?v=e821f3b';
import { badge, viewHeader } from '../ui/common.js?v=e821f3b';
import { qrSvg } from '../ui/qr.js?v=e821f3b';
import { invoicePaymentQr } from '../../core/epc.js?v=e821f3b';
import { lifecycleCard } from './expenses.js?v=e821f3b';
import { viewInvoiceForm } from './invoice-form.js?v=e821f3b';
import { depositCard } from './deposit.js?v=e821f3b';
import { viewTime } from './pilotage.js?v=e821f3b';
import { REMINDER_STEPS, dueReminderLevel, invoiceEmail, reminderMessage } from '../../core/reminders.js?v=e821f3b';

// ------------------------------------------------------------------ factures (§3.2, §3.5)

export const STATUS = {
  'a-echoir': ['À échoir', 'info'],
  '0-30': ['En retard', 'warning'],
  '31-60': ['En retard +30 j', 'warning'],
  '+60': ['En retard +60 j', 'danger'],
  payee: ['Payée', 'success'],
};

/** Routes de création : le type de document découle de l'adresse. */
export const NEW_DOC_ROUTES = { nouvelle: 'invoice', 'nouveau-devis': 'quote', 'nouvel-acompte': 'deposit' };

export const DOC_TITLES = { invoice: 'FACTURE', credit: 'AVOIR', deposit: "FACTURE D'ACOMPTE", quote: 'DEVIS' };

export function totalFor(i) {
  return i.status === 'issued' ? i.totals.totalTtc : computeTotals(i, { franchise: isVatExempt(i, ws.company) }).totalTtc;
}

export function viewSales(arg) {
  if (NEW_DOC_ROUTES[arg] || (arg && arg.startsWith('modifier-'))) return viewInvoiceForm(arg);
  if (arg) return viewInvoice(arg);
  if (ui.salesTab === 'recurrentes') return viewRecurring();
  if (ui.salesTab === 'temps') return viewTime();
  const quotesTab = ui.salesTab === 'devis';
  const rec = new Map(ws.receivables(today()).map((r) => [r.invoice.id, r]));
  const buckets = { 'a-echoir': 0, '0-30': 0, '31-60': 0, '+60': 0 };
  for (const r of rec.values()) if (r.outstanding > 0) buckets[r.bucket] += r.outstanding;
  const docs = [...ws.book.invoices].reverse().filter((i) => (i.type === 'quote') === quotesTab);
  const invoiced = new Set(ws.book.invoices.map((i) => i.quoteRef).filter(Boolean));
  const actions = html`<a class="btn btn-primary" href="#/ventes/nouvelle">Créer une facture</a
    ><a class="btn btn-secondary" href="#/ventes/nouveau-devis">Créer un devis</a
    ><a class="btn btn-secondary" href="#/ventes/nouvel-acompte">Facture d'acompte</a
    >${ws.book.invoices.some((i) => i.status === 'issued') ? html`<button class="btn btn-secondary" data-action="export-invoices-csv">Exporter (Excel)</button>` : ''}`;
  const statusOf = (i) => {
    if (i.status === 'draft') return badge('Brouillon');
    if (i.type === 'quote')
      return invoiced.has(i.number)
        ? badge('Facturé', 'success')
        : ui.quoteAcceptances?.[i.id]
          ? badge(`Accepté en ligne le ${frDate(ui.quoteAcceptances[i.id].at.slice(0, 10))}`, 'success')
          : i.dueDate < today()
            ? badge('Expiré', 'muted')
            : badge('Envoyé', 'info');
    if (i.type === 'credit') {
      const due = ws.book.outstanding(i);
      return html`<div class="badge-row">${badge('Avoir', 'primary')}${due < 0 ? badge(`À rembourser : ${eur(-due)}`, 'warning') : ''}</div>`;
    }
    return html`<div class="badge-row">${i.type === 'deposit' ? badge('Acompte', 'primary') : ''}${badge(...STATUS[rec.get(i.id).bucket])}</div>`;
  };
  return html` ${viewHeader('Factures', 'Ce que mes clients me doivent, et ce qu’ils ont réglé.', actions)}
    <div class="kpi-grid">
      ${[
        ['a-echoir', 'À échoir', 'hourglass'],
        ['0-30', 'En retard (0–30 j)', 'bell'],
        ['31-60', 'En retard (31–60 j)', 'warningTriangle'],
        ['+60', 'En retard (+60 j)', 'block'],
      ].map(
        ([k, l, ic]) =>
          html`<div class="kpi-card">
            <div class="kpi-icon">${raw(ICONS[ic])}</div>
            <div class="kpi-value">${eur(buckets[k])}</div>
            <div class="kpi-label">${l}</div>
          </div>`,
      )}
    </div>
    <div class="tabs" style="margin-bottom:14px">
      <button class="tab ${quotesTab ? '' : 'active'}" data-action="sales-tab" data-tab="factures">Factures</button>
      <button class="tab ${quotesTab ? 'active' : ''}" data-action="sales-tab" data-tab="devis">Devis</button>
      <button class="tab" data-action="sales-tab" data-tab="recurrentes">Récurrentes</button>
      <button class="tab" data-action="sales-tab" data-tab="temps">Temps passé</button>
    </div>
    ${quotesTab ? '' : depositCard()}
    <div class="card table-card">
      ${
        docs.length
          ? html`<div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Client</th>
                    <th>Date</th>
                    <th>${quotesTab ? 'Valable jusqu’au' : 'Échéance'}</th>
                    <th class="num">Total TTC</th>
                    ${quotesTab ? '' : html`<th class="num">Reste dû</th>`}
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  ${docs.map((i) => {
                    const total = totalFor(i);
                    const r = rec.get(i.id);
                    return html`<tr class="row-link" data-href="#/ventes/${i.id}">
                      <td class="mono">${i.number || '—'}</td>
                      <td>${i.client?.name || ''}</td>
                      <td>${frDate(i.issueDate)}</td>
                      <td>${frDate(i.dueDate)}</td>
                      <td class="num">${eur(i.type === 'credit' ? -total : total)}</td>
                      ${quotesTab ? '' : html`<td class="num">${r ? eur(r.outstanding) : ''}</td>`}
                      <td>${statusOf(i)}</td>
                    </tr>`;
                  })}
                </tbody>
              </table>
            </div>`
          : html`<div class="empty-state">
              <div class="empty-icon">${raw(ICONS.receipt)}</div>
              <h3>${quotesTab ? 'Aucun devis pour l’instant' : 'Aucune facture pour l’instant'}</h3>
              <p class="text-muted">${quotesTab ? 'Un devis accepté se transforme en facture en un clic.' : 'Créez la première en moins de 2 minutes.'}</p>
              <a class="btn btn-primary" href="#/ventes/${quotesTab ? 'nouveau-devis' : 'nouvelle'}">${quotesTab ? 'Créer un devis' : 'Créer une facture'}</a>
            </div>`
      }
    </div>`;
}

/** Onglet « Récurrentes » : modèles de factures produites automatiquement à chaque échéance. */
export function viewRecurring() {
  const f = ui.recurringForm || {};
  const franchise = ws.company.vatRegime === 'franchise';
  const tabs = html`<div class="tabs" style="margin-bottom:14px">
    <button class="tab" data-action="sales-tab" data-tab="factures">Factures</button>
    <button class="tab" data-action="sales-tab" data-tab="devis">Devis</button>
    <button class="tab active" data-action="sales-tab" data-tab="recurrentes">Récurrentes</button>
    <button class="tab" data-action="sales-tab" data-tab="temps">Temps passé</button>
  </div>`;
  const rows = ws.recurring.map((t) => {
    const ht = t.lines.reduce((s, l) => s + lineHt(l), 0);
    return html`<tr>
      <td>${t.client.name}</td>
      <td>${t.lines[0].label}</td>
      <td class="num">${eur(ht)} HT</td>
      <td>${FREQUENCIES[t.frequency].label}</td>
      <td>
        ${t.active ? frDate(nextDate(t)) : '—'}${t.endDate ? html`<br /><span class="text-muted" style="font-size:12px">jusqu'au ${frDate(t.endDate)}</span>` : ''}
      </td>
      <td>${t.autoIssue ? badge('Émission automatique', 'primary') : badge('Brouillon à valider')}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" data-action="recurring-toggle" data-id="${t.id}">${t.active ? 'Suspendre' : 'Reprendre'}</button
          ><button class="btn-link" data-action="recurring-delete" data-id="${t.id}">Supprimer</button>
        </div>
      </td>
    </tr>`;
  });
  return html` ${viewHeader('Factures', 'Abonnements, loyers, suivis mensuels : la facture se prépare toute seule à chaque échéance.')} ${tabs}
    <form class="card" data-form="recurring" style="display:flex;flex-direction:column;gap:14px">
      <h2>Nouvelle facture récurrente</h2>
      ${f.error ? html`<div class="issues-box">${f.error}</div>` : ''}
      <div class="form-grid">
        ${field(
          'Client',
          ws.clients.length
            ? html`<select class="input" name="clientId">
                ${ws.clients.map((c) => opt(c.id, c.name, f.clientId === c.id))}
              </select>`
            : html`<p class="form-hint">Ajoutez d’abord un client (écran Clients).</p>`,
        )}
        ${field('Désignation', html`<input class="input" name="label" value="${f.label || ''}" placeholder="Ex. : Maintenance mensuelle" />`, { hint: 'La période (« octobre 2026 ») est ajoutée automatiquement.' })}
        ${field('Prix HT', html`<input class="input" name="price" inputmode="decimal" placeholder="0,00" value="${f.price || ''}" />`)}
        ${
          franchise
            ? ''
            : field(
                'TVA',
                html`<select class="input" name="vatRateBp">
                  ${VAT_RATES_BP.map((r) => opt(r, pct(r), Number(f.vatRateBp ?? 2000) === r))}
                </select>`,
              )
        }
        ${field(
          'Nature',
          html`<select class="input" name="nature">
            ${opt('services', 'Service', f.nature !== 'biens')}${opt('biens', 'Bien', f.nature === 'biens')}
          </select>`,
        )}
        ${field(
          'Fréquence',
          html`<select class="input" name="frequency">
            ${Object.entries(FREQUENCIES).map(([k, v]) => opt(k, v.label, (f.frequency || 'monthly') === k))}
          </select>`,
        )}
        ${field('Première facture le', html`<input class="input" type="date" name="anchorDate" value="${f.anchorDate || today()}" />`)}
        ${field('Dernière facture au plus tard le (facultatif)', html`<input class="input" type="date" name="endDate" value="${f.endDate || ''}" />`)}
        ${field('Délai de paiement (jours)', html`<input class="input" name="paymentDays" inputmode="numeric" value="${f.paymentDays ?? ws.company.paymentTermsDays ?? 30}" />`)}
      </div>
      <label class="form-field-checkbox" style="display:flex;gap:8px;align-items:center"
        ><input type="checkbox" name="autoIssue" ${f.autoIssue ? raw('checked') : ''} />Émettre automatiquement (sinon la facture est préparée en brouillon et
        apparaît dans « À faire »)</label
      >
      <div><button class="btn btn-primary" type="submit" ${ws.clients.length ? '' : raw('disabled')}>Créer la facture récurrente</button></div>
    </form>
    <div class="card table-card">
      ${
        rows.length
          ? html`<div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Désignation</th>
                    <th class="num">Montant</th>
                    <th>Fréquence</th>
                    <th>Prochaine</th>
                    <th>Mode</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>`
          : html`<div class="empty-state">
              <div class="empty-icon">${raw(ICONS.refresh)}</div>
              <h3>Aucune facture récurrente</h3>
            </div>`
      }
    </div>`;
}

/** Prépare les factures récurrentes échues, une fois par jour et par session. */
export function runRecurring() {
  if (ui.recurringRanOn === today() || !ws.recurring.some((t) => t.active)) return;
  ui.recurringRanOn = today();
  const r = ws.generateRecurring(today());
  const n = r.drafts.length + r.issued.length;
  if (!n) return;
  save();
  setTimeout(
    () =>
      toast(
        r.issued.length
          ? `${r.issued.length} facture(s) récurrente(s) émise(s)${r.drafts.length ? `, ${r.drafts.length} à vérifier` : ''}.`
          : `${r.drafts.length} facture(s) récurrente(s) prête(s) à émettre.`,
      ),
    50,
  );
}

/** QR code de virement SEPA sous la facture (reste dû), pour payer depuis l'application de sa banque. */
function paymentQrBlock(inv, company, outstanding) {
  const payload = invoicePaymentQr(inv, company, outstanding);
  if (!payload) return '';
  return html`<div class="payment-qr">
    ${qrSvg(payload, { size: 112, label: `QR code de paiement de la facture ${inv.number}` })}
    <div>
      <strong>Payer par virement</strong>
      <p class="text-muted">
        Scannez ce code avec l’application de votre banque : bénéficiaire, IBAN, montant (${eur(outstanding)}) et référence sont pré-remplis.
      </p>
    </div>
  </div>`;
}

export function viewInvoice(id) {
  let inv;
  try {
    inv = ws.book.get(id);
  } catch {
    return html`<div class="empty-state">
      <h3>Facture introuvable</h3>
      <button class="btn btn-primary" data-href="#/ventes">Retour aux factures</button>
    </div>`;
  }
  const issued = inv.status === 'issued';
  const company = issued ? inv.issuer : ws.company;
  const franchise = isVatExempt(inv, company);
  const totals = issued ? inv.totals : computeTotals(inv, { franchise });
  const outstanding = issued ? ws.book.outstanding(inv) : null;
  const issues = issued ? [] : checkInvoice(inv, ws.company);
  const payments = ws.book.payments[inv.id] || [];
  const c = inv.client;
  // Relance : niveau proposé (J+3, J+15, J+30), sinon le suivant ; modèle de l'entreprise (Paramètres).
  const history = issued ? ws.reminderHistory(inv.id) : [];
  const lateDays = Math.floor((Date.parse(today()) - Date.parse(inv.dueDate)) / 86400000);
  const reminderLevel = dueReminderLevel(lateDays, history) || Math.min(3, Math.max(0, ...history.map((h) => h.level)) + 1);
  const reminder = invoiceEmail(ws, inv) && issued && outstanding > 0 ? reminderMessage(ws, inv.id, reminderLevel, today()) : null;
  const mailto = reminder
    ? `mailto:${ui.demo ? '' : encodeURIComponent(reminder.to)}?subject=${encodeURIComponent(reminder.subject)}&body=${encodeURIComponent(reminder.body)}`
    : '';
  const quote = inv.type === 'quote';
  // Mode connecté : le numéro n'est définitif qu'une fois attribué par la base.
  const unconfirmed = issued && isUnconfirmed(inv);
  const invoicedFrom = quote && issued ? ws.book.invoices.find((i) => i.quoteRef === inv.number) : null;
  const subtitle = !issued
    ? 'Brouillon : pas encore de numéro, modifiable.'
    : unconfirmed
      ? 'Émission en cours : numéro en attente de confirmation par le serveur. Impression et envoi disponibles dans un instant.'
      : quote
        ? invoicedFrom
          ? `Devis facturé (${invoicedFrom.number || 'facture en brouillon'})`
          : `Devis valable jusqu'au ${frDate(inv.dueDate)}`
        : outstanding > 0
          ? `Reste dû : ${eur(outstanding)}`
          : inv.type === 'credit'
            ? `Avoir sur la facture ${inv.creditOf}`
            : 'Payée intégralement';
  const actions = html` ${!issued ? html`<button class="btn btn-primary" data-action="invoice-issue-existing" data-id="${inv.id}">Émettre</button>${quote ? '' : html`<button class="btn btn-gold" data-action="invoice-issue-send" data-id="${inv.id}">Émettre et envoyer</button>`}<button class="btn btn-secondary" data-href="#/ventes/modifier-${inv.id}">Modifier</button><button class="btn btn-secondary" data-action="invoice-delete" data-id="${inv.id}">Supprimer</button>` : ''}
  ${quote && issued && !invoicedFrom ? html`<button class="btn btn-gold" data-action="quote-convert" data-id="${inv.id}">Transformer en facture</button>` : ''}
  ${issued && !unconfirmed ? html`<button class="btn btn-secondary" data-action="print">Imprimer / PDF</button>` : ''}
  ${issued && !quote && !unconfirmed ? html`<button class="btn btn-primary" data-action="invoice-send" data-id="${inv.id}">Envoyer au client</button><button class="btn btn-secondary" data-action="invoice-pdf" data-id="${inv.id}">Télécharger la facture (PDF)</button><button class="btn btn-secondary" data-action="einvoice" data-id="${inv.id}">Facture électronique (XML)</button>` : ''}
  ${
    mailto && !quote && !unconfirmed
      ? !ui.demo && cloudState.emailReady
        ? html`<button class="btn btn-gold" data-action="reminder-email" data-id="${inv.id}" data-index="${reminderLevel}">
            Relancer le client par e-mail
          </button>`
        : html`<a class="btn btn-gold" href="${mailto}" data-action="reminder-send" data-id="${inv.id}" data-index="${reminderLevel}">Relancer le client</a>`
      : ''
  }
  ${issued && inv.type !== 'credit' && !quote ? html`<button class="btn btn-secondary" data-action="credit-note" data-id="${inv.id}">Créer un avoir</button>` : ''}`;
  const historyNote = history.length
    ? html`<p class="text-muted no-print" style="margin:-6px 0 14px">
        Relances envoyées : ${history.map((h) => `${REMINDER_STEPS[h.level - 1]?.label.toLowerCase() || 'relance'} le ${frDate(h.date)}`).join(', ')}.
      </p>`
    : '';
  return html` <div class="no-print">
      <button class="btn-link" data-href="#/ventes">← Retour aux factures</button
      >${viewHeader(unconfirmed ? `${quote ? 'Devis' : 'Facture'} en cours d’émission` : inv.number || (quote ? 'Brouillon de devis' : 'Brouillon de facture'), subtitle, actions)}
    </div>
    ${historyNote}
    ${
      issues.length
        ? html`<div class="issues-box no-print" style="margin-bottom:14px">
            <strong>Avant émission, complétez :</strong>
            <ul>
              ${issues.map((i) => html`<li>${i.message}</li>`)}
            </ul>
          </div>`
        : ''
    }
    <article class="invoice-sheet">
      <div class="sheet-head">
        <div class="party">
          <strong>${issuerName(company)}</strong
          ><br />${company.address}<br />${company.legalForm}${company.capital ? ` au capital de ${company.capital}` : ''}${company.registration ? html`<br />${company.registration} ${company.siren}` : ''}<br />SIREN
          ${company.siren}${company.vatNumber ? html`<br />TVA ${company.vatNumber}` : ''}
        </div>
        <div>
          <h2 class="sheet-title">${DOC_TITLES[inv.type] || 'FACTURE'}</h2>
          <div class="gold-rule"></div>
          <div class="party">
            N° <strong>${inv.number || '(attribué à l’émission)'}</strong><br />Date : ${frDate(inv.issueDate)}<br />${quote ? 'Valable jusqu’au' : 'Échéance'}
            :
            ${frDate(inv.dueDate)}${inv.creditOf ? html`<br />Avoir sur facture ${inv.creditOf}` : ''}${inv.quoteRef ? html`<br />Selon devis ${inv.quoteRef}` : ''}${inv.deliveryDate ? html`<br />Livraison / exécution : ${frDate(inv.deliveryDate)}` : ''}${inv.deliveryAddress ? html`<br />Livré à : ${inv.deliveryAddress}` : ''}${issued ? html`<br />Nature : ${inv.operationNature}` : ''}
          </div>
        </div>
      </div>
      <div class="party" style="margin-bottom:22px">
        <span style="color:#5f6673">Facturé à</span><br /><strong>${c.name}</strong
        ><br />${c.address || ''}${c.siren ? html`<br />SIREN ${c.siren}` : ''}${c.vatNumber ? html`<br />TVA ${c.vatNumber}` : ''}
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Désignation</th>
            <th class="num">Qté</th>
            <th class="num">PU HT</th>
            ${franchise ? '' : html`<th class="num">TVA</th>`}
            <th class="num">Total HT</th>
          </tr>
        </thead>
        <tbody>
          ${inv.lines.map(
            (l) =>
              html`<tr>
                <td>${l.label}</td>
                <td class="num">${String(l.qty).replace('.', ',')}</td>
                <td class="num">${eur(l.unitPrice)}</td>
                ${franchise ? '' : html`<td class="num">${pct(l.vatRateBp)}</td>`}
                <td class="num">${eur(lineHt(l))}</td>
              </tr>`,
          )}
        </tbody>
      </table>
      <table class="totals-table" style="margin-top:14px">
        <tbody>
          <tr>
            <td>Total HT</td>
            <td class="num">${eur(totals.totalHt)}</td>
          </tr>
          ${totals.vatBreakdown
            .filter((v) => v.vat)
            .map(
              (v) =>
                html`<tr>
                  <td>TVA ${pct(v.rateBp)}</td>
                  <td class="num">${eur(v.vat)}</td>
                </tr>`,
            )}
          <tr class="grand">
            <td>Total TTC</td>
            <td class="num">${eur(totals.totalTtc)}</td>
          </tr>
          ${(inv.deposits || []).map(
            (x) =>
              html`<tr>
                <td>Acompte ${x.number} déduit</td>
                <td class="num">${eur(-x.amountTtc)}</td>
              </tr>`,
          )}
          ${
            inv.deposits?.length
              ? html`<tr class="grand">
                  <td>Net à payer</td>
                  <td class="num">${eur(totals.netToPay)}</td>
                </tr>`
              : ''
          }
        </tbody>
      </table>
      ${company.iban && !quote ? html`<p style="margin-top:18px;font-size:13.5px">Règlement par virement : <span class="mono">${company.iban}</span></p>` : ''}
      ${paymentQrBlock(inv, company, outstanding)}
      <div class="mentions">${(issued ? inv.mentions : []).map((m) => html`<div>${m}</div>`)}</div>
    </article>
    ${issued && !quote ? lifecycleCard(inv) : ''}
    ${
      payments.length
        ? html`<div class="card table-card no-print" style="margin-top:20px">
            <h2 style="padding:16px 16px 0">Règlements reçus</h2>
            <table class="table">
              <tbody>
                ${payments.map(
                  (p) =>
                    html`<tr>
                      <td>${frDate(p.date)}</td>
                      <td class="num">${eur(p.amount)}</td>
                    </tr>`,
                )}
              </tbody>
            </table>
          </div>`
        : ''
    }`;
}
