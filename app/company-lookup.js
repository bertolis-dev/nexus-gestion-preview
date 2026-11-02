/**
 * Données publiques des entreprises (API Recherche d’entreprises, État, gratuite, sans clé) — §3.1
 * étape 1. L'interprétation du résultat (forme juridique, nom) est dans core/company.js.
 */

import { companyFromSearch } from '../core/company.js?v=a619ec1';

/** Fiche brute de l'annuaire pour ce SIREN (premier résultat), ou null. */
export async function searchCompany(siren) {
  let r;
  try {
    r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(siren)}&page=1&per_page=1`);
  } catch {
    throw new Error('Annuaire des entreprises injoignable (connexion internet ?)');
  }
  if (!r.ok) throw new Error(`Service indisponible (${r.status})`);
  const first = (await r.json()).results?.[0];
  return first?.siren === siren ? first : null;
}

export async function lookupSiren(siren) {
  return companyFromSearch(await searchCompany(siren), siren);
}
