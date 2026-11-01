/**
 * Actions et formulaires du pilotage : échéances, budget, simulateur, temps passé, trajets, stock,
 * espace client, rapprochement en un clic et exports des listes.
 */

import { parseBudget } from '../../core/budget.js?v=d415f7a';
import { parseDuration } from '../../core/timesheet.js?v=d415f7a';
import { clientAux } from '../../core/invoices.js?v=d415f7a';
import { invoicesCsv, purchasesCsv } from '../../core/exports.js?v=d415f7a';
import { categoryById } from '../../core/pcg.js?v=d415f7a';
import * as cloud from '../cloud.js?v=d415f7a';
import { render } from '../render.js?v=d415f7a';
import { cloudState, today, ui, ws } from '../state.js?v=d415f7a';
import { download, save, toast } from '../store.js?v=d415f7a';
import { runRemuneration } from '../views/pilotage.js?v=d415f7a';

const cents = (text) => {
  const raw = String(text || '')
    .replace(/[\s\u00a0\u202f€]/g, '')
    .replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(raw) ? Math.round(Number(raw) * 100) : NaN;
};

/** Adresse de l'espace client : le secret est dans le fragment (#), jamais envoyé à un serveur ni dans les journaux. */
export const portalUrl = (token) => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}espace-client.html#${token}`;

/** Formulaires du pilotage ; renvoie true si le formulaire a été traité. */
export function pilotageSubmit(kind, f, fd) {
  if (kind === 'budget') {
    ui.budgetForm = { ...f };
    try {
      ws.saveBudget(parseBudget(f));
      ui.budgetForm = null;
      save();
      toast('Budget enregistré.');
    } catch (err) {
      ui.budgetForm.error = err.message;
    }
    render();
    return true;
  }
  if (kind === 'remuneration') {
    ui.remunerationForm = { ...f };
    try {
      ui.remunerationForm.result = runRemuneration(f);
    } catch (err) {
      ui.remunerationForm.error = err.message;
    }
    render();
    return true;
  }
  if (kind === 'time-entry') {
    ui.timeForm = { ...f };
    try {
      const rate = cents(f.rate);
      if (Number.isNaN(rate)) throw new Error('Taux horaire illisible (exemple : 60 ou 62,50).');
      ws.saveTimeEntry({ date: f.date, clientId: f.clientId, label: f.label, minutes: parseDuration(f.duration), rate });
      ws.company.hourlyRate = rate;
      ui.lastTimeClient = f.clientId;
      ui.timeForm = null;
      save();
      toast('Temps enregistré.');
    } catch (err) {
      ui.timeForm.error = err.message;
    }
    render();
    return true;
  }
  if (kind === 'mileage') {
    ui.mileageForm = { ...f, electric: fd.has('electric') };
    try {
      const p = ws.addMileage({ ...f, electric: fd.has('electric') });
      Object.assign(ws.company, { mileageDriver: f.driver.trim(), mileageHorsepower: Number(f.horsepower), mileageElectric: fd.has('electric') });
      ui.mileageForm = null;
      save();
      toast(`Trajet enregistré : indemnité de ${(p.totalTtc / 100).toFixed(2).replace('.', ',')} €.`);
    } catch (err) {
      ui.mileageForm.error = err.message;
    }
    render();
    return true;
  }
  if (kind === 'stock-move') {
    ui.stockForm = { ...f };
    try {
      ws.addStockMove(f);
      ui.stockForm = null;
      save();
      toast('Mouvement de stock enregistré.');
    } catch (err) {
      ui.stockForm.error = err.message;
    }
    render();
    return true;
  }
  return false;
}

async function loadLinks(clientId) {
  const c = ws.clients.find((x) => x.id === clientId);
  try {
    ui.clientLinks[clientId] = { links: await cloud.listClientLinks(cloudState.meta.structureId, clientAux(c)) };
  } catch (err) {
    ui.clientLinks[clientId] = { links: [], error: missingMigration(err) };
  }
}

const missingMigration = (err) =>
  ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(err?.code)
    ? 'L’espace client n’est pas encore activé sur le serveur (mise à jour de la base à appliquer).'
    : cloud.friendly(err);

export const actionsTable = {
  'pilotage-tab': async ({ el }) => {
    ui.pilotageTab = el.dataset.tab;
    return render();
  },
  'time-invoice': async ({ id }) => {
    try {
      const draft = ws.invoiceTime(id, today());
      save();
      ui.draft = null;
      location.hash = `#/ventes/modifier-${draft.id}`;
      toast('Brouillon de facture préparé : vérifiez-le, puis émettez-le.');
    } catch (err) {
      toast(err.message, true);
    }
    return render();
  },
  'time-delete': async ({ id }) => {
    try {
      ws.deleteTimeEntry(id);
      save();
    } catch (err) {
      toast(err.message, true);
    }
    return render();
  },
  'bank-match-sure': async () => {
    const n = ws.matchAllSure();
    save();
    render();
    return toast(n ? `${n} paiement${n > 1 ? 's' : ''} rapproché${n > 1 ? 's' : ''}.` : 'Aucun paiement à rapprocher automatiquement.');
  },
  'export-invoices-csv': async () => download(`factures-${today()}.csv`, invoicesCsv(ws.book), 'text/csv;charset=utf-8'),
  'export-purchases-csv': async () =>
    download(
      `depenses-${today()}.csv`,
      purchasesCsv(ws.purchases, (id) => categoryById(id)?.label || id),
      'text/csv;charset=utf-8',
    ),
  'client-links-load': async ({ id }) => {
    await loadLinks(id);
    return render();
  },
  'client-link-create': async ({ id }) => {
    const c = ws.clients.find((x) => x.id === id);
    try {
      const token = await cloud.createClientLink(cloudState.meta.structureId, clientAux(c), c.name);
      ui.freshClientLink = { clientId: id, url: portalUrl(token) };
      await loadLinks(id);
    } catch (err) {
      ui.clientLinks[id] = { ...(ui.clientLinks[id] || { links: [] }), error: missingMigration(err) };
    }
    return render();
  },
  'client-link-copy': async ({ el }) => {
    try {
      await navigator.clipboard.writeText(el.dataset.value);
      toast('Lien copié : collez-le dans votre e-mail au client.');
    } catch {
      toast('Copie impossible : sélectionnez le lien et copiez-le (Ctrl+C).', true);
    }
  },
  'client-link-revoke': async ({ id, el }) => {
    const clientId = el.dataset.index;
    try {
      await cloud.revokeClientLink(id);
      if (ui.freshClientLink?.clientId === clientId) ui.freshClientLink = null;
      await loadLinks(clientId);
      toast('Lien désactivé : il ne permet plus d’accéder à l’espace client.');
    } catch (err) {
      toast(missingMigration(err), true);
    }
    return render();
  },
};
