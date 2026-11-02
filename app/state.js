/**
 * État partagé de l'interface : entreprise affichée, écran, mode connecté, formats d'affichage.
 */

import { todayParis } from '../core/dates.js?v=269c883';
import { formatEuros } from '../core/money.js?v=269c883';
import { getDemo, removeDemo, setDemo } from './demo-store.js?v=269c883';

/**
 * Nexus Gestion — interface (lot 1).
 *
 * Design : strictement celui de Nexus RH. La feuille de style (nexus-rh.css), les polices, le logo,
 * les icônes (icons.js) et la structure HTML (#landing-root, #login-root, #app-shell > #sidebar +
 * #main-column > #topbar + #view-root) sont repris à l'identique ; gestion.css n'ajoute que les
 * éléments propres à la comptabilité (facture imprimable, lignes de facture, rapprochement).
 *
 * Toute la logique comptable vit dans core/ (testée sous Node) ; ce fichier affiche et relaie.
 * Deux modes : connecté (Supabase, app/cloud.js) ou démonstration (données fictives locales).
 */

// Erreur renvoyée par Supabase dans l'URL (lien de confirmation expiré ou déjà utilisé) : lue avant
// que supabase-js ne nettoie l'adresse, pour l'expliquer à l'utilisateur au lieu d'un échec muet.
export const URL_AUTH_ERROR = (() => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search.replace(/^\?/, ''));
  const code = params.get('error_code') || params.get('error');
  if (!code) return null;
  if (/otp_expired/.test(code)) return 'Ce lien de confirmation a expiré ou a déjà été utilisé. Demandez un nouvel e-mail ci-dessous.';
  return `Le lien n'a pas pu être validé (${params.get('error_description') || code}). Demandez un nouvel e-mail ci-dessous.`;
})();

// Accès à la démonstration enregistrée (tests de bout en bout, captures d'écran) : données locales seulement.
window.nexusDemoStore = { get: getDemo, set: setDemo, remove: removeDemo };

export const PREFS_KEY = 'nexus_gestion_prefs';

export const THEME_KEY = 'nexus_theme';

// même clé que Nexus RH : le choix de thème suit l'utilisateur d'une appli à l'autre
export const CONTACT_EMAIL = 'contact@bertolis.fr';

export const newId = () => crypto.randomUUID();

export let ws = null;

/** Remplace l'entreprise affichée (démonstration, chargement, déconnexion). */
export const setWs = (next) => (ws = next);

/** Mode connecté : structure en base, file d'envoi, dernier état envoyé. */
export const cloudState = { session: null, meta: null, outbox: null, synced: null, documents: [], emailReady: false, status: { pending: 0, error: null } };

export const freshOnboarding = () => ({
  step: 1,
  data: { fyEnd: `${todayParis().slice(0, 4)}-12-31`, chargesVat: 'oui', vatFrequency: 'mensuelle', nature: 'services', micro: 'non' },
});

export const ui = {
  screen: 'landing', // landing | login | app
  demo: false,
  booting: true,
  auth: { view: URL_AUTH_ERROR ? 'resend' : 'login', error: URL_AUTH_ERROR || '', info: '', busy: false, email: '' },
  mfa: null,
  mode: 'standard',
  ob: freshOnboarding(),
  draft: null,
  pendingPurchase: null,
  comptaTab: 'balance',
  salesTab: 'factures',
  expensesTab: 'depenses',
  statementBalance: '',
  faqOpen: null,
  pendingEinvoices: [],
};

// Date du jour à Paris (et non en UTC : la veille entre minuit et 1 h ou 2 h du matin).
export const today = () => todayParis();

export const eur = (c) => formatEuros(c || 0);

export const frDate = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR') : '');

export const pct = (bp) => `${(bp / 100).toLocaleString('fr-FR')} %`;
