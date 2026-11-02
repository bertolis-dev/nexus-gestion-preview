/**
 * Assistant d'import d'une grille fournisseur, en 4 étapes : 1. fournisseur, date d'effet et fichier ;
 * 2. onglet et première ligne de données (aperçu) ; 3. colonne de chaque champ (proposées
 * automatiquement, mémorisées par fournisseur) ; 4. contrôle (lignes lues, écartées, rapprochées par
 * EAN ou référence, comparatif avec la grille précédente) puis validation. L'EAN est la clé pivot.
 */

import { matchLines } from '../../core/commerce/articles.js?v=269c883';
import { FIELDS, columnLabels } from '../../core/commerce/sheet.js?v=269c883';
import { comparePricelists, supplierPricelists } from '../../core/commerce/pricelists.js?v=269c883';
import { commerce } from '../commerce/data.js?v=269c883';
import { field, html, opt, raw } from '../html.js?v=269c883';
import { eur, frDate, today } from '../state.js?v=269c883';
import { badge, icon } from '../ui/common.js?v=269c883';
import { commerceUi, fmtBp } from './articles.js?v=269c883';

const letter = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
// Nombres à la française (virgule décimale), sans séparateur de milliers pour ne pas couper un EAN.
const frNumber = (n) => n.toLocaleString('fr-FR', { maximumFractionDigits: 4, useGrouping: false });
const cellText = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? frNumber(v) : String(v).replace(/\s+/g, ' ').trim().slice(0, 40));

function steps(n) {
  const names = ['Fichier', 'Onglet', 'Colonnes', 'Contrôle'];
  return html`<ol class="wizard-steps" style="display:flex;gap:12px;flex-wrap:wrap;list-style:none;padding:0;margin:0 0 12px">
    ${names.map((s, i) => html`<li>${i + 1 === n ? badge(`${i + 1}. ${s}`, 'success') : html`<span class="text-muted">${i + 1}. ${s}</span>`}</li>`)}
  </ol>`;
}

export function gridImport() {
  const w = commerceUi().wizard;
  if (!w?.workbook) return stepFile(w || {});
  if (w.step === 2) return stepSheet(w);
  if (w.step === 3) return stepColumns(w);
  return stepControl(w);
}

function stepFile(w = {}) {
  return html`<form class="card" data-form="commerce-wiz-file" style="display:flex;flex-direction:column;gap:12px;max-width:720px">
    ${steps(1)}
    <h2>Importer une grille tarifaire</h2>
    <p class="text-muted" style="margin:0">
      Fichier Excel (xls, xlsx), CSV ou PDF envoyé par le fournisseur (un PDF est mis en tableau : vérifiez bien les colonnes). Chaque import est gardé avec sa
      date : vous pourrez comparer les grilles entre elles.
    </p>
    ${field(
      'Fournisseur',
      html`<select class="input" name="supplierId">
        ${opt('', 'Choisir…', !w.supplierId)}${commerce.suppliers.filter((s) => !s.mergedInto).map((s) => opt(s.id, s.name, w.supplierId === s.id))}${opt('nouveau', 'Nouveau fournisseur…', w.supplierId === 'nouveau')}
      </select>`,
    )}
    ${field('Nom du nouveau fournisseur', html`<input class="input" name="newName" maxlength="120" value="${w.newName || ''}" />`, { hint: 'Seulement si vous avez choisi « Nouveau fournisseur ».' })}
    ${field('Date d’effet des prix', html`<input class="input" type="date" name="effectiveDate" value="${w.effectiveDate || today()}" required style="width:180px" />`, { hint: 'La date à partir de laquelle ces prix s’appliquent (indiquée sur la grille).' })}
    ${field('Fichier', html`<input class="input" type="file" name="file" accept=".xls,.xlsx,.csv,.pdf" required />`)}
    <div><button class="btn btn-primary" type="submit">Lire le fichier</button></div>
  </form>`;
}

function stepSheet(w) {
  const sheet = w.workbook.sheets.find((s) => s.name === w.profile.sheet);
  const from = Math.max(0, w.profile.firstRow - 3);
  const rows = sheet.rows.slice(from, w.profile.firstRow + 12);
  const width = Math.min(18, Math.max(...rows.map((r) => r?.length || 0)));
  return html`<form class="card" data-form="commerce-wiz-sheet" style="display:flex;flex-direction:column;gap:12px">
    ${steps(2)}
    <h2>Onglet et première ligne de données</h2>
    <p class="text-muted" style="margin:0">
      ${w.fileName} ·
      ${w.reused ? 'Paramétrage du fournisseur repris : vérifiez simplement.' : 'Proposition automatique : l’onglet qui contient le plus de codes-barres.'}
    </p>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
      ${field(
        'Onglet',
        html`<select class="input" name="sheet" data-action="commerce-wiz-sheet">
          ${w.workbook.sheets.map((s) => opt(s.name, `${s.name} (${s.rows.length} lignes)`, s.name === w.profile.sheet))}
        </select>`,
      )}
      ${field('Première ligne de données', html`<input class="input" name="firstRow" type="number" min="1" value="${w.profile.firstRow + 1}" style="width:110px" />`)}
    </div>
    <div class="table-scroll">
      <table class="table grid-preview">
        <thead>
          <tr>
            <th>Ligne</th>
            ${Array.from({ length: width }, (_, i) => html`<th>${letter(i)}</th>`)}
          </tr>
        </thead>
        <tbody>
          ${rows.map(
            (r, i) =>
              html`<tr class="${from + i === w.profile.firstRow ? 'grid-first-row' : from + i < w.profile.firstRow ? 'text-muted' : ''}">
                <td>${from + i + 1}</td>
                ${Array.from({ length: width }, (_, c) => html`<td>${cellText(r?.[c])}</td>`)}
              </tr>`,
          )}
        </tbody>
      </table>
    </div>
    <div style="display:flex;gap:8px">
      <button type="button" class="btn btn-secondary" data-action="commerce-wiz-back" data-index="1">Retour</button>
      <button class="btn btn-primary" type="submit">Suivant : les colonnes</button>
    </div>
  </form>`;
}

function columnSelect(name, labels, sample, value, { optional = true } = {}) {
  return html`<select class="input" name="${name}">
    ${optional ? opt('', '— aucune —', value === undefined || value === null || value === '') : ''}
    ${labels.map((l, i) => opt(String(i), `${letter(i)} · ${l || 'sans titre'}${sample[i] ? ` (ex. ${sample[i]})` : ''}`, Number(value) === i && value !== '' && value !== null))}
  </select>`;
}

function stepColumns(w) {
  const sheet = w.workbook.sheets.find((s) => s.name === w.profile.sheet);
  const labels = columnLabels(sheet.rows, w.profile.firstRow);
  const first = sheet.rows[w.profile.firstRow] || [];
  const sample = labels.map((_, i) => cellText(first[i]).slice(0, 18));
  const C = w.profile.columns;
  const des = Array.isArray(C.designation) ? C.designation : C.designation === undefined ? [] : [C.designation];
  const others = w.workbook.sheets.filter((s) => s.name !== w.profile.sheet);
  const j = w.profile.join;
  const joinSheet = j && w.workbook.sheets.find((s) => s.name === j.sheet);
  const joinLabels = joinSheet ? columnLabels(joinSheet.rows, j.firstRow) : [];
  return html`<form class="card" data-form="commerce-wiz-columns" style="display:flex;flex-direction:column;gap:12px">
    ${steps(3)}
    <h2>Quelle colonne pour chaque information ?</h2>
    <p class="text-muted" style="margin:0">
      L’EAN (code-barres) relie la grille aux articles. À défaut, la référence fournisseur. Les autres colonnes sont facultatives.
    </p>
    <div class="grid-columns" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px">
      ${FIELDS.filter((f) => f.key !== 'designation').map((f) => field(f.label, columnSelect(f.key, labels, sample, C[f.key])))}
      ${[0, 1, 2].map((i) => field(i ? `Désignation (suite ${i})` : 'Désignation', columnSelect(`designation${i}`, labels, sample, des[i])))}
    </div>
    ${choiceGroup(w)}
    ${
      C.previousNetPrice !== undefined || w.previousDate
        ? field(
            'Date du prix d’achat précédent',
            html`<input class="input" type="date" name="previousDate" value="${w.previousDate || ''}" style="width:180px" />`,
            {
              hint: 'La grille donne aussi l’ancien prix : il est enregistré comme une version plus ancienne, à cette date.',
            },
          )
        : ''
    }
    <details ${j ? raw('open') : ''}>
      <summary>Prix de vente conseillé dans un autre onglet</summary>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
        ${field(
          'Onglet',
          html`<select class="input" name="joinSheet">
            ${opt('', '— aucun —', !j)}${others.map((s) => opt(s.name, s.name, j?.sheet === s.name))}
          </select>`,
        )}
        ${
          j
            ? html`${field('Colonne EAN', columnSelect('joinEan', joinLabels, [], j.ean, { optional: false }))}${field('Colonne prix conseillé HT', columnSelect('joinRetail', joinLabels, [], j.columns.retailPrice, { optional: false }))}`
            : html`<p class="form-hint">Choisissez l’onglet puis « Contrôler » : les colonnes seront proposées.</p>`
        }
      </div>
    </details>
    <div style="display:flex;gap:8px">
      <button type="button" class="btn btn-secondary" data-action="commerce-wiz-back" data-index="2">Retour</button>
      <button class="btn btn-primary" type="submit">Contrôler</button>
    </div>
  </form>`;
}

const choiceGroup = (w) =>
  html`<fieldset class="choice-group">
    <legend>Les prix de la grille sont exprimés</legend>
    <label
      ><input type="radio" name="priceBasis" value="piece" ${w.profile.priceBasis !== 'unit' ? raw('checked') : ''} /> à la pièce (au bidon, au sac…)</label
    >
    <label
      ><input type="radio" name="priceBasis" value="unit" ${w.profile.priceBasis === 'unit' ? raw('checked') : ''} /> au litre ou au kilo (multipliés par la
      contenance)</label
    >
  </fieldset>`;

function stepControl(w) {
  const r = w.result;
  const supplierId = w.supplierId === 'nouveau' ? null : w.supplierId;
  const m = matchLines(r.lines, commerce.articles, supplierId);
  const previous = supplierId ? supplierPricelists(commerce.pricelists, supplierId).at(-1) : null;
  const cmp = previous ? comparePricelists(previous, { effectiveDate: w.effectiveDate, lines: r.lines }) : null;
  const withPrice = r.lines.filter((l) => Number.isSafeInteger(l.netPrice)).length;
  return html`<div class="card" style="display:flex;flex-direction:column;gap:12px">
    ${steps(4)}
    <h2>Contrôle avant import</h2>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-value">${r.stats.lines}</div>
        <div class="kpi-label">Lignes lues</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${withPrice}</div>
        <div class="kpi-label">Avec un prix d’achat net</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${m.matched.length}</div>
        <div class="kpi-label">Articles reconnus (${m.matched.filter((x) => x.by === 'ean').length} par EAN)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${m.unmatched.length}</div>
        <div class="kpi-label">Pas au catalogue (nouveautés possibles)</div>
      </div>
    </div>
    ${withPrice ? '' : html`<div class="alert alert-warning">Aucun prix d’achat net : la grille ne donne que des prix bruts. Indiquez la remise du fournisseur, ou importez-la quand même pour suivre l’évolution des prix publics.</div>`}
    ${r.stats.repaired ? html`<p>${r.stats.repaired} code${r.stats.repaired > 1 ? 's' : ''}-barres abîmé${r.stats.repaired > 1 ? 's' : ''} par le tableur, réparé${r.stats.repaired > 1 ? 's' : ''}.</p>` : ''}
    ${
      cmp
        ? html`<p>
            Par rapport à la grille du ${frDate(previous.effectiveDate)} : <strong>${fmtBp(cmp.summary.averageBp)}</strong> en moyenne · ${cmp.summary.up}
            hausses · ${cmp.summary.down} baisses · ${cmp.summary.added} nouveautés · ${cmp.summary.removed} retirés.
          </p>`
        : ''
    }
    <div class="table-scroll">
      <table class="table">
        <thead>
          <tr>
            <th>Ligne</th>
            <th>EAN</th>
            <th>Référence</th>
            <th>Désignation</th>
            <th class="num">Contenance</th>
            <th class="num">Achat net HT</th>
            <th class="num">Prix brut</th>
            <th class="num">Conseillé HT</th>
          </tr>
        </thead>
        <tbody>
          ${r.lines.slice(0, 12).map(
            (l) =>
              html`<tr>
                <td>${l.row}</td>
                <td>${l.ean}</td>
                <td>${l.ref}</td>
                <td>${l.designation}</td>
                <td class="num">${l.size === null || l.size === undefined ? '' : frNumber(l.size)}</td>
                <td class="num">${l.netPrice !== null ? eur(l.netPrice) : '—'}</td>
                <td class="num">${l.grossPrice !== null ? eur(l.grossPrice) : '—'}</td>
                <td class="num">${l.retailPrice ? eur(l.retailPrice) : '—'}</td>
              </tr>`,
          )}
        </tbody>
      </table>
    </div>
    ${
      r.rejected.length
        ? html`<details>
            <summary>${r.rejected.length} ligne${r.rejected.length > 1 ? 's' : ''} écartée${r.rejected.length > 1 ? 's' : ''}</summary>
            <ul>
              ${r.rejected.slice(0, 40).map((x) => html`<li>Ligne ${x.row} « ${x.designation} » : ${x.reason}</li>`)}
            </ul>
          </details>`
        : ''
    }
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" class="btn btn-secondary" data-action="commerce-wiz-back" data-index="3">Revoir les colonnes</button>
      <button type="button" class="btn btn-primary" data-action="commerce-wiz-commit">
        ${icon('checkCircle')} Valider l’import (${m.matched.length} articles mis à jour)
      </button>
    </div>
  </div>`;
}
