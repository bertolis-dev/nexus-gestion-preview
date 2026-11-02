/**
 * Écran « Pilotage » (échéances fiscales, budget, rémunération du dirigeant) et compléments d'autres
 * écrans : temps passé (Factures), trajets (Dépenses), stock (Paramètres › Catalogue), espace client (fiche client).
 */

import { fiscalCalendar } from '../../core/fiscal-calendar.js?v=3bfbbd4';
import { BUDGET_LINES, budgetReport } from '../../core/budget.js?v=3bfbbd4';
import { compareScenarios, capitalCents, REMUNERATION_DEFAULTS } from '../../core/remuneration.js?v=3bfbbd4';
import { entryAmount, formatMinutes, isBilled, unbilledByClient } from '../../core/timesheet.js?v=3bfbbd4';
import { stockLevels } from '../../core/stock.js?v=3bfbbd4';
import { HORSEPOWER_CHOICES } from '../../core/mileage.js?v=3bfbbd4';
import { field, html, opt, raw } from '../html.js?v=3bfbbd4';
import { isMicro } from '../render.js?v=3bfbbd4';
import { cloudState, eur, frDate, today, ui, ws } from '../state.js?v=3bfbbd4';
import { badge, viewHeader } from '../ui/common.js?v=3bfbbd4';

const euros = (c) => (c ? (c / 100).toFixed(2).replace('.', ',').replace(/,00$/, '') : '');
const errorBox = (msg) => (msg ? html`<div class="issues-box" role="alert">${msg}</div>` : '');

// ------------------------------------------------------------------ écran Pilotage

export const showsRemuneration = () => ws.company.taxRegime === 'is-reel';

export function viewPilotage() {
  const tabs = [['echeances', 'Échéances'], ['budget', 'Budget'], ...(showsRemuneration() ? [['remuneration', 'Salaire ou dividendes']] : [])];
  const tab = tabs.some(([k]) => k === ui.pilotageTab) ? ui.pilotageTab : 'echeances';
  const body = tab === 'budget' ? budgetTab() : tab === 'remuneration' ? remunerationTab() : deadlinesTab();
  return html`${viewHeader('Pilotage', 'Vos prochaines échéances, votre budget de l’année et, en société, votre rémunération.')}
    <div class="tabs" style="margin-bottom:14px">
      ${tabs.map(([k, l]) => html`<button class="tab ${k === tab ? 'active' : ''}" data-action="pilotage-tab" data-tab="${k}">${l}</button>`)}
    </div>
    ${body}`;
}

function deadlinesTab() {
  const list = fiscalCalendar(ws, today());
  const soon = (d) => (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000 <= 30;
  return html`<div class="card table-card">
      <h2 style="padding:16px 16px 0">Les 12 prochains mois</h2>
      <p class="text-muted" style="padding:0 16px">
        Impôts, déclarations et formalités. La TVA${isMicro() ? ' et l’URSSAF ont' : ' a'} ${isMicro() ? 'leurs écrans' : 'son écran'} ; les échéances proches
        apparaissent aussi dans « À faire ».
      </p>
      ${
        list.length
          ? html`<div class="table-scroll">
              <table class="table cards-mobile">
                <thead>
                  <tr>
                    <th>Date limite</th>
                    <th>Échéance</th>
                    <th class="num">Montant estimé</th>
                  </tr>
                </thead>
                <tbody>
                  ${list.map(
                    (e) =>
                      html`<tr>
                        <td data-label="Date limite">${frDate(e.date)} ${soon(e.date) ? badge('Bientôt', 'warning') : ''}</td>
                        <td data-label="Échéance"><strong>${e.label}</strong><br /><span class="text-muted" style="font-size:13px">${e.detail}</span></td>
                        <td class="num" data-label="Montant estimé">${e.amount ? eur(e.amount) : '—'}</td>
                      </tr>`,
                  )}
                </tbody>
              </table>
            </div>`
          : html`<p class="text-muted" style="padding:0 16px 16px">Aucune échéance dans les 12 prochains mois.</p>`
      }
    </div>
    <p class="form-hint">
      Dates indicatives pour un exercice standard : le calendrier exact est publié chaque année sur impots.gouv.fr. En cas de doute, votre expert-comptable
      confirme.
    </p>`;
}

function budgetTab() {
  const budget = ws.currentBudget();
  const r = budgetReport(ws.ledger, ws.company.fiscalYear, budget, today());
  const hasBudget = Object.keys(budget).length > 0;
  const f = ui.budgetForm || {};
  const bar = (row) => {
    if (!row.budget) return '';
    const pctDone = Math.min(100, Math.round((row.actual * 100) / row.budget));
    const pctExpected = Math.min(100, Math.round((row.expected * 100) / row.budget));
    return html`<div class="budget-bar" role="img" aria-label="${pctDone} % du budget, ${pctExpected} % prévu à date">
      <span class="budget-bar-fill" style="width:${pctDone}%"></span><span class="budget-bar-mark" style="left:${pctExpected}%"></span>
    </div>`;
  };
  const fy = ws.company.fiscalYear;
  return html`${
      hasBudget
        ? html`<div class="kpi-grid">
              <div class="kpi-card">
                <div class="kpi-value">${eur(r.result.actual)}</div>
                <div class="kpi-label">Résultat à ce jour</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-value">${eur(r.result.expected)}</div>
                <div class="kpi-label">Résultat prévu à date (${r.elapsedPct} % de l’exercice)</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-value">${eur(r.result.budget)}</div>
                <div class="kpi-label">Résultat visé sur l’exercice</div>
              </div>
            </div>
            <div class="card table-card">
              <div class="table-scroll">
                <table class="table cards-mobile">
                  <thead>
                    <tr>
                      <th>Rubrique</th>
                      <th class="num">Budget de l’année</th>
                      <th class="num">Prévu à date</th>
                      <th class="num">Réalisé</th>
                      <th>Avancement</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${r.rows
                      .filter((row) => row.budget || row.actual)
                      .map(
                        (row) =>
                          html`<tr>
                            <td data-label="Rubrique">${row.label}</td>
                            <td class="num" data-label="Budget">${row.budget ? eur(row.budget) : '—'}</td>
                            <td class="num" data-label="Prévu à date">${row.budget ? eur(row.expected) : '—'}</td>
                            <td class="num" data-label="Réalisé">${eur(row.actual)}</td>
                            <td data-label="Avancement">${row.pct === null ? '—' : html`${row.pct} %${bar(row)}`}</td>
                          </tr>`,
                      )}
                  </tbody>
                </table>
              </div>
            </div>`
        : ''
    }
    <form class="card" data-form="budget" style="display:flex;flex-direction:column;gap:12px">
      <h2>${hasBudget ? 'Modifier le budget' : 'Fixer le budget de l’exercice'} (du ${frDate(fy.start)} au ${frDate(fy.end)})</h2>
      <p class="text-muted" style="margin:0">
        Montants HT sur l’année entière ; laissez vide ce qui ne vous concerne pas. Nexus compare ensuite au réalisé, mois après mois.
      </p>
      ${errorBox(f.error)}
      <div class="form-grid">
        ${BUDGET_LINES.map((b) => field(b.label, html`<input class="input" name="${b.key}" inputmode="decimal" value="${f[b.key] ?? euros(budget[b.key])}" placeholder="0" />`))}
      </div>
      <div><button class="btn btn-primary" type="submit">Enregistrer le budget</button></div>
    </form>`;
}

function remunerationTab() {
  const f = ui.remunerationForm || {};
  const profit = f.profit ?? '';
  const result = f.result;
  const p = REMUNERATION_DEFAULTS;
  const salarie = /^SAS/i.test(ws.company.legalForm || '');
  return html`<form class="card" data-form="remuneration" style="display:flex;flex-direction:column;gap:12px">
      <h2>Salaire ou dividendes : que vous reste-t-il ?</h2>
      <p class="text-muted" style="margin:0">
        Indiquez le bénéfice de l’année avant votre rémunération. Nexus compare cinq répartitions, de « tout en dividendes » à « tout en salaire »
        (${salarie ? 'président de SAS : assimilé salarié' : 'gérant majoritaire : travailleur indépendant'}).
      </p>
      ${errorBox(f.error)}
      <div class="form-grid">
        ${field('Bénéfice avant rémunération (€)', html`<input class="input" name="profit" inputmode="decimal" required value="${profit}" placeholder="Ex. : 80 000" />`)}
        ${field('Taux moyen d’impôt sur le revenu (%)', html`<input class="input" name="salaryTax" inputmode="decimal" value="${f.salaryTax ?? p.salaryIncomeTaxPct}" />`, { hint: 'Appliqué au salaire net ; votre avis d’impôt l’indique.' })}
      </div>
      <div><button class="btn btn-primary" type="submit">Comparer</button></div>
    </form>
    ${
      result
        ? html`<div class="card table-card">
              <div class="table-scroll">
                <table class="table cards-mobile">
                  <thead>
                    <tr>
                      <th>Répartition</th>
                      <th class="num">Salaire net</th>
                      <th class="num">Cotisations</th>
                      <th class="num">Impôt société</th>
                      <th class="num">Dividendes nets</th>
                      <th class="num">Il vous reste</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${result.list.map(
                      (s) =>
                        html`<tr class="${s === result.best ? 'row-highlight' : ''}">
                          <td data-label="Répartition">
                            ${s.costShare === 0 ? 'Tout en dividendes' : s.costShare === 100 ? 'Tout en salaire' : `${s.costShare} % en salaire`}
                            ${s === result.best ? badge('Le plus favorable', 'success') : ''}
                          </td>
                          <td class="num" data-label="Salaire net">${eur(s.netSalary - s.salaryTax)}</td>
                          <td class="num" data-label="Cotisations">${eur(s.contributions)}</td>
                          <td class="num" data-label="Impôt société">${eur(s.corporateTax)}</td>
                          <td class="num" data-label="Dividendes nets">${eur(s.dividends - s.dividendTax)}</td>
                          <td class="num" data-label="Il vous reste"><strong>${eur(s.inPocket)}</strong></td>
                        </tr>`,
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p class="form-hint">
              Estimation simplifiée par taux moyens (cotisations ${salarie ? `≈ ${p.assimileSalariePct}` : `≈ ${p.independantPct}`} % du net, impôt sur les
              sociétés 15 % puis 25 %, dividendes au prélèvement forfaitaire de ${String(p.pfuPct).replace('.', ',')}
              %${salarie ? '' : ', cotisations sur la part au-delà de 10 % du capital'}). Le salaire ouvre des droits (retraite, maladie) que les dividendes
              n’ouvrent pas. Décision à prendre avec votre expert-comptable.
            </p>`
        : ''
    }`;
}

/** Calcul du simulateur depuis le formulaire (euros en texte). */
export function runRemuneration(f) {
  const profit = Math.round(
    Number(
      String(f.profit || '')
        .replace(/[\s\u00a0\u202f€]/g, '')
        .replace(',', '.'),
    ) * 100,
  );
  const salaryTax = Number(String(f.salaryTax ?? '').replace(',', '.'));
  if (!Number.isFinite(profit) || profit <= 0) throw new Error('Indiquez le bénéfice avant rémunération (exemple : 80 000).');
  if (!Number.isFinite(salaryTax) || salaryTax < 0 || salaryTax > 60) throw new Error('Taux d’impôt sur le revenu entre 0 et 60 %.');
  return compareScenarios(
    { profit, legalForm: ws.company.legalForm, capital: capitalCents(ws.company.capital) },
    { ...REMUNERATION_DEFAULTS, salaryIncomeTaxPct: salaryTax },
  );
}

// ------------------------------------------------------------------ Factures › Temps passé

export function viewTime() {
  const f = ui.timeForm || {};
  const ids = new Set(ws.book.invoices.map((i) => i.id));
  const groups = unbilledByClient(ws.timeEntries, ids);
  const recent = ws.timeEntries.slice(0, 50);
  const tabs = html`<div class="tabs" style="margin-bottom:14px">
    <button class="tab" data-action="sales-tab" data-tab="factures">Factures</button>
    <button class="tab" data-action="sales-tab" data-tab="devis">Devis</button>
    <button class="tab" data-action="sales-tab" data-tab="recurrentes">Récurrentes</button>
    <button class="tab active" data-action="sales-tab" data-tab="temps">Temps passé</button>
  </div>`;
  return html`${viewHeader('Factures', 'Notez vos heures par client, puis facturez-les en un clic.')} ${tabs}
  ${
    ws.clients.length
      ? html`<form class="card" data-form="time-entry" style="display:flex;flex-direction:column;gap:12px">
          <h2>Noter du temps</h2>
          ${errorBox(f.error)}
          <div class="form-grid">
            ${field('Date', html`<input class="input" type="date" name="date" required value="${f.date || today()}" />`)}
            ${field(
              'Client',
              html`<select class="input" name="clientId" required>
                ${ws.clients.map((c) => opt(c.id, c.name, c.id === (f.clientId || ui.lastTimeClient)))}
              </select>`,
            )}
            ${field('Ce qui a été fait', html`<input class="input" name="label" required maxlength="200" value="${f.label || ''}" placeholder="Ex. : Développement du site" />`)}
            ${field('Durée', html`<input class="input" name="duration" required value="${f.duration || ''}" placeholder="1h30, 45 min, 2,5" />`)}
            ${field('Taux horaire HT (€)', html`<input class="input" name="rate" inputmode="decimal" required value="${f.rate ?? euros(ws.company.hourlyRate) ?? ''}" placeholder="Ex. : 60" />`)}
          </div>
          <div><button class="btn btn-primary" type="submit">Enregistrer</button></div>
        </form>`
      : html`<div class="card"><p class="text-muted" style="margin:0">Ajoutez d’abord un client (écran Clients) pour lui noter du temps.</p></div>`
  }
  ${
    groups.length
      ? html`<div class="card table-card">
          <h2 style="padding:16px 16px 0">À facturer</h2>
          <div class="table-scroll">
            <table class="table cards-mobile">
              <thead>
                <tr>
                  <th>Client</th>
                  <th class="num">Temps</th>
                  <th class="num">Montant HT</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${groups.map(
                  (g) =>
                    html`<tr>
                      <td data-label="Client">${g.clientName}</td>
                      <td class="num" data-label="Temps">${formatMinutes(g.minutes)}</td>
                      <td class="num" data-label="Montant HT">${eur(g.amount)}</td>
                      <td class="num">
                        <button class="btn btn-primary btn-sm" data-action="time-invoice" data-id="${g.clientId}">Préparer la facture</button>
                      </td>
                    </tr>`,
                )}
              </tbody>
            </table>
          </div>
        </div>`
      : ''
  }
  ${
    recent.length
      ? html`<div class="card table-card">
          <h2 style="padding:16px 16px 0">Derniers temps notés</h2>
          <div class="table-scroll">
            <table class="table cards-mobile">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Ce qui a été fait</th>
                  <th class="num">Durée</th>
                  <th class="num">Montant HT</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${recent.map((e) => {
                  const billed = isBilled(e, ids);
                  const inv = billed ? ws.book.invoices.find((i) => i.id === e.invoiceId) : null;
                  return html`<tr>
                    <td data-label="Date">${frDate(e.date)}</td>
                    <td data-label="Client">${e.clientName}</td>
                    <td data-label="Ce qui a été fait">${e.label}</td>
                    <td class="num" data-label="Durée">${formatMinutes(e.minutes)}</td>
                    <td class="num" data-label="Montant HT">${eur(entryAmount(e))}</td>
                    <td class="num">
                      ${billed ? html`<a class="doc-link" href="#/ventes/${inv.status === 'draft' ? `modifier-${inv.id}` : inv.id}">${inv.number || 'Brouillon'}</a>` : html`<button class="btn-link" data-action="time-delete" data-id="${e.id}">Supprimer</button>`}
                    </td>
                  </tr>`;
                })}
              </tbody>
            </table>
          </div>
        </div>`
      : ''
  }`;
}

// ------------------------------------------------------------------ Dépenses › Trajets

export function viewMileage() {
  const f = ui.mileageForm || {};
  const trips = ws.mileageTrips();
  const year = today().slice(0, 4);
  const yearKm = trips.filter((p) => p.date.startsWith(year)).reduce((s, p) => s + p.lines[0].mileage.km, 0);
  const yearAmount = trips.filter((p) => p.date.startsWith(year)).reduce((s, p) => s + p.totalTtc, 0);
  return html`<div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-value">${yearKm.toLocaleString('fr-FR')} km</div>
        <div class="kpi-label">Parcourus en ${year}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${eur(yearAmount)}</div>
        <div class="kpi-label">Indemnités ${year} (barème fiscal)</div>
      </div>
    </div>
    <form class="card" data-form="mileage" style="display:flex;flex-direction:column;gap:12px">
      <h2>Ajouter un trajet professionnel</h2>
      <p class="text-muted" style="margin:0">
        Avec votre véhicule personnel : Nexus calcule l’indemnité au barème kilométrique de l’administration et l’inscrit
        ${ws.company.taxRegime === 'ir-reel' ? 'à votre compte de l’exploitant' : 'à votre compte courant d’associé'} (elle vous est due ; un virement de la
        société la solde).
      </p>
      ${errorBox(f.error)}
      <div class="form-grid">
        ${field('Date', html`<input class="input" type="date" name="date" required value="${f.date || today()}" />`)}
        ${field('Conducteur', html`<input class="input" name="driver" required value="${f.driver || ws.company.mileageDriver || trips[0]?.supplier.name || ''}" placeholder="Prénom Nom" />`)}
        ${field('Départ', html`<input class="input" name="from" value="${f.from || ''}" placeholder="Ex. : Lyon" />`)}
        ${field('Arrivée', html`<input class="input" name="to" value="${f.to || ''}" placeholder="Ex. : Grenoble" />`)}
        ${field('Motif', html`<input class="input" name="purpose" value="${f.purpose || ''}" placeholder="Ex. : rendez-vous client" />`)}
        ${field('Distance (km)', html`<input class="input" name="km" inputmode="decimal" required value="${f.km || ''}" placeholder="Aller-retour : additionnez" />`)}
        ${field(
          'Puissance fiscale',
          html`<select class="input" name="horsepower">
            ${HORSEPOWER_CHOICES.map((cv) => opt(cv, cv === 7 ? '7 CV et plus' : `${cv} CV`, cv === Number(f.horsepower || ws.company.mileageHorsepower || 5)))}
          </select>`,
          { hint: 'Case P.6 de la carte grise.' },
        )}
      </div>
      <label class="form-field-checkbox" style="display:flex;gap:8px;align-items:center"
        ><input type="checkbox" name="electric" ${f.electric || ws.company.mileageElectric ? raw('checked') : ''} />Véhicule 100 % électrique (barème majoré de
        20 %)</label
      >
      <div><button class="btn btn-primary" type="submit">Ajouter le trajet</button></div>
    </form>
    ${
      trips.length
        ? html`<div class="card table-card">
            <h2 style="padding:16px 16px 0">Trajets enregistrés</h2>
            <div class="table-scroll">
              <table class="table cards-mobile">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Trajet</th>
                    <th class="num">Distance</th>
                    <th class="num">Indemnité</th>
                  </tr>
                </thead>
                <tbody>
                  ${trips.map(
                    (p) =>
                      html`<tr>
                        <td data-label="Date">${frDate(p.date)}</td>
                        <td data-label="Trajet">
                          ${p.lines[0].label || 'Trajet'}<br /><span class="text-muted" style="font-size:13px"
                            >${p.supplier.name} · ${p.lines[0].mileage.horsepower} CV${p.lines[0].mileage.electric ? ' électrique' : ''}</span
                          >
                        </td>
                        <td class="num" data-label="Distance">${p.lines[0].mileage.km.toLocaleString('fr-FR')} km</td>
                        <td class="num" data-label="Indemnité">${eur(p.totalTtc)}</td>
                      </tr>`,
                  )}
                </tbody>
              </table>
            </div>
          </div>`
        : ''
    }
    <p class="form-hint">
      Barème ${trips[0]?.lines[0].mileage.scaleYear || 2025} appliqué. Gardez une trace de chaque trajet (agenda, motif) : elle peut être demandée en cas de
      contrôle.
    </p>`;
}

// ------------------------------------------------------------------ Paramètres › Catalogue : stock

export function stockPanel() {
  const levels = stockLevels(ws.company.catalog, ws.stockMoves, ws.book.invoices);
  if (!levels.length) return '';
  const f = ui.stockForm || {};
  return html`<div class="card table-card" style="min-width:0">
      <h2 style="padding:16px 16px 0">Stock</h2>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Stock">
        <table class="table cards-mobile">
          <thead>
            <tr>
              <th>Article</th>
              <th class="num">Départ</th>
              <th class="num">Entrées / corrections</th>
              <th class="num">Vendus</th>
              <th class="num">En stock</th>
            </tr>
          </thead>
          <tbody>
            ${levels.map(
              (s) =>
                html`<tr>
                  <td data-label="Article">${s.item.label}</td>
                  <td class="num" data-label="Départ">${s.initial.toLocaleString('fr-FR')}</td>
                  <td class="num" data-label="Entrées">${s.moves.toLocaleString('fr-FR')}</td>
                  <td class="num" data-label="Vendus">${s.sold.toLocaleString('fr-FR')}</td>
                  <td class="num" data-label="En stock"><strong>${s.level.toLocaleString('fr-FR')}</strong> ${s.low ? badge('Stock bas', 'warning') : ''}</td>
                </tr>`,
            )}
          </tbody>
        </table>
      </div>
    </div>
    <form class="card" data-form="stock-move" style="display:flex;flex-direction:column;gap:12px;min-width:0">
      <h2>Entrée ou correction de stock</h2>
      <p class="text-muted" style="margin:0">
        Les ventes sont déduites toutes seules à l’émission des factures. Notez ici les livraisons reçues (nombre positif) et la casse ou l’inventaire
        (négatif).
      </p>
      ${errorBox(f.error)}
      <div class="form-grid">
        ${field(
          'Article',
          html`<select class="input" name="itemId">
            ${levels.map((s) => opt(s.item.id, s.item.label, s.item.id === f.itemId))}
          </select>`,
        )}
        ${field('Date', html`<input class="input" type="date" name="date" required value="${f.date || today()}" />`)}
        ${field('Quantité', html`<input class="input" name="qty" inputmode="decimal" required value="${f.qty || ''}" placeholder="Ex. : 12 ou -2" />`)}
        ${field('Motif', html`<input class="input" name="reason" maxlength="120" value="${f.reason || ''}" placeholder="Ex. : livraison fournisseur" />`)}
      </div>
      <div><button class="btn btn-primary" type="submit">Enregistrer le mouvement</button></div>
    </form>`;
}

// ------------------------------------------------------------------ fiche client : espace client

export function clientPortalCard(c) {
  const state = ui.clientLinks?.[c.id];
  const fresh = ui.freshClientLink?.clientId === c.id ? ui.freshClientLink.url : null;
  const canManage = !ui.demo && ['dirigeant', 'expert'].includes(cloudState.role || 'dirigeant');
  return html`<div class="card">
    <h2>Espace client</h2>
    <p class="text-muted" style="margin-top:0">
      Un lien personnel à envoyer à ${c.name} : il y retrouve toutes ses factures et ses devis, les télécharge en PDF, et accepte un devis en ligne (son nom, la
      date et l’heure sont enregistrés). Sans compte ni mot de passe ; vous pouvez le désactiver à tout moment.
    </p>
    ${
      ui.demo
        ? html`<p class="form-hint" style="margin:0">Disponible avec un compte Nexus (pas en démonstration).</p>`
        : !canManage
          ? html`<p class="form-hint" style="margin:0">Le dirigeant ou l’expert-comptable crée le lien.</p>`
          : html`${
                fresh
                  ? html`<div class="notice-gold" style="display:flex;flex-direction:column;gap:8px">
                      <strong>Lien créé : copiez-le maintenant, il ne sera plus affiché.</strong>
                      <input class="input mono" readonly value="${fresh}" aria-label="Lien de l’espace client" data-select-on-focus />
                      <div><button type="button" class="btn btn-gold btn-sm" data-action="client-link-copy" data-value="${fresh}">Copier le lien</button></div>
                    </div>`
                  : ''
              }
              ${
                state?.links?.length
                  ? html`<ul style="margin:10px 0;padding-left:18px">
                      ${state.links.map(
                        (l) =>
                          html`<li>
                            Lien créé le ${frDate(l.created_at.slice(0, 10))}, valable jusqu’au ${frDate(l.expires_at.slice(0, 10))}
                            <button type="button" class="btn-link" data-action="client-link-revoke" data-id="${l.id}" data-index="${c.id}">Désactiver</button>
                          </li>`,
                      )}
                    </ul>`
                  : ''
              }
              ${state?.error ? errorBox(state.error) : ''}
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="btn btn-secondary" data-action="client-link-create" data-id="${c.id}">
                  ${state?.links?.length ? 'Créer un nouveau lien' : 'Créer le lien de l’espace client'}
                </button>
                ${state ? '' : html`<button type="button" class="btn-link" data-action="client-links-load" data-id="${c.id}">Voir les liens actifs</button>`}
              </div>`
    }
  </div>`;
}
