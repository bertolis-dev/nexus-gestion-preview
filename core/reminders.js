/**
 * Relances des factures impayées : propositions à J+3, J+15 et J+30 après l'échéance (dans « À
 * faire »), historique des relances envoyées (company.reminders), modèles modifiables
 * (company.reminderTemplates) avec variables : {client} {numero} {montant} {date} {echeance} {jours}
 * {entreprise}.
 */

import { formatEuros } from './money.js?v=a619ec1';

export const REMINDER_STEPS = [
  { level: 1, days: 3, label: 'Rappel courtois' },
  { level: 2, days: 15, label: 'Relance' },
  { level: 3, days: 30, label: 'Dernière relance' },
];

const closing = '\n\nCordialement,\n{entreprise}';
export const DEFAULT_TEMPLATES = [
  {
    subject: 'Facture {numero} en attente de règlement',
    body: `Bonjour,\n\nSauf erreur de notre part, la facture {numero} du {date}, d'un montant de {montant}, arrivée à échéance le {echeance}, reste à régler.\n\nSi le règlement est déjà parti, merci de ne pas tenir compte de ce message.${closing}`,
  },
  {
    subject: 'Relance : facture {numero} en attente de règlement',
    body: `Bonjour,\n\nNous n'avons pas encore reçu le règlement de la facture {numero} du {date}, d'un montant de {montant}, échue depuis {jours} jours ; elle reste à régler.\n\nMerci de procéder au règlement dans les meilleurs délais.${closing}`,
  },
  {
    subject: 'Dernière relance : facture {numero} en attente de règlement',
    body: `Bonjour,\n\nMalgré nos précédents messages, la facture {numero} du {date}, d'un montant de {montant}, échue depuis {jours} jours, reste à régler.\n\nSans règlement de votre part sous huit jours, nous serons contraints d'engager une procédure de recouvrement ; des pénalités de retard et l'indemnité forfaitaire de 40 € pourront être appliquées.${closing}`,
  },
];

/** Niveau de relance à proposer (le plus haut atteint et pas encore envoyé), ou null. */
export function dueReminderLevel(lateDays, history = []) {
  const sent = Math.max(0, ...history.map((h) => h.level));
  const reached = REMINDER_STEPS.filter((s) => lateDays >= s.days).at(-1);
  return reached && reached.level > sent ? reached.level : null;
}

export const renderTemplate = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);

const frDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/**
 * Adresse du client d'une facture : celle figée à l'émission, sinon celle de sa fiche (ajoutée après
 * coup) — même règle que l'envoi par la base (courriel.envoyer).
 */
export function invoiceEmail(ws, inv) {
  return inv.client?.email || ws.clients?.find((c) => c.code === inv.client?.code)?.email || '';
}

/** Message de relance (destinataire, objet, texte) pour une facture et un niveau. */
export function reminderMessage(ws, invoiceId, level, today) {
  const inv = ws.book.get(invoiceId);
  const custom = ws.company.reminderTemplates?.[level - 1];
  const template = custom?.subject && custom?.body ? custom : DEFAULT_TEMPLATES[level - 1];
  const lateDays = Math.max(0, Math.floor((Date.parse(today) - Date.parse(inv.dueDate)) / 86400000));
  const vars = {
    client: inv.client?.name || '',
    numero: inv.number,
    montant: formatEuros(ws.book.outstanding(inv)).replace(/[\u00A0\u202F]/g, ' '),
    date: frDate(inv.issueDate),
    echeance: frDate(inv.dueDate),
    jours: String(lateDays),
    entreprise: ws.company.name || '',
  };
  return { to: invoiceEmail(ws, inv), subject: renderTemplate(template.subject, vars), body: renderTemplate(template.body, vars) };
}

/** Méthodes installées sur Workspace.prototype (voir core/workspace.js). */
export const reminderMethods = {
  reminderHistory(invoiceId) {
    return this.company.reminders?.[invoiceId] || [];
  },
  /** Relance envoyée : conservée dans l'historique de la facture. */
  recordReminder(invoiceId, { level, date }) {
    this.book.get(invoiceId);
    this.company.reminders = { ...(this.company.reminders || {}), [invoiceId]: [...this.reminderHistory(invoiceId), { level, date }] };
  },
};
