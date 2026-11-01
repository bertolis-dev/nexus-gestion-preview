/**
 * Entreprise : forme juridique d'après l'annuaire des entreprises, numéro de TVA intracommunautaire,
 * fiche créée à partir des réponses de l'assistant d'installation (§3.1).
 */

import { firstFiscalYear } from './dates.js?v=d415f7a';

/** Formes juridiques prises en charge par Nexus Gestion (contrôlées aussi en base). */
export const SUPPORTED_LEGAL_FORMS = ['EI', 'EURL', 'SARL', 'SAS', 'SASU'];

// Catégories juridiques de l'INSEE : 1xxx = personne physique (entreprise individuelle).
const NATURES = { 5498: 'EURL', 5499: 'SARL', 5710: 'SAS', 5720: 'SASU' };

/** Forme juridique d'après la catégorie juridique INSEE, ou null si elle n'est pas prise en charge. */
export function legalFormFromNature(code) {
  const n = String(code ?? '');
  if (/^1\d{3}$/.test(n)) return 'EI';
  return NATURES[n] || null;
}

/** Fiche issue de l'API Recherche d'entreprises (premier résultat pour ce SIREN). */
export function companyFromSearch(result, siren) {
  if (!result || result.siren !== siren) throw new Error('Aucune entreprise trouvée pour ce SIREN');
  const full = result.nom_complet || '';
  // L'API ajoute le sigle entre parenthèses, même quand il répète le nom (« QONTO (QONTO) »).
  const name = full.replace(/\s*\(([^)]*)\)$/, (m, sigle) => (full.startsWith(sigle) ? '' : m));
  const legalForm = legalFormFromNature(result.nature_juridique);
  const company = { name, address: result.siege?.adresse || '', legalForm };
  if (!legalForm) {
    company.warning = `Nexus Gestion prend en charge les EI, EURL, SARL, SAS et SASU : la forme juridique de cette entreprise (catégorie ${result.nature_juridique || 'inconnue'}) n'en fait pas partie.`;
  }
  return company;
}

/** Numéro de TVA intracommunautaire français : FR + clé (12 + 3 × (SIREN mod 97)) mod 97 + SIREN. */
export const vatNumberFromSiren = (siren) => `FR${String((12 + 3 * (Number(siren) % 97)) % 97).padStart(2, '0')}${siren}`;

/** Fiche de l'entreprise à partir des réponses de l'assistant (régimes fiscal et de TVA déduits). */
export function companyFromOnboarding(d) {
  if (!SUPPORTED_LEGAL_FORMS.includes(d.legalForm)) throw new Error('Choisissez une forme juridique prise en charge (EI, EURL, SARL, SAS ou SASU).');
  const siren = String(d.siren || '').replace(/\s/g, '');
  const micro = d.legalForm === 'EI' && d.micro === 'oui';
  const vatRegime = d.chargesVat === 'non' ? 'franchise' : d.vatFrequency === 'annuelle' ? 'reel-simplifie' : 'reel-normal';
  return {
    name: String(d.name || '').trim(),
    siren,
    address: String(d.address || '').trim(),
    legalForm: d.legalForm,
    capital: '',
    vatRegime,
    vatNumber: vatRegime === 'franchise' ? '' : vatNumberFromSiren(siren),
    vatOnDebits: false,
    taxRegime: micro ? (d.nature === 'biens' ? 'micro-bic' : 'micro-bnc') : d.legalForm === 'EI' ? 'ir-reel' : 'is-reel',
    microActivity: d.nature === 'biens' ? 'bic-vente' : 'bnc',
    defaultNature: d.nature === 'biens' ? 'biens' : 'services',
    fiscalYear: firstFiscalYear({ end: d.fyEnd, activityStart: d.activityStart || null }),
    paymentTermsDays: 30,
    activityStart: d.activityStart || null,
  };
}

/**
 * Entreprise à ouvrir après la connexion : la seule, ou la dernière ouverte si elle est toujours
 * accessible ; sinon null (l'utilisateur choisit dans la liste).
 */
export function pickStructure(structures, lastId) {
  if (structures.length === 1) return structures[0].id;
  return structures.some((s) => s.id === lastId) ? lastId : null;
}
