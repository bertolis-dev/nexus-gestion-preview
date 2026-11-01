/** Page « Fonctionnalités » : pilotage. Règles de rédaction : voir app/features.js. */
export default {
  slug: 'pilotage',
  icon: 'trendingUp',
  title: 'Pilotage, temps passé et espace client',
  text: 'Échéances fiscales, budget comparé au réalisé, simulateur salaire ou dividendes, heures facturées, trajets au barème kilométrique, stock et espace client.',
  lead: 'Au-delà de la comptabilité, Nexus vous aide à piloter : ce qui tombe dans les prochains mois, où vous en êtes de votre budget, combien vous verser, et un espace où vos clients retrouvent leurs factures et acceptent vos devis.',
  images: [
    {
      src: 'features/pilotage.webp',
      alt: 'Écran Pilotage : budget de l’année comparé au réalisé',
      caption: 'Le budget de l’année par rubrique, comparé au réalisé et à ce qui était prévu à la date du jour.',
    },
    {
      src: 'features/temps.webp',
      alt: 'Factures, onglet Temps passé : heures à facturer par client',
      caption: 'Les heures notées par client, transformées en facture en un clic.',
    },
    {
      src: 'features/trajets.webp',
      alt: 'Dépenses, onglet Trajets en voiture : indemnités au barème kilométrique',
      caption: 'Chaque trajet professionnel calculé au barème kilométrique, en tenant compte des kilomètres déjà parcourus dans l’année.',
    },
  ],
  benefits: [
    {
      title: 'Échéances fiscales',
      text: 'Impôt sur les sociétés, déclaration de résultats, honoraires à déclarer (DAS2), CFE, approbation et dépôt des comptes : les 12 prochains mois, et un rappel dans « À faire » 15 jours avant.',
    },
    { title: 'Budget comparé au réalisé', text: 'Fixez vos montants de l’année par rubrique : Nexus compare au réalisé et à ce qui était prévu à date.' },
    {
      title: 'Salaire ou dividendes',
      text: 'Pour une société à l’impôt sur les sociétés, ce qui vous reste selon la part versée en salaire, de 0 à 100 %. Une estimation simple à discuter avec votre expert-comptable.',
    },
    { title: 'Temps passé facturé', text: 'Notez vos heures par client et par prestation ; la facture se prépare avec une ligne par prestation.' },
    {
      title: 'Indemnités kilométriques',
      text: 'Vos trajets avec votre véhicule personnel, au barème de l’administration (majoré pour un véhicule électrique), inscrits comme somme due au dirigeant.',
    },
    {
      title: 'Stock simple',
      text: 'Pour les articles que vous suivez : stock de départ, livraisons, ventes déduites à chaque facture et alerte de stock bas.',
    },
    {
      title: 'Espace client',
      text: 'Un lien personnel par client : ses factures et devis en PDF, le QR code pour payer par virement, et l’acceptation d’un devis en ligne, datée et nominative.',
    },
  ],
  steps: [
    'Ouvrez Pilotage pour voir vos échéances et fixer votre budget.',
    'Notez votre temps dans Factures → Temps passé, puis préparez la facture.',
    'Créez le lien de l’espace client depuis la fiche du client et envoyez-le-lui.',
    'Suivez les devis acceptés en ligne dans l’onglet Devis et transformez-les en factures.',
  ],
  audience: [
    { role: 'Consultants et prestataires', text: 'Le temps passé facturé sans ressaisie, des devis acceptés en ligne.' },
    { role: 'Dirigeants de société', text: 'Les échéances anticipées et une première idée de la meilleure rémunération.' },
    { role: 'Artisans et commerçants', text: 'Les trajets au barème et un suivi de stock simple.' },
  ],
  faq: [
    {
      q: 'L’acceptation en ligne vaut-elle signature ?',
      a: 'C’est une acceptation datée et nominative (nom saisi par le client, date et heure enregistrées), pas une signature électronique certifiée. Pour la plupart des devis, elle suffit à prouver l’accord.',
    },
    {
      q: 'Le simulateur remplace-t-il mon expert-comptable ?',
      a: 'Non : il donne un ordre de grandeur par taux moyens. La décision tient compte de votre situation personnelle et se prend avec votre expert-comptable.',
    },
    {
      q: 'Mes clients doivent-ils créer un compte ?',
      a: 'Non : le lien personnel suffit. Il est valable un an et vous pouvez le désactiver à tout moment.',
    },
  ],
  related: ['factures', 'devis', 'cloture'],
};
