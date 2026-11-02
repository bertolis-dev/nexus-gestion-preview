/**
 * Connecteur URSSAF (micro-entrepreneur) : une seule interface pour les écrans, quelle que soit
 * l'implémentation.
 *  - Aujourd'hui : `createManualConnector`, qui vérifie et prépare les données, puis guide
 *    l'utilisateur vers son espace autoentrepreneur.urssaf.fr.
 *  - Demain : un connecteur à l'API « Tierce déclaration auto-entrepreneur » (docs/02), avec la même
 *    interface, pour déclarer et payer sans quitter Nexus. Les écrans n'auront pas à changer.
 *
 * Interface d'un connecteur :
 *   kind                               'manual' | 'api'
 *   checkIdentity(siret, today)        → { ok, identity?, warnings[], error? }
 *   checkAccount({ accountNumber, hasSpace, identity })
 *                                      → { ok, accountNumber?, verified, steps[], error? }
 *   declare(period)                    → { mode, url?, steps[] }
 *   status(link)                       → { linked, prepared, label }
 * Une erreur est toujours { code, message, causes? } avec un message qui dit quoi faire.
 *
 * Pur JavaScript : l'appel à l'annuaire des entreprises est injecté (`lookupCompany`), pour que ce
 * module reste testable sans réseau.
 */

import { isValidSiren } from '../invoices.js?v=a619ec1';

export const URSSAF_SPACE_URL = 'https://www.autoentrepreneur.urssaf.fr/portail/accueil.html';
export const URSSAF_CREATE_SPACE_URL = 'https://www.autoentrepreneur.urssaf.fr/portail/accueil/creer-votre-compte-etape-1.html';
/** En dessous de cette ancienneté, le compte URSSAF peut ne pas être encore ouvert. */
export const RECENT_REGISTRATION_DAYS = 90;

/**
 * Numéro de compte cotisant sur 18 chiffres : retire les espaces et complète en insérant des 0 après
 * les 3 premiers chiffres (« 747 123456789 » → « 747000000123456789 »).
 */
export function padUrssafAccount(raw) {
  const digits = String(raw ?? '').replace(/\s/g, '');
  if (!digits)
    return {
      ok: false,
      value: '',
      message: 'Saisissez votre numéro de compte cotisant : il figure sur les courriers de l’URSSAF et dans votre espace en ligne.',
    };
  if (!/^\d+$/.test(digits))
    return { ok: false, value: digits, message: 'Le numéro de compte cotisant ne contient que des chiffres : retirez les lettres, tirets ou points.' };
  if (digits.length > 18)
    return {
      ok: false,
      value: digits,
      message: `Ce numéro compte ${digits.length} chiffres, au lieu de 18 : vérifiez que vous n’avez pas saisi votre SIRET ou un chiffre en trop.`,
    };
  if (digits.length < 4)
    return {
      ok: false,
      value: digits,
      message: 'Ce numéro est trop court : recopiez-le en entier depuis un courrier de l’URSSAF (3 chiffres, puis la suite).',
    };
  const value = digits.slice(0, 3) + '0'.repeat(18 - digits.length) + digits.slice(3);
  return { ok: true, value, message: '' };
}

/** SIRET : 14 chiffres, dont les 9 premiers forment un SIREN valide. */
export function parseSiret(raw) {
  const siret = String(raw ?? '').replace(/\s/g, '');
  if (!/^\d{14}$/.test(siret))
    return { ok: false, message: 'Le SIRET compte 14 chiffres : votre SIREN (9 chiffres) suivi du numéro d’établissement (5 chiffres).' };
  if (!isValidSiren(siret.slice(0, 9))) return { ok: false, message: 'Ce SIRET ne semble pas valide : vérifiez les 9 premiers chiffres (votre SIREN).' };
  return { ok: true, siret, siren: siret.slice(0, 9) };
}

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/**
 * Causes probables d'un compte introuvable, de la plus probable à la moins probable, avec l'action
 * à mener pour chacune. `context` : { identity, hasSpace }.
 */
export function accountNotFoundCauses({ identity = null, hasSpace = null } = {}) {
  const causes = [];
  if (hasSpace === false) {
    causes.push({
      cause: 'Vous n’avez pas encore d’espace en ligne sur autoentrepreneur.urssaf.fr.',
      action: 'Créez-le avec votre SIRET et votre numéro de compte cotisant, puis revenez ici.',
      url: URSSAF_CREATE_SPACE_URL,
    });
  }
  if (identity?.recent) {
    causes.push({
      cause: `Votre entreprise a été immatriculée il y a ${identity.ageDays} jours : votre compte URSSAF n’est peut-être pas encore ouvert.`,
      action: 'Attendez le courrier de l’URSSAF confirmant votre immatriculation (il contient votre numéro de compte cotisant), puis réessayez.',
    });
  }
  if (identity && !identity.active) {
    causes.push({
      cause: 'L’annuaire des entreprises indique que cette entreprise est fermée.',
      action: 'Vérifiez le SIRET saisi : s’il s’agit d’une ancienne activité, utilisez celui de votre micro-entreprise actuelle.',
    });
  }
  causes.push({
    cause: 'Le numéro de compte cotisant a été mal recopié.',
    action: 'Recopiez les 18 chiffres depuis un courrier de l’URSSAF ou depuis la rubrique « Mon compte » de votre espace en ligne.',
  });
  causes.push({
    cause: 'Le numéro appartient à une autre activité (ancienne entreprise, activité salariée).',
    action: 'Utilisez le numéro de compte cotisant rattaché à votre micro-entreprise actuelle.',
  });
  return causes;
}

/**
 * Connecteur manuel. `lookupCompany(siren)` renvoie la fiche de l'annuaire des entreprises
 * (format de l'API Recherche d'entreprises) ou null si introuvable, et lève une erreur si le service
 * ne répond pas.
 */
export function createManualConnector({ lookupCompany, recentDays = RECENT_REGISTRATION_DAYS } = {}) {
  return {
    kind: 'manual',

    async checkIdentity(rawSiret, today) {
      const parsed = parseSiret(rawSiret);
      if (!parsed.ok) return { ok: false, warnings: [], error: { code: 'siret-invalid', message: parsed.message } };
      let record;
      try {
        record = await lookupCompany(parsed.siren);
      } catch {
        return {
          ok: false,
          warnings: [],
          error: { code: 'service-unavailable', message: 'L’annuaire des entreprises ne répond pas pour le moment : réessayez dans quelques minutes.' },
        };
      }
      if (!record || record.siren !== parsed.siren) {
        return {
          ok: false,
          warnings: [],
          error: { code: 'not-found', message: 'Aucune entreprise ne correspond à ce SIRET dans l’annuaire des entreprises : vérifiez les chiffres saisis.' },
        };
      }
      const createdOn = record.date_creation || null;
      const ageDays = createdOn ? daysBetween(createdOn, today) : null;
      const identity = {
        siret: parsed.siret,
        siren: parsed.siren,
        name: record.nom_complet || '',
        active: record.etat_administratif === 'A',
        createdOn,
        ageDays,
        recent: ageDays !== null && ageDays < recentDays,
      };
      const warnings = [];
      if (!identity.active) {
        return {
          ok: false,
          identity,
          warnings,
          error: {
            code: 'closed',
            message: 'L’annuaire des entreprises indique que cette entreprise est fermée : vérifiez le SIRET, ou utilisez celui de votre activité actuelle.',
          },
        };
      }
      const known = [record.siege?.siret, ...(record.matching_etablissements || []).map((e) => e.siret)].filter(Boolean);
      if (known.length && !known.includes(parsed.siret)) {
        warnings.push('Ce SIRET ne correspond pas au siège de l’entreprise connu de l’annuaire : vérifiez le numéro d’établissement (5 derniers chiffres).');
      }
      if (identity.recent) {
        warnings.push(
          `Entreprise immatriculée il y a ${ageDays} jours : votre compte URSSAF peut ne pas être encore ouvert. Attendez le courrier de l’URSSAF avec votre numéro de compte cotisant.`,
        );
      }
      return { ok: true, identity, warnings };
    },

    checkAccount({ accountNumber, hasSpace, identity = null }) {
      if (hasSpace === false) {
        return {
          ok: false,
          verified: false,
          steps: [
            'Ouvrez autoentrepreneur.urssaf.fr et choisissez « Créer mon espace ».',
            'Saisissez votre SIRET et votre numéro de compte cotisant (sur le courrier de l’URSSAF).',
            'Activez l’espace avec le lien reçu par e-mail, puis revenez ici.',
          ],
          error: {
            code: 'no-space',
            message: 'Créez d’abord votre espace sur autoentrepreneur.urssaf.fr : c’est lui que Nexus reliera.',
            url: URSSAF_CREATE_SPACE_URL,
          },
        };
      }
      const padded = padUrssafAccount(accountNumber);
      if (!padded.ok) return { ok: false, verified: false, steps: [], error: { code: 'account-invalid', message: padded.message } };
      // Le connecteur manuel ne peut pas interroger l'URSSAF : le numéro est vérifié dans sa forme,
      // puis confirmé lors du raccordement à l'API.
      return {
        ok: true,
        accountNumber: padded.value,
        verified: false,
        steps: [
          identity?.recent
            ? 'Numéro enregistré. Votre immatriculation étant récente, il sera confirmé auprès de l’URSSAF lors du raccordement.'
            : 'Numéro enregistré : il sera confirmé auprès de l’URSSAF lors du raccordement.',
        ],
      };
    },

    declare(period) {
      return {
        mode: 'manual',
        url: URSSAF_SPACE_URL,
        steps: [
          period?.label
            ? `Déclarez votre chiffre d’affaires ${period.label} sur votre espace URSSAF.`
            : 'Déclarez votre chiffre d’affaires sur votre espace URSSAF.',
          'Validez le paiement par prélèvement.',
          'Reportez dans Nexus le montant des cotisations calculé par l’URSSAF.',
        ],
      };
    },

    status(link) {
      const prepared = Boolean(link?.identity?.active && link?.accountNumber && link?.hasSpace);
      return {
        linked: false,
        prepared,
        label: prepared
          ? 'Données prêtes : le raccordement se fera dès l’ouverture du service de l’URSSAF.'
          : 'Préparez le raccordement : SIRET, espace URSSAF et numéro de compte cotisant.',
      };
    },
  };
}
