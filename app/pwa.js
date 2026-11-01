/**
 * Installation de l’application (PWA).
 */

// ------------------------------------------------------------------ installation (PWA)

export let installPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});

/** Propose l'installation si le navigateur l'a permis ; renvoie faux sinon. */
export function promptInstall() {
  if (!installPrompt) return false;
  installPrompt.prompt();
  installPrompt = null;
  return true;
}
