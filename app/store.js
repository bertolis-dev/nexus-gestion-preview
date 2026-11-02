/**
 * Préférences, thème, enregistrement (démonstration ou base), notifications, erreurs inattendues.
 */

import { Workspace } from '../core/workspace.js?v=a619ec1';
import { getDemo, setDemo } from './demo-store.js?v=a619ec1';
import { CONTACT_EMAIL, PREFS_KEY, THEME_KEY, cloudState, setWs, ui, ws } from './state.js?v=a619ec1';

// ------------------------------------------------------------------ préférences, thème, stockage

export function loadPrefs() {
  try {
    ui.mode = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}').mode || 'standard';
  } catch {}
}

export function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: ui.mode }));
  } catch {}
}

export function getTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'system';
  } catch {
    return 'system';
  }
}

export function setTheme(value) {
  try {
    if (value === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, value);
  } catch {}
  if (value === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', value);
}

export async function loadDemo() {
  try {
    const data = await getDemo();
    if (!data) return false;
    setWs(new Workspace({ company: data.company, state: data }));
    ui.demo = true;
    return true;
  } catch {
    return false;
  }
}

/** Version des données, incrémentée à chaque modification : invalide les calculs mémorisés. */
export let dataVersion = 0;

/** Après chaque action : envoi en base (mode connecté) ou enregistrement local (démonstration). */
export function save() {
  dataVersion++;
  savePrefs();
  if (ui.demo) {
    setDemo(ws.toJSON()).catch(() => toast('Enregistrement local impossible (stockage plein ou bloqué).', true));
    return;
  }
  if (cloudState.outbox.hasNewer()) {
    toast('Une version plus récente de Nexus Gestion est ouverte dans un autre onglet : rechargez cette page avant de continuer.', true);
  }
  const next = JSON.parse(JSON.stringify(ws));
  lastPush = cloudState.outbox.push(cloudState.synced, next, cloudState.meta).catch(() => {});
  cloudState.synced = next;
}

let lastPush = Promise.resolve();

/**
 * Attend que les dernières modifications soient acceptées par le serveur (mode connecté) ; échoue
 * après `timeoutMs` ou si le serveur en refuse une. Immédiat en démonstration.
 */
export async function whenSaved(timeoutMs = 20000) {
  if (ui.demo || !cloudState.outbox) return;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Le serveur ne répond pas pour le moment.')), timeoutMs);
  });
  try {
    await Promise.race([lastPush.then(() => cloudState.outbox.waitIdle()), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Même implémentation que showToast() de Nexus RH (empilement, apparition, retrait après 3 s). */
export function toast(message, error = false) {
  const el = document.createElement('div');
  el.className = `toast toast-${error ? 'error' : 'success'}`;
  el.textContent = message;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => el.classList.add('visible'), 10);
  setTimeout(
    () => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 300);
    },
    error ? 6000 : 3000, // un message d'erreur reste le temps d'être lu
  );
}

// Le module principal s'est exécuté : la garde de démarrage (boot.js) n'a rien à afficher.
window.__nexusBooted = true;

/** Erreurs non prévues (bug, promesse rejetée) : un message clair plutôt qu'un écran figé sans explication. */
export let lastUnexpectedAt = 0;

export function reportUnexpected(error) {
  console.error(error);
  if (Date.now() - lastUnexpectedAt < 5000) return; // une seule alerte pour une rafale d'erreurs
  lastUnexpectedAt = Date.now();
  toast(
    `Une erreur inattendue s’est produite. Vos données enregistrées ne sont pas perdues : si l’écran ne répond plus, rechargez la page. Si cela se reproduit, écrivez-nous à ${CONTACT_EMAIL}.`,
    true,
  );
}

window.addEventListener('error', (e) => {
  // Erreurs venant d'extensions du navigateur ou d'autres sites : pas les nôtres.
  if (e.filename && !e.filename.startsWith(location.origin)) return;
  reportUnexpected(e.error || e.message);
});

window.addEventListener('unhandledrejection', (e) => reportUnexpected(e.reason));

export function download(name, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
