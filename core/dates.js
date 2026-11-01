/**
 * Dates civiles françaises. Une date comptable est une date à Paris, pas en UTC :
 * `new Date().toISOString().slice(0, 10)` renvoie la veille entre minuit et 1 h (2 h en été).
 * Les dates sont des chaînes « AAAA-MM-JJ » ; l'arithmétique se fait en UTC sur ces chaînes,
 * sans dépendre du fuseau de la machine ni des changements d'heure.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PARIS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Vraie date du calendrier au format « AAAA-MM-JJ » (refuse le 30 février ou le 31 avril). */
export function isCalendarDate(s) {
  if (!ISO_DATE.test(s || '')) return false;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === s;
}

/** Date civile à Paris d'un instant (par défaut : maintenant). */
export function todayParis(now = new Date()) {
  const p = Object.fromEntries(PARIS.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Date civile à Paris d'un horodatage ISO (ex. date de validation d'une écriture) ; '' si absent. */
export function parisDateOf(timestamp) {
  return timestamp ? todayParis(new Date(timestamp)) : '';
}

/** Date civile + n jours. */
export function addDays(isoDate, days) {
  if (!ISO_DATE.test(isoDate || '')) throw new Error(`Date invalide : ${isoDate}`);
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Même jour un an plus tard ; un dernier jour de mois reste un dernier jour de mois (28/02 → 29/02). */
function sameDayNextYear(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const last = d === lastDayOf(y, m);
  return iso(y + 1, m, last ? lastDayOf(y + 1, m) : Math.min(d, lastDayOf(y + 1, m)));
}

/** Exercice qui suit : du lendemain de la clôture à la même date de fin l'année suivante. */
export function nextFiscalYear(fy) {
  return { start: addDays(fy.end, 1), end: sameDayNextYear(fy.end) };
}

/**
 * Premier exercice : 12 mois se terminant à la date choisie, ou du début d'activité à cette date
 * (premier exercice long possible, 24 mois au plus — à valider par l'expert-comptable).
 */
export function firstFiscalYear({ end, activityStart = null }) {
  const [y, m, d] = end.split('-').map(Number);
  const twelve = addDays(iso(y - 1, m, d === lastDayOf(y, m) ? lastDayOf(y - 1, m) : Math.min(d, lastDayOf(y - 1, m))), 1);
  if (!activityStart) return { start: twelve, end };
  if (activityStart > end) throw new Error('La fin du premier exercice doit être après le début d’activité.');
  const earliest = addDays(iso(y - 2, m, d === lastDayOf(y, m) ? lastDayOf(y - 2, m) : Math.min(d, lastDayOf(y - 2, m))), 1);
  if (activityStart < earliest) throw new Error('Le premier exercice ne peut pas dépasser 24 mois : choisissez une date de fin plus proche.');
  return { start: activityStart, end };
}
