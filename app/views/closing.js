/**
 * Écran « closing ».
 */

import { INVENTORY_TYPES, allocationProposal, balanceSheet, closingChecklist, fiscalYearLabel, incomeStatement } from '../../core/closing.js?v=d415f7a';
import { addDays } from '../../core/dates.js?v=d415f7a';
import { VAT_RATES_BP } from '../../core/invoices.js?v=d415f7a';
import { parseEuros } from '../../core/money.js?v=d415f7a';
import * as cloud from '../cloud.js?v=d415f7a';
import { field, html, opt, raw } from '../html.js?v=d415f7a';
import { ICONS } from '../icons.js?v=d415f7a';
import { render } from '../render.js?v=d415f7a';
import { cloudState, eur, frDate, pct, setWs, today, ui, ws } from '../state.js?v=d415f7a';
import { save, toast } from '../store.js?v=d415f7a';
import { openStructure } from '../sync-ui.js?v=d415f7a';
import { badge, icon, term, viewHeader } from '../ui/common.js?v=d415f7a';

// ------------------------------------------------------------------ clôture de l'exercice (lot 3)

export const CHARGE_ACCOUNTS = [
  ['613200', 'Loyer'],
  ['616000', 'Assurances'],
  ['628000', 'Abonnements et logiciels'],
  ['606100', 'Électricité, gaz, eau'],
  ['626000', 'Téléphone, internet'],
  ['622600', 'Honoraires'],
  ['604000', 'Sous-traitance'],
  ['615000', 'Entretien et réparations'],
];

export const REVENUE_ACCOUNTS = [
  ['706000', 'Prestations de services'],
  ['707000', 'Ventes de marchandises'],
  ['701000', 'Ventes de produits fabriqués'],
];

export function statementTable(title, rows, total, totalLabel) {
  return html`<div class="card table-card">
    <h3 style="padding:14px 16px 0">${title}</h3>
    <table class="table">
      <tbody>
        ${rows
          .filter(([, v]) => v)
          .map(
            ([l, v]) =>
              html`<tr>
                <td>${l}</td>
                <td class="num">${eur(v)}</td>
              </tr>`,
          )}
        <tr>
          <td><strong>${totalLabel}</strong></td>
          <td class="num"><strong>${eur(total)}</strong></td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

export function viewClosing() {
  const fy = ws.company.fiscalYear;
  const checklist = closingChecklist(ws, { today: today() });
  const inventory = ws.ledger.entries.filter((e) => e.source?.kind === 'inventory');
  const pnl = incomeStatement(ws.ledger);
  const bs = balanceSheet(ws.ledger);
  const isCompanyTax = ws.company.taxRegime === 'is-reel';
  const opts = ui.isOptions || { addBacks: '', previousLosses: '', reducedRateEligible: true };
  const toCents = (s) => {
    try {
      return s ? parseEuros(s) : 0;
    } catch {
      return 0;
    }
  };
  const is = isCompanyTax
    ? ws.computeCorporateTax({ addBacks: toCents(opts.addBacks), previousLosses: toCents(opts.previousLosses), reducedRateEligible: opts.reducedRateEligible })
    : null;
  const isPaid = ws.ledger
    .lines()
    .filter((l) => l.account === '444000' && l.entry.source?.type !== 'corporate-tax')
    .reduce((s, l) => s + l.debit - l.credit, 0);
  const society = ws.company.legalForm !== 'EI';
  const canClose = ui.demo || !society || cloudState.role === 'expert';
  const it = ui.inventoryForm || { type: 'prepaid' };
  const accounts = ['deferred', 'receivable'].includes(it.type) ? REVENUE_ACCOUNTS : CHARGE_ACCOUNTS;
  const clientsDue = ws.receivables(fy.end).filter((r) => r.outstanding > 0);
  return html` ${viewHeader(`Clôture de l'exercice ${fiscalYearLabel(fy)}`, `Du ${frDate(fy.start)} au ${frDate(fy.end)} : inventaire, impôt, comptes annuels.`, html`${cloudState.role === 'collaborateur' ? '' : html`<button class="btn btn-primary no-print" data-action="closing-package">${icon('archive', 14)} Dossier pour l’expert-comptable (ZIP)</button>`}<button class="btn btn-secondary no-print" data-action="print">Imprimer / PDF</button>`)}
    ${allocationCard()}
    <div class="card action-center no-print">
      <h2>1. Check-list</h2>
      <div class="action-center-list">
        ${checklist.map((i) =>
          // Point sans écran associé : simple information, pas un bouton qui ne mène nulle part.
          i.view
            ? html`<button type="button" class="action-center-item" data-href="#/${i.view}">
                <span class="action-center-icon">${raw(ICONS[i.ok ? 'checkCircle' : 'warningTriangle'])}</span>
                <span class="action-center-label">${i.label} — <span class="text-muted">${i.detail}</span></span>
                <span class="action-center-arrow">→</span>
              </button>`
            : html`<div class="action-center-item action-center-static">
                <span class="action-center-icon">${raw(ICONS[i.ok ? 'checkCircle' : 'warningTriangle'])}</span>
                <span class="action-center-label">${i.label} — <span class="text-muted">${i.detail}</span></span>
              </div>`,
        )}
      </div>
    </div>

    <div class="card no-print" style="display:flex;flex-direction:column;gap:12px">
      <h2>2. Écritures d'inventaire</h2>
      ${
        inventory.length
          ? html`<table class="table">
              <tbody>
                ${inventory.map(
                  (e) =>
                    html`<tr>
                      <td>${e.label}</td>
                      <td class="num">${eur(e.lines[0].debit)}</td>
                      <td>
                        ${e.status === 'draft' ? html`<button class="btn-link" data-action="inventory-delete" data-id="${e.id}">Supprimer</button>` : badge('Validée', 'success')}
                      </td>
                    </tr>`,
                )}
              </tbody>
            </table>`
          : html`<p class="text-muted">Aucune écriture d'inventaire pour l'instant.</p>`
      }
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${
          ws.ledger.entries.some((e) => e.source?.kind === 'inventory' && e.source.type === 'depreciation')
            ? html`${badge('Dotations aux amortissements passées', 'success')}`
            : html`<button class="btn btn-secondary" data-action="depreciation-book">Passer les dotations aux amortissements</button>`
        }
      </div>
      <div class="form-grid">
        ${field(
          'Type',
          html`<select class="input" data-inv="type" data-rerender-inv>
            ${Object.entries(INVENTORY_TYPES).map(([k, v]) => opt(k, v.label, it.type === k))}
          </select>`,
          { hint: INVENTORY_TYPES[it.type].help },
        )}
        ${
          it.type === 'doubtful'
            ? field(
                'Client concerné',
                html`<select class="input" data-inv="aux">
                  ${clientsDue.map((r) => opt(ws.invoiceAux(r.invoice), `${r.invoice.client.name} — ${r.invoice.number} (${eur(r.outstanding)})`, it.aux === ws.invoiceAux(r.invoice)))}
                </select>`,
              )
            : field(
                'Compte concerné',
                html`<select class="input" data-inv="account">
                  ${accounts.map(([k, l]) => opt(k, l, it.account === k))}
                </select>`,
              )
        }
        ${field('Montant HT', html`<input class="input" data-inv="amount" inputmode="decimal" placeholder="0,00" value="${it.amount || ''}" />`)}
        ${
          ['accrued', 'receivable'].includes(it.type) && ws.company.vatRegime !== 'franchise'
            ? field(
                'TVA de la facture attendue',
                html`<select class="input" data-inv="vatRateBp">
                  ${VAT_RATES_BP.map((r) => opt(r, pct(r), r === 2000))}
                </select>`,
              )
            : ''
        }
        ${field('Libellé (facultatif)', html`<input class="input" data-inv="label" value="${it.label || ''}" />`)}
      </div>
      <div><button class="btn btn-primary" data-action="inventory-add">Ajouter l'écriture</button></div>
    </div>

    ${
      isCompanyTax
        ? html`<div class="card no-print" style="display:flex;flex-direction:column;gap:12px">
            <h2>3. Impôt sur les sociétés</h2>
            <div class="form-grid">
              ${field('Charges non déductibles à réintégrer', html`<input class="input" data-is="addBacks" inputmode="decimal" placeholder="0,00" value="${opts.addBacks}" />`, { hint: 'Amendes, part non déductible des cadeaux…' })}
              ${field('Déficits des années précédentes', html`<input class="input" data-is="previousLosses" inputmode="decimal" placeholder="0,00" value="${opts.previousLosses}" />`)}
            </div>
            <label class="form-field-checkbox" style="display:flex;gap:8px;align-items:center"
              ><input type="checkbox" data-is="reducedRateEligible" ${opts.reducedRateEligible ? raw('checked') : ''} />Taux réduit de 15 % applicable (chiffre
              d'affaires &lt; 10 M€, capital entièrement libéré et détenu à 75 % au moins par des personnes physiques)</label
            >
            <table class="table">
              <tbody>
                <tr>
                  <td>Résultat avant impôt</td>
                  <td class="num">${eur(pnl.resultBeforeTax)}</td>
                </tr>
                <tr>
                  <td>Bénéfice imposable</td>
                  <td class="num">${eur(is.taxable)}</td>
                </tr>
                <tr>
                  <td>dont à 15 %</td>
                  <td class="num">${eur(is.atReduced)}</td>
                </tr>
                <tr>
                  <td>dont à 25 %</td>
                  <td class="num">${eur(is.atNormal)}</td>
                </tr>
                <tr>
                  <td><strong>Impôt de l'exercice</strong></td>
                  <td class="num"><strong>${eur(is.tax)}</strong></td>
                </tr>
                <tr>
                  <td>Acomptes déjà versés</td>
                  <td class="num">${eur(isPaid)}</td>
                </tr>
                <tr>
                  <td><strong>${is.tax - isPaid >= 0 ? 'Solde à payer' : 'Excédent à récupérer'}</strong></td>
                  <td class="num"><strong>${eur(Math.abs(is.tax - isPaid))}</strong></td>
                </tr>
              </tbody>
            </table>
            <div><button class="btn btn-primary" data-action="is-book" data-tax="${is.tax}">Comptabiliser l'impôt (${eur(is.tax)})</button></div>
            <p class="form-hint">
              Solde à payer au plus tard le 15 du 4e mois suivant la clôture (15 mai pour un exercice clos le 31 décembre). Calcul à faire valider par votre
              expert-comptable.
            </p>
          </div>`
        : ''
    }

    <h2 style="margin:18px 0 10px">${isCompanyTax ? '4' : '3'}. Comptes annuels</h2>
    <div class="grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">
      ${statementTable('Bilan — actif', Object.entries(bs.assets), bs.totalAssets, 'Total actif')}
      ${statementTable('Bilan — passif', Object.entries(bs.liabilities), bs.totalLiabilities, 'Total passif')}
    </div>
    ${!bs.balanced ? html`<div class="issues-box">Le bilan n'est pas équilibré (écart de ${eur(bs.totalAssets - bs.totalLiabilities)}) : contactez le support.</div>` : ''}
    <div class="grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">
      ${statementTable('Produits d’exploitation', Object.entries(pnl.operatingIncome), pnl.opIncome, 'Total des produits')}
      ${statementTable('Charges d’exploitation', Object.entries(pnl.operatingCharges), pnl.opCharges, 'Total des charges')}
    </div>
    <div class="card table-card">
      <table class="table">
        <tbody>
          <tr>
            <td>Résultat d'exploitation</td>
            <td class="num">${eur(pnl.operatingResult)}</td>
          </tr>
          <tr>
            <td>Résultat financier</td>
            <td class="num">${eur(pnl.financialIncome - pnl.financialCharges)}</td>
          </tr>
          <tr>
            <td>Résultat exceptionnel</td>
            <td class="num">${eur(pnl.exceptionalIncome - pnl.exceptionalCharges)}</td>
          </tr>
          <tr>
            <td>Impôt sur les bénéfices</td>
            <td class="num">${eur(pnl.incomeTax)}</td>
          </tr>
          <tr>
            <td><strong>Résultat net</strong></td>
            <td class="num"><strong>${eur(pnl.netResult)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="form-hint">
      Présentation simplifiée (rubriques des formulaires 2033-A et 2033-B) ; la correspondance compte par compte et la liasse fiscale sont à valider par votre
      expert-comptable avant dépôt.
    </p>

    <div class="card no-print" style="display:flex;flex-direction:column;gap:10px">
      <h2>${isCompanyTax ? '5' : '4'}. Clôturer l'exercice</h2>
      <p class="text-muted">
        La clôture détermine le résultat, valide définitivement toutes les écritures de l'exercice (plus aucune modification possible) et ouvre l'exercice
        suivant avec son bilan d'ouverture.
      </p>
      ${!canClose ? html`<div class="notice-gold">Pour une société, la clôture est réalisée par votre expert-comptable : invitez-le depuis les <a href="#/parametres/utilisateurs">paramètres</a>, il la validera depuis son propre accès.</div>` : ''}
      ${ui.demo && society ? html`<p class="form-hint">Démonstration : dans l'application réelle, la clôture d'une société est réservée à l'expert-comptable invité.</p>` : ''}
      <div>
        <button class="btn btn-primary" data-action="close-year" ${canClose && today() > fy.end ? '' : raw('disabled')}>
          Clôturer l'exercice ${fiscalYearLabel(fy)}
        </button>
      </div>
      ${today() <= fy.end ? html`<p class="form-hint">Disponible à partir du ${frDate(addDays(fy.end, 1))}.</p>` : ''}
    </div>`;
}

/** Affectation du résultat de l'exercice précédent (tant qu'elle n'est pas faite). */
export function allocationCard() {
  const { result, legalReserveMin, proposal } = allocationProposal(ws.ledger, ws.company);
  if (!result || ws.ledger.entries.some((e) => e.source?.kind === 'allocation')) return '';
  const ei = ws.company.legalForm === 'EI';
  const f = ui.allocationForm || Object.fromEntries(Object.entries(proposal).map(([k, v]) => [k, v ? (v / 100).toFixed(2).replace('.', ',') : '']));
  const input = (key, label, hint) =>
    field(label, html`<input class="input" data-alloc="${key}" inputmode="decimal" placeholder="0,00" value="${f[key] || ''}" />`, { hint });
  return html`<div class="card no-print" style="display:flex;flex-direction:column;gap:12px;border:2px solid var(--landing-gold-500)">
    <h2>Affectation du résultat de l'exercice précédent</h2>
    <p>
      ${result > 0 ? 'Bénéfice' : 'Perte'} à affecter : <strong>${eur(Math.abs(result))}</strong>.
      ${ei ? 'En entreprise individuelle, il rejoint votre compte de l’exploitant.' : 'À répartir selon la décision de l’assemblée des associés (dans les 6 mois de la clôture).'}
    </p>
    ${
      ei
        ? ''
        : html`<div class="form-grid">
            ${result > 0 ? input('legalReserve', term('Mise en réserve obligatoire', 'Réserve légale'), `Minimum : ${eur(legalReserveMin)} (5 % du bénéfice, jusqu'à 10 % du capital).`) : ''}
            ${result > 0 ? input('otherReserves', 'Autres réserves') : ''} ${result > 0 ? input('dividends', 'Dividendes') : ''}
            ${input('retained', term('Gardé pour les années suivantes', 'Report à nouveau'), result < 0 ? 'Une perte est reportée : elle viendra en déduction des bénéfices futurs.' : '')}
          </div>`
    }
    <div><button class="btn btn-primary" data-action="allocate-result">Enregistrer l'affectation</button></div>
  </div>`;
}

/** Passe à l'exercice suivant après la clôture (et l'enregistre en base en mode connecté). */
export async function closeYearFlow() {
  const fy = ws.company.fiscalYear;
  const pending = closingChecklist(ws, { today: today() }).filter((i) => !i.ok);
  const warning = pending.length
    ? ` Attention, ${pending.length} point(s) de la check-list ne sont pas réglés : ${pending.map((i) => i.detail).join(' ; ')}.`
    : '';
  if (!confirm(`Clôturer l'exercice ${fiscalYearLabel(fy)} ? Toutes ses écritures seront validées définitivement et l'exercice suivant sera ouvert.${warning}`))
    return;
  let next;
  try {
    next = ws.closeYear(today());
  } catch (err) {
    return toast(err.message, true);
  }
  if (ui.demo) {
    setWs(next);
    save();
    location.hash = '#/accueil';
    render();
    return toast(`Exercice clôturé. Bienvenue dans l'exercice ${fiscalYearLabel(next.company.fiscalYear)}.`);
  }
  try {
    save(); // détermination du résultat + validation de l'exercice
    await cloudState.outbox.waitIdle();
    const nextFiscalYearId = await cloud.closeFiscalYear(cloudState.meta.fiscalYearId);
    cloudState.meta = { ...cloudState.meta, fiscalYearId: nextFiscalYearId };
    setWs(next);
    // En base, le nouvel exercice n'a encore aucune écriture : le bilan d'ouverture et les extournes partent maintenant.
    const synced = JSON.parse(JSON.stringify(next));
    synced.ledger = { ...synced.ledger, entries: [], lockedThrough: null };
    cloudState.synced = synced;
    save();
    location.hash = '#/accueil';
    render();
    toast(`Exercice clôturé. Bienvenue dans l'exercice ${fiscalYearLabel(next.company.fiscalYear)}.`);
  } catch (err) {
    toast(`Clôture refusée : ${cloud.friendly(err)}`, true);
    await openStructure(cloudState.meta.structureId);
    render();
  }
}
