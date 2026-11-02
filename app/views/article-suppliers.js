/**
 * Fiche article, vue experte : les fournisseurs de l'article (plusieurs possibles, un principal),
 * leurs prix par quantité, la comparaison pour une quantité donnée, puis le classement (rayon,
 * famille, caractéristiques) et les seuils de réapprovisionnement repris dans Kezia.
 */

import { TIER_UNITS, compareSuppliers, orderSuggestion, tierUnits } from '../../core/commerce/tiers.js?v=3bfbbd4';
import { stockOf } from '../../core/commerce/stock.js?v=3bfbbd4';
import { canManage, commerce } from '../commerce/data.js?v=3bfbbd4';
import { field, html, opt, raw } from '../html.js?v=3bfbbd4';
import { eur, frDate } from '../state.js?v=3bfbbd4';
import { badge } from '../ui/common.js?v=3bfbbd4';
import { commerceUi, fmtQty, supplierName } from './articles.js?v=3bfbbd4';

const UNIT_ONE = { piece: 'unité', colis: 'colis', palette: 'palette' };

/** « dès 4 palettes (560 u.) » */
export function tierLabel(t, link) {
  const units = tierUnits(t, link);
  const what = t.qty > 1 ? TIER_UNITS[t.per] : UNIT_ONE[t.per];
  return `dès ${fmtQty(t.qty)} ${what}${t.per !== 'piece' && units ? ` (${fmtQty(units)} u.)` : ''}`;
}

function tiersCell(a, s) {
  const tiers = s.tiers || [];
  if (!tiers.length) return '—';
  return html`<ul style="margin:0;padding-left:16px">
    ${tiers.map(
      (t, i) =>
        html`<li>
          ${tierLabel(t, s)} : <strong>${eur(t.netPrice)}</strong>${t.source === 'saisie' ? ' (saisi)' : ''}
          ${
            canManage()
              ? html`<button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  data-action="commerce-tier-remove"
                  data-id="${a.id}"
                  data-index="${s.supplierId}|${i}"
                  aria-label="Retirer ce palier"
                >
                  ×
                </button>`
              : ''
          }
        </li>`,
    )}
  </ul>`;
}

function compareBlock(a, links) {
  const qty = commerceUi().qtyFor?.[a.id] ?? null;
  const rows = qty ? compareSuppliers(a, qty) : [];
  return html`<form data-form="commerce-qty" data-id="${a.id}" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      ${field('Prix pour une quantité', html`<input class="input" name="qty" inputmode="decimal" value="${qty ?? ''}" placeholder="ex. 560" style="width:120px" />`)}
      <button class="btn btn-secondary" type="submit">Comparer les fournisseurs</button>
    </form>
    ${
      rows.length
        ? html`<div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Pour ${fmtQty(qty)} unités</th>
                  <th class="num">Prix unitaire HT</th>
                  <th>Prix appliqué</th>
                  <th class="num">Total HT</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(
                  (r, i) =>
                    html`<tr>
                      <td>
                        ${supplierName(r.link.supplierId)}${i === 0 && links.length > 1 && r.netPrice !== null ? html` ${badge('le moins cher', 'success')}` : ''}
                      </td>
                      <td class="num">${r.netPrice === null ? '—' : eur(r.netPrice)}</td>
                      <td>${r.tier ? tierLabel(r.tier, r.link) : 'prix de base'}</td>
                      <td class="num">${r.total === null ? '—' : eur(r.total)}</td>
                    </tr>`,
                )}
              </tbody>
            </table>
          </div>`
        : ''
    }`;
}

function manageForms(a, links) {
  const others = commerce.suppliers.filter((s) => !s.mergedInto);
  return html`<details>
      <summary>Ajouter un fournisseur, ou modifier sa référence et son prix</summary>
      <form data-form="commerce-link" data-id="${a.id}" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:8px">
        ${field(
          'Fournisseur',
          html`<select class="input" name="supplierId" required>
            ${opt('', '— choisir —', true)}${others.map((s) => opt(s.id, s.name))}
          </select>`,
        )}
        ${field('Référence', html`<input class="input" name="ref" maxlength="60" style="width:140px" />`)}
        ${field('Prix net HT (€)', html`<input class="input" name="price" inputmode="decimal" style="width:110px" />`)}
        ${field('Colisage', html`<input class="input" name="packSize" inputmode="decimal" style="width:80px" />`)}
        ${field('Par palette', html`<input class="input" name="palletSize" inputmode="decimal" style="width:90px" />`)}
        <button class="btn btn-secondary" type="submit">Enregistrer</button>
      </form>
      <p class="form-hint" style="margin:6px 0 0">Un fournisseur déjà présent est mis à jour ; une case laissée vide garde sa valeur.</p>
    </details>
    ${
      links.length
        ? html`<details>
            <summary>Ajouter un prix par quantité (remise négociée, prix par palette)</summary>
            <form data-form="commerce-tier" data-id="${a.id}" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:8px">
              ${field(
                'Fournisseur',
                html`<select class="input" name="supplierId">
                  ${links.map((s, i) => opt(s.supplierId, supplierName(s.supplierId), i === 0))}
                </select>`,
              )}
              ${field('À partir de', html`<input class="input" name="qty" inputmode="numeric" required style="width:90px" />`)}
              ${field(
                'Unité',
                html`<select class="input" name="per">
                  ${Object.entries(TIER_UNITS).map(([k, l]) => opt(k, l, k === 'piece'))}
                </select>`,
              )}
              ${field('Prix net HT à l’unité (€)', html`<input class="input" name="price" inputmode="decimal" required style="width:110px" />`)}
              <button class="btn btn-secondary" type="submit">Ajouter</button>
            </form>
          </details>`
        : ''
    }`;
}

/** Tableau des fournisseurs de l'article, avec leurs paliers et la comparaison par quantité. */
export function suppliersBlock(a) {
  const links = [...(a.suppliers || [])].sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0));
  const pl = (id) => commerce.pricelists.find((p) => p.id === id);
  return html`<div class="table-scroll">
      <table class="table">
        <thead>
          <tr>
            <th>Fournisseur</th>
            <th>Référence</th>
            <th class="num">Achat net HT</th>
            <th>Colis · palette</th>
            <th>Prix par quantité</th>
            <th>Grille du</th>
            ${canManage() ? html`<th></th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${links.map((s, i) => {
            const p = pl(s.pricelistId);
            return html`<tr>
              <td>${supplierName(s.supplierId)}${i === 0 && links.length > 1 ? html` ${badge('principal', 'muted')}` : ''}</td>
              <td>${s.ref || '—'}</td>
              <td class="num">${s.netPrice ? eur(s.netPrice) : '—'}</td>
              <td>${s.packSize ? fmtQty(s.packSize) : '—'} · ${s.palletSize ? fmtQty(s.palletSize) : '—'}</td>
              <td>${tiersCell(a, s)}</td>
              <td>${p ? frDate(p.effectiveDate) : 'saisi'}</td>
              ${
                canManage()
                  ? html`<td style="white-space:nowrap">
                      ${
                        i > 0
                          ? html`<button
                              type="button"
                              class="btn btn-secondary btn-sm"
                              data-action="commerce-link-primary"
                              data-id="${a.id}"
                              data-index="${s.supplierId}"
                            >
                              Principal
                            </button>`
                          : ''
                      }
                      <button type="button" class="btn btn-secondary btn-sm" data-action="commerce-link-remove" data-id="${a.id}" data-index="${s.supplierId}">
                        Retirer
                      </button>
                    </td>`
                  : ''
              }
            </tr>`;
          })}
        </tbody>
      </table>
    </div>
    ${links.length ? compareBlock(a, links) : html`<p class="text-muted" style="margin:0">Aucun fournisseur rattaché.</p>`}
    ${canManage() ? manageForms(a, links) : ''}`;
}

/** Commande suggérée sous le stock minimum (fiche article, bloc Stock). */
export function orderHint(a) {
  const o = orderSuggestion(a, stockOf(commerce.moves, a.id).level);
  if (!o) return '';
  if (!o.qty) return html`<div class="alert alert-warning">Stock au minimum : indiquez une quantité à commander ou un stock maximum.</div>`;
  const b = o.best;
  return html`<div class="alert alert-warning">
    À commander : <strong>${fmtQty(o.qty)}</strong>${
      b?.netPrice !== null && b?.netPrice !== undefined
        ? html` chez ${supplierName(b.link.supplierId)}, ${eur(b.netPrice)} HT l’unité${b.tier ? ` (${tierLabel(b.tier, b.link)})` : ''}, soit ${eur(b.total)}
          HT`
        : ''
    }.
  </div>`;
}

const num = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

/** Classement, caractéristiques et seuils de stock, repris dans l'export vers Kezia. */
export function classBlock(a) {
  const input = (name, value, attrs = '') => html`<input class="input" name="${name}" value="${value ?? ''}" ${raw(attrs)} />`;
  const disabled = canManage() ? '' : 'disabled';
  return html`<form class="card" data-form="commerce-class" data-id="${a.id}" style="display:flex;flex-direction:column;gap:10px">
    <h2>Classement et réapprovisionnement</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px">
      ${field('Rayon', input('department', a.department, `maxlength="80" list="commerce-departments" ${disabled}`))}
      ${field('Famille', input('family', a.family, `maxlength="80" ${disabled}`))}
      ${field('Sous-famille', input('subFamily', a.subFamily, `maxlength="80" ${disabled}`))}
      ${field('Marque', input('brand', a.brand, `maxlength="80" ${disabled}`))}
      ${field('Contenance', input('size', num(a.size), `inputmode="decimal" ${disabled}`))}
      ${field('Unité', input('unit', a.unit, `maxlength="10" placeholder="L, kg, m…" ${disabled}`))}
      ${field('Teinte ou base', input('colour', a.colour, `maxlength="60" ${disabled}`))}
      ${field('Taille, dimension', input('dimension', a.dimension, `maxlength="60" placeholder="180 mm, T9, P120…" ${disabled}`))}
      ${field('Stock minimum', input('stockMin', num(a.stockMin), `inputmode="decimal" ${disabled}`))}
      ${field('Stock maximum', input('stockMax', num(a.stockMax), `inputmode="decimal" ${disabled}`))}
      ${field('Quantité à commander', input('reorderQty', num(a.reorderQty), `inputmode="decimal" ${disabled}`))}
    </div>
    <datalist id="commerce-departments">
      ${[...new Set(commerce.articles.map((x) => x.department).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'fr')).map((d) => opt(d, d))}
    </datalist>
    ${canManage() ? html`<div><button class="btn btn-secondary" type="submit">Enregistrer</button></div>` : ''}
    <p class="form-hint" style="margin:0">Rayon, famille, sous-famille, marque, teinte, taille et quantités partent vers Kezia avec l’export.</p>
  </form>`;
}
