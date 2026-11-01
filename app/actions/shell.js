/**
 * Écran « shell ».
 */

import * as cloud from '../cloud.js?v=d415f7a';
import { removeDemo } from '../demo-store.js?v=d415f7a';
import { $, render, renderApp } from '../render.js?v=d415f7a';
import { cloudState, freshOnboarding, setWs, today, ui, ws } from '../state.js?v=d415f7a';
import { download, setTheme, toast } from '../store.js?v=d415f7a';
import { openStructure, openStructureAndShow, refreshEmailStatus } from '../sync-ui.js?v=d415f7a';
import { openGuide, openGuideForCurrentScreen } from '../views/guide.js?v=d415f7a';

/** Version publiée plus récente que celle chargée ? (numéro ?v=… ajouté à la mise en ligne) */
async function newerVersionAvailable() {
  const current = /[?&]v=([\w-]+)/.exec(document.querySelector('script[src*="app.js"]')?.src || '')?.[1];
  if (!current) return false;
  try {
    const page = await (await fetch(location.pathname, { cache: 'no-store' })).text();
    const latest = /app\.js\?v=([\w-]+)/.exec(page)?.[1];
    return Boolean(latest && latest !== current);
  } catch {
    return false;
  }
}

/** Actions « shell » : data-action → fonction. */
export const actionsTable = {
  'guide-open': async () => {
    $('user-menu-panel').classList.remove('open');
    $('btn-user-menu')?.setAttribute('aria-expanded', 'false');
    openGuide();
  },
  'guide-help': async () => openGuideForCurrentScreen(),
  'forecast-toggle': async () => {
    ui.forecastOpen = !ui.forecastOpen;
    return render();
  },
  // Alerte de trésorerie (« À faire ») : prévision dépliée et affichée.
  'forecast-show': async () => {
    ui.forecastOpen = true;
    render();
    const card = $('tresorerie-prevue');
    card?.scrollIntoView({ block: 'start' });
    card?.focus({ preventScroll: true });
  },
  'toggle-nav': async ({ el }) => {
    const open = $('sidebar-nav').classList.toggle('open');
    el.setAttribute('aria-expanded', String(open));
    return;
  },
  'user-menu': async ({ el }) => {
    const open = $('user-menu-panel').classList.toggle('open');
    el.setAttribute('aria-expanded', String(open));
    return;
  },
  theme: async ({ el }) => {
    setTheme(el.dataset.value);
    return renderApp();
  },
  /**
   * Mise à jour : les modifications en attente sont d'abord enregistrées, puis les données rechargées
   * depuis la base sans quitter l'écran ni perdre une saisie en cours. Si une nouvelle version de
   * l'application est en ligne, la page est rechargée pour la prendre (sauf saisie en cours).
   */
  reload: async ({ el }) => {
    if (ui.reloading) return;
    ui.reloading = true;
    el?.classList.add('is-spinning');
    el?.setAttribute('aria-busy', 'true');
    try {
      const newer = await newerVersionAvailable();
      const editing = /^#\/(ventes\/(nouve|modifier-)|clients\/nouveau)/.test(location.hash);
      if (newer && !editing) {
        if (cloudState.outbox) await cloudState.outbox.flush();
        return location.reload();
      }
      if (ui.demo || !cloudState.meta) {
        render();
        return toast(newer ? 'Nouvelle version disponible : enregistrez votre saisie, puis mettez à jour.' : 'Affichage à jour.');
      }
      await cloudState.outbox?.flush();
      if (cloudState.outbox?.error) return;
      await openStructure(cloudState.meta.structureId);
      await refreshEmailStatus();
      render();
      toast(newer ? 'Données à jour. Nouvelle version disponible : enregistrez votre saisie, puis mettez à jour.' : 'Données à jour.');
    } catch (err) {
      toast(cloud.friendly(err), true);
    } finally {
      ui.reloading = false;
      const btn = document.querySelector('[data-action="reload"]');
      btn?.classList.remove('is-spinning');
      btn?.removeAttribute('aria-busy');
    }
  },
  print: async () => {
    return window.print();
  },
  backup: async () => {
    return download(`nexus-gestion-${today()}.json`, JSON.stringify(ws.toJSON(), null, 2), 'application/json');
  },
  'demo-exit': async () => {
    removeDemo();
    setWs(null);
    ui.demo = false;
    ui.screen = 'landing';
    $('app-shell').dataset.ready = '';
    location.hash = '';
    return render();
  },
  'structure-open': async ({ id }) => {
    try {
      await openStructureAndShow(id);
    } catch (err) {
      toast(cloud.friendly(err), true);
    }
  },
  'structure-switch': async () => {
    if (cloudState.status.pending && !confirm('Des modifications ne sont pas encore enregistrées. Changer d’entreprise quand même ?')) return;
    ui.emails = null;
    ui.members = null;
    setWs(null);
    ui.picking = true;
    ui.screen = 'login';
    location.hash = '';
    return render();
  },
  'sign-out': async () => {
    const pending = Math.max(cloudState.status.pending || 0, cloud.pendingEverywhere());
    if (
      pending &&
      !confirm(
        `${pending} modification(s) ne sont pas encore enregistrées (cette entreprise ou une autre). Se déconnecter les effacera de ce navigateur. Continuer ?`,
      )
    )
      return;
    await cloud.signOut();
    Object.assign(cloudState, { session: null, meta: null, outbox: null, synced: null, status: { pending: 0, error: null } });
    setWs(null);
    ui.mfa = null;
    // Rien de la session précédente ne reste affichable (membres, appareils).
    ui.security = null;
    ui.members = null;
    ui.emails = null;
    ui.structures = null;
    ui.picking = false;
    ui.ob = freshOnboarding();
    ui.screen = 'login';
    ui.auth = { view: 'login', error: '', info: '', busy: false, email: ui.auth.email };
    $('app-shell').dataset.ready = '';
    location.hash = '';
    return render();
  },
  'sync-retry': async () => {
    return cloudState.outbox?.flush();
  },
  'sync-skip': async () => {
    if (!confirm('Écarter cette modification refusée par la base ? Les autres modifications en attente seront enregistrées, puis les données rechargées.'))
      return;
    if (!(await cloudState.outbox.skipRefused())) return;
    await cloudState.outbox.flush();
    if (cloudState.outbox.error) return;
    await openStructure(cloudState.meta.structureId);
    cloudState.status = { pending: 0, error: null };
    render();
    return toast('Modification écartée, données rechargées depuis la base.');
  },
  'sync-reload': async () => {
    if (!confirm('Recharger depuis la base ? Les modifications non enregistrées de ce navigateur seront abandonnées.')) return;
    cloudState.outbox.clear();
    await openStructure(cloudState.meta.structureId);
    cloudState.status = { pending: 0, error: null };
    render();
    return toast('Données rechargées depuis la base.');
  },
};
