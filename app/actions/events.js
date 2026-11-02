/**
 * Événements du document : saisie, changement, clavier, formulaires, clics, navigation.
 */

import { isValidSiren } from '../../core/invoices.js?v=3bfbbd4';
import { parseEuros } from '../../core/money.js?v=3bfbbd4';
import { knownVatOnDebits } from '../../core/purchases.js?v=3bfbbd4';
import { usualVatRate } from '../../core/pcg.js?v=3bfbbd4';
import { findCatalogItem } from '../../core/catalog.js?v=3bfbbd4';
import * as cloud from '../cloud.js?v=3bfbbd4';
import { html, raw } from '../html.js?v=3bfbbd4';
import { ICONS } from '../icons.js?v=3bfbbd4';
import { $, render, searchResults } from '../render.js?v=3bfbbd4';
import { closeLightbox, featureSlug } from '../site/landing.js?v=3bfbbd4';
import { cloudState, ui, ws } from '../state.js?v=3bfbbd4';
import { save, savePrefs, toast } from '../store.js?v=3bfbbd4';
import { afterSignIn } from '../sync-ui.js?v=3bfbbd4';
import { attachTxReceipt, currentBankAccount, importBankFile } from '../views/bank.js?v=3bfbbd4';
import { attachReceipt } from '../views/expenses.js?v=3bfbbd4';
import { readNexusRhFile } from '../views/nexusrh-import.js?v=3bfbbd4';
import { readDiscount, readPrice, totalsBlock } from '../views/invoice-form.js?v=3bfbbd4';
import { onboardingAction, readOpeningFile } from '../views/onboarding.js?v=3bfbbd4';
import { runAction } from './index.js?v=3bfbbd4';
import { readReceivedInvoices } from '../received-invoices.js?v=3bfbbd4';
import { catalogSubmit } from './settings.js?v=3bfbbd4';
import { clientSubmit, readClientsFile } from './clients.js?v=3bfbbd4';
import { filterClients } from '../views/clients.js?v=3bfbbd4';
import { pilotageSubmit } from './pilotage.js?v=3bfbbd4';

export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  const last = keys.at(-1);
  o[last] = last === 'vatRateBp' ? Number(value) : value;
}

/** Désignation choisie dans le catalogue : prix, TVA et nature de la ligne remplis. */
function fillFromCatalog(form, i, label) {
  const item = findCatalogItem(ws.company.catalog, label);
  if (!item) return;
  const line = ui.draft.lines[i];
  const priceText = (item.unitPrice / 100).toFixed(2).replace('.', ',');
  Object.assign(line, { label: item.label, unitPrice: item.unitPrice, priceText, nature: item.nature, catalogPrice: item.unitPrice });
  if (ws.company.vatRegime !== 'franchise') line.vatRateBp = item.vatRateBp;
  for (const [name, value] of [
    [`lines.${i}.priceText`, priceText],
    [`lines.${i}.vatRateBp`, String(line.vatRateBp)],
    [`lines.${i}.nature`, item.nature],
  ]) {
    const input = form.querySelector(`[name="${name}"]`);
    if (input) input.value = value;
  }
}

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.ob) {
    ui.ob.data[el.dataset.ob] = el.value;
    if (el.type === 'radio') render();
    return;
  }
  if (el.dataset.statement !== undefined) {
    ui.statementBalance = el.value;
    return;
  }
  if (el.dataset.clientsSearch !== undefined) return filterClients(el.value);
  // Nouveau client : saisie gardée si l'écran est redessiné (mise à jour, état de l'envoi…).
  const clientForm = el.closest('form[data-form="client"]');
  if (clientForm && !clientForm.querySelector('[name="id"]') && el.name) {
    ui.clientDraft = { ...(ui.clientDraft || { type: 'B2B', country: 'FR' }), [el.name]: el.value };
    return;
  }
  if (el.id === 'global-search-input') {
    const results = searchResults(el.value);
    const box = $('global-search-results');
    box.innerHTML = html`${results.map(
      (r) =>
        html`<div class="search-result-item" role="option" tabindex="-1" aria-selected="false" data-href="${r.href}">
          <span class="search-result-icon">${raw(ICONS[r.icon])}</span>
          <div>
            <div class="search-result-label">${r.label}</div>
            <div class="search-result-sublabel">${r.sub}</div>
          </div>
        </div>`,
    )}${el.value.trim().length >= 2 && !results.length ? html`<div class="search-result-item"><div class="search-result-sublabel">Aucun résultat</div></div>` : ''}`.s;
    box.classList.toggle('open', el.value.trim().length >= 2);
    el.setAttribute('aria-expanded', String(box.classList.contains('open')));
    return;
  }
  const form = el.closest('form[data-form="invoice"]');
  if (form && el.name) {
    setPath(ui.draft, el.name, el.value);
    if (el.name === 'clientId') ui.draft.clientEdit = null;
    if (el.hasAttribute('data-rerender')) return render();
    const m = /^lines\.(\d+)\.priceText$/.exec(el.name);
    if (m) {
      // Prix illisible : champ signalé tout de suite, la ligne compte pour 0 dans le total affiché.
      const price = readPrice(el.value);
      ui.draft.lines[m[1]].unitPrice = price ?? 0;
      if (price === null) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
    }
    const lab = /^lines\.(\d+)\.label$/.exec(el.name);
    if (lab) {
      const line = ui.draft.lines[lab[1]];
      const untouched = !line.unitPrice || (line.catalogPrice !== undefined && line.unitPrice === line.catalogPrice);
      if (e.inputType === 'insertReplacementText' || !e.inputType || untouched) fillFromCatalog(form, Number(lab[1]), el.value);
    }
    const disc = /^lines\.(\d+)\.discountText$/.exec(el.name);
    if (disc) {
      // Remise illisible (ou hors 0-100 %) : champ signalé, la ligne compte sans remise dans le total affiché.
      const bp = readDiscount(el.value);
      ui.draft.lines[disc[1]].discountBp = bp || undefined;
      if (bp === null) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
    }
    if (/^lines\.\d+\.qty$/.test(el.name)) ui.draft.lines[el.name.split('.')[1]].qty = Number(el.value.replace(',', '.')) || 0;
    $('totals').innerHTML = totalsBlock().s;
  }
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  // Fournisseur déjà connu : son option pour les débits est reprise.
  if (el.name === 'supplier' && el.form?.dataset.form === 'purchase') {
    const box = el.form.querySelector('[name="vatOnDebits"]');
    const known = knownVatOnDebits(ws.purchases, el.value);
    if (box && known !== null) box.checked = known; // fournisseur inconnu : la case cochée reste cochée
    return;
  }
  if (el.dataset.statement !== undefined) return render();
  if (el.dataset.cat !== undefined) {
    const tx = ws.transactions.find((t) => t.id === el.dataset.cat);
    const rate = tx && usualVatRate(el.value, tx.date);
    const vat = document.querySelector(`[data-vat="${CSS.escape(el.dataset.cat)}"]`);
    if (vat && rate !== null && rate !== undefined) vat.value = String(rate);
    return;
  }
  if (el.dataset.paPlatform !== undefined) {
    ws.company.paPlatform = el.value || undefined;
    save();
    return render();
  }
  if (el.dataset.bankAccount !== undefined) {
    ui.bankAccountId = el.value;
    ui.statementBalance = '';
    ui.bankPage = 0;
    return render();
  }
  if (el.dataset.urssafFrequency !== undefined) {
    ws.company.urssafFrequency = el.value;
    ui.urssafDeclare = null;
    save();
    return render();
  }
  if (el.dataset.action === 'settings-fec-file' && el.files[0]) {
    try {
      ui.pendingOpening = { opening: await readOpeningFile(el.files[0]), fileName: el.files[0].name };
    } catch (err) {
      toast(err.message, true);
    }
    return render();
  }
  if (el.dataset.action === 'ob-bank-file' && el.files[0]) {
    try {
      Object.assign(ui.ob.data, { bankFileName: el.files[0].name, bankTx: (await importBankFile(el.files[0])).transactions });
    } catch (err) {
      ui.ob.error = err.message;
    }
    return render();
  }
  if (el.dataset.action === 'clients-file' && el.files[0]) {
    const file = el.files[0];
    el.value = '';
    return readClientsFile(file);
  }
  if (el.dataset.action === 'logo-file' && el.files[0]) {
    const file = el.files[0];
    if (!['image/png', 'image/jpeg'].includes(file.type)) return toast('Choisissez une image PNG ou JPEG.', true);
    if (file.size > 200 * 1024) return toast('Image trop lourde : 200 Ko au plus (réduisez-la, par exemple à 400 px de large).', true);
    const reader = new FileReader();
    reader.onload = () => {
      ws.company.logo = reader.result;
      save();
      render();
      toast('Logo enregistré : il figure en tête de vos factures PDF.');
    };
    reader.readAsDataURL(file);
    return;
  }
  if (el.dataset.action === 'tx-receipt-file' && el.files[0]) {
    const file = el.files[0];
    el.value = ''; // le même fichier peut être choisi de nouveau après un échec
    return attachTxReceipt(el.dataset.id, file);
  }
  if (el.dataset.action === 'bank-file' && el.files[0]) {
    try {
      const result = await importBankFile(el.files[0], currentBankAccount().id);
      ui.bankAccountId = result.accountId;
      const added = ws.importTransactions(result.transactions);
      ui.bankImport = { ...result, fileName: el.files[0].name, added: added.length };
      save();
      render();
      toast(
        added.length ? `${added.length} nouvelle(s) transaction(s) importée(s).` : 'Aucune nouvelle transaction : ce relevé était déjà importé.',
        result.errors.length > 0,
      );
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  if (el.dataset.action === 'nexusrh-file' && el.files[0]) {
    const file = el.files[0];
    el.value = ''; // le même fichier peut être choisi de nouveau
    return readNexusRhFile(file).catch(() => toast('Fichier illisible : choisissez le fichier exporté depuis Nexus RH.', true));
  }
  if (el.dataset.action === 'einvoice-in-file' && el.files.length) {
    const { invoices, errors } = await readReceivedInvoices([...el.files], ws.company.siren);
    for (const e of errors) toast(e, true);
    if (invoices.length) {
      [ui.pendingEinvoice, ...ui.pendingEinvoices] = invoices;
      ui.expensesTab = 'depenses';
      if (invoices.length > 1) toast(`${invoices.length} factures reçues à vérifier, une par une.`);
    }
    return render();
  }
  if (el.dataset.alloc) {
    ui.allocationForm = {
      ...(ui.allocationForm || {}),
      ...Object.fromEntries([...document.querySelectorAll('[data-alloc]')].map((e) => [e.dataset.alloc, e.value])),
    };
    return;
  }
  if (el.dataset.inv === 'type') {
    ui.inventoryForm = { type: el.value };
    return render();
  }
  if (el.dataset.is) {
    ui.isOptions = {
      ...(ui.isOptions || { addBacks: '', previousLosses: '', reducedRateEligible: true }),
      [el.dataset.is]: el.type === 'checkbox' ? el.checked : el.value,
    };
    return render();
  }
  if (el.dataset.action === 'asset-years') {
    ws.company.assetYears = { ...(ws.company.assetYears || {}), [el.dataset.id]: Number(el.value) };
    save();
    render();
    return toast('Durée d’amortissement enregistrée.');
  }
  if (el.dataset.action === 'toggle-deposit') {
    const ids = ui.draft.depositIds;
    ui.draft.depositIds = el.checked ? [...ids, el.dataset.id] : ids.filter((x) => x !== el.dataset.id);
    $('totals').innerHTML = totalsBlock().s;
    return;
  }
  if (el.dataset.action === 'auto-reminders') {
    ws.company.autoReminders = el.checked;
    save();
    render();
    return toast(el.checked ? 'Relances automatiques activées : chaque matin, les relances dues partent par e-mail.' : 'Relances automatiques désactivées.');
  }
  if (el.dataset.action === 'settings-tab') {
    location.hash = `#/parametres/${el.value}`;
    return;
  }
  if (el.dataset.action === 'mode') {
    ui.mode = el.checked ? 'avance' : 'standard';
    savePrefs();
    return render();
  }
});

/** Ferme les menus ouverts (menu du compte, recherche, menu mobile) ; renvoie vrai si l'un l'était. */
export function closeMenus() {
  let closed = false;
  const panel = $('user-menu-panel');
  if (panel?.classList.contains('open')) {
    panel.classList.remove('open');
    $('btn-user-menu')?.setAttribute('aria-expanded', 'false');
    $('btn-user-menu')?.focus();
    closed = true;
  }
  const results = $('global-search-results');
  if (results?.children.length) {
    results.innerHTML = '';
    results.classList.remove('open');
    $('global-search-input')?.setAttribute('aria-expanded', 'false');
    $('global-search-input')?.focus();
    closed = true;
  }
  for (const id of ['sidebar-nav', 'landing-nav-links']) {
    if ($(id)?.classList.contains('open')) {
      $(id).classList.remove('open');
      $('btn-mobile-nav-toggle')?.setAttribute('aria-expanded', 'false');
      closed = true;
    }
  }
  return closed;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('modal-root')?.classList.contains('open')) return closeLightbox();
  // Bouton « choisir un fichier » (étiquette autour d'un champ caché) : Entrée ou Espace ouvre le choix.
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-file-picker]')) {
    e.preventDefault();
    return e.target.querySelector('input[type="file"]')?.click();
  }
  // Aperçu de l'import Nexus RH : Échap le ferme.
  if (e.key === 'Escape' && ui.nexusRh) {
    ui.nexusRh = null;
    return render();
  }
  if (e.key === 'Escape' && closeMenus()) return;
  // Ligne de tableau ou résultat de recherche : Entrée (ou Espace) l'ouvre.
  const target = e.target.closest?.('tr[data-href], .search-result-item[data-href]');
  if (target && (e.key === 'Enter' || e.key === ' ') && e.target === target) {
    e.preventDefault();
    location.hash = target.dataset.href;
    $('global-search-results')?.classList.remove('open');
    return;
  }
  // Recherche : flèches pour parcourir les résultats.
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.closest?.('.topbar-search')) {
    const options = [...document.querySelectorAll('#global-search-results [role="option"]')];
    if (!options.length) return;
    e.preventDefault();
    const i = options.indexOf(document.activeElement);
    const next = options[e.key === 'ArrowDown' ? Math.min(i + 1, options.length - 1) : i - 1];
    if (next) next.focus();
    else $('global-search-input').focus();
    for (const o of options) o.setAttribute('aria-selected', String(o === next));
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && $('global-search-input')?.offsetParent) {
    e.preventDefault();
    $('global-search-input').focus();
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target;
  const kind = form.dataset.form;
  e.preventDefault();
  const fd = new FormData(form);
  const f = Object.fromEntries(fd);
  if (pilotageSubmit(kind, f, fd)) return;

  if (kind === 'purchase') {
    const file = fd.get('document');
    ui.pendingPurchase = { form: { ...f, document: undefined }, file: file && file.size ? file : null };
    try {
      const data = {
        supplier: { name: f.supplier.trim() },
        date: f.date,
        number: f.number.trim(),
        categoryId: f.categoryId,
        ttc: parseEuros(f.ttc),
        vatRateBp: Number(f.vatRateBp ?? 0),
        documentName: file && file.size ? file.name : '',
        type: f.docType === 'credit' ? 'credit' : 'invoice',
        reverseCharge: fd.has('reverseCharge'),
      };
      if (form.querySelector('[name="vatOnDebits"]')) data.supplier.vatOnDebits = fd.has('vatOnDebits');
      if (!data.supplier.name) throw new Error('Indiquez le fournisseur.');
      if (data.ttc <= 0) throw new Error('Le montant doit être positif.');
      ui.pendingPurchase.data = data;
      const res = ws.addPurchase(data);
      if (!res.purchase) {
        ui.pendingPurchase.duplicates = res.duplicates;
        return render();
      }
      const pendingFile = ui.pendingPurchase.file;
      ui.pendingPurchase = null;
      save();
      render();
      toast('Dépense enregistrée.');
      attachReceipt(res.purchase, pendingFile);
    } catch (err) {
      ui.pendingPurchase.error = err.message.startsWith('Montant invalide') ? 'Le montant saisi n’est pas valide (exemple : 49,90).' : err.message;
      render();
    }
    return;
  }
  if (kind === 'recurring') {
    ui.recurringForm = { ...f, autoIssue: fd.has('autoIssue') };
    try {
      const client = ws.clients.find((x) => x.id === f.clientId);
      const unitPrice = parseEuros(f.price || '');
      ws.saveRecurring({
        client: structuredClone(client),
        lines: [{ label: (f.label || '').trim(), qty: 1, unitPrice, vatRateBp: Number(f.vatRateBp ?? 0), nature: f.nature }],
        frequency: f.frequency,
        anchorDate: f.anchorDate,
        endDate: f.endDate || null,
        paymentDays: Number(f.paymentDays) || 0,
        autoIssue: fd.has('autoIssue'),
      });
      ui.recurringForm = null;
      ui.recurringRanOn = null; // une échéance déjà atteinte est préparée tout de suite
      save();
      render();
      toast('Facture récurrente créée.');
    } catch (err) {
      ui.recurringForm.error = err.message.startsWith('Montant invalide') ? 'Le prix saisi n’est pas valide (exemple : 750,00).' : err.message;
      render();
    }
    return;
  }
  if (kind === 'company') {
    const siren = f.siren.replace(/\s/g, '');
    if (!isValidSiren(siren)) return toast('Le SIREN saisi n’est pas valide.', true);
    // Identité figée : la forme juridique (champ désactivé, donc absent du formulaire) reste celle enregistrée.
    if (ws.identityLocked()) {
      if (siren !== ws.company.siren) {
        return toast(
          'Le SIREN ne peut plus être modifié : des factures ont été émises ou des écritures validées. Pour un changement de situation, contactez le support.',
          true,
        );
      }
      f.legalForm = ws.company.legalForm;
    }
    Object.assign(ws.company, { ...f, siren, vatOnDebits: fd.has('vatOnDebits'), paymentTermsDays: Number(f.paymentTermsDays) || 30 });
    save();
    render();
    return toast('Paramètres enregistrés.');
  }
  if (kind === 'catalog-item') return catalogSubmit(f, form);
  if (kind === 'client') return clientSubmit(f);
  if (kind === 'reminder-templates') {
    if ([0, 1, 2].some((i) => /https?:\/\/|www\./i.test(`${f[`subject${i}`] || ''} ${f[`body${i}`] || ''}`)))
      return toast('Les liens (http://, www.) ne sont pas autorisés dans les relances : retirez-les, puis enregistrez.', true);
    ws.company.reminderTemplates = [0, 1, 2].map((i) => ({ subject: (f[`subject${i}`] || '').trim(), body: (f[`body${i}`] || '').trim() }));
    save();
    render();
    return toast('Modèles de relance enregistrés.');
  }
  if (kind === 'micro') {
    if (f.acreStart && f.acreEnd && f.acreEnd < f.acreStart)
      return toast('La fin de l’ACRE doit être postérieure à son début : vérifiez les dates sur votre attestation URSSAF.', true);
    if (f.acreEnd && !f.acreStart) return toast('Indiquez aussi la date de début de votre ACRE.', true);
    Object.assign(ws.company, {
      microActivity: f.microActivity,
      taxRegime: f.microActivity === 'bnc' ? 'micro-bnc' : 'micro-bic',
      retraite: f.retraite === 'cipav' ? 'cipav' : 'general',
      activityStart: f.activityStart || null,
      acreStart: f.acreStart || null,
      acreEnd: f.acreEnd || null,
      artisan: fd.has('artisan'),
      versementLiberatoire: fd.has('versementLiberatoire'),
    });
    save();
    render();
    return toast('Situation enregistrée : les estimations de cotisations sont à jour.');
  }
  if (kind === 'bank-account-add') {
    try {
      const account = ws.addBankAccount({ label: f.label, iban: f.iban });
      ui.addingBank = false;
      ui.bankAccountId = account.id;
      save();
      render();
      toast(`Compte « ${account.label} » ajouté : importez-y ses relevés.`);
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  if (kind === 'mfa-add') {
    try {
      await cloud.mfaVerify(ui.security.adding.factorId, f.code);
      ui.security = null;
      render();
      toast('Appareil de secours enregistré : il donne accès à votre comptabilité si vous perdez votre téléphone.');
    } catch (err) {
      ui.security.adding.error = cloud.friendly(err);
      render();
    }
    return;
  }
  if (kind === 'mfa') {
    ui.mfa = { ...ui.mfa, busy: true, error: '' };
    render();
    try {
      await cloud.mfaVerify(f.factor || ui.mfa.factorId, f.code);
      ui.mfa = null;
      await afterSignIn();
    } catch (err) {
      ui.mfa = { ...ui.mfa, busy: false, error: cloud.friendly(err) };
      render();
    }
    return;
  }
  if (!['login', 'signup', 'forgot', 'resend', 'new-password'].includes(kind)) return;
  const a = ui.auth;
  Object.assign(a, { busy: true, error: '', info: '', email: f.email || a.email });
  render();
  try {
    if (kind === 'login') {
      cloudState.session = (await cloud.signIn(f.email, f.password)).session;
      a.busy = false;
      return afterSignIn();
    }
    if (kind === 'signup') {
      const res = await cloud.signUp(f.email, f.password);
      if (res.session) {
        cloudState.session = res.session;
        a.busy = false;
        return afterSignIn();
      }
      Object.assign(a, {
        view: 'login',
        info: `Compte créé pour ${f.email}. Vérifiez votre boîte mail et cliquez sur le lien de confirmation avant de vous connecter.`,
      });
    }
    if (kind === 'forgot') {
      await cloud.resetPassword(f.email);
      a.info = 'Si un compte existe pour cette adresse, un lien de réinitialisation vient de vous être envoyé.';
    }
    if (kind === 'resend') {
      await cloud.resendConfirmation(f.email);
      Object.assign(a, { view: 'login', info: `Un nouvel email de confirmation a été envoyé à ${f.email}. Le lien est valable une heure.` });
    }
    if (kind === 'new-password') {
      await cloud.updatePassword(f.password);
      a.view = 'login';
      a.busy = false;
      toast('Mot de passe modifié.');
      return afterSignIn();
    }
  } catch (err) {
    a.error = cloud.friendly(err);
  }
  a.busy = false;
  render();
});

document.addEventListener('click', async (e) => {
  // Menus déroulants : fermeture au clic extérieur (même comportement que Nexus RH).
  if (!e.target.closest('.user-menu-wrapper')) {
    $('user-menu-panel')?.classList.remove('open');
    $('btn-user-menu')?.setAttribute('aria-expanded', 'false');
  }
  if (!e.target.closest('.topbar-search')) $('global-search-results')?.classList.remove('open');
  if (!e.target.closest('.landing-nav-menu')) $('landing-nav-links')?.classList.remove('open');

  if (e.target.id === 'modal-root') return closeLightbox();
  const focusLink = e.target.closest('a[data-focus]');
  if (focusLink) {
    e.preventDefault();
    document.querySelector(focusLink.dataset.focus)?.focus();
    return;
  }
  // Lien d'évitement : le focus va au titre de l'écran (le # sert au routage).
  if (e.target.closest('.skip-link')) {
    e.preventDefault();
    const h1 = $('view-root')?.querySelector('h1');
    if (h1) {
      h1.tabIndex = -1;
      h1.focus();
    }
    return;
  }
  const nav = e.target.closest('[data-href]');
  if (nav) {
    location.hash = nav.dataset.href;
    $('global-search-results')?.classList.remove('open');
    return;
  }
  const goto = e.target.closest('[data-goto]');
  if (goto) {
    $('landing-nav-links')?.classList.remove('open');
    return document.getElementById(goto.dataset.goto)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'button')) return;
  const { action, id, index } = el.dataset;
  if (action.startsWith('ob-') && action !== 'ob-bank-file') return onboardingAction(action);

  return runAction(action, { e, el, action, id, index });
});

window.addEventListener('hashchange', () => {
  if (ui.screen === 'landing' && !cloudState.session) {
    closeLightbox();
    render();
    // Retour à la liste : on revient sur la section Fonctionnalités, sinon en haut de la nouvelle page.
    if (!featureSlug() && ui.backToFeatures) document.getElementById('landing-fonctionnalites')?.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
    ui.backToFeatures = false;
    return;
  }
  if (ui.screen !== 'app') return;
  render();
  window.scrollTo(0, 0);
});
