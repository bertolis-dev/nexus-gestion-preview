/**
 * Fournisseurs (fiche, versions de grilles datées, comparatif entre deux versions, incohérences avec
 * la caisse) et onglet « Caisse » (reprise de l'export Kezia, fichier à réimporter dans Kezia,
 * rapprochement avec l'ancien logiciel). Réservé au dirigeant et à l'expert-comptable.
 */

import { misfiledArticles, similarSuppliers } from '../../core/commerce/consistency.js?v=a619ec1';
import { LEVELS } from '../../core/commerce/legacy.js?v=a619ec1';
import { SUPPLIER_ROLES, comparePricelists, currentProfile, supplierPricelists } from '../../core/commerce/pricelists.js?v=a619ec1';
import { fold } from '../../core/commerce/sheet.js?v=a619ec1';
import { commerce } from '../commerce/data.js?v=a619ec1';
import { checksCard } from './checks.js?v=a619ec1';
import { field, html, opt, raw } from '../html.js?v=a619ec1';
import { eur, frDate, ui } from '../state.js?v=a619ec1';
import { badge, icon } from '../ui/common.js?v=a619ec1';
import { commerceUi, fmtBp, supplierName } from './articles.js?v=a619ec1';

const articlesOf = (id) => commerce.articles.filter((a) => (a.suppliers || []).some((s) => s.supplierId === id));
const siteLabel = (u) => u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
const isPrimary = (a, id) => [...(a.suppliers || [])].sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0))[0]?.supplierId === id;

export function suppliersList() {
  const similar = similarSuppliers(commerce.suppliers.filter((s) => !s.mergedInto));
  return html`${
      similar.length
        ? html`<div class="card" style="border-left:4px solid var(--color-warning)">
            <h2>Même fournisseur sous deux noms ?</h2>
            <ul style="margin:0;padding-left:18px">
              ${similar.map(
                (p) =>
                  html`<li style="margin:6px 0">
                    ${p.reason}.
                    <button type="button" class="btn btn-secondary btn-sm" data-action="commerce-merge" data-id="${p.a.id}" data-index="${p.b.id}">
                      Fusionner « ${p.a.name} » dans « ${p.b.name} »
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" data-action="commerce-merge" data-id="${p.b.id}" data-index="${p.a.id}">
                      Fusionner « ${p.b.name} » dans « ${p.a.name} »
                    </button>
                  </li>`,
              )}
            </ul>
          </div>`
        : ''
    }
    <div class="card table-card">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:16px 16px 0">
        <h2 style="margin:0">Fournisseurs (${commerce.suppliers.filter((s) => !s.mergedInto).length})</h2>
        <button type="button" class="btn btn-primary" data-href="#/articles/import">${icon('upload')} Importer une grille</button>
      </div>
      <div class="table-scroll">
        <table class="table cards-mobile">
          <thead>
            <tr>
              <th>Fournisseur</th>
              <th>Marques</th>
              <th>Coordonnées</th>
              <th class="num">Articles</th>
              <th>Dernière grille</th>
              <th class="num">Versions</th>
              <th>À voir</th>
            </tr>
          </thead>
          <tbody>
            ${commerce.suppliers
              .filter((s) => !s.mergedInto)
              .map((s) => {
                const pls = supplierPricelists(commerce.pricelists, s.id);
                const misfiled = misfiledArticles(commerce.articles, s.id).length;
                return html`<tr class="clickable-row" data-href="#/articles/fournisseur-${s.id}">
                  <td data-label="Fournisseur"><strong>${s.name}</strong></td>
                  <td data-label="Marques">${(s.brands || []).slice(0, 4).join(', ')}${s.group ? html`<div class="text-muted">${s.group}</div>` : ''}</td>
                  <td data-label="Coordonnées">${[s.phone, s.website ? siteLabel(s.website) : null].filter(Boolean).join(' · ') || '—'}</td>
                  <td class="num" data-label="Articles">${articlesOf(s.id).length}</td>
                  <td data-label="Dernière grille">${pls.length ? frDate(pls.at(-1).effectiveDate) : '—'}</td>
                  <td class="num" data-label="Versions">${pls.length}</td>
                  <td data-label="À voir">
                    ${misfiled ? badge(`${misfiled} rangé${misfiled > 1 ? 's' : ''} sous un autre fournisseur`, 'warning') : ''}
                    ${!pls.length && articlesOf(s.id).length ? badge('Grille à demander', 'info') : ''}
                  </td>
                </tr>`;
              })}
          </tbody>
        </table>
      </div>
    </div>`;
}

function compareBlock(s, pls) {
  if (pls.length < 2) return html`<p class="text-muted">Le comparatif apparaîtra dès la deuxième grille importée pour ce fournisseur.</p>`;
  const st = commerceUi();
  const sel = st.compare?.supplierId === s.id ? st.compare : { a: pls.at(-2).id, b: pls.at(-1).id };
  const A = pls.find((p) => p.id === sel.a) || pls.at(-2);
  const B = pls.find((p) => p.id === sel.b) || pls.at(-1);
  const c = comparePricelists(A, B);
  const label = (p) => `${frDate(p.effectiveDate)} · ${p.fileName || 'grille'} (${p.lineCount} lignes)`;
  const top = (list) =>
    list.slice(0, 15).map(
      (r) =>
        html`<tr>
          <td>${r.line.designation}</td>
          <td>${r.line.ean || r.line.ref}</td>
          <td class="num">${eur(r.before)}</td>
          <td class="num">${eur(r.after)}</td>
          <td class="num ${r.variationBp > 0 ? 'text-danger' : 'text-success'}">${r.variationBp > 0 ? '+' : ''}${fmtBp(r.variationBp)}</td>
        </tr>`,
    );
  return html`<form data-form="commerce-compare" data-id="${s.id}" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      ${field(
        'Grille de départ',
        html`<select class="input" name="a">
          ${pls.map((p) => opt(p.id, label(p), p.id === A.id))}
        </select>`,
      )}
      ${field(
        'Comparée à',
        html`<select class="input" name="b">
          ${pls.map((p) => opt(p.id, label(p), p.id === B.id))}
        </select>`,
      )}
      <button class="btn btn-secondary" type="submit">Comparer</button>
    </form>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-value">${fmtBp(c.summary.averageBp)}</div>
        <div class="kpi-label">Variation moyenne</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${c.summary.up}</div>
        <div class="kpi-label">Hausses</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${c.summary.down}</div>
        <div class="kpi-label">Baisses</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${c.summary.added}</div>
        <div class="kpi-label">Nouveautés</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${c.summary.removed}</div>
        <div class="kpi-label">Retirés</div>
      </div>
    </div>
    ${
      c.up.length || c.down.length
        ? html`<div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>EAN / réf.</th>
                  <th class="num">Avant</th>
                  <th class="num">Après</th>
                  <th class="num">Variation</th>
                </tr>
              </thead>
              <tbody>
                ${top(c.up)}${top(c.down)}
              </tbody>
            </table>
          </div>`
        : ''
    }`;
}

export function supplierDetail(s) {
  const pls = supplierPricelists(commerce.pricelists, s.id);
  const misfiled = misfiledArticles(commerce.articles, s.id);
  const profile = currentProfile(s);
  const n = articlesOf(s.id);
  return html`<div class="view-header view-header-row">
      <div>
        <h1>${s.name}</h1>
        <p class="view-subtitle">
          ${n.length} article${n.length > 1 ? 's' : ''} · ${n.filter((a) => isPrimary(a, s.id)).length} dont il est le fournisseur principal
        </p>
      </div>
      <div class="detail-header-actions">
        <button type="button" class="btn btn-primary" data-action="commerce-import-for" data-id="${s.id}">
          ${icon('upload')} Importer une nouvelle grille
        </button>
      </div>
    </div>
    ${
      misfiled.length
        ? html`<div class="card" style="border-left:4px solid var(--color-warning)">
            <h2>${misfiled.length} article${misfiled.length > 1 ? 's' : ''} rangé${misfiled.length > 1 ? 's' : ''} sous un autre fournisseur dans la caisse</h2>
            <p class="text-muted">
              Ils figurent dans la grille de ${s.name}, mais la caisse les range sous un autre nom : leur prix d’achat reste celui de l’autre fournisseur.
            </p>
            <ul style="margin:0 0 10px;padding-left:18px">
              ${misfiled.slice(0, 12).map((m) => html`<li><a href="#/articles/${m.article.id}">${m.article.label}</a> — rangé sous ${supplierName(m.primary?.supplierId)}</li>`)}
            </ul>
            <button type="button" class="btn btn-primary" data-action="commerce-make-primary" data-id="${s.id}">
              Faire de ${s.name} le fournisseur principal de ces articles
            </button>
          </div>`
        : ''
    }
    <div class="card">
      <h2>Grilles tarifaires (${pls.length})</h2>
      ${
        pls.length
          ? html`<div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>Date d’effet</th>
                    <th>Fichier</th>
                    <th class="num">Lignes</th>
                    <th>Importée le</th>
                    <th>Paramétrage</th>
                  </tr>
                </thead>
                <tbody>
                  ${[...pls].reverse().map(
                    (p) =>
                      html`<tr>
                        <td>${frDate(p.effectiveDate)}</td>
                        <td>${p.fileName || '—'}</td>
                        <td class="num">${p.lineCount}</td>
                        <td>${frDate(String(p.importedAt).slice(0, 10))}</td>
                        <td>${p.profileVersion ? `version ${p.profileVersion}` : '—'}</td>
                      </tr>`,
                  )}
                </tbody>
              </table>
            </div>`
          : html`<p class="text-muted">Aucune grille importée.</p>`
      }
      <h3>Comparatif</h3>
      ${compareBlock(s, pls)}
    </div>
    <form class="card" data-form="commerce-supplier" data-id="${s.id}" style="display:flex;flex-direction:column;gap:10px;max-width:720px">
      <h2>Fiche</h2>
      <h3 style="margin:4px 0 0">Société</h3>
      ${field('Nom (comme dans la caisse)', html`<input class="input" name="name" value="${s.name}" required maxlength="120" />`)}
      ${field('Raison sociale', html`<input class="input" name="legalName" value="${s.legalName || ''}" maxlength="160" />`)}
      ${field(
        'Rôle',
        html`<select class="input" name="role">
          ${opt('', 'À préciser', !s.role)}${Object.entries(SUPPLIER_ROLES).map(([k, v]) => opt(k, v, s.role === k))}
        </select>`,
      )}
      ${field('Groupe ou réseau', html`<input class="input" name="group" value="${s.group || ''}" maxlength="120" />`, {
        hint: 'Exemple : marque du groupe PPG, ou vendue par le réseau Espace Revêtements.',
      })}
      ${field('Marques', html`<input class="input" name="brands" value="${(s.brands || []).join(', ')}" />`, { hint: 'Séparées par des virgules : sert à repérer un même fournisseur sous le nom de sa marque.' })}
      ${field('SIREN', html`<input class="input" name="siren" value="${s.siren || ''}" inputmode="numeric" maxlength="11" style="width:150px" />`)}
      ${field(
        'Site web',
        html`<input class="input" name="website" value="${s.website || ''}" maxlength="200" />${
            s.website ? html`<a href="${s.website}" target="_blank" rel="noopener">Ouvrir ${siteLabel(s.website)}</a>` : ''
          }`,
      )}
      <h3 style="margin:4px 0 0">Coordonnées</h3>
      ${field('Adresse', html`<textarea class="input" name="address" rows="2" maxlength="300">${s.address || ''}</textarea>`)}
      ${field('Téléphone', html`<input class="input" name="phone" value="${s.phone || ''}" maxlength="40" />`)}
      ${field('E-mail', html`<input class="input" type="email" name="email" value="${s.email || ''}" maxlength="160" />`)}
      ${field('E-mail des commandes', html`<input class="input" type="email" name="orderEmail" value="${s.orderEmail || ''}" maxlength="160" />`)}
      ${field('Commercial ou contact', html`<input class="input" name="contact" value="${s.contact || ''}" maxlength="120" />`)}
      ${field('N° de compte client', html`<input class="input" name="accountNumber" value="${s.accountNumber || ''}" maxlength="40" style="width:200px" />`, {
        hint: 'Le numéro du magasin chez ce fournisseur, à rappeler à chaque commande.',
      })}
      <h3 style="margin:4px 0 0">Conditions</h3>
      ${field(
        'Prix fournis dans ses grilles',
        html`<select class="input" name="priceType">
          ${opt('net', 'Prix d’achat net', s.priceType === 'net')}${opt('brut', 'Prix public brut (remise à appliquer)', s.priceType === 'brut')}${opt('inconnu', 'À préciser', !['net', 'brut'].includes(s.priceType))}
        </select>`,
      )}
      ${field('Coefficient de vente habituel', html`<input class="input" name="coef" inputmode="decimal" value="${s.defaultCoefBp ? (s.defaultCoefBp / 10000).toFixed(2).replace('.', ',') : ''}" style="width:110px" />`, { hint: 'Exemple : 2,00 (prix de vente HT = 2 × prix d’achat). Sert aux prix proposés et aux nouveautés.' })}
      ${field(
        'Franco de port (€ HT)',
        html`<input
          class="input"
          name="franco"
          inputmode="decimal"
          value="${s.francoCents ? (s.francoCents / 100).toFixed(2).replace('.', ',') : ''}"
          style="width:130px"
        />`,
        {
          hint: 'Montant de commande à partir duquel la livraison est offerte.',
        },
      )}
      ${field('Délai de livraison (jours)', html`<input class="input" name="leadDays" inputmode="numeric" value="${s.leadDays ?? ''}" style="width:90px" />`)}
      ${field('Notes', html`<textarea class="input" name="notes" rows="3" maxlength="2000">${s.notes || ''}</textarea>`)}
      ${
        s.sources?.length
          ? html`<p class="text-muted" style="margin:0">
              Coordonnées relevées sur : ${s.sources.map((u, i) => html`${i ? ', ' : ''}<a href="${u}" target="_blank" rel="noopener">${siteLabel(u)}</a>`)}
            </p>`
          : ''
      }
      ${
        profile
          ? html`<p class="text-muted" style="margin:0">
              Paramétrage d’import mémorisé (version ${profile.version}) : onglet « ${profile.profile.sheet} », données à partir de la ligne
              ${profile.profile.firstRow + 1}.
            </p>`
          : ''
      }
      <div><button class="btn btn-primary" type="submit">Enregistrer la fiche</button></div>
    </form>`;
}

// ------------------------------------------------------------------ caisse

/** Copie des données du module : enregistrer (sauvegarde, autre appareil) et, en démonstration, charger. */
export const snapshotCard = () =>
  html`<div class="card" style="display:flex;flex-direction:column;gap:10px">
    <h2>Copie des données du module</h2>
    <p class="text-muted" style="margin:0">
      Un fichier qui contient tout le module (articles, fournisseurs, grilles, stock, prix à valider) : pour passer d’un appareil à l’autre ou garder une
      sauvegarde. Il contient des prix d’achat : gardez-le pour vous.
    </p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" class="btn btn-secondary" data-action="commerce-snapshot-save">${icon('document')} Enregistrer une copie</button>
      ${
        ui.demo
          ? html`<button type="button" class="btn btn-primary" data-action="commerce-file-pick" data-id="snapshot">
              ${icon('upload')} Charger un jeu de données
            </button>`
          : ''
      }
    </div>
    <input type="file" accept=".json,application/json" data-action="commerce-snapshot-file" hidden aria-label="Jeu de données Nexus" />
    ${ui.demo ? '' : html`<p class="form-hint" style="margin:0">En mode connecté, la reprise passe par l’export Kezia et les grilles (étapes ci-dessus).</p>`}
  </div>`;

export function cashRegisterTab() {
  const st = commerceUi();
  const k = st.kezia;
  const lg = st.legacy;
  return html`<div class="card" style="display:flex;flex-direction:column;gap:10px">
      <h2>1. Reprendre les articles de la caisse Kezia</h2>
      <p class="text-muted" style="margin:0">
        Dans Kezia : Outils › Import / Export Excel › Exportation › Articles (cochez « IDArt »). Choisissez ensuite le fichier ici. À refaire quand vous voulez
        : les prix d’achat des grilles ne sont pas écrasés.
      </p>
      <div>
        <button type="button" class="btn btn-primary" data-action="commerce-file-pick" data-id="kezia">${icon('upload')} Choisir l’export Kezia</button>
      </div>
      <input type="file" accept=".xls,.xlsx,.csv" data-action="commerce-kezia-file" hidden aria-label="Export Articles de Kezia" />
      ${
        k
          ? html`<div class="alert alert-success">
              ${k.created} article${k.created > 1 ? 's' : ''} créé${k.created > 1 ? 's' : ''}, ${k.updated} mis à jour, ${k.suppliers} fournisseurs.
              ${
                k.issues.length
                  ? html`<details>
                      <summary>${k.issues.length} point${k.issues.length > 1 ? 's' : ''} à voir dans la caisse</summary>
                      <ul>
                        ${k.issues.slice(0, 60).map((i) => html`<li>Article ${i.idart} « ${i.label} » : ${i.text}</li>`)}
                      </ul>
                    </details>`
                  : ''
              }
            </div>`
          : ''
      }
    </div>
    <div class="card" style="display:flex;flex-direction:column;gap:10px">
      <h2>2. Envoyer les prix à la caisse</h2>
      <p class="text-muted" style="margin:0">
        Fichier au format de Kezia (mêmes colonnes que son export, une ligne par fournisseur). Dans Kezia : faites une sauvegarde, puis Outils › Import / Export
        Excel › Importation › Articles, sans modifier la première colonne.
      </p>
      <form data-form="commerce-kezia-export" style="display:flex;flex-direction:column;gap:8px">
        <label><input type="checkbox" name="updatePmpa" checked /> Remplacer le prix d’achat Kezia par le prix d’achat des grilles</label>
        <label><input type="checkbox" name="onlyLinked" /> Seulement les articles déjà présents dans la caisse</label>
        <div><button class="btn btn-primary" type="submit">${icon('document')} Télécharger le fichier pour Kezia</button></div>
      </form>
    </div>
    <div class="card" style="display:flex;flex-direction:column;gap:10px">
      <h2>3. Retrouver les prix de l’ancien logiciel</h2>
      <p class="text-muted" style="margin:0">
        Export de l’ancien logiciel de caisse (colonnes code article, libellé, prix de vente). Les correspondances sûres et très probables sont rattachées après
        votre accord ; les autres se vérifient une par une.
      </p>
      <div>
        <button type="button" class="btn btn-secondary" data-action="commerce-file-pick" data-id="legacy">
          ${icon('upload')} Choisir l’export de l’ancien logiciel
        </button>
      </div>
      <input type="file" accept=".xls,.xlsx,.csv" data-action="commerce-legacy-file" hidden aria-label="Export de l'ancien logiciel" />
      ${lg ? legacyBlock(lg) : ''}
    </div>
    ${checksCard()} ${snapshotCard()}`;
}

function legacyBlock(lg) {
  const byLevel = (l) => lg.proposals.filter((p) => p.level === l && !p.done);
  const sure = [...byLevel('A'), ...byLevel('B')];
  const toCheck = [...byLevel('C'), ...byLevel('D')].sort((a, b) => b.score - a.score);
  const art = (id) => commerce.articles.find((a) => a.id === id);
  return html`<p>
      ${lg.count} articles lus dans l’ancien logiciel ·
      ${Object.entries(LEVELS)
        .map(([k, v]) => `${v} : ${lg.proposals.filter((p) => p.level === k).length}`)
        .join(' · ')}
    </p>
    ${
      sure.length
        ? html`<button type="button" class="btn btn-primary" data-action="commerce-legacy-accept" data-id="sure">
            Rattacher les ${sure.length} correspondances sûres et très probables
          </button>`
        : ''
    }
    ${
      toCheck.length
        ? html`<div class="table-scroll">
              <table class="table cards-mobile">
                <thead>
                  <tr>
                    <th>Article (caisse)</th>
                    <th>Proposition (ancien logiciel)</th>
                    <th class="num">Prix ancien logiciel HT</th>
                    <th>Pourquoi</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${toCheck.slice(0, 50).map(
                    (p) =>
                      html`<tr>
                        <td data-label="Article">${art(p.articleId)?.label}</td>
                        <td data-label="Proposition">${p.label} <span class="text-muted">(${p.code})</span></td>
                        <td class="num" data-label="Prix">${eur(p.priceHt)}</td>
                        <td data-label="Pourquoi" style="min-width:340px">
                          ${badge(LEVELS[p.level], p.level === 'C' ? 'warning' : 'muted')} <span class="text-muted">${p.why}</span>
                        </td>
                        <td>
                          <button type="button" class="btn btn-secondary btn-sm" data-action="commerce-legacy-accept" data-id="${p.articleId}">
                            Rattacher
                          </button>
                        </td>
                      </tr>`,
                  )}
                </tbody>
              </table>
            </div>
            ${toCheck.length > 50 ? html`<p class="text-muted">${toCheck.length - 50} autres propositions à vérifier : rattachez les premières, la liste se met à jour.</p>` : ''}`
        : ''
    }
    ${raw('')}`;
}

/** Fournisseur dont le nom correspond (recherche par nom sans casse) — pour l'assistant d'import. */
export const supplierByName = (name) => commerce.suppliers.find((s) => fold(s.name) === fold(name));
