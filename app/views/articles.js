/**
 * Écran « Articles » (module Articles, tarifs et stock, pour les commerces) : liste du catalogue,
 * recherche (une douchette tape le code-barres puis Entrée), filtres d'alerte, scan en magasin,
 * prix proposés à valider. La fiche, les fournisseurs et l'assistant d'import sont dans leurs fichiers.
 */

import { articleAlerts, margin, purchaseOf } from '../../core/commerce/articles.js?v=a619ec1';
import { fold } from '../../core/commerce/sheet.js?v=a619ec1';
import { stockLevels, stockSummary } from '../../core/commerce/stock.js?v=a619ec1';
import { canDecide, canManage, commerce, loadCommerce } from '../commerce/data.js?v=a619ec1';
import { html, opt, raw } from '../html.js?v=a619ec1';
import { eur, frDate, ui } from '../state.js?v=a619ec1';
import { badge, icon, viewHeader } from '../ui/common.js?v=a619ec1';
import { articleCard } from './article-card.js?v=a619ec1';
import { gridImport } from './grid-import.js?v=a619ec1';
import { cashRegisterTab, supplierDetail, suppliersList } from './suppliers.js?v=a619ec1';

export const commerceUi = () =>
  (ui.commerce ||= { search: '', filter: '', supplier: '', limit: 100, mode: canManage() ? 'expert' : 'simple', wizard: null, compare: null, scanMiss: null });

export const supplierName = (id) => commerce.suppliers.find((s) => s.id === id)?.name || '—';
export const fmtBp = (bp) => (bp === null || bp === undefined ? '—' : `${(bp / 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
export const fmtCoef = (bp) =>
  bp === null || bp === undefined ? '—' : `× ${(bp / 10000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtQty = (q) => (q === null || q === undefined ? '—' : q.toLocaleString('fr-FR', { maximumFractionDigits: 3 }));
const ALERT_KIND = { erreur: 'danger', alerte: 'warning', info: 'muted' };

const TABS = [
  { key: '', label: 'Articles', icon: 'package', show: () => true },
  { key: 'scan', label: 'Scanner', icon: 'scanFrame', show: () => true },
  { key: 'fournisseurs', label: 'Fournisseurs', icon: 'building', show: canManage },
  { key: 'import', label: 'Importer une grille', icon: 'upload', show: canManage },
  { key: 'caisse', label: 'Caisse (Kezia)', icon: 'desktop', show: canManage },
  { key: 'a-valider', label: 'Prix à valider', icon: 'checkCircle', show: () => true },
];

function tabs(active) {
  const open = commerce.proposals.filter((p) => p.status === 'proposee').length;
  return html`<div class="tabs" role="tablist" style="margin-bottom:16px;flex-wrap:wrap">
    ${TABS.filter((t) => t.show()).map(
      (t) =>
        html`<button
          type="button"
          role="tab"
          class="tab ${t.key === active ? 'active' : ''}"
          aria-selected="${t.key === active}"
          data-href="#/articles${t.key ? `/${t.key}` : ''}"
        >
          ${icon(t.icon)} ${t.label}${t.key === 'a-valider' && open ? html` ${badge(String(open), 'warning')}` : ''}
        </button>`,
    )}
  </div>`;
}

export function viewArticles(arg = '') {
  if (!commerce.loaded) {
    if (!commerce.loading && !commerce.error) loadCommerce().then(() => import('../render.js?v=a619ec1').then((m) => m.render()));
    return html`${viewHeader('Articles et stock', '')}
      <div class="card">
        ${
          commerce.error
            ? html`<p class="text-danger">Chargement impossible : ${commerce.error}</p>
                <button type="button" class="btn btn-secondary" data-action="commerce-reload">Réessayer</button>`
            : html`<p class="text-muted" role="status">Chargement du catalogue…</p>`
        }
      </div>`;
  }
  const article = commerce.articles.find((a) => a.id === arg);
  if (article) return html`${tabs('')}${articleCard(article)}`;
  const supplier = arg?.startsWith('fournisseur-') && commerce.suppliers.find((s) => s.id === arg.slice(12));
  if (supplier && canManage()) return html`${tabs('fournisseurs')}${supplierDetail(supplier)}`;
  const views = {
    scan: scanTab,
    fournisseurs: () => (canManage() ? suppliersList() : ''),
    import: () => (canManage() ? gridImport() : ''),
    caisse: () => (canManage() ? cashRegisterTab() : ''),
    'a-valider': proposalsTab,
  };
  return html`${viewHeader(
    'Articles et stock',
    'Catalogue, prix d’achat des grilles fournisseurs, prix de vente, marges et stock compté en magasin.',
    html`<button type="button" class="btn btn-primary" data-href="#/articles/scan">${icon('scanFrame')} Scanner</button>`,
  )}
  ${tabs(views[arg] ? arg : '')}${(views[arg] || articleList)()}`;
}

// ------------------------------------------------------------------ liste

const FILTERS = [
  ['', 'Tous les articles'],
  ['alerte', 'À surveiller (toutes les alertes)'],
  ['perte', 'Vendus à perte'],
  ['marge-faible', 'Marge sous le seuil'],
  ['sans-achat', 'Prix d’achat inconnu'],
  ['pmpa', 'Prix d’achat Kezia à mettre à jour'],
  ['stock-bas', 'Stock sous le minimum'],
  ['sans-ean', 'Sans code-barres'],
];

/** Articles correspondant à la recherche (désignation, EAN, code caisse, ancien code, référence fournisseur). */
export function searchArticles(q, articles = commerce.articles) {
  const k = fold(q);
  if (!k) return articles;
  const words = k.split(' ');
  return articles.filter((a) => {
    const hay = fold([a.label, a.ean, ...(a.codes || []).map((c) => c.value), ...(a.suppliers || []).map((s) => s.ref), a.brand].filter(Boolean).join(' '));
    return words.every((w) => hay.includes(w));
  });
}

function articleList() {
  const st = commerceUi();
  const admin = canManage();
  const levels = stockLevels(commerce.moves);
  let list = searchArticles(st.search);
  if (st.supplier) list = list.filter((a) => (a.suppliers || []).some((s) => s.supplierId === st.supplier));
  if (st.filter === 'stock-bas')
    list = list.filter((a) => a.stockMin !== null && a.stockMin !== undefined && (levels.get(a.id)?.level ?? Infinity) <= a.stockMin);
  else if (st.filter)
    list = list.filter((a) => articleAlerts(a).some((x) => (st.filter === 'alerte' ? x.level !== 'info' || x.code === 'sans-achat' : x.code === st.filter)));
  list = [...list].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  const summary = admin ? stockSummary(commerce.articles, commerce.moves) : null;
  const toValidate = commerce.proposals.filter((p) => p.status === 'proposee').length;
  return html`<div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-value">${commerce.articles.length}</div>
        <div class="kpi-label">Articles</div>
      </div>
      ${
        admin
          ? html`<div class="kpi-card">
                <div class="kpi-value">${commerce.articles.filter((a) => purchaseOf(a)).length}</div>
                <div class="kpi-label">Avec un prix d’achat</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-value">${eur(summary.value)}</div>
                <div class="kpi-label">Valeur du stock compté (${summary.counted} articles)</div>
              </div>`
          : ''
      }
      <div class="kpi-card">
        <div class="kpi-value">${toValidate}</div>
        <div class="kpi-label">Prix à valider</div>
      </div>
    </div>
    <div class="card table-card">
      <form data-form="commerce-search" class="commerce-filters" style="display:flex;gap:8px;flex-wrap:wrap;padding:16px 16px 0;align-items:center">
        <input
          class="input"
          type="search"
          name="q"
          value="${st.search}"
          placeholder="Désignation, code-barres, référence…"
          aria-label="Rechercher un article"
          style="flex:1 1 260px"
          autocomplete="off"
          data-commerce-search
        />
        <select class="input" name="filter" aria-label="Filtre" style="flex:0 1 240px">
          ${FILTERS.filter(([k]) => admin || !['perte', 'marge-faible', 'sans-achat', 'pmpa'].includes(k)).map(([k, l]) => opt(k, l, st.filter === k))}
        </select>
        <select class="input" name="supplier" aria-label="Fournisseur" style="flex:0 1 200px">
          ${opt('', 'Tous les fournisseurs', !st.supplier)}${commerce.suppliers.map((s) => opt(s.id, s.name, st.supplier === s.id))}
        </select>
        <button class="btn btn-secondary" type="submit">${icon('search')} Rechercher</button>
      </form>
      <p class="text-muted" style="padding:8px 16px 0;margin:0">
        ${list.length} article${list.length > 1 ? 's' : ''}${list.length > st.limit ? ` — ${st.limit} premiers affichés` : ''}
      </p>
      <div class="table-scroll">
        <table class="table cards-mobile">
          <thead>
            <tr>
              <th>Article</th>
              <th>Fournisseur</th>
              ${admin ? html`<th class="num">Prix d’achat HT</th>` : ''}
              <th class="num">Prix de vente TTC</th>
              ${admin ? html`<th class="num">Marge</th>` : ''}
              <th class="num">Stock</th>
              <th>À voir</th>
            </tr>
          </thead>
          <tbody>
            ${list.slice(0, st.limit).map((a) => {
              const m = margin(a);
              const alerts = articleAlerts(a).filter((x) => admin || !['perte', 'marge-faible', 'sans-achat', 'pmpa', 'unite'].includes(x.code));
              const first = alerts.find((x) => x.level !== 'info') || alerts[0];
              return html`<tr class="clickable-row" data-href="#/articles/${a.id}">
                <td data-label="Article"><strong>${a.label}</strong><br /><span class="text-muted">${a.ean || 'sans code-barres'}</span></td>
                <td data-label="Fournisseur">
                  ${a.suppliers?.length ? supplierName([...a.suppliers].sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0))[0].supplierId) : '—'}
                </td>
                ${admin ? html`<td class="num" data-label="Prix d’achat HT">${purchaseOf(a) ? eur(purchaseOf(a)) : '—'}</td>` : ''}
                <td class="num" data-label="Prix de vente TTC">${a.salePrice ? eur(a.salePrice) : '—'}</td>
                ${admin ? html`<td class="num" data-label="Marge">${fmtBp(m.markBp)}</td>` : ''}
                <td class="num" data-label="Stock">${fmtQty(levels.get(a.id)?.level)}</td>
                <td data-label="À voir">${first ? badge(first.text, ALERT_KIND[first.level]) : ''}</td>
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
      ${
        list.length > st.limit
          ? html`<div style="padding:12px 16px"><button type="button" class="btn btn-secondary" data-action="commerce-more">Afficher 100 de plus</button></div>`
          : ''
      }
      ${
        !commerce.articles.length && canManage()
          ? html`<div style="padding:16px">
              <p>Le catalogue est vide. Commencez par importer l’export Articles de votre caisse, puis les grilles de vos fournisseurs.</p>
              <button type="button" class="btn btn-primary" data-href="#/articles/caisse">Importer depuis la caisse</button>
            </div>`
          : ''
      }
    </div>`;
}

// ------------------------------------------------------------------ scan

function scanTab() {
  const st = commerceUi();
  const miss = st.scanMiss;
  const gridLine = miss && canManage() && findInPricelists(miss);
  return html`<div class="card scan-card" style="display:flex;flex-direction:column;gap:14px;max-width:560px">
    <h2>Scanner un article</h2>
    <p class="text-muted" style="margin:0">
      Visez le code-barres avec l’appareil photo : la fiche s’ouvre, avec le prix et le stock. Vous pouvez aussi taper le code ou utiliser une douchette.
    </p>
    <button type="button" class="btn btn-primary btn-lg" data-action="commerce-scan">${icon('camera', 20)} Ouvrir l’appareil photo</button>
    <form data-form="commerce-code" style="display:flex;gap:8px">
      <input
        class="input"
        name="code"
        inputmode="numeric"
        autocomplete="off"
        placeholder="Code-barres ou code article"
        aria-label="Code-barres ou code article"
        style="flex:1"
      />
      <button class="btn btn-secondary" type="submit">Ouvrir la fiche</button>
    </form>
    ${
      canManage()
        ? html`<fieldset class="choice-group">
            <legend>Fiche affichée après le scan</legend>
            <label
              ><input type="radio" name="commerce-mode" value="simple" data-action="commerce-mode" ${st.mode === 'simple' ? raw('checked') : ''} /> Simple :
              prix de vente, fournisseur, stock</label
            >
            <label
              ><input type="radio" name="commerce-mode" value="expert" data-action="commerce-mode" ${st.mode === 'expert' ? raw('checked') : ''} /> Experte : en
              plus prix d’achat, marges, historique, nouveau prix</label
            >
          </fieldset>`
        : ''
    }
    ${
      miss
        ? html`<div class="alert alert-warning" role="alert">
            <strong>Code ${miss} : aucun article.</strong>
            ${
              gridLine
                ? html`<p style="margin:6px 0">
                      Trouvé dans la grille ${supplierName(gridLine.supplierId)} : ${gridLine.line.designation} — achat
                      ${gridLine.line.netPrice ? eur(gridLine.line.netPrice) : '—'} HT.
                    </p>
                    <button type="button" class="btn btn-primary" data-action="commerce-create-from-grid" data-id="${miss}">
                      Créer l’article depuis la grille
                    </button>`
                : html`<p style="margin:6px 0">Il n’est ni dans le catalogue ni dans les grilles importées.</p>`
            }
          </div>`
        : ''
    }
  </div>`;
}

/** Ligne de la grille la plus récente qui porte ce code-barres (nouveauté pas encore au catalogue). */
export function findInPricelists(ean) {
  const sorted = [...commerce.pricelists].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  for (const p of sorted) {
    const line = p.lines.find((l) => l.ean === ean);
    if (line) return { line, supplierId: p.supplierId, pricelistId: p.id };
  }
  return null;
}

// ------------------------------------------------------------------ prix à valider

function proposalsTab() {
  const open = commerce.proposals.filter((p) => p.status === 'proposee').sort((a, b) => a.proposedAt.localeCompare(b.proposedAt));
  const done = commerce.proposals
    .filter((p) => p.status !== 'proposee')
    .sort((a, b) => String(b.decidedAt).localeCompare(String(a.decidedAt)))
    .slice(0, 30);
  const label = (id) => commerce.articles.find((a) => a.id === id)?.label || 'Article supprimé';
  const row = (p, actions) =>
    html`<tr>
      <td data-label="Article"><a href="#/articles/${p.articleId}">${label(p.articleId)}</a></td>
      <td class="num" data-label="Prix actuel">${p.current ? eur(p.current) : '—'}</td>
      <td class="num" data-label="Prix proposé"><strong>${eur(p.proposed)}</strong></td>
      <td data-label="Motif">${p.reason || ''}</td>
      <td data-label="Date">${frDate(String(p.proposedAt).slice(0, 10))}</td>
      <td>${actions}</td>
    </tr>`;
  return html`<div class="card table-card">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:16px 16px 0">
        <h2 style="margin:0">Prix de vente proposés (${open.length})</h2>
        ${
          canDecide() && open.length > 1
            ? html`<button type="button" class="btn btn-primary" data-action="commerce-decide-all">Tout valider (${open.length})</button>`
            : ''
        }
      </div>
      <p class="text-muted" style="padding:0 16px">
        ${canDecide() ? 'Validez : le prix passe dans la fiche et dans l’historique. Pensez ensuite à l’envoyer à la caisse (onglet Caisse).' : 'Le dirigeant valide ou refuse chaque proposition.'}
      </p>
      <div class="table-scroll">
        <table class="table cards-mobile">
          <thead>
            <tr>
              <th>Article</th>
              <th class="num">Prix actuel TTC</th>
              <th class="num">Prix proposé TTC</th>
              <th>Motif</th>
              <th>Proposé le</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${open.map((p) =>
              row(
                p,
                canDecide()
                  ? html`<button type="button" class="btn btn-primary btn-sm" data-action="commerce-decide" data-id="${p.id}" data-index="1">Valider</button>
                      <button type="button" class="btn btn-secondary btn-sm" data-action="commerce-decide" data-id="${p.id}" data-index="0">Refuser</button>`
                  : badge('En attente', 'warning'),
              ),
            )}
          </tbody>
        </table>
      </div>
      ${open.length ? '' : html`<p class="text-muted" style="padding:0 16px 16px">Aucun prix en attente.</p>`}
    </div>
    ${
      done.length
        ? html`<div class="card table-card">
            <h2 style="padding:16px 16px 0">Dernières décisions</h2>
            <div class="table-scroll">
              <table class="table cards-mobile">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th class="num">Ancien prix</th>
                    <th class="num">Prix proposé</th>
                    <th>Motif</th>
                    <th>Proposé le</th>
                    <th>Décision</th>
                  </tr>
                </thead>
                <tbody>
                  ${done.map((p) => row(p, badge(p.status === 'validee' ? 'Validé' : 'Refusé', p.status === 'validee' ? 'success' : 'muted')))}
                </tbody>
              </table>
            </div>
          </div>`
        : ''
    }`;
}
