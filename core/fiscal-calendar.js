/**
 * Calendrier fiscal et juridique de l'entreprise : les échéances autres que la TVA et l'URSSAF (déjà
 * suivies ailleurs) — impôt sur les sociétés, déclaration de résultats, honoraires versés (DAS2), CFE,
 * approbation et dépôt des comptes, déclaration de revenus du dirigeant. Dates indicatives pour un
 * exercice standard, à confirmer chaque année (calendrier publié sur impots.gouv.fr).
 */

import { sum } from './money.js?v=d415f7a';
import { corporateTaxSchedule } from './istax.js?v=d415f7a';
import { categoryById } from './pcg.js?v=d415f7a';

/** Seuil de déclaration des honoraires, commissions et droits d'auteur versés (DAS2) : 1 200 € TTC par an et par bénéficiaire. */
export const DAS2_THRESHOLD = 120000;
/** Catégories de dépenses concernées par la DAS2 (comptes 6226, 6222, 6516). */
const DAS2_ACCOUNTS = ['622600', '622200', '651600'];

/** Dernier jour du mois `m` (1-12) de l'année `y`, en tenant compte des débordements de mois. */
const endOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
const addMonthsEnd = (iso, months) => {
  const [y, m] = iso.split('-').map(Number);
  return endOfMonth(y, m + months);
};
const addDaysIso = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/**
 * Date limite de la déclaration de résultats (liasse) d'un exercice clos le `end` : vers le 20 mai pour
 * un exercice civil (2ᵉ jour ouvré après le 1er mai, plus 15 jours en ligne), sinon 3 mois après la
 * clôture plus 15 jours.
 */
export function resultsDeadline(end) {
  if (end.slice(5) === '12-31') return `${Number(end.slice(0, 4)) + 1}-05-20`;
  return addDaysIso(addMonthsEnd(end, 3), 15);
}

/** Bénéficiaires d'honoraires à déclarer (DAS2) sur l'exercice : total TTC versé au-delà du seuil. */
export function das2Beneficiaries(purchases, { start, end }) {
  const totals = new Map();
  for (const p of purchases) {
    if (p.date < start || p.date > end) continue;
    const concerned = p.lines.filter((l) => DAS2_ACCOUNTS.includes(categoryById(l.categoryId)?.account));
    if (!concerned.length) continue;
    const ttc = sum(concerned.map((l) => l.ht + (Number.isSafeInteger(l.vat) ? l.vat : 0))) * (p.type === 'credit' ? -1 : 1);
    const key = p.supplier.name.trim();
    totals.set(key, (totals.get(key) || 0) + ttc);
  }
  return [...totals]
    .filter(([, total]) => total > DAS2_THRESHOLD)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Échéances des `days` prochains jours à partir de `today`, triées par date.
 * @returns {{ date: string, kind: string, label: string, detail: string, amount?: number }[]}
 */
export function fiscalCalendar(ws, today, { days = 365 } = {}) {
  const c = ws.company;
  const fy = c.fiscalYear;
  const until = addDaysIso(today, days);
  const micro = c.taxRegime?.startsWith('micro');
  const isCorp = c.taxRegime === 'is-reel';
  const out = [];
  const add = (date, kind, label, detail, amount) => {
    if (date >= today && date <= until) out.push({ date, kind, label, detail, ...(amount ? { amount } : {}) });
  };
  // Exercices dont une échéance peut tomber dans la fenêtre : celui qui vient de se terminer et le courant.
  const prevEnd = addDaysIso(fy.start, -1);
  const ends = [prevEnd, fy.end];

  if (isCorp) {
    for (const o of corporateTaxSchedule(ws, today))
      add(o.date, 'is', o.label, 'Impôt sur les sociétés, payé en ligne depuis votre espace professionnel impots.gouv.fr.', -o.amount);
  }
  if (!micro) {
    for (const end of ends) {
      const year = end.slice(0, 4);
      const deadline = resultsDeadline(end);
      add(
        deadline,
        'liasse',
        `Déclaration de résultats ${year} (liasse fiscale${isCorp ? ' 2065 et 2033' : ' 2031 ou 2035'})`,
        'Préparée avec votre expert-comptable à partir du bilan et du compte de résultat (écran Clôture). Date indicative : le calendrier exact est publié chaque année.',
      );
      const start = end === fy.end ? fy.start : `${Number(fy.start.slice(0, 4)) - 1}${fy.start.slice(4)}`;
      const das2 = das2Beneficiaries(ws.purchases, { start, end });
      if (das2.length)
        add(
          deadline,
          'das2',
          `Honoraires versés en ${year} à déclarer (DAS2) : ${das2.length} bénéficiaire${das2.length > 1 ? 's' : ''}`,
          `Plus de 1 200 € versés à : ${das2.map((d) => d.name).join(', ')}. Déclaration en même temps que la liasse.`,
        );
      if (c.legalForm !== 'EI') {
        add(addMonthsEnd(end, 6), 'ag', `Approbation des comptes ${year}`, 'Assemblée (ou décision de l’associé unique) dans les 6 mois suivant la clôture.');
        add(
          addMonthsEnd(end, 7),
          'greffe',
          `Dépôt des comptes ${year} au greffe`,
          'Un mois après l’approbation (deux mois en ligne), sur le guichet unique de l’INPI.',
        );
      }
    }
  }
  // Déclaration de revenus du dirigeant (entrepreneur individuel, micro ou réel) : fin mai à début juin.
  if (micro || c.legalForm === 'EI') {
    const y = Number(today.slice(0, 4));
    for (const year of [y, y + 1])
      add(
        `${year}-05-31`,
        'ir',
        `Déclaration de revenus ${year - 1} (avec la 2042-C-PRO)`,
        'Vos revenus professionnels sont déclarés sur votre déclaration personnelle. Date limite selon votre département (fin mai à début juin).',
      );
  }
  // CFE : avis à consulter en ligne, paiement au 15 décembre (pas de CFE l'année de création).
  const y = Number(today.slice(0, 4));
  for (const year of [y, y + 1])
    add(
      `${year}-12-15`,
      'cfe',
      `Cotisation foncière des entreprises (CFE) ${year}`,
      'Avis disponible en novembre dans votre espace professionnel impots.gouv.fr ; aucune CFE l’année de création.',
    );
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

/** Échéances des 15 prochains jours pour la liste « À faire ». */
export function fiscalTodo(ws, today) {
  return fiscalCalendar(ws, today, { days: 15 }).map((e) => ({
    urgency: 2,
    kind: 'fiscal',
    view: 'pilotage',
    text: `${e.label} — avant le ${e.date.split('-').reverse().join('/')}`,
  }));
}
