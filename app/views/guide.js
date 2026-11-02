/**
 * Guide de l'application (même présentation que le guide de Nexus RH) : fenêtre avec recherche,
 * sommaire par groupes, un chapitre par écran avec ses captures et ses questions fréquentes. Ouvert
 * depuis le menu du compte, ou par le bouton « ? » à la page de l'écran affiché.
 */

import { extrait, rechercher, surligner } from '../../core/guide-search.js?v=a619ec1';
import { guideSections } from '../guide/sections.js?v=a619ec1';
import { html, raw } from '../html.js?v=a619ec1';
import { ICONS } from '../icons.js?v=a619ec1';
import { isMicro, navItems, route } from '../render.js?v=a619ec1';
import { ws } from '../state.js?v=a619ec1';
import { icon } from '../ui/common.js?v=a619ec1';
import { garderFocus, startTour } from '../ui/tour.js?v=a619ec1';

const SUGGESTIONS = ['Créer une facture', 'Remise', 'Relancer un client', 'Importer un relevé', 'Photo du ticket', 'Déclarer la TVA', 'Clôture', 'Nexus RH'];

const sections = () =>
  guideSections({
    micro: isMicro(),
    tva: ws.company.vatRegime !== 'franchise',
    nav: navItems().filter((i) => i.key),
  });

const entreeHtml = (e) =>
  html`<details class="guide-entry" data-guide-entry="${e.id}">
    <summary>${e.q}</summary>
    <div class="guide-entry-body">
      ${raw(e.r)}${e.vue ? html`<div class="guide-actions"><button type="button" class="btn btn-secondary btn-sm" data-guide-open-view="${e.vue}">Ouvrir l’écran</button></div>` : ''}
    </div>
  </details>`;

function chapitreHtml(s, depuisRecherche) {
  const barre =
    s.entrees.length > 2
      ? html`<div class="guide-toolbar">
          <button type="button" class="btn-link" data-guide-expand="1">Tout déplier</button
          ><button type="button" class="btn-link" data-guide-expand="0">Tout replier</button>
        </div>`
      : '';
  return html`${depuisRecherche ? html`<button type="button" class="btn-link guide-back" data-guide-back>← Retour aux résultats</button>` : ''}
    <h3 class="guide-title">${s.icone && ICONS[s.icone] ? html`<span class="guide-title-icon">${icon(s.icone, 18)}</span>` : ''}${s.titre}</h3>
    ${raw(s.intro)}
    ${
      s.entrees.length
        ? html`<div class="guide-entries">
            <div class="search-section-label guide-entries-label">Questions fréquentes</div>
            ${barre}${s.entrees.map(entreeHtml)}
          </div>`
        : ''
    }
    ${s.vue ? html`<div class="guide-actions"><button type="button" class="btn btn-primary btn-sm" data-guide-open-view="${s.vue}">Ouvrir « ${s.titre} »</button></div>` : ''}`;
}

function resultatsHtml({ termes, resultats, approchant }, requete) {
  if (!resultats.length)
    return html`<div class="guide-results">
      <p class="guide-results-count"><strong>Aucun résultat</strong> pour « ${requete} ».</p>
      <ul class="guide-tips-list">
        <li>Essayez un seul mot-clé, par exemple « facture », « TVA » ou « relevé ».</li>
        <li>Parcourez le sommaire à gauche : les chapitres sont rangés par thème.</li>
        <li>Ou écrivez-nous à <a href="mailto:contact@bertolis.fr">contact@bertolis.fr</a>.</li>
      </ul>
    </div>`;
  return html`<div class="guide-results">
    <p class="guide-results-count">
      <strong>${resultats.length}</strong> résultat${resultats.length > 1 ? 's' : ''} pour « ${requete} »
      <button type="button" class="btn-link" data-guide-clear>Effacer la recherche</button>
    </p>
    ${approchant ? html`<p class="text-muted guide-results-note">Aucune réponse ne contient tous vos mots : voici les plus proches.</p>` : ''}
    <ul class="guide-results-list">
      ${resultats.map(
        (r) =>
          html`<li>
            <button type="button" class="guide-result" data-guide-go="${r.sectionId}" data-guide-go-entry="${r.entreeId || ''}">
              <span class="guide-result-chap">${r.sectionTitre}</span>
              <span class="guide-result-titre">${raw(surligner(r.titre, termes))}</span>
              <span class="guide-result-extrait">${raw(surligner(extrait(r.brut), termes))}</span>
            </button>
          </li>`,
      )}
    </ul>
  </div>`;
}

/** Agrandit une capture par-dessus le guide ; un clic ou Échap la ferme (sans fermer le guide). */
function agrandir(img) {
  if (document.getElementById('guide-lightbox')) return;
  const voile = document.createElement('div');
  voile.id = 'guide-lightbox';
  voile.className = 'guide-lightbox';
  voile.setAttribute('role', 'dialog');
  voile.setAttribute('aria-label', img.alt || 'Capture agrandie');
  voile.innerHTML = html`<img src="${img.getAttribute('src')}" alt="${img.alt || ''}" /><button type="button" class="btn btn-secondary btn-sm">
      Fermer
    </button>`.s;
  const fermer = () => {
    document.removeEventListener('keydown', echap, true);
    voile.remove();
    img.focus();
  };
  const echap = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fermer();
    }
  };
  voile.addEventListener('click', fermer);
  document.addEventListener('keydown', echap, true);
  document.body.appendChild(voile);
  voile.querySelector('button').focus();
}

/** Ouvre le guide sur un chapitre (identifiant), par défaut le premier. */
export function openGuide(sectionId) {
  const list = sections();
  const groupes = [...new Set(list.map((s) => s.groupe))];
  let courant = list.find((s) => s.id === sectionId) || list[0];
  const suggestions = SUGGESTIONS.filter((q) => rechercher(list, q).resultats.length).slice(0, 6);
  const opener = document.activeElement;
  let root = document.getElementById('modal-root');
  if (!root) {
    root = Object.assign(document.createElement('div'), { id: 'modal-root' });
    document.body.append(root);
  }
  root.innerHTML = html`<div class="modal modal-xlarge guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-heading">
    <div class="modal-header">
      <h2 id="guide-heading">${icon('helpCircle', 18)} Guide de Nexus Gestion</h2>
      <button type="button" class="btn-icon" data-guide-close aria-label="Fermer le guide">${raw(ICONS.close)}</button>
    </div>
    <div class="modal-body guide-body">
      <div class="guide-searchbar">
        <input
          type="search"
          class="input guide-search"
          id="guide-search"
          placeholder="Que cherchez-vous ? Par exemple : remise, relancer un client, TVA…"
          aria-label="Rechercher dans le guide"
          autocomplete="off"
        />
        ${
          suggestions.length
            ? html`<div class="guide-suggestions">
                <span class="text-muted">Essayez :</span
                >${suggestions.map((q) => html`<button type="button" class="guide-chip" data-guide-suggestion="${q}">${q}</button>`)}
              </div>`
            : ''
        }
      </div>
      <div class="guide-layout">
        <nav class="guide-toc" aria-label="Sommaire du guide">
          ${groupes.map(
            (g) =>
              html`<div class="guide-toc-group">
                <div class="guide-toc-label">${g}</div>
                ${list
                  .filter((s) => s.groupe === g)
                  .map((s) => html`<button type="button" class="guide-toc-item" data-guide-section="${s.id}">${s.titre}</button>`)}
              </div>`,
          )}
        </nav>
        <article class="guide-content" id="guide-content" tabindex="-1" aria-live="polite"></article>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" data-guide-start-tour>Lancer la visite guidée</button>
      <button type="button" class="btn btn-secondary" data-guide-close>Fermer</button>
    </div>
  </div>`.s;
  root.classList.add('open');
  const zone = root.querySelector('#guide-content');
  const champ = root.querySelector('#guide-search');

  const afficher = (id, entreeId, depuisRecherche) => {
    const s = list.find((x) => x.id === id);
    if (!s) return;
    courant = s;
    zone.innerHTML = chapitreHtml(s, depuisRecherche).s;
    zone.scrollTop = 0;
    root.querySelectorAll('[data-guide-section]').forEach((b) => {
      b.classList.toggle('active', b.dataset.guideSection === id);
      if (b.dataset.guideSection === id) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    if (entreeId) {
      const cible = zone.querySelector(`details[data-guide-entry="${CSS.escape(entreeId)}"]`);
      if (cible) {
        cible.open = true;
        // Sur téléphone, c'est le corps de la fenêtre qui défile, pas la zone de contenu.
        cible.scrollIntoView({ block: 'start' });
        cible.classList.add('guide-entry-flash');
        setTimeout(() => cible.classList.remove('guide-entry-flash'), 1800);
      }
    }
  };
  const resultats = (requete) => {
    const q = String(requete || '').trim();
    if (!q) return afficher(courant.id);
    zone.innerHTML = resultatsHtml(rechercher(list, q), q).s;
    zone.scrollTop = 0;
    root.querySelectorAll('[data-guide-section]').forEach((b) => b.classList.remove('active'));
  };
  const fermer = () => {
    root.classList.remove('open');
    root.innerHTML = '';
    root.onclick = null; // #modal-root sert aussi à l'agrandissement des captures du site
    root.onkeydown = null;
    document.removeEventListener('keydown', surTouche, true);
    // Ouvert depuis le menu du compte (refermé entre-temps) : retour sur le bouton du compte.
    (opener?.isConnected ? opener : document.getElementById('btn-user-menu'))?.focus?.();
  };
  const surTouche = (e) => {
    if (e.key === 'Tab' && !document.getElementById('guide-lightbox')) garderFocus(e, root.querySelector('.guide-modal'));
    if (e.key === 'Escape' && !document.getElementById('guide-lightbox')) {
      e.preventDefault();
      e.stopPropagation();
      fermer();
    }
  };
  document.addEventListener('keydown', surTouche, true);

  root.onclick = (e) => {
    const t = e.target;
    if (t === root || t.closest('[data-guide-close]')) return fermer();
    if (t.closest('[data-guide-start-tour]')) {
      fermer();
      return startTour({ force: true });
    }
    const img = t.closest('img.guide-shot-img');
    if (img) return agrandir(img);
    const b = t.closest('button');
    if (!b) return;
    if (b.dataset.guideSection) {
      champ.value = '';
      afficher(b.dataset.guideSection);
      zone.focus();
    } else if (b.dataset.guideSuggestion) {
      champ.value = b.dataset.guideSuggestion;
      resultats(champ.value);
    } else if (b.dataset.guideGo) afficher(b.dataset.guideGo, b.dataset.guideGoEntry, true);
    else if (b.hasAttribute('data-guide-back')) resultats(champ.value);
    else if (b.hasAttribute('data-guide-clear')) {
      champ.value = '';
      afficher(courant.id);
      champ.focus();
    } else if (b.dataset.guideExpand) zone.querySelectorAll('details.guide-entry').forEach((d) => (d.open = b.dataset.guideExpand === '1'));
    else if (b.dataset.guideOpenView) {
      fermer();
      location.hash = `#/${b.dataset.guideOpenView}`;
    }
  };
  root.onkeydown = (e) => {
    const img = e.target.closest?.('img.guide-shot-img');
    if (img && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      agrandir(img);
    }
  };
  let attente;
  champ.addEventListener('input', () => {
    clearTimeout(attente);
    attente = setTimeout(() => resultats(champ.value), 150);
  });
  afficher(courant.id);
  champ.focus();
}

/** Bouton « ? » : le guide ouvert à la page de l'écran affiché. */
export const openGuideForCurrentScreen = () => openGuide(`ecran-${route().name}`);
