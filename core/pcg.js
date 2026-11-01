/**
 * Plan comptable général (règlement ANC 2014-03), sous-ensemble utile à une TPE.
 * Chaque compte porte un libellé officiel (mode avancé) et un libellé courant (vues standard, §5) :
 * l'utilisateur ne voit jamais « 401 » ni « lettrage » tant qu'il n'active pas le mode avancé.
 * Le plan est paramétrable par structure : `buildChart(extra)` ajoute des sous-comptes.
 */

export const ACCOUNTS = [
  // Classe 1 — capitaux
  ['101000', 'Capital', 'Capital de la société'],
  ['108000', "Compte de l'exploitant", 'Apports et retraits personnels'],
  ['106100', 'Réserve légale', 'Réserve légale'],
  ['106800', 'Autres réserves', 'Bénéfices mis en réserve'],
  ['110000', 'Report à nouveau (solde créditeur)', 'Bénéfices des années précédentes'],
  ['119000', 'Report à nouveau (solde débiteur)', 'Pertes des années précédentes'],
  ['120000', "Résultat de l'exercice (bénéfice)", "Bénéfice de l'année"],
  ['129000', "Résultat de l'exercice (perte)", "Perte de l'année"],
  ['164000', 'Emprunts auprès des établissements de crédit', 'Emprunts bancaires'],
  // Classe 2 — immobilisations
  ['205000', 'Concessions, brevets, logiciels', 'Logiciels achetés (durables)'],
  ['215400', 'Matériel industriel', 'Machines et outillage'],
  ['218200', 'Matériel de transport', 'Véhicules'],
  ['218300', 'Matériel de bureau et informatique', 'Ordinateurs et matériel de bureau'],
  ['218400', 'Mobilier', 'Mobilier'],
  ['280500', 'Amortissements des logiciels', 'Usure des logiciels'],
  ['281540', 'Amortissements du matériel industriel', 'Usure des machines'],
  ['281820', 'Amortissements du matériel de transport', 'Usure des véhicules'],
  ['281830', 'Amortissements du matériel de bureau et informatique', 'Usure du matériel informatique'],
  ['281840', 'Amortissements du mobilier', 'Usure du mobilier'],
  // Classe 4 — tiers
  ['401000', 'Fournisseurs', 'Ce que je dois à mes fournisseurs'],
  ['404000', "Fournisseurs d'immobilisations", "Ce que je dois pour mes achats d'équipement"],
  ['408000', 'Fournisseurs - factures non parvenues', 'Factures fournisseurs attendues'],
  ['411000', 'Clients', 'Ce que mes clients me doivent'],
  ['416000', 'Clients douteux ou litigieux', 'Clients en litige'],
  ['418000', 'Clients - produits non encore facturés', 'Ventes à facturer'],
  ['419100', 'Clients - avances et acomptes reçus', 'Acomptes reçus de clients'],
  ['421000', 'Personnel - rémunérations dues', 'Salaires à payer'],
  ['431000', 'Sécurité sociale', 'Cotisations sociales à payer'],
  ['437000', 'Autres organismes sociaux', 'Cotisations retraite, mutuelle et prévoyance à payer'],
  ['444000', 'État - impôt sur les bénéfices', 'Impôt sur les sociétés'],
  ['445510', 'TVA à décaisser', 'TVA à payer'],
  ['445200', 'TVA due intracommunautaire', 'TVA due sur achats étrangers (autoliquidation)'],
  ['445620', 'TVA déductible sur immobilisations', 'TVA récupérable sur équipements'],
  ['445660', 'TVA déductible sur autres biens et services', 'TVA récupérable sur dépenses'],
  ['445680', 'TVA déductible en attente de paiement', 'TVA récupérable au paiement (prestations)'],
  ['445670', 'Crédit de TVA à reporter', "TVA à récupérer auprès de l'État"],
  ['445710', 'TVA collectée', 'TVA facturée à mes clients'],
  ['445800', 'TVA à régulariser ou en attente', 'TVA en attente (encaissements)'],
  ['445810', 'Acomptes - régime simplifié d’imposition', 'Acomptes de TVA versés'],
  ['445860', 'Taxes sur le chiffre d’affaires sur factures non parvenues', 'TVA des factures fournisseurs à recevoir'],
  ['445870', 'Taxes sur le chiffre d’affaires sur factures à établir', 'TVA des ventes à facturer'],
  ['455000', 'Associés - comptes courants', 'Argent prêté par l’associé'],
  ['457000', 'Associés - dividendes à payer', 'Dividendes à verser'],
  ['467000', 'Autres comptes débiteurs ou créditeurs', 'Autres montants à régler'],
  ['471000', "Compte d'attente", 'À classer'],
  ['486000', "Charges constatées d'avance", "Dépenses payées d'avance"],
  ['487000', "Produits constatés d'avance", "Recettes encaissées d'avance"],
  ['491000', 'Dépréciation des comptes clients', 'Risque de clients impayés'],
  // Classe 5 — trésorerie
  ['512000', 'Banque', 'Compte bancaire'],
  // Comptes bancaires supplémentaires (un sous-compte par compte, dans l’ordre d’ajout).
  ['512100', 'Banque - compte 2', 'Compte bancaire n° 2'],
  ['512200', 'Banque - compte 3', 'Compte bancaire n° 3'],
  ['512300', 'Banque - compte 4', 'Compte bancaire n° 4'],
  ['512400', 'Banque - compte 5', 'Compte bancaire n° 5'],
  ['512500', 'Banque - compte 6', 'Compte bancaire n° 6'],
  ['512600', 'Banque - compte 7', 'Compte bancaire n° 7'],
  ['512700', 'Banque - compte 8', 'Compte bancaire n° 8'],
  ['512800', 'Banque - compte 9', 'Compte bancaire n° 9'],
  ['512900', 'Banque - compte 10', 'Compte bancaire n° 10'],
  ['530000', 'Caisse', 'Espèces'],
  ['580000', 'Virements internes', 'Transferts entre mes comptes'],
  // Classe 6 — charges
  ['601000', 'Achats de matières premières', 'Matières premières'],
  ['604000', "Achats d'études et prestations de services", 'Sous-traitance'],
  ['606100', 'Fournitures non stockables (eau, énergie)', 'Électricité, gaz, eau'],
  ['606300', "Fournitures d'entretien et petit équipement", 'Petit matériel'],
  ['606400', 'Fournitures administratives', 'Fournitures de bureau'],
  ['606800', 'Autres matières et fournitures', 'Carburant et autres fournitures'],
  ['607000', 'Achats de marchandises', 'Marchandises revendues'],
  ['613200', 'Locations immobilières', 'Loyer'],
  ['613500', 'Locations mobilières', 'Location de matériel ou de véhicule'],
  ['615000', 'Entretien et réparations', 'Entretien et réparations'],
  ['616000', "Primes d'assurance", 'Assurances'],
  ['618000', 'Divers (documentation, séminaires)', 'Documentation et formations'],
  ['622600', 'Honoraires', 'Honoraires (comptable, avocat…)'],
  ['623000', 'Publicité, publications, relations publiques', 'Publicité et marketing'],
  ['623400', 'Cadeaux à la clientèle', 'Cadeaux clients'],
  ['625100', 'Voyages et déplacements', 'Déplacements (train, avion, taxi)'],
  ['625600', 'Missions (hébergement)', 'Hôtels'],
  ['625700', 'Réceptions', 'Repas d’affaires'],
  ['626000', 'Frais postaux et de télécommunications', 'Téléphone, internet, courrier'],
  ['627000', 'Services bancaires et assimilés', 'Frais bancaires'],
  ['628000', 'Divers (cotisations, abonnements)', 'Abonnements et logiciels'],
  ['635000', 'Autres impôts, taxes et versements assimilés', 'Impôts et taxes (CFE…)'],
  ['641000', 'Rémunérations du personnel', 'Salaires'],
  ['644000', "Rémunération du travail de l'exploitant", 'Rémunération du dirigeant'],
  ['645000', 'Charges de sécurité sociale et de prévoyance', 'Cotisations sociales'],
  ['646000', "Cotisations sociales personnelles de l'exploitant", 'Cotisations sociales du dirigeant'],
  ['647400', 'Versements aux autres œuvres sociales', 'Titres-restaurant (part employeur)'],
  ['658000', 'Charges diverses de gestion courante', 'Écarts et charges diverses'],
  ['661100', 'Intérêts des emprunts et dettes', "Intérêts d'emprunt"],
  ['681110', 'Dotations aux amortissements des immobilisations incorporelles', "Usure des logiciels de l'année"],
  ['681120', 'Dotations aux amortissements des immobilisations corporelles', "Usure des équipements de l'année"],
  ['681740', 'Dotations aux provisions pour dépréciation des créances', 'Provision clients impayés'],
  ['695000', 'Impôts sur les bénéfices', 'Impôt sur les sociétés'],
  // Classe 7 — produits
  ['701000', 'Ventes de produits finis', 'Ventes de produits fabriqués'],
  ['706000', 'Prestations de services', 'Prestations de services'],
  ['707000', 'Ventes de marchandises', 'Ventes de marchandises'],
  ['708500', 'Ports et frais accessoires facturés', 'Frais de livraison facturés'],
  ['758000', 'Produits divers de gestion courante', 'Écarts et recettes diverses'],
  ['768000', 'Autres produits financiers', 'Intérêts reçus'],
].map(([number, label, plainLabel]) => ({ number, label, plainLabel, classe: Number(number[0]) }));

export function buildChart(extra = []) {
  const chart = new Map(ACCOUNTS.map((a) => [a.number, a]));
  for (const a of extra) {
    if (!/^[1-7]\d{2,}$/.test(a.number)) throw new Error(`Numéro de compte invalide : ${a.number}`);
    chart.set(a.number, { plainLabel: a.label, ...a, classe: Number(a.number[0]) });
  }
  return chart;
}

/** Comptes auxiliaires (un par client/fournisseur) : 411 + code tiers, rattaché au collectif pour le FEC. */
export function auxiliaryAccount(collective, thirdPartyCode) {
  return { collective, aux: `${collective.slice(0, 3)}${thirdPartyCode}`.toUpperCase() };
}

/**
 * Catégories de dépense proposées en langage courant (§3.3). `vatDeductiblePct` applique les
 * règles de TVA non déductible sans que l'utilisateur ait à les connaître.
 * À faire valider par l'expert-comptable référent (§2) — valeurs par défaut au 25/09/2026 :
 *  - carburant d'une voiture de tourisme : 80 % (gazole et essence, CGI art. 298-4-1°) ;
 *  - véhicule de tourisme (achat, location, entretien) : 0 % (CGI ann. II art. 206-IV-2-6°) ;
 *  - transport de personnes et hébergement : 0 % (ann. II art. 206-IV-2-3° et 4°) ;
 *  - cadeaux : déductible sous le seuil par bénéficiaire (73 € TTC), géré par `giftVatThreshold`.
 * `nature` : prestation de services (TVA déductible au paiement, sauf fournisseur ayant opté pour les
 * débits, CGI art. 271-I-2 et 269-2-c) ou bien (TVA déductible à la facture) ; modifiable par ligne.
 */
export const EXPENSE_CATEGORIES = [
  { id: 'marchandises', label: 'Marchandises à revendre', account: '607000', vatDeductiblePct: 100, nature: 'goods' },
  { id: 'matieres', label: 'Matières premières', account: '601000', vatDeductiblePct: 100, nature: 'goods' },
  { id: 'sous-traitance', label: 'Sous-traitance', account: '604000', vatDeductiblePct: 100, nature: 'services' },
  { id: 'energie', label: 'Électricité, gaz, eau', account: '606100', vatDeductiblePct: 100, nature: 'goods' },
  { id: 'petit-materiel', label: 'Petit matériel', account: '606300', vatDeductiblePct: 100, nature: 'goods' },
  { id: 'fournitures', label: 'Fournitures de bureau', account: '606400', vatDeductiblePct: 100, nature: 'goods' },
  { id: 'carburant-vu', label: 'Carburant (véhicule utilitaire)', account: '606800', vatDeductiblePct: 100, nature: 'goods' },
  { id: 'carburant-vp', label: 'Carburant (voiture)', account: '606800', vatDeductiblePct: 80, nature: 'goods' },
  { id: 'loyer', label: 'Loyer', account: '613200', vatDeductiblePct: 100, nature: 'services' },
  { id: 'location-materiel', label: 'Location de matériel', account: '613500', vatDeductiblePct: 100, nature: 'services' },
  { id: 'location-voiture', label: 'Location de voiture', account: '613500', vatDeductiblePct: 0, nature: 'services' },
  { id: 'entretien', label: 'Entretien et réparations', account: '615000', vatDeductiblePct: 100, nature: 'services' },
  { id: 'entretien-voiture', label: 'Entretien de voiture', account: '615000', vatDeductiblePct: 0, nature: 'services' },
  { id: 'assurance', label: 'Assurances', account: '616000', vatDeductiblePct: 0, nature: 'services' },
  { id: 'formation', label: 'Documentation et formations', account: '618000', vatDeductiblePct: 100, nature: 'services' },
  { id: 'honoraires', label: 'Honoraires (comptable, avocat…)', account: '622600', vatDeductiblePct: 100, nature: 'services' },
  { id: 'publicite', label: 'Publicité et marketing', account: '623000', vatDeductiblePct: 100, nature: 'services' },
  { id: 'cadeaux', label: 'Cadeaux clients', account: '623400', vatDeductiblePct: 100, giftVatThreshold: 7300, nature: 'goods' },
  { id: 'deplacements', label: 'Déplacements (train, avion, taxi)', account: '625100', vatDeductiblePct: 0, nature: 'services' },
  { id: 'indemnites-km', label: 'Indemnités kilométriques', account: '625100', vatDeductiblePct: 0, nature: 'services', internal: true },
  { id: 'hotel', label: 'Hôtels', account: '625600', vatDeductiblePct: 0, nature: 'services' },
  { id: 'repas', label: "Repas d'affaires", account: '625700', vatDeductiblePct: 100, nature: 'services' },
  { id: 'telecom', label: 'Téléphone, internet, courrier', account: '626000', vatDeductiblePct: 100, nature: 'services' },
  { id: 'banque', label: 'Frais bancaires', account: '627000', vatDeductiblePct: 100, nature: 'services' },
  { id: 'logiciel', label: 'Abonnements et logiciels', account: '628000', vatDeductiblePct: 100, nature: 'services' },
  { id: 'impots', label: 'Impôts et taxes (CFE…)', account: '635000', vatDeductiblePct: 0, nature: 'services' },
  // Titres-restaurant importés de Nexus RH : part employeur en charge, part salarié retenue sur salaire
  // (421). Sans TVA ; `internal` : non proposées dans les listes de saisie.
  { id: 'titres-restaurant', label: 'Titres-restaurant (part employeur)', account: '647400', vatDeductiblePct: 0, nature: 'services', internal: true },
  { id: 'titres-restaurant-salarie', label: 'Titres-restaurant (part salarié)', account: '421000', vatDeductiblePct: 0, nature: 'services', internal: true },
  { id: 'materiel-info', label: 'Ordinateur et matériel informatique', account: '218300', vatDeductiblePct: 100, fixedAsset: true, nature: 'goods' },
  { id: 'mobilier', label: 'Mobilier', account: '218400', vatDeductiblePct: 100, fixedAsset: true, nature: 'goods' },
  { id: 'logiciel-achat', label: 'Logiciel acheté (licence définitive)', account: '205000', vatDeductiblePct: 100, fixedAsset: true, nature: 'goods' },
];

/** Catégories proposées dans les listes de saisie (les catégories internes aux imports en sont exclues). */
export const CHOOSABLE_EXPENSE_CATEGORIES = EXPENSE_CATEGORIES.filter((c) => !c.internal);

/**
 * Taux de TVA habituel par catégorie de dépense, proposé par défaut quand un mouvement bancaire est
 * catégorisé (l'utilisateur peut le changer). null : pas de taux habituel sûr (exonéré ou taxé selon
 * le cas), aucun taux n'est proposé. Paramètre daté, à valider par l'expert-comptable
 * (docs/regles-a-valider.md).
 */
export const USUAL_VAT_RATES_2026 = {
  year: 2026,
  validation: 'à valider par l’expert-comptable',
  rates: {
    marchandises: null,
    matieres: 2000,
    'sous-traitance': 2000,
    energie: null, // électricité et gaz 20 %, eau 5,5 %
    'petit-materiel': 2000,
    fournitures: 2000,
    'carburant-vu': 2000,
    'carburant-vp': 2000,
    loyer: null, // exonéré, ou 20 % si le bailleur a opté pour la TVA
    'location-materiel': 2000,
    'location-voiture': 2000,
    entretien: 2000,
    'entretien-voiture': 2000,
    assurance: 0, // exonérée
    formation: null, // souvent exonérée (organisme de formation), sinon 20 %
    honoraires: 2000,
    publicite: 2000,
    cadeaux: 2000,
    deplacements: 1000, // transport de voyageurs
    hotel: 1000,
    repas: 1000, // restauration sur place (boissons alcoolisées à 20 %)
    telecom: 2000,
    banque: null, // commissions souvent exonérées, certaines taxées
    logiciel: 2000,
    impots: 0, // hors champ
    'materiel-info': 2000,
    mobilier: 2000,
    'logiciel-achat': 2000,
  },
};
const USUAL_VAT_RATES = [USUAL_VAT_RATES_2026];

/** Taux habituel à la date donnée (dernier barème connu pour cette année ou avant), ou null. */
export function usualVatRate(categoryId, date) {
  const year = Number(String(date).slice(0, 4));
  const table = USUAL_VAT_RATES.filter((t) => t.year <= year).at(-1) || USUAL_VAT_RATES[0];
  return table.rates[categoryId] ?? null;
}

export const REVENUE_ACCOUNT_BY_NATURE = {
  services: '706000',
  biens: '707000',
  produits: '701000',
};

export function categoryById(id) {
  const c = EXPENSE_CATEGORIES.find((x) => x.id === id);
  if (!c) throw new Error(`Catégorie inconnue : ${id}`);
  return c;
}
