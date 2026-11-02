/**
 * Fiche article, ouverte depuis la liste ou après un scan en magasin.
 *  - simple (tout membre) : désignation, fournisseur, prix de vente, stock, « j'ai compté » ;
 *  - experte (dirigeant, expert-comptable) : en plus prix d'achat par fournisseur et leur évolution
 *    d'une grille à l'autre, prix d'achat Kezia, marge, prix de l'ancien logiciel, prix conseillé,
 *    historique, et proposition d'un nouveau prix (validée par le dirigeant).
 */

import { CODE_TYPES, ROUNDINGS, articleAlerts, margin, proposeSalePrice, purchaseOf } from '../../core/commerce/articles.js?v=3bfbbd4';
import { lineKey, priceTimeline } from '../../core/commerce/pricelists.js?v=3bfbbd4';
import { MOVE_KINDS, stockOf } from '../../core/commerce/stock.js?v=3bfbbd4';
import { canDecide, canManage, commerce } from '../commerce/data.js?v=3bfbbd4';
import { field, html, opt, raw } from '../html.js?v=3bfbbd4';
import { eur, frDate, today } from '../state.js?v=3bfbbd4';
import { badge, icon } from '../ui/common.js?v=3bfbbd4';
import { classBlock, orderHint, suppliersBlock } from './article-suppliers.js?v=3bfbbd4';
import { commerceUi, fmtBp, fmtCoef, fmtQty, supplierName } from './articles.js?v=3bfbbd4';

const euros = (c) => (c === null || c === undefined ? '' : (c / 100).toFixed(2).replace('.', ','));

function stockBlock(a) {
  const s = stockOf(commerce.moves, a.id);
  const recent = commerce.moves
    .filter((m) => m.articleId === a.id)
    .sort((x, y) => y.date.localeCompare(x.date) || String(y.createdAt).localeCompare(String(x.createdAt)))
    .slice(0, 5);
  return html`<div class="card" style="display:flex;flex-direction:column;gap:10px">
    <h2>Stock</h2>
    <div class="article-big">
      <span class="article-big-value">${fmtQty(s.level)}</span>
      <span class="text-muted"
        >${s.lastCount ? `compté le ${frDate(s.lastCount)}` : 'jamais compté'}${a.stockMin !== null && a.stockMin !== undefined ? ` · minimum ${fmtQty(a.stockMin)}` : ''}</span
      >
    </div>
    ${orderHint(a)}
    <form data-form="commerce-count" data-id="${a.id}" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      ${field('J’ai compté', html`<input class="input" name="qty" inputmode="decimal" autocomplete="off" required style="width:120px" />`)}
      <button class="btn btn-primary" type="submit">Enregistrer le comptage</button>
    </form>
    <details>
      <summary>Entrée, sortie ou correction</summary>
      <form data-form="commerce-move" data-id="${a.id}" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:8px">
        ${field(
          'Mouvement',
          html`<select class="input" name="kind">
            ${['entree', 'sortie', 'correction'].map((k) => opt(k, MOVE_KINDS[k]))}
          </select>`,
        )}
        ${field('Quantité', html`<input class="input" name="qty" inputmode="decimal" required style="width:110px" />`, { hint: 'Correction : + ou −' })}
        ${field('Motif', html`<input class="input" name="note" maxlength="200" placeholder="Livraison, casse…" />`)}
        <button class="btn btn-secondary" type="submit">Enregistrer</button>
      </form>
    </details>
    ${
      recent.length
        ? html`<ul class="text-muted" style="margin:0;padding-left:18px">
            ${recent.map((m) => html`<li>${frDate(m.date)} · ${MOVE_KINDS[m.kind]} ${m.kind === 'comptage' ? fmtQty(m.qty) : `${m.qty > 0 ? '+' : ''}${fmtQty(m.qty)}`}${m.note ? ` · ${m.note}` : ''}</li>`)}
          </ul>`
        : ''
    }
  </div>`;
}

function proposalBlock(a, expert) {
  const st = commerceUi();
  const pending = commerce.proposals.filter((p) => p.articleId === a.id && p.status === 'proposee');
  const p = purchaseOf(a);
  const coef = st.proposalCoef ?? 20000;
  const rounding = st.proposalRounding || 'psy';
  const suggested = expert && p ? proposeSalePrice(p, coef, { vatRateBp: a.vatRateBp ?? 2000, rounding }) : null;
  return html`<div class="card" style="display:flex;flex-direction:column;gap:10px">
    <h2>Proposer un nouveau prix de vente</h2>
    ${pending.map(
      (x) =>
        html`<div class="alert alert-warning">
          Prix proposé : <strong>${eur(x.proposed)}</strong>${x.reason ? ` (${x.reason})` : ''}, en attente de validation.
          ${
            canDecide()
              ? html`<button type="button" class="btn btn-primary btn-sm" data-action="commerce-decide" data-id="${x.id}" data-index="1">Valider</button>
                  <button type="button" class="btn btn-secondary btn-sm" data-action="commerce-decide" data-id="${x.id}" data-index="0">Refuser</button>`
              : ''
          }
        </div>`,
    )}
    ${
      suggested
        ? html`<form data-form="commerce-suggest" data-id="${a.id}" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            ${field('Coefficient sur l’achat', html`<input class="input" name="coef" inputmode="decimal" value="${(coef / 10000).toFixed(2).replace('.', ',')}" style="width:90px" />`)}
            ${field(
              'Arrondi',
              html`<select class="input" name="rounding">
                ${Object.entries(ROUNDINGS).map(([k, r]) => opt(k, r.label, k === rounding))}
              </select>`,
            )}
            <button class="btn btn-secondary" type="submit">Calculer</button>
            <span>Prix calculé : <strong>${eur(suggested)}</strong> TTC</span>
          </form>`
        : ''
    }
    <form data-form="commerce-propose" data-id="${a.id}" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      ${field('Nouveau prix TTC (€)', html`<input class="input" name="price" inputmode="decimal" value="${euros(suggested)}" required style="width:120px" />`)}
      ${field('Motif', html`<input class="input" name="reason" maxlength="300" placeholder="Prix de l’ancien logiciel, hausse fournisseur…" style="min-width:220px" />`)}
      <button class="btn btn-primary" type="submit">${canDecide() ? 'Proposer' : 'Envoyer pour validation'}</button>
    </form>
    <p class="form-hint" style="margin:0">Le prix change après validation par le dirigeant, puis s’envoie à la caisse avec l’export Kezia.</p>
  </div>`;
}

function purchaseBlock(a) {
  const m = margin(a);
  const rise = a.purchasePrice && a.pmpa ? Math.round(((a.purchasePrice - a.pmpa) * 10000) / a.pmpa) : null;
  return html`<div class="card" style="display:flex;flex-direction:column;gap:10px">
    <h2>Achat</h2>
    <dl class="article-facts">
      <dt>Prix d’achat Kezia</dt>
      <dd>${a.pmpa ? eur(a.pmpa) : '—'}</dd>
      <dt>Prix d’achat de la grille</dt>
      <dd>${a.purchasePrice ? eur(a.purchasePrice) : '—'}</dd>
      <dt>Hausse grille / Kezia</dt>
      <dd>
        ${rise === null ? '—' : html`<span class="${rise > 50 ? 'text-danger' : rise < -50 ? 'text-success' : ''}">${rise > 0 ? '+' : ''}${fmtBp(rise)}</span>`}
      </dd>
    </dl>
    ${suppliersBlock(a)} ${timeline(a)}
    <p style="margin:0">Coefficient ${fmtCoef(m.coefBp)} · taux de marque ${fmtBp(m.markBp)}</p>
  </div>`;
}

/** Prix d'achat d'une grille à l'autre, pour chaque fournisseur de l'article. */
function timeline(a) {
  const key = a.ean || null;
  const rows = (a.suppliers || []).flatMap((s) => {
    const k = key || (s.ref ? lineKey({ ref: s.ref }) : null);
    return k ? priceTimeline(commerce.pricelists, s.supplierId, k).map((t) => ({ ...t, supplierId: s.supplierId })) : [];
  });
  if (rows.length < 2) return '';
  return html`<details>
    <summary>Évolution du prix d’achat (${rows.length} grilles)</summary>
    <ul style="margin:8px 0 0;padding-left:18px">
      ${rows.map((r, i) => {
        const prev = rows[i - 1];
        const v =
          prev && prev.supplierId === r.supplierId && prev.netPrice && r.netPrice ? Math.round(((r.netPrice - prev.netPrice) * 10000) / prev.netPrice) : null;
        return html`<li>
          ${frDate(r.date)} · ${supplierName(r.supplierId)} :
          ${r.netPrice ? eur(r.netPrice) : '—'}${v !== null && v !== 0 ? ` (${v > 0 ? '+' : ''}${fmtBp(v)})` : ''}
        </li>`;
      })}
    </ul>
  </details>`;
}

function saleBlock(a, expert) {
  const m = margin(a);
  const legacy = (a.codes || []).find((c) => c.type === 'ancien');
  const retail = (a.suppliers || [])
    .map((s) => commerce.pricelists.find((p) => p.id === s.pricelistId)?.lines.find((l) => l.ean && l.ean === a.ean)?.retailPrice)
    .find(Boolean);
  const hist = commerce.history.filter((h) => h.articleId === a.id && h.kind === 'vente').sort((x, y) => y.date.localeCompare(x.date));
  return html`<div class="card" style="display:flex;flex-direction:column;gap:10px">
    <h2>Vente</h2>
    <div class="article-big">
      <span class="article-big-value">${a.salePrice ? eur(a.salePrice) : '—'}</span><span class="text-muted">TTC · ${m.saleHt ? eur(m.saleHt) : '—'} HT</span>
    </div>
    ${
      expert
        ? html`<dl class="article-facts">
              <dt>Prix de l’ancien logiciel</dt>
              <dd>${a.legacyPrice ? `${eur(a.legacyPrice)} HT` : '—'}${legacy ? ` (code ${legacy.value})` : ''}</dd>
              ${a.legacyWhy ? html`<dd class="text-muted" style="grid-column:1 / -1;font-weight:400">Rapprochement : ${a.legacyWhy}</dd>` : ''}
              <dt>Prix de vente conseillé (fournisseur)</dt>
              <dd>${retail ? `${eur(retail)} HT` : '—'}</dd>
              <dt>Marge actuelle</dt>
              <dd>${fmtBp(m.markBp)}</dd>
            </dl>
            ${hist.length ? html`<p class="text-muted" style="margin:0">Dernier changement : ${frDate(hist[0].date)}, ${hist[0].before ? eur(hist[0].before) : '—'} → ${eur(hist[0].after)}</p>` : ''}`
        : ''
    }
  </div>`;
}

export function articleCard(a) {
  const st = commerceUi();
  const expert = canManage() && st.mode === 'expert';
  const alerts = articleAlerts(a).filter((x) => expert || !['perte', 'marge-faible', 'sans-achat', 'pmpa', 'unite'].includes(x.code));
  const suppliers = [...(a.suppliers || [])].sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0)).map((s) => supplierName(s.supplierId));
  return html`<div class="view-header view-header-row">
      <div>
        <h1>${a.label}</h1>
        <p class="view-subtitle">${suppliers.join(' · ') || 'Fournisseur inconnu'} · ${a.ean || 'sans code-barres'}</p>
      </div>
      <div class="detail-header-actions">
        <button type="button" class="btn btn-secondary" data-action="commerce-scan">${icon('scanFrame')} Scanner un autre article</button>
        ${
          canManage()
            ? html`<button type="button" class="btn btn-secondary" data-action="commerce-mode" data-id="${expert ? 'simple' : 'expert'}">
                ${expert ? 'Vue simple' : 'Vue experte'}
              </button>`
            : ''
        }
      </div>
    </div>
    ${alerts.length ? html`<p>${alerts.map((x) => badge(x.text, { erreur: 'danger', alerte: 'warning', info: 'muted' }[x.level]))}</p>` : ''}
    <div class="article-grid">
      ${saleBlock(a, expert)}${stockBlock(a)}${expert ? purchaseBlock(a) : ''}${proposalBlock(a, expert)}${expert ? classBlock(a) : ''}
      ${
        expert
          ? html`<div class="card">
              <h2>Codes</h2>
              <dl class="article-facts">
                <dt>EAN (code-barres)</dt>
                <dd>${a.ean || '—'}</dd>
                ${(a.codes || []).map(
                  (c) =>
                    html`<dt>${CODE_TYPES[c.type]}</dt>
                      <dd>${c.value}</dd>`,
                )}
                <dt>TVA</dt>
                <dd>${((a.vatRateBp ?? 2000) / 100).toLocaleString('fr-FR')} %</dd>
                <dt>Rayon</dt>
                <dd>${a.department || '—'}</dd>
              </dl>
            </div>`
          : ''
      }
    </div>
    <p><a href="#/articles">${raw('&larr;')} Retour au catalogue</a> · ${frDate(today())}</p>`;
}
