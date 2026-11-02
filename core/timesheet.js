/**
 * Temps passé (company.timeEntries) : heures saisies par client, au taux horaire choisi, puis
 * transformées en lignes de facture. Une saisie facturée garde le numéro de sa facture et n'est plus
 * proposée ; elle redevient facturable si le brouillon est supprimé.
 */

import { divRound, sum } from './money.js?v=269c883';

export class TimeError extends Error {}

/** « 1h30 », « 1:30 », « 1,5 », « 90 min » → minutes. */
export function parseDuration(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  let m;
  if ((m = /^(\d{1,3})(?:h|:)(\d{1,2})?$/.exec(t))) return Number(m[1]) * 60 + Number(m[2] || 0);
  if ((m = /^(\d{1,4})(?:min|mn|m)$/.exec(t))) return Number(m[1]);
  if ((m = /^(\d{1,3})(?:[.,](\d{1,2}))?h?$/.exec(t))) return Math.round(Number(`${m[1]}.${m[2] || 0}`) * 60);
  return NaN;
}

/** Contrôle et normalise une saisie de temps. */
export function timeEntry({ id, date, clientId, clientName, label, minutes, rate }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new TimeError('Indiquez la date.');
  if (!clientId || !clientName) throw new TimeError('Choisissez le client.');
  const what = String(label || '').trim();
  if (!what) throw new TimeError('Indiquez ce qui a été fait (exemple : « Développement du site »).');
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60) throw new TimeError('Durée illisible : écrivez par exemple 1h30, 45 min ou 2,5.');
  if (!Number.isSafeInteger(rate) || rate < 0) throw new TimeError('Taux horaire illisible.');
  return { id, date, clientId, clientName, label: what.slice(0, 200), minutes, rate, invoiceId: null };
}

/** Montant HT d'une saisie (taux horaire × durée). */
export const entryAmount = (e) => divRound(e.rate * e.minutes, 60);

/** Saisie facturée : sa facture existe encore (un brouillon supprimé la rend de nouveau facturable). */
export const isBilled = (e, invoiceIds) => Boolean(e.invoiceId) && invoiceIds.has(e.invoiceId);

/** Saisies non facturées, regroupées par client, avec leur total. */
export function unbilledByClient(entries = [], invoiceIds = new Set()) {
  const groups = new Map();
  for (const e of entries) {
    if (isBilled(e, invoiceIds)) continue;
    const g = groups.get(e.clientId) || { clientId: e.clientId, clientName: e.clientName, entries: [], minutes: 0, amount: 0 };
    g.entries.push(e);
    g.minutes += e.minutes;
    g.amount += entryAmount(e);
    groups.set(e.clientId, g);
  }
  return [...groups.values()].sort((a, b) => b.amount - a.amount);
}

/** Lignes de facture : une par prestation et par taux horaire. */
export function timeInvoiceLines(entries, { vatRateBp }) {
  const byKey = new Map();
  for (const e of entries) {
    const key = `${e.label.toLocaleLowerCase('fr')}|${e.rate}`;
    const g = byKey.get(key) || { label: e.label, rate: e.rate, minutes: 0, dates: [] };
    g.minutes += e.minutes;
    g.dates.push(e.date);
    byKey.set(key, g);
  }
  return [...byKey.values()].map((g) => {
    const dates = g.dates.sort();
    const fr = (d) => d.split('-').reverse().join('/');
    const period = dates[0] === dates.at(-1) ? `le ${fr(dates[0])}` : `du ${fr(dates[0])} au ${fr(dates.at(-1))}`;
    // Durée exprimable en heures à 3 décimales (multiple de 3 min) : quantité en heures au taux horaire ;
    // sinon une ligne au forfait, durée dans la désignation (le total reste exact au centime).
    if ((g.minutes * 1000) % 60 === 0)
      return { label: `${g.label} (${period})`, qty: (g.minutes * 1000) / 60 / 1000, unitPrice: g.rate, vatRateBp, nature: 'services' };
    return { label: `${g.label} (${formatMinutes(g.minutes)}, ${period})`, qty: 1, unitPrice: divRound(g.rate * g.minutes, 60), vatRateBp, nature: 'services' };
  });
}

/** Total HT des saisies, en centimes. */
export const entriesTotal = (entries) => sum(entries.map(entryAmount));

/** « 1 h 30 » */
export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`;
}
