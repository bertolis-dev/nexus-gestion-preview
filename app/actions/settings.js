/**
 * Écran « settings ».
 */

import * as cloud from '../cloud.js?v=e821f3b';
import { render } from '../render.js?v=e821f3b';
import { cloudState, frDate, today, ui, ws } from '../state.js?v=e821f3b';
import { download, save, toast } from '../store.js?v=e821f3b';
import { forgetRule } from '../../core/categorization.js?v=e821f3b';
import { explainEmailError } from '../email-errors.js?v=e821f3b';
import { refreshEmailStatus } from '../sync-ui.js?v=e821f3b';
import { removeCatalogItem, saveCatalogItem } from '../../core/catalog.js?v=e821f3b';
import { readPrice } from '../views/invoice-form.js?v=e821f3b';

/** Ajout au catalogue (formulaire de Paramètres > Prestations et articles). */
export function catalogSubmit(f, form) {
  const unitPrice = readPrice(f.price);
  try {
    ws.company.catalog = saveCatalogItem(ws.company.catalog, {
      label: f.label,
      unitPrice: unitPrice ?? -1,
      vatRateBp: ws.company.vatRegime === 'franchise' ? 0 : Number(f.vatRateBp),
      nature: f.nature,
      tracked: f.tracked === 'on',
      stockInitial: f.stockInitial || 0,
      stockAlert: f.stockAlert ?? null,
    });
  } catch (err) {
    return toast(err.message, true);
  }
  save();
  form.reset();
  render();
  toast(`« ${f.label.trim()} » ajouté au catalogue.`);
}

/** Actions « settings » : data-action → fonction. */
export const actionsTable = {
  'data-export': async () => {
    try {
      const data = ui.demo
        ? { exported_at: new Date().toISOString(), format: 'Nexus Gestion — démonstration (JSON)', state: ws.toJSON() }
        : await cloud.exportStructure(cloudState.meta.structureId);
      download(`nexus-gestion-donnees-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
      toast('Toutes vos données ont été téléchargées.');
    } catch (err) {
      toast(cloud.friendly(err), true);
    }
  },
  'email-test': async () => {
    if (ui.emailTest?.busy) return;
    ui.emailTest = { busy: true };
    render();
    try {
      const r = await cloud.sendTestEmail();
      ui.emailTest = r.ok
        ? { ok: true, message: `E-mail de test envoyé à ${r.recipient} depuis ${r.sender}. Vérifiez votre boîte de réception (et les indésirables).` }
        : { ok: false, message: explainEmailError(r.detail), detail: r.detail };
    } catch (err) {
      const detail = cloud.friendly(err);
      ui.emailTest = { ok: false, message: explainEmailError(detail), detail };
    }
    ui.emails = null;
    if (ui.emailTest.ok) await refreshEmailStatus();
    render();
  },
  'catalog-remove': async ({ id }) => {
    ws.company.catalog = removeCatalogItem(ws.company.catalog, id);
    save();
    render();
    toast('Prestation retirée du catalogue.');
  },
  'reminder-templates-reset': async () => {
    delete ws.company.reminderTemplates;
    save();
    render();
    toast('Modèles de Nexus rétablis.');
  },
  'category-rule-forget': async ({ id, index }) => {
    ws.company.categoryRules = forgetRule(ws.company.categoryRules, id, index);
    save();
    render();
    toast('Règle oubliée.');
  },
  'logo-remove': async () => {
    delete ws.company.logo;
    save();
    render();
    toast('Logo retiré.');
  },
  'invite-member': async () => {
    const email = document.querySelector('[data-invite-email]').value.trim();
    const role = document.querySelector('[data-invite-role]').value;
    if (!email) return toast('Indiquez l’adresse e-mail.', true);
    try {
      // Réponse identique qu'un compte existe ou non (la base ne révèle pas les adresses inscrites).
      const message = await cloud.inviteMember(cloudState.meta.structureId, email, role);
      ui.members = await cloud.listMembers(cloudState.meta.structureId);
      render();
      toast(message);
    } catch (err) {
      toast(cloud.friendly(err), true);
    }
    return;
  },
  'mfa-add': async () => {
    try {
      ui.security = { ...ui.security, adding: await cloud.mfaEnroll(`Appareil de secours ${frDate(today())}`) };
    } catch (err) {
      toast(cloud.friendly(err), true);
    }
    return render();
  },
  'mfa-remove': async ({ id }) => {
    if (!confirm('Retirer cette application d’authentification ? Elle ne permettra plus d’ouvrir votre comptabilité.')) return;
    try {
      await cloud.mfaRemove(id);
      ui.security = null;
      render();
      toast('Application retirée.');
    } catch (err) {
      toast(cloud.friendly(err), true);
    }
    return;
  },
  'remove-member': async ({ id }) => {
    const m = (ui.members || []).find((x) => x.user_id === id);
    if (!confirm(`Retirer l’accès de ${m?.email || 'ce membre'} à votre comptabilité ?`)) return;
    try {
      await cloud.removeMember(cloudState.meta.structureId, id);
      ui.members = await cloud.listMembers(cloudState.meta.structureId);
      render();
      toast('Accès retiré.');
    } catch (err) {
      toast(cloud.friendly(err), true);
    }
    return;
  },
};
