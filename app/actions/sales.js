/**
 * Écran « sales ».
 */

import { buildCii, checkEn16931, ciiFileName } from '../../core/einvoice.js?v=a619ec1';
import { InvoiceError, defaultDueDate, isValidSiren } from '../../core/invoices.js?v=a619ec1';
import { LIFECYCLE } from '../../core/lifecycle.js?v=a619ec1';
import { lookupSiren } from '../company-lookup.js?v=a619ec1';
import { render } from '../render.js?v=a619ec1';
import * as cloud from '../cloud.js?v=a619ec1';
import { cloudState, eur, frDate, today, ui, ws } from '../state.js?v=a619ec1';
import { invoiceEmail, reminderMessage } from '../../core/reminders.js?v=a619ec1';
import { explainEmailError } from '../email-errors.js?v=a619ec1';
import { download, save, toast, whenSaved } from '../store.js?v=a619ec1';
import { isUnconfirmed } from '../sync-ui.js?v=a619ec1';
import { emptyLine, persistDraft } from '../views/invoice-form.js?v=a619ec1';
import { invoicePdf, pdfFileName } from '../facturx-ui.js?v=a619ec1';
import { depositCandidates } from '../../core/deposit.js?v=a619ec1';
import { createZip } from '../../core/zip.js?v=a619ec1';

/**
 * Émet le brouillon du formulaire (`fromForm`) ou un brouillon enregistré ; renvoie la pièce émise,
 * ou null si l'émission a échoué (anomalies affichées sur le formulaire) ou attend son numéro.
 */
async function issueDraft(fromForm, id) {
  const inv = fromForm ? persistDraft() : ws.book.get(id);
  if (!inv) {
    render();
    return null;
  }
  try {
    const issued = ws.issueInvoice(inv.id);
    ui.draft = null;
    save();
    location.hash = `#/ventes/${issued.id}`;
    render();
    // Mode connecté : le numéro n'est définitif qu'une fois confirmé par la base (file d'envoi).
    if (!ui.demo) {
      toast('Émission envoyée : le numéro s’affiche dès sa confirmation par le serveur.');
      return issued;
    }
    toast(
      `${issued.type === 'quote' ? 'Devis' : issued.type === 'deposit' ? "Facture d'acompte" : issued.type === 'credit' ? 'Avoir' : 'Facture'} ${issued.number} émis${issued.type === 'quote' || issued.type === 'credit' ? '' : 'e'}.`,
    );
    return issued;
  } catch (err) {
    if (err instanceof InvoiceError && err.issues.length) {
      if (ui.draft) {
        Object.assign(ui.draft, { issues: err.issues, focusIssues: true, key: `modifier-${inv.id}`, savedId: inv.id });
        location.hash = `#/ventes/modifier-${inv.id}`;
      }
      render();
    } else toast(err.message, true);
  }
  return null;
}

/** Envoi de la facture : par Nexus (Brevo) si en service, sinon partage ou messagerie. */
async function sendInvoice(id) {
  const inv = ws.book.get(id);
  let pdf;
  try {
    pdf = await invoicePdf(inv, ws.company, { outstanding: ws.book.outstanding(inv) });
  } catch (err) {
    return toast(`PDF impossible : ${err.message}`, true);
  }
  const name = pdfFileName(inv);
  const subject = `${inv.type === 'credit' ? 'Avoir' : 'Facture'} ${inv.number} — ${ws.company.name}`;
  const net = inv.totals.netToPay ?? inv.totals.totalTtc;
  const due = inv.type === 'credit' ? net : ws.book.outstanding(inv);
  const rest = inv.type !== 'credit' && due > 0 && due < net ? ` (reste à régler : ${eur(due)})` : '';
  const body = `Bonjour,\n\nVeuillez trouver ci-joint ${inv.type === 'credit' ? "l'avoir" : 'la facture'} ${inv.number} d'un montant de ${eur(net)}${rest}${inv.type === 'credit' ? '' : `, à régler avant le ${frDate(inv.dueDate)}`}.\n\nCordialement,\n${ws.company.name}`;
  // Envoi par Nexus Gestion (Brevo) : directement au client, PDF joint.
  const email = invoiceEmail(ws, inv);
  if (!ui.demo && cloudState.emailReady && email) {
    try {
      const r = await cloud.sendInvoiceEmail(inv.id, { subject, body, pdf, name });
      if (!r.ok) return toast(`La facture n’est pas partie. ${explainEmailError(r.detail)}`, true);
      ui.emails = null;
      return toast(`Facture envoyée par e-mail à ${r.recipient}, PDF joint.`);
    } catch (err) {
      return toast(`La facture n’est pas partie. ${explainEmailError(cloud.friendly(err))}`, true);
    }
  }
  // Démonstration : client fictif (adresse en .example) ; rien ne part, la facture est seulement montrée.
  if (ui.demo) {
    download(name, pdf, 'application/pdf');
    return toast(
      'Démonstration : aucun e-mail ne part, le client est fictif. Le PDF est téléchargé pour que vous voyiez la facture ; connectez-vous pour envoyer vos vraies factures.',
    );
  }
  if (!email) toast('Ce client n’a pas d’adresse e-mail : complétez sa fiche pour l’envoi direct. Votre messagerie s’ouvre à la place.', true);
  const file = new File([pdf], name, { type: 'application/pdf' });
  // Téléphone et certains ordinateurs : partage natif avec le PDF joint.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: subject, text: body });
      return toast('Facture partagée.');
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  // Sinon : PDF téléchargé, puis message préparé dans la messagerie (la pièce jointe s'ajoute à la main).
  download(name, pdf, 'application/pdf');
  const to = email ? encodeURIComponent(email) : '';
  location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  toast(`${name} est téléchargé : joignez-le au message qui s’ouvre.`);
}

/** Actions « sales » : data-action → fonction. */
export const actionsTable = {
  'line-add': async () => {
    ui.draft.lines.push(emptyLine());
    return render();
  },
  'line-remove': async ({ index }) => {
    ui.draft.lines.splice(Number(index), 1);
    return render();
  },
  'client-lookup': async () => {
    const nc = ui.draft.newClient;
    const siren = (nc.siren || '').replace(/\s/g, '');
    if (!isValidSiren(siren)) return toast('Ce SIREN ne semble pas valide.', true);
    try {
      const { warning: _warning, ...found } = await lookupSiren(siren);
      Object.assign(nc, found, { siren });
      render();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  },
  'invoice-cancel': async () => {
    ui.draft = null;
    location.hash = '#/ventes';
    return;
  },
  'invoice-save': async () => {
    const inv = persistDraft();
    if (!inv) return render();
    ui.draft = null;
    location.hash = `#/ventes/${inv.id}`;
    return toast('Brouillon enregistré.');
  },
  'invoice-issue': async () => {
    await issueDraft(true);
  },
  'invoice-issue-existing': async ({ id }) => {
    await issueDraft(false, id);
  },
  // Émettre puis envoyer au client dans le même clic (formulaire, ou brouillon enregistré si `id`).
  'invoice-issue-send': async ({ id }) => {
    if (ui.sending) return;
    const issued = await issueDraft(!id, id);
    if (!issued) return;
    ui.sending = true;
    try {
      // Mode connecté : on n'envoie qu'une facture dont la base a confirmé l'émission et le numéro.
      try {
        await whenSaved();
      } catch (err) {
        render();
        return toast(
          `Facture émise, mais pas encore confirmée par le serveur (${err.message}) : envoyez-la depuis sa fiche dès que son numéro s’affiche.`,
          true,
        );
      }
      render();
      await sendInvoice(issued.id);
    } finally {
      ui.sending = false;
    }
  },
  'invoice-delete': async ({ id }) => {
    if (!confirm('Supprimer ce brouillon ?')) return;
    ws.book.deleteDraft(id);
    save();
    location.hash = '#/ventes';
    return;
  },
  'credit-note': async ({ id }) => {
    const draft = ws.book.createCreditNote(id, { issueDate: today() });
    save();
    location.hash = `#/ventes/modifier-${draft.id}`;
    return;
  },
  'deposit-prepare': async () => {
    const todo = depositCandidates(ws.book);
    if (!todo.length) return;
    const platform = ws.company.paPlatform || 'autre';
    try {
      toast(`Préparation de ${todo.length} facture(s)…`);
      const files = [];
      for (const inv of todo) files.push({ name: pdfFileName(inv), data: await invoicePdf(inv, ws.company) });
      const fileName = `depot-factures-${today()}.zip`;
      download(fileName, createZip(files), 'application/zip');
      ui.pendingDeposit = { ids: todo.map((i) => i.id), platform, fileName };
      render();
    } catch (err) {
      toast(`Préparation impossible : ${err.message}`, true);
    }
  },
  'deposit-confirm': async () => {
    const { ids, platform } = ui.pendingDeposit;
    ws.markDeposited(ids, { date: today(), platform });
    ui.pendingDeposit = null;
    save();
    render();
    toast(`${ids.length} facture(s) marquée(s) « Déposée ».`);
  },
  'deposit-cancel': async () => {
    ui.pendingDeposit = null;
    return render();
  },
  // Le lien mailto s'ouvre normalement ; la relance est ajoutée à l'historique de la facture.
  'reminder-email': async ({ id, index }) => {
    if (ui.sending) return;
    const level = Number(index);
    const msg = reminderMessage(ws, id, level, today());
    ui.sending = true;
    try {
      const r = await cloud.sendReminderEmail(id, level, msg);
      if (!r.ok) return toast(`La relance n’est pas partie. ${explainEmailError(r.detail)}`, true);
      ws.recordReminder(id, { level, date: today() });
      save();
      ui.emails = null;
      render();
      toast(`Relance envoyée par e-mail à ${r.recipient}.`);
    } catch (err) {
      toast(cloud.friendly(err), true);
    } finally {
      ui.sending = false;
    }
  },
  'reminder-send': async ({ id, index }) => {
    ws.recordReminder(id, { level: Number(index), date: today() });
    save();
    setTimeout(render, 0);
  },
  'invoice-pdf': async ({ id }) => {
    const inv = ws.book.get(id);
    try {
      const pdf = await invoicePdf(inv, ws.company, { outstanding: ws.book.outstanding(inv) });
      download(pdfFileName(inv), pdf, 'application/pdf');
      toast('Facture PDF téléchargée (Factur-X : la facture électronique est jointe au PDF).');
    } catch (err) {
      toast(`PDF impossible : ${err.message}`, true);
    }
  },
  'invoice-send': async ({ id }) => {
    if (ui.sending) return;
    ui.sending = true;
    try {
      await sendInvoice(id);
    } finally {
      ui.sending = false;
    }
  },
  einvoice: async ({ id }) => {
    const inv = ws.book.get(id);
    if (isUnconfirmed(inv)) return toast('Numéro en attente de confirmation par le serveur : réessayez dans un instant.', true);
    const problems = checkEn16931(inv);
    if (problems.length) return toast(`Facture électronique non conforme : ${problems[0]}`, true);
    download(ciiFileName(inv), buildCii(inv), 'application/xml;charset=utf-8');
    return toast('Facture électronique CII (EN 16931) téléchargée.');
  },
  'status-add': async ({ id }) => {
    const status = document.querySelector('[data-status-select]').value;
    const detail = document.querySelector('[data-status-detail]').value.trim();
    try {
      ws.book.recordStatus(id, { status, date: today(), detail });
      save();
      render();
      toast(`Statut « ${LIFECYCLE[status].label} » ajouté.`);
    } catch (err) {
      toast(err.message, true);
    }
    return;
  },
  'recurring-toggle': async ({ id }) => {
    const t = ws.recurring.find((x) => x.id === id);
    ws.saveRecurring({ ...t, active: !t.active });
    save();
    return render();
  },
  'recurring-delete': async ({ id }) => {
    if (!confirm('Supprimer cette facture récurrente ? Les factures déjà créées sont conservées.')) return;
    ws.deleteRecurring(id);
    save();
    return render();
  },
  'sales-tab': async ({ el }) => {
    ui.salesTab = el.dataset.tab;
    return render();
  },
  'quote-convert': async ({ id }) => {
    const q = ws.book.get(id);
    const due = defaultDueDate({ type: 'invoice', issueDate: today(), paymentTermsDays: ws.company.paymentTermsDays });
    const draft = ws.book.convertQuote(id, { issueDate: today(), dueDate: due });
    save();
    ui.draft = null;
    location.hash = `#/ventes/modifier-${draft.id}`;
    return toast(`Brouillon de facture créé depuis le devis ${q.number}.`);
  },
};
