/**
 * Écran « site ».
 */

import { seedDemo } from '../demo.js?v=a619ec1';
import { promptInstall } from '../pwa.js?v=a619ec1';
import { $, render } from '../render.js?v=a619ec1';
import { closeLightbox, openLightbox } from '../site/landing.js?v=a619ec1';
import { ui } from '../state.js?v=a619ec1';
import { toast } from '../store.js?v=a619ec1';

/** Actions « site » : data-action → fonction. */
export const actionsTable = {
  'goto-login': async ({ action }) => {
    ui.screen = 'login';
    ui.auth = { ...ui.auth, view: action === 'goto-signup' ? 'signup' : 'login', error: '', info: '' };
    window.scrollTo(0, 0);
    return render();
  },
  'goto-signup': (ctx) => actionsTable['goto-login'](ctx),
  'feature-back': async () => {
    ui.backToFeatures = true;
    if (location.hash) location.hash = '';
    else document.getElementById('landing-fonctionnalites')?.scrollIntoView({ block: 'start' });
    return;
  },
  lightbox: async ({ el }) => {
    return openLightbox(el.dataset.src, el.getAttribute('alt') || '');
  },
  'lightbox-close': async () => {
    return closeLightbox();
  },
  'goto-landing': async () => {
    ui.screen = 'landing';
    return render();
  },
  'auth-view': async ({ el }) => {
    ui.auth = { ...ui.auth, view: el.dataset.view, error: '', info: '' };
    return render();
  },
  'toggle-password': async ({ el }) => {
    const input = el.parentElement.querySelector('input');
    input.type = input.type === 'password' ? 'text' : 'password';
    el.setAttribute('aria-pressed', String(input.type === 'text'));
    el.setAttribute('aria-label', input.type === 'text' ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    return;
  },
  'landing-menu': async () => {
    return $('landing-nav-links').classList.toggle('open');
  },
  faq: async ({ el, index }) => {
    ui.faqOpen = ui.faqOpen === index ? null : index;
    return el.closest('.landing-faq-item').classList.toggle('landing-faq-item-open');
  },
  install: async () => {
    if (!promptInstall()) toast('Ouvrez le menu ⋮ de votre navigateur puis « Installer Nexus Gestion ».');
    return;
  },
  demo: async () => {
    ui.booting = false; // depuis l'écran « service injoignable » : la démonstration prend la main
    ui.bootMessage = '';
    return seedDemo();
  },
};
