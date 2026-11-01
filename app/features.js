/**
 * Pages « Fonctionnalités » du site public (une page par carte de la page d'accueil).
 * Les captures (app/features/*.webp) sont prises sur la démonstration par scripts/screenshots.mjs :
 * relancer ce script après toute évolution visible d'un écran.
 * Règle de rédaction : ne décrire que ce que l'application fait réellement aujourd'hui ; ce qui
 * dépend d'un partenaire pas encore branché est annoncé comme tel.
 */
import factures from './site/pages/factures.js?v=e821f3b';
import devis from './site/pages/devis.js?v=e821f3b';
import banque from './site/pages/banque.js?v=e821f3b';
import depenses from './site/pages/depenses.js?v=e821f3b';
import tva from './site/pages/tva.js?v=e821f3b';
import micro from './site/pages/micro.js?v=e821f3b';
import relances from './site/pages/relances.js?v=e821f3b';
import compta from './site/pages/compta.js?v=e821f3b';
import cloture from './site/pages/cloture.js?v=e821f3b';
import securite from './site/pages/securite.js?v=e821f3b';
import conformite from './site/pages/conformite.js?v=e821f3b';
import pilotage from './site/pages/pilotage.js?v=e821f3b';

/** Ordre d'affichage sur la page d'accueil. */
export const FEATURE_PAGES = [factures, devis, banque, depenses, tva, micro, relances, compta, cloture, pilotage, securite, conformite];

export const featureBySlug = (slug) => FEATURE_PAGES.find((f) => f.slug === slug);
