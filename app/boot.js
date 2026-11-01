// Démarrage (script classique, chargé dans <head> avant tout rendu) :
//  1. thème choisi appliqué avant le premier affichage (même clé que Nexus RH) ;
//  2. installation du service worker ;
//  3. garde de démarrage : si le module principal n'a pas pu s'exécuter (réseau coupé, CDN
//     indisponible, navigateur trop ancien), un message clair remplace la page blanche.
(function () {
  try {
    var t = localStorage.getItem('nexus_theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}

  window.addEventListener('load', function () {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {}); // installation hors connexion facultative (navigation privée, stockage plein…)
    if (window.__nexusBooted) return;
    var box = document.createElement('div');
    box.className = 'boot-failure';
    box.setAttribute('role', 'alert');
    box.innerHTML =
      '<h1>Nexus Gestion n’a pas pu démarrer</h1>' +
      '<p>Vérifiez votre connexion à internet, puis rechargez la page. Vos données enregistrées ne sont pas perdues.</p>' +
      '<p>Si le problème continue, écrivez-nous à <a href="mailto:contact@bertolis.fr">contact@bertolis.fr</a>.</p>' +
      '<button type="button" class="btn btn-primary">Recharger la page</button>';
    box.querySelector('button').addEventListener('click', function () {
      location.reload();
    });
    document.body.appendChild(box);
  });
})();
