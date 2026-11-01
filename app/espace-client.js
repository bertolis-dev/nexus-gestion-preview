/**
 * Espace client (page publique, sans compte) : le client ouvre le lien reçu de son fournisseur, voit
 * ses factures et ses devis, télécharge les PDF, paie par virement (QR code) et accepte un devis.
 * Le secret du lien est dans le fragment (#) de l'adresse : il n'est envoyé qu'à la fonction
 * client_portal / accept_quote de la base (migration 0034), jamais dans une adresse ni un journal.
 */

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js?v=d415f7a';
import { html } from './html.js?v=d415f7a';
import { formatEuros } from '../core/money.js?v=d415f7a';
import { invoicePaymentQr } from '../core/epc.js?v=d415f7a';
import { qrSvg } from './ui/qr.js?v=d415f7a';

const root = document.getElementById('portal-root');
const token = location.hash.slice(1);
const KIND = { invoice: 'Facture', credit: 'Avoir', deposit: 'Facture d’acompte', quote: 'Devis' };
const frDate = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
let data = null;
let accepting = null;

async function rpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || 'Service momentanément indisponible : réessayez dans quelques minutes.');
  return body;
}

function toast(message, error = false) {
  const el = Object.assign(document.createElement('div'), { className: `toast toast-${error ? 'error' : 'success'}`, textContent: message });
  document.getElementById('toast-root').append(el);
  setTimeout(() => el.remove(), 5000);
}

/** Reste à payer d'une facture : net à payer, moins règlements et avoirs. */
const outstanding = (d) =>
  d.type === 'quote' || d.type === 'credit' ? 0 : Math.max(0, (d.totals.netToPay ?? d.totals.totalTtc) - Number(d.paid) - Number(d.credited));

function status(d) {
  if (d.type === 'quote') {
    if (d.acceptance) return html`<span class="badge badge-success">Accepté le ${frDate(d.acceptance.at)}</span>`;
    return d.dueDate < todayIso()
      ? html`<span class="badge badge-muted">Expiré</span>`
      : html`<span class="badge badge-info">Valable jusqu’au ${frDate(d.dueDate)}</span>`;
  }
  if (d.type === 'credit') return html`<span class="badge badge-primary">Avoir</span>`;
  const due = outstanding(d);
  if (!due) return html`<span class="badge badge-success">Payée</span>`;
  return html`<span class="badge ${d.dueDate < todayIso() ? 'badge-warning' : 'badge-info'}">Reste ${formatEuros(due)} · échéance ${frDate(d.dueDate)}</span>`;
}

function acceptForm(d) {
  return html`<form class="portal-accept" data-accept="${d.id}">
    <p><strong>Accepter le devis ${d.number}</strong> (${formatEuros(d.totals.totalTtc)} TTC).</p>
    <label class="form-field" for="accept-name"
      >Vos prénom et nom<input class="input" id="accept-name" name="name" required minlength="2" maxlength="120" autocomplete="name"
    /></label>
    <label class="form-field-checkbox" style="display:flex;gap:8px;align-items:flex-start"
      ><input type="checkbox" name="agree" required />J’ai lu le devis et je l’accepte, « bon pour accord ». La date et l’heure de mon acceptation sont
      enregistrées.</label
    >
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" type="submit">Accepter le devis</button>
      <button class="btn btn-secondary" type="button" data-cancel>Annuler</button>
    </div>
  </form>`;
}

function paymentBlock(d) {
  const due = outstanding(d);
  if (!due || !d.issuer?.iban) return '';
  const payload = invoicePaymentQr(d, d.issuer, due);
  return html`<div class="portal-pay">
    ${payload ? qrSvg(payload, { size: 132, label: `QR code de paiement de la facture ${d.number}` }) : ''}
    <div>
      <p style="margin:0 0 4px"><strong>Payer par virement</strong> : scannez le QR code avec l’application de votre banque, ou utilisez :</p>
      <p class="mono" style="margin:0">IBAN ${d.issuer.iban.replace(/(.{4})/g, '$1 ').trim()}${d.issuer.bic ? html`<br />BIC ${d.issuer.bic}` : ''}</p>
      <p style="margin:4px 0 0">Montant ${formatEuros(due)}, référence « Facture ${d.number} ».</p>
    </div>
  </div>`;
}

function render() {
  const docs = data.documents;
  const totalDue = docs.reduce((s, d) => s + outstanding(d), 0);
  root.innerHTML = html`<header class="portal-header">
      <div>
        <p class="text-muted" style="margin:0">Espace client</p>
        <h1 style="margin:0">${data.company.name}</h1>
        <p style="margin:4px 0 0">Documents de <strong>${data.client}</strong></p>
      </div>
      ${
        totalDue
          ? html`<div class="kpi-card">
              <div class="kpi-value">${formatEuros(totalDue)}</div>
              <div class="kpi-label">Reste à payer</div>
            </div>`
          : ''
      }
    </header>
    ${
      docs.length
        ? html`<ul class="portal-docs">
            ${docs.map(
              (d) =>
                html`<li class="card">
                  <div class="portal-doc-head">
                    <div>
                      <strong>${KIND[d.type] || 'Facture'} ${d.number}</strong>
                      <span class="text-muted"> · ${frDate(d.issueDate)} · ${formatEuros(d.totals.totalTtc)} TTC</span>
                    </div>
                    ${status(d)}
                  </div>
                  ${paymentBlock(d)} ${accepting === d.id ? acceptForm(d) : ''}
                  <div class="portal-doc-actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-pdf="${d.id}">Télécharger le PDF</button>
                    ${d.type === 'quote' && !d.acceptance && d.dueDate >= todayIso() && accepting !== d.id ? html`<button type="button" class="btn btn-primary btn-sm" data-start-accept="${d.id}">Accepter ce devis</button>` : ''}
                  </div>
                </li>`,
            )}
          </ul>`
        : html`<div class="card"><p style="margin:0">Aucun document pour l’instant.</p></div>`
    }
    <footer class="portal-footer text-muted">
      Une question ? Contactez
      ${data.company.name}${data.company.email ? html` : <a href="mailto:${data.company.email}">${data.company.email}</a>` : ''}${data.company.phone ? html` · ${data.company.phone}` : ''}.<br />
      Lien personnel valable jusqu’au ${frDate(data.expires_at)}, à ne pas transférer. Espace proposé par Nexus Gestion.
    </footer>`.s;
}

function fail(message) {
  root.innerHTML = html`<div class="card portal-error" role="alert">
    <h1 style="margin-top:0">Espace client indisponible</h1>
    <p>${message}</p>
  </div>`.s;
}

async function downloadPdf(id) {
  const d = data.documents.find((x) => x.id === id);
  try {
    const { invoicePdf } = await import('./facturx-ui.js?v=d415f7a');
    const bytes = await invoicePdf(d, d.issuer, { outstanding: outstanding(d) });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `${d.type === 'quote' ? 'devis' : d.type === 'credit' ? 'avoir' : 'facture'}-${d.number}.pdf`,
    });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    console.warn('PDF', err);
    toast('Le PDF n’a pas pu être préparé : réessayez, ou demandez-le à votre fournisseur.', true);
  }
}

root.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.pdf) return downloadPdf(t.dataset.pdf);
  if (t.dataset.startAccept) {
    accepting = t.dataset.startAccept;
    render();
    return root.querySelector('#accept-name')?.focus();
  }
  if (t.hasAttribute('data-cancel')) {
    accepting = null;
    render();
  }
});

root.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.dataset.accept;
  const name = new FormData(form).get('name');
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const acceptance = await rpc('accept_quote', { p_token: token, p_quote: id, p_name: name });
    data.documents.find((d) => d.id === id).acceptance = acceptance;
    accepting = null;
    render();
    toast('Merci : votre acceptation du devis est enregistrée et transmise à votre fournisseur.');
  } catch (err) {
    button.disabled = false;
    toast(err.message, true);
  }
});

async function start() {
  if (!/^[0-9a-f]{64}$/.test(token))
    return fail('Ce lien est incomplet : ouvrez-le directement depuis l’e-mail reçu, ou demandez-en un nouveau à votre fournisseur.');
  try {
    data = await rpc('client_portal', { p_token: token });
    document.title = `${data.company.name} · Espace client`;
    render();
  } catch (err) {
    fail(err.message);
  }
}

window.addEventListener('hashchange', () => location.reload());
start();
