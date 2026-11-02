/**
 * Contrôles des articles repris de la caisse : articles créés deux fois (comparés champ par champ,
 * les différences en couleur, pour montrer au magasin ce qu'il voit en caisse) et codes-barres qui
 * désignent un autre produit dans la grille du fournisseur.
 */

import { duplicateArticles, labelMismatches } from '../../core/commerce/consistency.js?v=a619ec1';
import { commerce } from '../commerce/data.js?v=a619ec1';
import { html } from '../html.js?v=a619ec1';
import { eur } from '../state.js?v=a619ec1';
import { badge } from '../ui/common.js?v=a619ec1';

const codeOf = (a, type) => (a.codes || []).find((c) => c.type === type)?.value || '';
const raw = (a, k) => (a.kezia?.rawLines || []).map((r) => r[k]).find((v) => v !== undefined && v !== null && v !== '') ?? '';

// Lignes du comparatif : ce que le magasin voit dans Kezia pour chaque article.
const FIELDS = [
  ['Désignation', (a) => a.label],
  ['Code-barres saisi dans Kezia', (a) => String(raw(a, 'EAN')) || '(vide)'],
  ['Réf. fournisseur', (a) => (a.suppliers || []).map((s) => s.ref).find(Boolean) || '(vide)'],
  ['Prix d’achat (PMPA)', (a) => (a.pmpa ? eur(a.pmpa) : '(vide)')],
  ['Prix de vente TTC', (a) => (a.salePrice ? eur(a.salePrice) : '(vide)')],
  ['Rayon', (a) => a.department || '(vide)'],
  ['Code ancien logiciel', (a) => codeOf(a, 'ancien') || '(vide)'],
];

function latestPricelists() {
  const by = new Map();
  for (const p of commerce.pricelists) if (!by.has(p.supplierId) || by.get(p.supplierId).effectiveDate < p.effectiveDate) by.set(p.supplierId, p);
  return [...by.values()];
}

const compare = (g) =>
  html`<div class="table-scroll" style="margin:6px 0 14px">
    <p style="margin:0 0 4px"><strong>${g.reason}</strong></p>
    <table class="table">
      <thead>
        <tr>
          <th>Dans Kezia</th>
          ${g.articles.map((a) => html`<th><a href="#/articles/${a.id}">Article ${codeOf(a, 'caisse') || '—'}</a></th>`)}
        </tr>
      </thead>
      <tbody>
        ${FIELDS.map(([label, get]) => {
          const values = g.articles.map(get);
          const differs = new Set(values).size > 1;
          return html`<tr>
            <td>${label}</td>
            ${values.map((v) => html`<td style="${differs ? 'background:var(--color-warning-soft);font-weight:600' : ''}">${v}</td>`)}
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;

export function checksCard() {
  const dups = duplicateArticles(commerce.articles);
  const twice = dups.filter((g) => g.kind !== 'libelle');
  const sameName = dups.filter((g) => g.kind === 'libelle');
  const wrong = labelMismatches(commerce.articles, latestPricelists());
  if (!dups.length && !wrong.length) return '';
  return html`<div class="card" style="display:flex;flex-direction:column;gap:10px">
    <h2>Contrôles des articles de la caisse</h2>
    ${
      twice.length
        ? html`<details open>
            <summary><strong>${twice.length} article${twice.length > 1 ? 's' : ''} sans doute créé${twice.length > 1 ? 's' : ''} deux fois</strong></summary>
            <p class="text-muted" style="margin:6px 0">
              En caisse, le scan ne trouve que l’article qui a le bon code-barres : l’autre se vend à un autre prix quand on le cherche par son nom, et les
              ventes comme le stock sont coupés en deux. Les cases en couleur sont celles qui diffèrent.
            </p>
            ${twice.map(compare)}
          </details>`
        : ''
    }
    ${
      wrong.length
        ? html`<details open>
            <summary><strong>${wrong.length} code${wrong.length > 1 ? 's' : ''}-barres qui désignent un autre produit chez le fournisseur</strong></summary>
            <p class="text-muted" style="margin:6px 0">
              Le prix d’achat de la grille appliqué à ces articles est celui de l’autre produit : vérifiez le code en rayon.
            </p>
            <div class="table-scroll">
              <table class="table cards-mobile">
                <thead>
                  <tr>
                    <th>Article Kezia</th>
                    <th>Code-barres</th>
                    <th>Ce code dans la grille</th>
                    <th>Pourquoi</th>
                  </tr>
                </thead>
                <tbody>
                  ${wrong.map(
                    (m) =>
                      html`<tr>
                        <td data-label="Article Kezia"><a href="#/articles/${m.article.id}">${codeOf(m.article, 'caisse')} ${m.article.label}</a></td>
                        <td data-label="Code-barres">${m.article.ean}</td>
                        <td data-label="Ce code dans la grille">${m.line.designation}${m.line.size ? ` (${String(m.line.size).replace('.', ',')})` : ''}</td>
                        <td data-label="Pourquoi">${badge(m.reason, 'warning')}</td>
                      </tr>`,
                  )}
                </tbody>
              </table>
            </div>
          </details>`
        : ''
    }
    ${
      sameName.length
        ? html`<details>
            <summary>
              <strong>${sameName.length} nom${sameName.length > 1 ? 's' : ''} porté${sameName.length > 1 ? 's' : ''} par des produits différents</strong>
            </summary>
            <p class="text-muted" style="margin:6px 0">
              Codes-barres différents, donc produits différents : précisez le libellé (contenance, teinte) pour que le vendeur choisisse le bon.
            </p>
            ${sameName.map(compare)}
          </details>`
        : ''
    }
  </div>`;
}
