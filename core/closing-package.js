/**
 * Dossier de clôture pour l'expert-comptable : un ZIP avec le FEC, la balance, le grand livre et la
 * check-list de clôture de l'exercice en cours. Le FEC n'est inclus que si toutes les écritures sont
 * validées (il ne peut contenir que des écritures définitives) ; sinon la check-list le signale.
 */

import { closingChecklist, fiscalYearLabel } from './closing.js?v=a619ec1';
import { generalLedgerCsv, trialBalanceCsv } from './exports.js?v=a619ec1';
import { encodeLatin9, exportFEC } from './reports.js?v=a619ec1';
import { createZip } from './zip.js?v=a619ec1';

const utf8 = (s) => new TextEncoder().encode(s);
const frDate = (iso) => iso.split('-').reverse().join('/');

/** @returns {{ fileName, fiscalYear, files: {name, data}[], zip: Uint8Array, fecIncluded: boolean }} */
export function closingPackage(ws, { today, date = new Date() }) {
  const { siren, name } = ws.company;
  const fy = ws.company.fiscalYear;
  const label = fiscalYearLabel(fy);
  const files = [];
  let fecNote = '';
  const drafts = ws.ledger.entries.filter((e) => e.status !== 'validated').length;
  if (drafts)
    fecNote = `FEC non inclus : ${drafts} écriture(s) non validée(s). Validez les écritures (page Comptabilité) puis téléchargez de nouveau le dossier.`;
  else {
    const fec = exportFEC(ws.ledger, { siren, closingDate: fy.end });
    files.push({ name: fec.fileName, data: encodeLatin9(fec.content) });
  }
  files.push({ name: `balance-${siren}-${label}.csv`, data: utf8(trialBalanceCsv(ws.ledger)) });
  files.push({ name: `grand-livre-${siren}-${label}.csv`, data: utf8(generalLedgerCsv(ws.ledger)) });
  const items = closingChecklist(ws, { today });
  const text = [
    `Dossier de clôture — ${name} — SIREN ${siren}`,
    `Exercice du ${frDate(fy.start)} au ${frDate(fy.end)} — préparé le ${frDate(today)} avec Nexus Gestion`,
    '',
    'Check-list de clôture',
    ...items.map((i) => `[${i.ok ? 'OK' : 'À FAIRE'}] ${i.label}${i.detail ? ` — ${i.detail}` : ''}`),
    ...(fecNote ? ['', fecNote] : []),
    '',
  ].join('\r\n');
  files.push({ name: `check-list-cloture-${label}.txt`, data: utf8(text) });
  return { fileName: `dossier-cloture-${siren}-${label}.zip`, fiscalYear: label, files, zip: createZip(files, { date }), fecIncluded: !drafts };
}
