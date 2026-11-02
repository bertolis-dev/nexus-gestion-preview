/**
 * Actions de l'écran « Clients ».
 */

import { importClientsCsv } from '../../core/clients.js?v=3bfbbd4';
import { decodeStatement } from '../../core/bank-import.js?v=3bfbbd4';
import { isValidSiren } from '../../core/invoices.js?v=3bfbbd4';
import { lookupSiren } from '../company-lookup.js?v=3bfbbd4';
import { render } from '../render.js?v=3bfbbd4';
import { ui, ws } from '../state.js?v=3bfbbd4';
import { save, toast } from '../store.js?v=3bfbbd4';

/** Enregistrement de la fiche (création ou modification). */
export function clientSubmit(f) {
  const name = (f.name || '').trim();
  const siren = (f.siren || '').replace(/\s/g, '');
  const email = (f.email || '').trim();
  const country = ((f.country || 'FR').trim() || 'FR').toUpperCase().slice(0, 2);
  if (!name) return toast('Indiquez le nom du client.', true);
  if (siren && !isValidSiren(siren)) return toast('Ce SIREN ne semble pas valide : vérifiez les 9 chiffres.', true);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Cette adresse e-mail ne semble pas valide.', true);
  const data = {
    name,
    type: f.type === 'B2C' ? 'B2C' : 'B2B',
    siren,
    email,
    address: (f.address || '').trim(),
    country,
    vatNumber: (f.vatNumber || '').replace(/\s/g, '').toUpperCase(),
  };
  const existing = f.id && ws.clients.find((c) => c.id === f.id);
  const duplicate = ws.clients.find((c) => c.id !== f.id && ((siren && c.siren === siren) || c.name.trim().toLowerCase() === name.toLowerCase()));
  if (duplicate) return toast(`Un client « ${duplicate.name} » existe déjà${siren && duplicate.siren === siren ? ' avec ce SIREN' : ''}.`, true);
  const client = ws.saveClient(existing ? { ...data, id: existing.id } : data);
  ui.clientDraft = null;
  save();
  if (existing) {
    render();
    return toast('Fiche du client enregistrée.');
  }
  location.hash = `#/clients/${client.id}`;
  toast(`Client « ${client.name} » créé.`);
}

/** Fichier de clients choisi : aperçu avant import. */
export async function readClientsFile(file) {
  try {
    const text = decodeStatement(new Uint8Array(await file.arrayBuffer()));
    ui.clientImport = { fileName: file.name, ...importClientsCsv(text, ws.clients) };
  } catch (err) {
    toast(`Fichier illisible : ${err.message}`, true);
  }
  render();
}

export const actionsTable = {
  'clients-import-confirm': async () => {
    const list = ui.clientImport?.clients || [];
    for (const c of list) ws.saveClient(c);
    ui.clientImport = null;
    save();
    render();
    toast(`${list.length} client${list.length > 1 ? 's' : ''} ajouté${list.length > 1 ? 's' : ''}.`);
  },
  'clients-file-pick': async () => {
    document.querySelector('[data-action="clients-file"]')?.click();
  },
  'clients-import-cancel': async () => {
    ui.clientImport = null;
    render();
  },
  /** Facture ou devis pour ce client : le formulaire s'ouvre avec le client déjà choisi. */
  'client-new-doc': async ({ id, index }) => {
    if (ui.draft?.lines?.some((l) => l.label || l.unitPrice) && !confirm('Une facture est en cours de saisie. L’abandonner pour en créer une pour ce client ?'))
      return;
    ui.draft = null;
    ui.presetClientId = id;
    location.hash = index === 'quote' ? '#/ventes/nouveau-devis' : '#/ventes/nouvelle';
  },
  /** « Remplir » : nom et adresse repris de l'annuaire des entreprises à partir du SIREN saisi. */
  'client-form-lookup': async ({ el }) => {
    const form = el.closest('form');
    const siren = form.siren.value.replace(/\s/g, '');
    if (!isValidSiren(siren)) return toast('Ce SIREN ne semble pas valide.', true);
    try {
      const { warning: _warning, ...found } = await lookupSiren(siren);
      if (found.name) form.name.value = found.name;
      if (found.address) form.address.value = found.address;
      form.type.value = 'B2B';
      toast('Nom et adresse repris de l’annuaire des entreprises.');
    } catch (err) {
      toast(err.message, true);
    }
  },
};
