/**
 * File d'envoi vers la base (mode connecté). Chaque modification locale devient une liste
 * d'opérations (core/sync.js, planSync) mise en file, puis envoyée dans l'ordre.
 *
 * Plusieurs onglets d'une même entreprise partagent la même file : elle est stockée une seule fois,
 * lue et réécrite sous verrou, et un seul onglet envoie à la fois. Sans cela, deux onglets ouverts
 * réécrivaient chacun leur copie de la file et des modifications se perdaient.
 *
 * Dépendances injectées (testable sans navigateur ni réseau) :
 *   run(op) → résultat du serveur ; storage { getItem, setItem } ; lock(name, fn) exclusif ;
 *   friendly(error) → message ; onStatus(status) ; onResult(op, result).
 */

import { planSync, isDivergence } from './sync.js?v=e821f3b';

const DIVERGENCE_MESSAGE = 'Des modifications ont été enregistrées ailleurs (autre appareil ou autre onglet) : rechargez les données depuis la base.';
const directLock = (_name, fn) => fn();

/**
 * Version du format de la file enregistrée : { v, ops }. Version 1 (avant numérotation) : un simple
 * tableau d'opérations, repris tel quel. Une file écrite par une version plus récente de
 * l'application (autre onglet déjà mis à jour) n'est ni envoyée ni réécrite.
 */
export const OUTBOX_SCHEMA_VERSION = 2;
const STORAGE_WARNING = 'Le stockage de ce navigateur est plein : gardez cette page ouverte jusqu’à « Toutes les modifications sont enregistrées ».';
const NEWER_MESSAGE = 'Des modifications en attente viennent d’une version plus récente de Nexus Gestion : rechargez la page.';

export class Outbox {
  constructor({ key, run, storage, lock = directLock, friendly = (e) => e?.message || String(e), onStatus = () => {}, onResult = () => {} }) {
    Object.assign(this, { key, run, storage, lock, friendly, onStatus, onResult });
    this.running = false;
    this.error = null;
    this.queue = this.#load();
  }

  #load() {
    // Stockage refusé (plein ou bloqué) : la file en mémoire fait foi, ne pas la relire (elle serait vide).
    if (this.memoryOnly) return this.queue;
    let saved;
    try {
      saved = JSON.parse(this.storage.getItem(this.key) || '[]');
    } catch {
      return [];
    }
    if (Array.isArray(saved)) return saved;
    this.newer = saved?.v > OUTBOX_SCHEMA_VERSION;
    return Array.isArray(saved?.ops) ? saved.ops : [];
  }

  #persist() {
    if (this.newer) return;
    try {
      this.storage.setItem(this.key, JSON.stringify({ v: OUTBOX_SCHEMA_VERSION, ops: this.queue }));
      this.memoryOnly = false;
    } catch {
      // Stockage plein ou bloqué : la file reste en mémoire et l'envoi continue ; l'utilisateur est
      // prévenu qu'une fermeture de la page avant la fin de l'envoi perdrait ces modifications.
      if (!this.memoryOnly) this.onStatus({ pending: this.queue.length, error: null, warning: STORAGE_WARNING });
      this.memoryOnly = true;
    }
  }

  /** File écrite par une version plus récente de l'application (autre onglet mis à jour) ? */
  hasNewer() {
    this.#load();
    return Boolean(this.newer);
  }

  /** Ajoute les opérations qui mènent de `before` à `after`, puis lance l'envoi. */
  async push(before, after, meta) {
    // Une action de l'utilisateur = un lot : si l'une de ses opérations est écartée, les suivantes du
    // même lot (qui en dépendent : dépense après son écriture…) le sont aussi.
    const batch = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const ops = planSync(before, after, meta).map((op) => ({ ...op, batch }));
    if (!ops.length) return;
    await this.lock(`${this.key}:file`, () => {
      // Relire la file partagée avant d'ajouter : un autre onglet a pu la modifier.
      this.queue = [...this.#load(), ...ops];
      this.#persist();
    });
    return this.flush();
  }

  async flush() {
    if (this.running) return;
    this.queue = this.#load();
    if (this.newer) {
      this.error = NEWER_MESSAGE;
      this.onStatus({ pending: this.queue.length, error: NEWER_MESSAGE, divergence: true });
      return;
    }
    this.running = true;
    this.error = null;
    this.onStatus({ pending: this.queue.length, error: null });
    try {
      // Un seul onglet envoie à la fois ; chaque opération n'est retirée de la file qu'une fois acceptée.
      await this.lock(`${this.key}:envoi`, async () => {
        for (;;) {
          const op = await this.lock(`${this.key}:file`, () => {
            this.queue = this.#load();
            return this.queue[0];
          });
          if (!op) break;
          const result = await this.run(op);
          this.onResult(op, result);
          await this.lock(`${this.key}:file`, () => {
            this.queue = this.#load();
            if (JSON.stringify(this.queue[0]) === JSON.stringify(op)) this.queue.shift();
            this.#persist();
          });
        }
      });
    } catch (e) {
      // Refus motivé par la base (règle métier, droits) : son message dit quoi corriger ; seule une
      // divergence sans motif (doublon, numéro différent) reçoit le message générique.
      // Valeur rejetée par un contrôle de la base (22… données, 23514 contrôle, 23502 champ manquant) :
      // elle ne passera jamais, l'utilisateur peut la retirer. Une clé étrangère manquante (23503) reste
      // bloquante : elle se corrige par une migration, sans perdre l'opération.
      const invalid = /^22/.test(e?.code || '') || ['23514', '23502'].includes(e?.code);
      const refused = Boolean(e?.code) && e.code !== '23505' && (isDivergence(e) || invalid);
      this.error = refused ? this.friendly(e) : isDivergence(e) ? DIVERGENCE_MESSAGE : this.friendly(e);
      this.refusedOp = refused ? this.queue[0] : null;
      this.onStatus({ pending: this.queue.length, error: this.error, divergence: isDivergence(e), refused });
      this.running = false;
      return;
    }
    this.running = false;
    this.onStatus({ pending: 0, error: null });
  }

  /** Attend que toutes les opérations soient envoyées ; échoue si le serveur en refuse une. */
  async waitIdle() {
    await this.flush();
    while (this.running) await new Promise((r) => setTimeout(r, 20));
    if (this.error) throw new Error(this.error);
    this.queue = this.#load();
    if (this.queue.length) await this.waitIdle();
  }

  /**
   * Factures émises dont le numéro n'est pas encore confirmé par la base : tant que issue_invoice
   * n'a pas répondu, le numéro affiché n'est qu'une prévision (impression et XML indisponibles).
   */
  unconfirmedInvoices() {
    return new Set(
      this.#load()
        .filter((op) => op.fn === 'issue_invoice')
        .map((op) => op.args.p_invoice),
    );
  }

  /** Retire de la file la seule opération refusée par la base ; les suivantes restent à envoyer. */
  async skipRefused() {
    const op = this.refusedOp;
    if (!op) return false;
    await this.lock(`${this.key}:file`, () => {
      this.queue = this.#load();
      if (JSON.stringify(this.queue[0]) === JSON.stringify(op)) this.queue.shift();
      if (op.batch) this.queue = this.queue.filter((x) => x.batch !== op.batch);
      this.#persist();
    });
    this.refusedOp = null;
    this.error = null;
    return true;
  }

  /** Abandonne les opérations en attente (après rechargement depuis la base, qui fait foi). */
  clear() {
    this.queue = [];
    this.#persist();
  }
}

/** Verrou exclusif en mémoire (plusieurs « onglets » simulés dans un même processus, ou repli). */
export function memoryLock() {
  const tails = new Map();
  return (name, fn) => {
    const previous = tails.get(name) || Promise.resolve();
    const current = previous.then(() => fn());
    tails.set(
      name,
      current.catch(() => {}),
    );
    return current;
  };
}

export const OUTBOX_PREFIX = 'nexus_gestion_outbox_';

/**
 * Efface les files d'envoi de toutes les entreprises (elles contiennent des données métier : clients,
 * factures, écritures). Appelé à la déconnexion, pour qu'un ordinateur partagé n'en garde rien.
 * Renvoie le nombre de files effacées.
 */
/** Nombre d'opérations en attente dans les files de toutes les entreprises de ce navigateur. */
export function pendingOutboxOps(storage) {
  let n = 0;
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (!k?.startsWith(OUTBOX_PREFIX)) continue;
    try {
      const saved = JSON.parse(storage.getItem(k) || '[]');
      n += (Array.isArray(saved) ? saved : saved?.ops || []).length;
    } catch {
      // File illisible : ignorée.
    }
  }
  return n;
}

export function purgeOutboxes(storage) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(OUTBOX_PREFIX)) keys.push(k);
  }
  for (const k of keys) storage.removeItem(k);
  return keys.length;
}
