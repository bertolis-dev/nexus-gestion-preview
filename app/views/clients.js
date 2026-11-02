/**
 * Écran « Clients » : liste avec ce que chacun rapporte et doit, fiche détaillée (coordonnées,
 * factures et devis, habitudes de paiement), création, et import depuis un tableur.
 */

import { clientDocuments, clientSummary } from '../../core/clients.js?v=269c883';
import { DOC_TITLES } from './sales.js?v=269c883';
import { field, html, opt } from '../html.js?v=269c883';
import { eur, frDate, today, ui, ws } from '../state.js?v=269c883';
import { badge, viewHeader } from '../ui/common.js?v=269c883';
import { clientPortalCard } from './pilotage.js?v=269c883';

const days = (n) => (n === null ? '—' : `${n} jour${n > 1 ? 's' : ''}`);

export function viewClients(arg) {
  if (arg === 'nouveau') return clientForm(null);
  const client = arg && ws.clients.find((c) => c.id === arg);
  if (client) return clientDetail(client);
  return clientList();
}

function clientList() {
  const t = today();
  const rows = ws.clients
    .map((c) => clientSummary(ws.book, c, t))
    .sort((a, b) => b.outstanding - a.outstanding || b.revenue12 - a.revenue12 || a.client.name.localeCompare(b.client.name, 'fr'));
  const totalDue = rows.reduce((s, r) => s + r.outstanding, 0);
  const totalLate = rows.reduce((s, r) => s + r.overdue, 0);
  return html`${viewHeader(
    'Clients',
    'Ce que chaque client vous rapporte, ce qu’il vous doit et comment il paie.',
    html`<button class="btn btn-primary" data-href="#/clients/nouveau">Nouveau client</button>
      <button type="button" class="btn btn-secondary" data-action="clients-file-pick">Importer une liste</button
      ><input type="file" accept=".csv,.txt,text/csv" data-action="clients-file" hidden aria-label="Fichier de clients (CSV)" />`,
  )}
  ${importPreview()}
  ${
    rows.length
      ? html`<div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-value">${rows.length}</div>
              <div class="kpi-label">Client${rows.length > 1 ? 's' : ''}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-value">${eur(totalDue)}</div>
              <div class="kpi-label">Ce que mes clients me doivent</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-value">${eur(totalLate)}</div>
              <div class="kpi-label">Dont en retard</div>
            </div>
          </div>
          <div class="card table-card">
            <div style="padding:16px 16px 0">
              <input
                class="input"
                type="search"
                data-clients-search
                placeholder="Rechercher un client (nom, e-mail, SIREN)…"
                aria-label="Rechercher un client"
                style="width:100%;max-width:420px"
              />
            </div>
            <div class="table-scroll">
              <table class="table clients-table cards-mobile">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th class="num">CA sur 12 mois</th>
                    <th class="num">Reste dû</th>
                    <th class="num">Délai moyen</th>
                    <th>Dernière facture</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map(
                    (r) =>
                      html`<tr
                        class="clickable-row"
                        data-href="#/clients/${r.client.id}"
                        data-search="${`${r.client.name} ${r.client.email || ''} ${r.client.siren || ''}`.toLowerCase()}"
                      >
                        <td class="cards-full">
                          <a href="#/clients/${r.client.id}" class="client-name">${r.client.name}</a>
                          <div class="text-muted" style="font-size:12.5px">
                            ${r.client.email || (r.client.type === 'B2C' ? 'Particulier' : 'Pas d’e-mail : relances impossibles')}
                          </div>
                        </td>
                        <td class="num" data-label="CA sur 12 mois">${eur(r.revenue12)}</td>
                        <td class="num" data-label="Reste dû">
                          ${r.outstanding ? eur(r.outstanding) : '—'} ${r.overdue ? html`<div>${badge(`${eur(r.overdue)} en retard`, 'warning')}</div>` : ''}
                        </td>
                        <td class="num" data-label="Délai moyen">${days(r.avgPaymentDays)}</td>
                        <td data-label="Dernière facture">${r.lastInvoiceDate ? frDate(r.lastInvoiceDate) : '—'}</td>
                      </tr>`,
                  )}
                </tbody>
              </table>
            </div>
            <p class="text-muted clients-empty-search" hidden style="padding:0 16px 16px">Aucun client ne correspond à cette recherche.</p>
          </div>`
      : html`<div class="card empty-state">
          <p>
            Aucun client pour l’instant. Ajoutez-en un, importez votre liste depuis un tableur, ou créez directement une facture : le client est enregistré au
            passage.
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
            <button class="btn btn-primary" data-href="#/clients/nouveau">Nouveau client</button>
            <button class="btn btn-secondary" data-href="#/ventes/nouvelle">Créer une facture</button>
          </div>
        </div>`
  }`;
}

/** Aperçu d'un import : ce qui sera créé, les doublons écartés, les lignes refusées. */
function importPreview() {
  const imp = ui.clientImport;
  if (!imp) return '';
  return html`<div class="card" style="display:flex;flex-direction:column;gap:10px" role="status">
    <h2>Import de « ${imp.fileName} »</h2>
    <p style="margin:0">
      <strong>${imp.clients.length} client${imp.clients.length > 1 ? 's' : ''} à ajouter</strong>${
        imp.duplicates.length
          ? html` · ${imp.duplicates.length} déjà présent${imp.duplicates.length > 1 ? 's' : ''}, ignoré${imp.duplicates.length > 1 ? 's' : ''}`
          : ''
      }${imp.errors.length ? html` · ${imp.errors.length} ligne${imp.errors.length > 1 ? 's' : ''} refusée${imp.errors.length > 1 ? 's' : ''}` : ''}
    </p>
    ${
      imp.clients.length
        ? html`<p class="text-muted" style="margin:0">
            ${imp.clients
              .slice(0, 8)
              .map((c) => c.name)
              .join(', ')}${imp.clients.length > 8 ? '…' : ''}
          </p>`
        : ''
    }
    ${
      imp.errors.length
        ? html`<ul class="text-muted" style="margin:0;padding-left:18px">
            ${imp.errors.slice(0, 10).map((e) => html`<li>Ligne ${e.line} : ${e.message}</li>`)}
          </ul>`
        : ''
    }
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${imp.clients.length ? html`<button class="btn btn-primary" data-action="clients-import-confirm">Ajouter ${imp.clients.length} client${imp.clients.length > 1 ? 's' : ''}</button>` : ''}
      <button class="btn btn-secondary" data-action="clients-import-cancel">Annuler</button>
    </div>
    <p class="form-hint" style="margin:0">
      Colonnes reconnues : nom (ou raison sociale), e-mail, SIREN ou SIRET, adresse, code postal, ville, pays, n° de TVA.
    </p>
  </div>`;
}

function clientDetail(c) {
  const s = clientSummary(ws.book, c, today());
  const docs = clientDocuments(ws.book.invoices, c).sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
  const reminders = docs.flatMap((i) => (ws.company.reminders?.[i.id] || []).map((r) => ({ ...r, number: i.number })));
  return html`<button class="btn-link no-print" data-href="#/clients">← Retour aux clients</button>
    ${viewHeader(
      c.name,
      [c.type === 'B2C' ? 'Particulier' : 'Entreprise', c.siren ? `SIREN ${c.siren}` : '', c.email || ''].filter(Boolean).join(' · '),
      html`<button class="btn btn-primary" data-action="client-new-doc" data-id="${c.id}" data-index="invoice">Créer une facture</button
        ><button class="btn btn-secondary" data-action="client-new-doc" data-id="${c.id}" data-index="quote">Créer un devis</button>`,
    )}
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-value">${eur(s.revenue12)}</div>
        <div class="kpi-label">Chiffre d’affaires HT sur 12 mois</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${eur(s.outstanding)}</div>
        <div class="kpi-label">Reste dû${s.overdue ? ` · dont ${eur(s.overdue)} en retard` : ''}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${days(s.avgPaymentDays)}</div>
        <div class="kpi-label">Délai moyen de paiement</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${s.invoiceCount}</div>
        <div class="kpi-label">Facture${s.invoiceCount > 1 ? 's' : ''} émise${s.invoiceCount > 1 ? 's' : ''}</div>
      </div>
    </div>
    <div class="card table-card">
      <h2 style="padding:16px 16px 0">Factures et devis</h2>
      ${
        docs.length
          ? html`<div class="table-scroll">
              <table class="table client-docs cards-mobile">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Document</th>
                    <th>Date</th>
                    <th class="num">Total TTC</th>
                    <th class="num">Reste dû</th>
                  </tr>
                </thead>
                <tbody>
                  ${docs.map((i) => {
                    const due = i.status === 'issued' && i.type !== 'quote' ? ws.book.outstanding(i) : 0;
                    return html`<tr class="clickable-row" data-href="#/ventes/${i.id}">
                      <td class="mono" data-label="N°"><a class="doc-link" href="#/ventes/${i.id}">${i.number || 'Brouillon'}</a></td>
                      <td data-label="Document">${(DOC_TITLES[i.type] || 'FACTURE').toLowerCase().replace(/^./, (x) => x.toUpperCase())}</td>
                      <td data-label="Date">${frDate(i.issueDate)}</td>
                      <td class="num" data-label="Total TTC">${eur(i.totals?.totalTtc || 0)}</td>
                      <td class="num" data-label="Reste dû">
                        ${due > 0 ? html`${eur(due)}${i.dueDate && i.dueDate < today() ? html` ${badge('En retard', 'warning')}` : ''}` : i.status === 'issued' && i.type === 'invoice' ? badge('Payée', 'success') : '—'}
                      </td>
                    </tr>`;
                  })}
                </tbody>
              </table>
            </div>`
          : html`<p class="text-muted" style="padding:0 16px 16px">Aucune facture ni devis pour ce client.</p>`
      }
    </div>
    ${
      reminders.length
        ? html`<div class="card">
            <h2>Relances envoyées</h2>
            <ul style="margin:0;padding-left:18px">
              ${reminders.sort((a, b) => b.date.localeCompare(a.date)).map((r) => html`<li>Facture ${r.number} : relance n° ${r.level} le ${frDate(r.date)}</li>`)}
            </ul>
          </div>`
        : ''
    }
    ${clientPortalCard(c)} ${clientForm(c)}`;
}

/** Fiche du client (création ou modification). Le code du client, qui relie ses factures, ne change pas. */
function clientForm(c) {
  const e = c || ui.clientDraft || { type: 'B2B', country: 'FR' };
  const fresh = !c;
  const body = html`<form class="card" data-form="client" style="display:flex;flex-direction:column;gap:14px" novalidate>
    <h2>${fresh ? 'Nouveau client' : 'Fiche du client'}</h2>
    ${c ? html`<input type="hidden" name="id" value="${c.id}" />` : ''}
    <div class="form-grid">
      ${field(
        'Type de client',
        html`<select class="input" name="type">
          ${opt('B2B', 'Entreprise', e.type !== 'B2C')}${opt('B2C', 'Particulier', e.type === 'B2C')}
        </select>`,
      )}
      ${field(
        'SIREN',
        html`<div style="display:flex;gap:8px">
          <input class="input" name="siren" inputmode="numeric" value="${e.siren || ''}" /><button
            type="button"
            class="btn btn-secondary btn-sm"
            data-action="client-form-lookup"
          >
            Remplir
          </button>
        </div>`,
        { hint: 'Obligatoire sur les factures à une entreprise française. « Remplir » reprend le nom et l’adresse.' },
      )}
      ${field('Nom ou raison sociale', html`<input class="input" name="name" required value="${e.name || ''}" />`)}
      ${field('E-mail de facturation', html`<input class="input" name="email" type="email" value="${e.email || ''}" />`, { hint: 'Pour l’envoi des factures et des relances.' })}
      ${field('Adresse', html`<input class="input" name="address" value="${e.address || ''}" />`)}
      ${field('Pays', html`<input class="input" name="country" maxlength="2" value="${e.country || 'FR'}" style="max-width:90px;text-transform:uppercase" />`, { hint: 'Code du pays : FR, BE, DE…' })}
      ${field('N° de TVA intracommunautaire', html`<input class="input" name="vatNumber" value="${e.vatNumber || ''}" />`, { hint: 'Pour un client professionnel d’un autre pays de l’UE.' })}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" type="submit">${fresh ? 'Créer le client' : 'Enregistrer'}</button>
      ${fresh ? html`<button type="button" class="btn-link" data-href="#/clients">Annuler</button>` : ''}
    </div>
  </form>`;
  return fresh ? html`<button class="btn-link no-print" data-href="#/clients">← Retour aux clients</button>${viewHeader('Nouveau client')}${body}` : body;
}

/** Nombre de clients affichés après filtrage (recherche instantanée, sans redessiner l'écran). */
export function filterClients(query) {
  const q = query.trim().toLowerCase();
  let shown = 0;
  for (const tr of document.querySelectorAll('.clients-table tbody tr')) {
    const ok = !q || tr.dataset.search.includes(q);
    tr.hidden = !ok;
    if (ok) shown++;
  }
  const empty = document.querySelector('.clients-empty-search');
  if (empty) empty.hidden = shown > 0;
  return shown;
}
