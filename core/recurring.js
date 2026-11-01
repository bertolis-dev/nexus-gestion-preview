/**
 * Factures récurrentes (§3.2) : un modèle (client, lignes, fréquence) produit une facture à
 * chaque échéance. Par défaut la facture est préparée en brouillon et apparaît dans « À faire » ;
 * avec l'émission automatique, elle est émise directement si elle est conforme (sinon elle reste
 * en brouillon, avec la liste de ce qu'il manque, comme toute facture).
 *
 * La date d'émission est celle du jour de génération, jamais une date passée : la numérotation
 * doit rester chronologique. Une échéance manquée (application non ouverte) produit sa facture au
 * rattrapage suivant, avec la période facturée dans la désignation.
 */

export const FREQUENCIES = {
  monthly: { label: 'Chaque mois', months: 1 },
  quarterly: { label: 'Chaque trimestre', months: 3 },
  yearly: { label: 'Chaque année', months: 12 },
};

/** Ajoute n mois à une date ISO en conservant le jour (ramené au dernier jour du mois si besoin). */
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Libellé de la période couverte par une échéance : « octobre 2026 », « T4 2026 », « 2026 ». */
export function periodLabel(iso, frequency) {
  const [y, m] = iso.split('-').map(Number);
  if (frequency === 'yearly') return String(y);
  if (frequency === 'quarterly') return `T${Math.ceil(m / 3)} ${y}`;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Date de la prochaine échéance. Calculée depuis la date d'ancrage (et non de proche en proche) pour
 * ne pas dériver : un 31 janvier donne 28 février puis 31 mars, jamais 28 mars.
 */
export function nextDate(t) {
  return addMonths(t.anchorDate, (t.nextIndex || 0) * FREQUENCIES[t.frequency].months);
}

export function validateTemplate(t) {
  const problems = [];
  if (!t.client?.name) problems.push('Choisissez un client.');
  if (!FREQUENCIES[t.frequency]) problems.push('Choisissez une fréquence.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.anchorDate || '')) problems.push('Indiquez la date de la première facture.');
  else if (t.endDate && t.endDate < t.anchorDate) problems.push('La date de fin précède la première facture.');
  if (!t.lines?.length || t.lines.some((l) => !l.label?.trim() || !(Number(l.qty) > 0) || !Number.isSafeInteger(l.unitPrice)))
    problems.push('Complétez les lignes (désignation, quantité, prix).');
  return problems;
}

/**
 * Échéances à facturer à la date `today` : [{ index, date }] (au plus 12 à la fois, garde-fou contre
 * un modèle très ancien réactivé par erreur).
 */
export function dueOccurrences(t, today) {
  if (!t.active) return [];
  const out = [];
  for (let index = t.nextIndex || 0; out.length < 12; index++) {
    const date = addMonths(t.anchorDate, index * FREQUENCIES[t.frequency].months);
    if (date > today || (t.endDate && date > t.endDate)) break;
    out.push({ index, date });
  }
  return out;
}
