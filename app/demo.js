/**
 * Entreprise de démonstration.
 */

import { parseBankCsv } from '../core/bank.js?v=a619ec1';
import { Workspace } from '../core/workspace.js?v=a619ec1';
import { vatNumberFromSiren } from '../core/company.js?v=a619ec1';
import { render } from './render.js?v=a619ec1';
import { frDate, setWs, today, ui, ws } from './state.js?v=a619ec1';
import { save, toast } from './store.js?v=a619ec1';

// ------------------------------------------------------------------ démonstration

export function seedDemo() {
  ui.demo = true;
  const year = Number(today().slice(0, 4));
  const d = (m, day) => `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const cm = Number(today().slice(5, 7));
  const back = (months, day) => new Date(Date.UTC(year, cm - 1 - months, day)).toISOString().slice(0, 10);
  setWs(
    new Workspace({
      company: {
        name: 'Atelier Durand EURL',
        siren: '732829320',
        address: '12 rue des Lilas, 69003 Lyon',
        legalForm: 'EURL',
        registration: 'RCS Lyon',
        capital: '1 000 €',
        vatRegime: 'reel-normal',
        vatNumber: vatNumberFromSiren('732829320'),
        vatOnDebits: false,
        taxRegime: 'is-reel',
        defaultNature: 'services',
        fiscalYear: { start: d(1, 1), end: d(12, 31) },
        paymentTermsDays: 30,
        iban: 'FR76 3000 6000 0112 3456 7890 189',
      },
    }),
  );
  const martin = ws.saveClient({ name: 'Martin SAS', siren: '552100554', address: '1 place Bellecour, 69002 Lyon', email: 'compta@martin.example' });
  const bio = ws.saveClient({ name: 'Bio & Co SARL', siren: '443061841', address: '8 quai Rambaud, 69002 Lyon', email: 'factures@bioco.example' });
  ws.ledger.addDraft({
    journal: 'AN',
    date: d(1, 1),
    label: "Solde bancaire à l'ouverture",
    lines: [
      { account: '512000', debit: 850000 },
      { account: '455000', credit: 850000 },
    ],
  });
  const mk = (client, issue, due, lines) => ws.issueInvoice(ws.book.createDraft({ client, issueDate: issue, dueDate: due, lines }).id);
  const f1 = mk(martin, back(3, 5), back(2, 5), [{ label: 'Accompagnement stratégique', qty: 4, unitPrice: 65000, vatRateBp: 2000, nature: 'services' }]);
  mk(bio, back(2, 10), back(1, 9), [{ label: 'Audit des process', qty: 1, unitPrice: 180000, vatRateBp: 2000, nature: 'services' }]);
  const f3 = mk(martin, back(1, 3), back(0, 3), [
    { label: 'Atelier équipe', qty: 2, unitPrice: 90000, vatRateBp: 2000, nature: 'services' },
    { label: 'Supports imprimés', qty: 20, unitPrice: 1250, vatRateBp: 2000, nature: 'biens' },
  ]);
  ws.book.createDraft({
    client: bio,
    issueDate: today(),
    dueDate: back(-1, Number(today().slice(8, 10))),
    lines: [{ label: 'Suivi mensuel', qty: 1, unitPrice: 75000, vatRateBp: 2000, nature: 'services' }],
  });
  ws.addPurchase({ supplier: { name: 'Orange' }, date: back(2, 2), number: 'OR-2211', categoryId: 'telecom', ttc: 4799, documentName: 'orange.pdf' });
  ws.addPurchase({ supplier: { name: 'LDLC' }, date: back(2, 15), number: 'LD-9087', categoryId: 'materiel-info', ttc: 162000, documentName: 'ldlc.pdf' });
  ws.addPurchase({ supplier: { name: 'Regus' }, date: back(1, 1), number: 'RG-445', categoryId: 'loyer', ttc: 54000, documentName: 'regus.pdf' });
  const money = (c) => (c / 100).toFixed(2).replace('.', ',');
  ws.importTransactions(
    parseBankCsv(
      [
        'Date;Libellé;Montant',
        `${frDate(back(2, 8))};VIR MARTIN SAS ${f1.number};${money(f1.totals.totalTtc)}`,
        `${frDate(back(2, 4))};PRLV ORANGE OR-2211;-47,99`,
        `${frDate(back(2, 18))};CB LDLC LD-9087;-1620,00`,
        `${frDate(back(1, 2))};PRLV REGUS RG-445;-540,00`,
        `${frDate(back(1, 28))};FRAIS TENUE DE COMPTE;-9,00`,
        `${frDate(back(0, 2))};VIR MARTIN SAS ${f3.number};${money(f3.totals.totalTtc)}`,
        `${frDate(back(0, 1))};CB SNCF PARIS LYON;-89,00`,
      ].join('\n'),
    ),
  );
  for (const t of ws.transactions.slice(0, 4)) {
    const [best] = ws.suggestionsFor(t.id);
    if (best)
      ws.matchTransaction(
        t.id,
        best.docs.map((doc, i) => ({ doc, amount: best.amounts[i] })),
      );
  }
  // Un devis envoyé et un abonnement mensuel, pour que les onglets Devis et Récurrentes ne soient pas vides.
  const quote = ws.book.createDraft({
    type: 'quote',
    client: martin,
    issueDate: back(0, 1),
    dueDate: back(-1, 1),
    lines: [
      { label: 'Refonte du parcours client', qty: 3, unitPrice: 85000, vatRateBp: 2000, nature: 'services' },
      { label: 'Formation des équipes (demi-journée)', qty: 2, unitPrice: 45000, vatRateBp: 2000, nature: 'services' },
    ],
  });
  ws.issueInvoice(quote.id);
  ws.saveRecurring({
    client: bio,
    frequency: 'monthly',
    anchorDate: back(-1, 1),
    paymentDays: 30,
    lines: [{ label: 'Maintenance mensuelle', qty: 1, unitPrice: 35000, vatRateBp: 2000, nature: 'services' }],
  });
  // Pilotage : budget de l'année, temps passé à facturer et un trajet en voiture, pour des écrans parlants.
  ws.saveBudget({ ca: 9000000, externes: 1800000, achats: 400000, impots: 150000 });
  for (const [day, label, minutes] of [
    [3, 'Atelier de cadrage', 150],
    [5, 'Maquettes des écrans', 240],
    [6, 'Atelier de cadrage', 90],
  ])
    ws.saveTimeEntry({ date: back(0, day), clientId: bio.id, label, minutes, rate: 7000 });
  ws.addMileage({
    date: back(0, 4),
    km: 64,
    horsepower: 5,
    driver: 'Claire Durand',
    from: 'Lyon',
    to: 'Villefranche-sur-Saône',
    purpose: 'rendez-vous Bio & Co',
  });
  save();
  location.hash = '#/accueil';
  render();
  toast('Entreprise de démonstration chargée.');
}
