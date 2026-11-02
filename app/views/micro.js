/**
 * Écran « micro ».
 */

import { ESTIMATE_MISSING_LABELS, incomeDeclaration, receiptsBook } from '../../core/micro.js?v=a619ec1';
import { formatDecimalComma } from '../../core/money.js?v=a619ec1';
import { field, html, opt } from '../html.js?v=a619ec1';
import { isMicro } from '../render.js?v=a619ec1';
import { eur, frDate, today, ui, ws } from '../state.js?v=a619ec1';
import { badge, icon, viewHeader } from '../ui/common.js?v=a619ec1';

// ------------------------------------------------------------------ micro-entrepreneur

export const microReceipts = () => ws.microReceipts();

export const URSSAF_SITE = 'https://www.autoentrepreneur.urssaf.fr/portail/accueil.html';

export const URSSAF_STATUS = {
  'a-venir': ['À venir', 'muted'],
  'en-cours': ['Période en cours', 'muted'],
  'a-declarer': ['À déclarer', 'warning'],
  'en-retard': ['En retard', 'warning'],
  declaree: ['Déclarée, à payer', 'info'],
  'rien-a-payer': ['Déclarée, rien à payer', 'success'],
  payee: ['Payée', 'success'],
};

/** Déclarations URSSAF de l'année : montant, échéance, état, et parcours « Déclarer ». */
export function urssafCard(year) {
  const periods = ws.urssafPeriods(year, today());
  const open = periods.find((p) => p.from === ui.urssafDeclare);
  const freq = ws.company.urssafFrequency || 'trimestrielle';
  return html`<div class="card table-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 16px 0">
        <h2>Déclarations URSSAF ${year}</h2>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px"
          >Je déclare
          <select class="input" data-urssaf-frequency style="width:auto">
            ${opt('trimestrielle', 'chaque trimestre', freq === 'trimestrielle')}${opt('mensuelle', 'chaque mois', freq === 'mensuelle')}
          </select></label
        >
      </div>
      <div class="table-scroll">
        <table class="table urssaf-table cards-mobile">
          <thead>
            <tr>
              <th>Période</th>
              <th class="num">Chiffre d'affaires encaissé</th>
              <th>Échéance</th>
              <th>État</th>
              <th class="num">Cotisations estimées</th>
              <th class="num">Cotisations URSSAF</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${periods.map(
              (p) =>
                html`<tr>
                  <td class="cards-full" data-label="Période"><strong>${p.label}</strong></td>
                  <td class="num" data-label="Chiffre d'affaires encaissé"><strong>${eur(p.turnover)}</strong></td>
                  <td data-label="Échéance">${frDate(p.deadline)}</td>
                  <td data-label="État">
                    ${badge(...URSSAF_STATUS[p.status])}${p.record?.paidAt ? html` <span class="text-muted" style="font-size:12px">le ${frDate(p.record.paidAt)}</span>` : ''}
                  </td>
                  <td class="num text-muted" data-label="Cotisations estimées">${eur(p.estimate.total)}</td>
                  <td class="num" data-label="Cotisations URSSAF">${p.record ? eur(p.record.contributions) : '—'}</td>
                  <td class="num cards-action">
                    ${p.status === 'a-declarer' || p.status === 'en-retard' ? html`<button class="btn btn-primary btn-sm" data-action="urssaf-declare-open" data-from="${p.from}">Déclarer</button>` : ''}
                  </td>
                </tr>`,
            )}
          </tbody>
        </table>
      </div>
      <p class="form-hint" style="padding:0 16px">
        Cotisations estimées : calcul de Nexus à partir de votre chiffre d'affaires encaissé et de votre situation (Paramètres). Le montant qui fait foi est
        celui affiché par l'URSSAF.
      </p>
      ${open ? urssafDeclarePanel(open) : ''}
    </div>
    ${setAsideCard(periods)} ${incomeDeclarationCard()}`;
}

/** Ce que l'estimation n'inclut pas faute de valeur validée, dit en une phrase. */
export function estimateCaveatText(e) {
  if (!e?.missing.length) return '';
  const rates = e.missing.filter((k) => k !== 'acre-fin').map((k) => ESTIMATE_MISSING_LABELS[k]);
  const acre = e.missing.includes('acre-fin') ? 'Indiquez la date de fin de votre ACRE dans les paramètres pour une estimation exacte.' : '';
  if (!rates.length) return acre;
  const list = rates.length > 1 ? `${rates.slice(0, -1).join(', ')} et ${rates.at(-1)}` : rates[0];
  return `L’estimation n’inclut pas ${list} : ${rates.length > 1 ? 'ces taux sont' : 'ce taux est'} en attente de validation par notre expert-comptable. Le montant réel demandé par l’URSSAF sera donc plus élevé.${acre ? ` ${acre}` : ''}`;
}

/** Encadré bien visible reprenant `estimateCaveatText` (tête d'écran, « À mettre de côté », déclaration). */
export function estimateCaveat(e) {
  const text = estimateCaveatText(e);
  if (!text) return '';
  return html`<div class="notice-gold" role="note" data-estimate-caveat style="display:flex;gap:8px;align-items:flex-start">
    <span aria-hidden="true">${icon('info', 16)}</span><span>${text}</span>
  </div>`;
}

/** Encart « À mettre de côté » : estimation sur la période en cours, à partir de ce qui est déjà encaissé. */
export function setAsideCard(periods) {
  const current = periods.find((p) => p.status === 'en-cours') || periods.at(-1);
  if (!current) return '';
  const trimestre = (ws.company.urssafFrequency || 'trimestrielle') === 'trimestrielle';
  return html`<div class="card" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;border-top:3px solid var(--landing-gold-500)">
    <span style="color:var(--landing-gold-500)">${icon('coin', 28)}</span>
    <div style="flex:1;min-width:220px">
      <h3 style="margin:0 0 4px">À mettre de côté ${trimestre ? 'ce trimestre' : 'ce mois-ci'} (estimation)</h3>
      <p style="margin:0;font-size:14px;line-height:1.6">
        Sur <strong>${eur(current.turnover)}</strong> encaissés depuis le ${frDate(current.from)} (${current.label}), prévoyez environ
        <strong>${eur(current.estimate.total)}</strong> pour l'URSSAF, à régler au plus tard le ${frDate(current.deadline)}.
      </p>
      ${current.estimate.acreReduction ? html`<p class="form-hint" style="margin:4px 0 0">ACRE déduite : ${eur(current.estimate.acreReduction)} (${current.estimate.rates.acreBp / 100} % des cotisations sociales).</p>` : ''}
      ${estimateCaveat(current.estimate)}
    </div>
    <strong class="landing-gradient-number" style="font-size:28px">${eur(current.estimate.total)}</strong>
  </div>`;
}

export function urssafDeclarePanel(p) {
  return html`<div style="padding:16px;border-top:1px solid var(--color-border);display:flex;flex-direction:column;gap:14px">
    <h3 style="margin:0">Déclarer ${p.label}</h3>
    ${estimateCaveat(p.estimate)}
    <ol class="landing-steps" style="margin:0">
      <li>
        <span class="landing-step-num">1</span
        ><span class="landing-step-text"
          >Chiffre d'affaires à déclarer : <strong>${eur(p.turnover)}</strong> (encaissé du ${frDate(p.from)} au ${frDate(p.to)}).
          <button
            class="btn btn-secondary btn-sm"
            data-action="urssaf-copy"
            data-amount="${(p.turnover / 100).toFixed(2).replace('.', ',')}"
            style="margin-left:6px"
          >
            Copier le montant
          </button></span
        >
      </li>
      <li>
        <span class="landing-step-num">2</span
        ><span class="landing-step-text"
          >Déclarez-le sur votre espace URSSAF et validez le paiement par prélèvement.
          <a class="btn btn-gold btn-sm" href="${URSSAF_SITE}" target="_blank" rel="noopener" style="margin-left:6px">Ouvrir mon espace URSSAF</a></span
        >
      </li>
      <li><span class="landing-step-num">3</span><span class="landing-step-text">Reportez ici le montant des cotisations calculé par l'URSSAF :</span></li>
    </ol>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      ${field('Cotisations calculées par l’URSSAF', html`<input class="input" data-urssaf-contributions inputmode="decimal" placeholder="0,00" value="${formatDecimalComma(p.estimate.total)}" style="max-width:200px" />`, { hint: `Pré-rempli avec l’estimation de Nexus (${eur(p.estimate.total)}) : remplacez-le par le montant affiché par l’URSSAF.` })}
      <button class="btn btn-primary" data-action="urssaf-declare" data-from="${p.from}" style="margin-bottom:2px">Enregistrer la déclaration</button>
      <button class="btn btn-secondary" data-action="urssaf-declare-cancel" style="margin-bottom:2px">Annuler</button>
    </div>
    <p class="form-hint" style="margin:0">
      Quand le prélèvement apparaît sur votre relevé, classez-le en « Cotisations URSSAF » dans l'écran Banque : la déclaration passe automatiquement à « Payée
      ».
    </p>
  </div>`;
}

export function thresholdCard() {
  const f = ws.vatFranchiseStatus(today());
  if (!f) return '';
  const label = {
    ok: ['Sous le seuil', 'success'],
    'alerte-80': ['Attention : 80 % du seuil atteint', 'warning'],
    'depasse-base': ['Seuil de base dépassé', 'warning'],
    'depasse-majore': ['Seuil majoré dépassé : plus en franchise', 'danger'],
  };
  const m = f.message;
  return html`<h2>Suivi du seuil de franchise de TVA</h2>
    <p>Chiffre d'affaires encaissé cette année : <strong>${eur(f.turnover)}</strong> ${badge(...label[f.status])}</p>
    ${f.status === 'ok' ? '' : html`<p style="line-height:1.6">${m.consequence}</p>`}
    ${m.regimeAfter ? html`<p style="line-height:1.6">${m.regimeAfter}</p>` : ''}
    ${m.action ? html`<p style="line-height:1.6"><strong>${m.action}</strong></p>` : ''}
    <p class="form-hint">Seuils 2026 à confirmer par votre expert-comptable : 85 000 € (ventes) et 37 500 € (services).</p>`;
}

/** Réponse directe sur la TVA, en tête de l'accueil et de l'écran URSSAF (entreprises en franchise). */
export function franchiseBanner() {
  const f = ws.vatFranchiseStatus(today());
  if (!f) return '';
  const m = f.message;
  const strong = m.level === 'sortie';
  return html`<div
    class="card ${strong ? '' : 'notice-gold'}"
    style="display:flex;gap:14px;align-items:flex-start;${strong ? 'border-left:4px solid var(--color-danger)' : ''}"
  >
    <span style="color:var(--landing-gold-500)">${icon(strong ? 'warningTriangle' : 'percent', 22)}</span>
    <div>
      <h3 style="margin:0 0 4px">${m.headline}</h3>
      <p style="margin:0;font-size:14px;line-height:1.6">
        ${m.level === 'ok' ? m.consequence : html`${m.consequence} <a href="#/${isMicro() ? 'urssaf' : 'tva'}">Voir le détail</a>`}
      </p>
    </div>
  </div>`;
}

/** Chiffre d'affaires de l'année précédente à reporter sur la déclaration de revenus (sans numéro de case). */
function incomeDeclarationCard() {
  const d = incomeDeclaration(ws.microReceipts(), Number(today().slice(0, 4)) - 1);
  if (!d.total) return '';
  return html`<div class="card" style="display:flex;flex-direction:column;gap:8px">
    <h2>Pour votre déclaration de revenus ${d.year + 1}</h2>
    <p class="text-muted" style="margin:0">
      Chiffre d’affaires encaissé en ${d.year}, à reporter dans la déclaration complémentaire des revenus des professions non salariées (même avec le versement
      libératoire). Vérifiez le cadre proposé par impots.gouv.fr selon votre activité.
    </p>
    <table class="table">
      <tbody>
        ${d.byActivity.map(
          (a) =>
            html`<tr>
              <td>${a.label}</td>
              <td class="num"><strong>${eur(a.amount)}</strong></td>
            </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

export function viewUrssaf() {
  const receipts = microReceipts();
  const year = Number(today().slice(0, 4));
  const book = receiptsBook(receipts, { from: `${year}-01-01`, to: `${year}-12-31` });
  const periods = ws.urssafPeriods(year, today());
  const current = periods.find((p) => p.status === 'en-cours') || periods.at(-1);
  return html` ${viewHeader('URSSAF et seuils', 'Le montant à déclarer est votre chiffre d’affaires encaissé sur la période.')}
    ${estimateCaveat(current?.estimate)} ${franchiseBanner()} ${urssafCard(year)}
    ${(() => {
      const t = thresholdCard();
      return t ? html`<div class="card">${t}</div>` : '';
    })()}
    <div class="card table-card">
      <div class="view-header-row" style="display:flex;justify-content:space-between;align-items:center;padding:16px 16px 0">
        <h2>Livre des recettes ${year}</h2>
        <button class="btn btn-secondary btn-sm" data-action="export-receipts">Exporter (Excel)</button>
      </div>
      ${
        book.rows.length
          ? html`<table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Facture</th>
                  <th>Client</th>
                  <th>Mode</th>
                  <th class="num">Montant</th>
                </tr>
              </thead>
              <tbody>
                ${book.rows.map(
                  (r) =>
                    html`<tr>
                      <td>${frDate(r.date)}</td>
                      <td class="mono">${r.invoiceNumber}</td>
                      <td>${r.clientName}</td>
                      <td>${r.method}</td>
                      <td class="num">${eur(r.amount)}</td>
                    </tr>`,
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="4">Total</td>
                  <td class="num">${eur(book.total)}</td>
                </tr>
              </tfoot>
            </table>`
          : html`<div class="empty-state"><p class="text-muted">Les encaissements rapprochés dans « Banque » apparaissent ici automatiquement.</p></div>`
      }
    </div>`;
}
