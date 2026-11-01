/**
 * Stockage de la démonstration dans le navigateur : IndexedDB (plusieurs centaines de Mo possibles),
 * au lieu de localStorage (5 Mo, QuotaExceededError dès quelques centaines de factures). Une
 * démonstration enregistrée par une version précédente (localStorage) est reprise automatiquement.
 * Repli sur localStorage si IndexedDB est indisponible (navigation privée de certains navigateurs).
 *
 * Les écritures sont enchaînées : une lecture attend la fin des écritures en cours.
 */

const DB_NAME = 'nexus-gestion';
const STORE = 'demo';
const KEY = 'etat';
const LEGACY_KEY = 'nexus_gestion_demo_v1';

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponible'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function run(mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req?.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

let queue = Promise.resolve();
const enqueue = (fn) => (queue = queue.then(fn, fn));

const legacy = () => {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
  } catch {
    return null;
  }
};

/** État enregistré de la démonstration, ou null. */
export async function getDemo() {
  await queue.catch(() => {});
  try {
    const state = await run('readonly', (s) => s.get(KEY));
    if (state) return state;
    const old = legacy();
    if (old) {
      await run('readwrite', (s) => s.put(old, KEY));
      localStorage.removeItem(LEGACY_KEY);
    }
    return old;
  } catch {
    return legacy();
  }
}

/** Enregistre l'état (copie structurée) ; renvoie une promesse rejetée si le stockage refuse. */
export function setDemo(state) {
  return enqueue(async () => {
    try {
      await run('readwrite', (s) => s.put(state, KEY));
    } catch {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(state));
    }
  });
}

export function removeDemo() {
  return enqueue(async () => {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {}
    try {
      await run('readwrite', (s) => s.delete(KEY));
      await run('readwrite', (s) => s.delete('commerce')); // module Articles de la démonstration
    } catch {}
  });
}

/** Autre donnée de la démonstration (module Articles : catalogue, grilles, stock), sous sa propre clé. */
export async function getDemoKey(key) {
  await queue.catch(() => {});
  try {
    return (await run('readonly', (s) => s.get(key))) ?? null;
  } catch {
    return null;
  }
}

export function setDemoKey(key, value) {
  return enqueue(() => run('readwrite', (s) => s.put(value, key)));
}
