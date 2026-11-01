import * as cloud from './cloud.js?v=d415f7a';
import { seedDemo } from './demo.js?v=d415f7a';
import { render } from './render.js?v=d415f7a';
import { featureSlug } from './site/landing.js?v=d415f7a';
import { URL_AUTH_ERROR, cloudState, ui } from './state.js?v=d415f7a';
import { loadDemo, loadPrefs } from './store.js?v=d415f7a';
import { afterSignIn } from './sync-ui.js?v=d415f7a';
// Modules à effets de bord : écouteurs d'événements du document, installation (PWA).
import './actions/events.js';
import './pwa.js';

// ------------------------------------------------------------------ démarrage

/**
 * Reprend la session enregistrée. Une coupure réseau ou un service lent au démarrage (réveil du PC,
 * Wi-Fi pas encore prêt) ne renvoie plus à l'écran de connexion : on réessaie jusqu'au retour du
 * réseau, l'utilisateur reste connecté.
 */
async function resume(step) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await step();
    } catch (e) {
      if (!cloud.hasStoredSession() || !cloud.isTransient(e)) throw e;
      ui.booting = true;
      ui.bootMessage = `${cloud.UNREACHABLE_MESSAGE} Vous restez connecté : nouvel essai automatique dans quelques secondes.`;
      render();
      await new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          window.removeEventListener('online', done);
          resolve();
        };
        const timer = setTimeout(done, Math.min(30000, 2000 * attempt));
        window.addEventListener('online', done);
      });
      // Démonstration ouverte entre-temps : on cesse de réessayer, la session reste enregistrée.
      if (ui.demo) throw Object.assign(new Error('Reprise abandonnée'), { abandoned: true });
    }
  }
}

async function boot() {
  loadPrefs();
  // Branché avant toute reprise de session (même abandonnée pour la démonstration).
  cloud.onAuthChange((event, session) => {
    cloudState.session = session;
    if (event === 'PASSWORD_RECOVERY') {
      ui.auth = { view: 'new-password', error: '', info: '', busy: false };
      render();
    }
  });
  const params = new URLSearchParams(location.search);
  try {
    cloudState.session = await resume(() => cloud.currentSession());
    if (cloudState.session) {
      await resume(async () => {
        ui.booting = false;
        await afterSignIn();
      });
      ui.bootMessage = '';
    } else if (params.has('demo')) {
      ui.booting = false;
      // Sans le paramètre dans l'adresse, un rechargement garde la démonstration en cours au lieu de la réinitialiser.
      history.replaceState(null, '', location.pathname + location.hash);
      return seedDemo();
    } else if (featureSlug()) {
      ui.screen = 'landing';
    } else if (await loadDemo()) {
      ui.screen = 'app';
    } else if (URL_AUTH_ERROR || params.has('desktop')) {
      ui.screen = 'login';
    }
  } catch (e) {
    if (e.abandoned) return;
    ui.screen = 'login';
    ui.auth.error = cloud.friendly(e);
  }
  ui.booting = false;
  render();
}

boot();
