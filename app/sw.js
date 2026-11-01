// Service worker : rend Nexus installable (PWA) et accélère les visites suivantes.
//  - Fichiers versionnés (?v=…, ajouté à la mise en ligne par scripts/version-assets.mjs) : servis
//    depuis le cache, puisqu'une nouvelle version porte une nouvelle adresse (jamais de fichier
//    périmé). L'ancienne version d'un même fichier est retirée du cache.
//  - Tout le reste (page, images, données) : réseau, comme avant ; la page reste en cache pour
//    s'ouvrir hors connexion.
//  - Jamais intercepté : requêtes autres que GET ou vers un autre site (Supabase, API publiques) — un
//    POST rejoué par le service worker peut arriver corrompu (observé sur Chrome Android).
const CACHE = 'nexus-gestion';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

async function versioned(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const url = new URL(request.url);
    for (const old of await cache.keys()) {
      const o = new URL(old.url);
      if (o.pathname === url.pathname && o.search !== url.search) await cache.delete(old);
    }
    await cache.put(request, response.clone());
  }
  return response;
}

async function page(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.searchParams.has('v')) return event.respondWith(versioned(event.request));
  if (event.request.mode === 'navigate') return event.respondWith(page(event.request));
  event.respondWith(fetch(event.request));
});
