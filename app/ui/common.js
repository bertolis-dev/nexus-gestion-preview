/**
 * Éléments d'interface communs : icônes, logo, badges, titres d'écran, vocabulaire courant.
 */

import { html, raw } from '../html.js?v=a619ec1';
import { ICONS } from '../icons.js?v=a619ec1';
import { ui } from '../state.js?v=a619ec1';

// ------------------------------------------------------------------ gabarits (échappement par défaut)

/** Même rendu que icon() de Nexus RH. */
export const icon = (name, size = 16) => raw(`<span class="icon-inline" style="width:${size}px;height:${size}px;">${ICONS[name]}</span>`);

export const LOGO = raw('<span class="logo-mark"><img class="logo-icon" src="logo.webp" alt="Nexus" width="32" height="32"></span>');

export const brand = html`${LOGO} Nexus <span class="brand-suffix">Gestion</span>`;

export const badge = (text, kind = 'muted') => html`<span class="badge badge-${kind}">${text}</span>`;

/** Terme comptable en mode avancé, langage courant en mode standard (§5 du cahier des charges). */
export const term = (plain, expert) => (ui.mode === 'avance' ? expert : plain);

export const viewHeader = (title, subtitle, actions) =>
  html`<div class="view-header ${actions ? 'view-header-row' : ''}">
    <div>
      <h1>${title}</h1>
      ${subtitle ? html`<p class="view-subtitle">${subtitle}</p>` : ''}
    </div>
    ${actions ? html`<div class="detail-header-actions">${actions}</div>` : ''}
  </div>`;
