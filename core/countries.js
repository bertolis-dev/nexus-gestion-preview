/**
 * Zones géographiques pour la TVA. Liste des États membres de l'Union européenne au 01/01/2026
 * (codes ISO 3166-1 alpha-2 ; la Grèce est « GR » en ISO et « EL » dans les numéros de TVA) — à tenir
 * à jour et à valider par l'expert-comptable référent. Monaco fait partie du territoire fiscal français
 * pour la TVA.
 */
export const EU_COUNTRIES_2026 = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
]);

/** 'FR' (France et Monaco), 'UE' (autre État membre) ou 'HORS_UE'. */
export function tradeZone(country) {
  const c = String(country || 'FR').toUpperCase();
  if (c === 'FR' || c === 'MC') return 'FR';
  return EU_COUNTRIES_2026.has(c) || c === 'EL' ? 'UE' : 'HORS_UE';
}
