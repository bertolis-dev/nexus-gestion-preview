/**
 * Indemnités kilométriques du dirigeant (véhicule personnel utilisé pour l'entreprise), au barème
 * fiscal publié chaque année par l'administration. Le barème dépend de la distance parcourue sur
 * l'année entière : chaque trajet vaut la différence entre le barème après lui et avant lui, si bien
 * que la somme des trajets de l'année est toujours égale au barème appliqué au total.
 */

import { divRound } from './money.js?v=d415f7a';

/**
 * Barème des voitures, en millièmes d'euro par km : [jusqu'à 5 000 km, de 5 001 à 20 000 km (taux, fixe en
 * centimes), au-delà]. Barème 2025, reconduit tant qu'un barème plus récent n'est pas ajouté ici.
 */
export const CAR_SCALE = {
  2025: {
    3: { low: 529, mid: [316, 106500], high: 370 },
    4: { low: 606, mid: [340, 133000], high: 407 },
    5: { low: 636, mid: [357, 139500], high: 427 },
    6: { low: 665, mid: [374, 145700], high: 447 },
    7: { low: 697, mid: [394, 151500], high: 470 },
  },
};
/** Majoration du barème pour un véhicule 100 % électrique. */
export const ELECTRIC_BONUS_PCT = 20;
export const HORSEPOWER_CHOICES = [3, 4, 5, 6, 7];

export class MileageError extends Error {}

/** Barème applicable à une année (le plus récent connu qui ne la dépasse pas, sinon le plus ancien). */
export function scaleYear(year) {
  const years = Object.keys(CAR_SCALE)
    .map(Number)
    .sort((a, b) => a - b);
  return years.filter((y) => y <= year).at(-1) ?? years[0];
}

/** Barème annuel en centimes pour `km` parcourus dans l'année. */
export function annualAllowance(km, horsepower, { year, electric = false } = {}) {
  const row = CAR_SCALE[scaleYear(year)][Math.min(7, Math.max(3, Math.trunc(horsepower) || 3))];
  const d = Math.max(0, Number(km) || 0);
  const tenths = Math.round(d * 10); // distance au dixième de km : calcul en entiers
  const base = d <= 5000 ? divRound(tenths * row.low, 100) : d <= 20000 ? divRound(tenths * row.mid[0], 100) + row.mid[1] : divRound(tenths * row.high, 100);
  return electric ? base + divRound(base * ELECTRIC_BONUS_PCT, 100) : base;
}

/**
 * Indemnité d'un trajet, compte tenu des kilomètres déjà parcourus dans l'année avec le même véhicule.
 * @returns {{ amount: number, scaleYear: number }}
 */
export function tripAllowance({ km, horsepower, electric, kmBefore = 0, year }) {
  const d = Number(km);
  if (!Number.isFinite(d) || d <= 0) throw new MileageError('Indiquez le nombre de kilomètres parcourus.');
  if (d > 10000) throw new MileageError('Un trajet de plus de 10 000 km : vérifiez la distance.');
  if (!HORSEPOWER_CHOICES.includes(Number(horsepower))) throw new MileageError('Choisissez la puissance fiscale du véhicule (carte grise, case P.6).');
  const opts = { year, electric };
  return { amount: annualAllowance(kmBefore + d, horsepower, opts) - annualAllowance(kmBefore, horsepower, opts), scaleYear: scaleYear(year) };
}

/** Trajets de l'année déjà enregistrés (ligne de dépense marquée `mileage`), avant une date, pour un véhicule. */
export function kmBeforeTrip(purchases, { date, vehicle }) {
  const year = date.slice(0, 4);
  return purchases
    .filter((p) => p.lines[0]?.mileage?.vehicle === vehicle && p.date.slice(0, 4) === year && p.date <= date)
    .reduce((s, p) => s + p.lines[0].mileage.km, 0);
}
