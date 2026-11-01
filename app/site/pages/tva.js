/** Page « Fonctionnalités » : tva. Règles de rédaction : voir app/features.js. */
export default {
  slug: 'tva',
  icon: 'percent',
  title: 'TVA préparée pour vous',
  text: 'Collectée, déductible, à payer : chaque mois, le montant est prêt et justifié facture par facture, TVA sur encaissements comprise.',
  lead: 'Plus de calcul de dernière minute : à partir de vos factures, de vos dépenses et de votre banque, Nexus prépare votre déclaration de TVA case par case, vous rappelle l’échéance et garde la trace de ce qui a été déclaré.',
  images: [
    {
      src: 'features/tva.webp',
      alt: 'Déclaration de TVA de juillet : TVA due, récupérable et à payer',
      caption:
        'La déclaration du mois : TVA due, TVA récupérable, montant à payer et numéros de case du formulaire officiel. Un clic pour valider, un autre pour exporter le détail.',
    },
  ],
  benefits: [
    {
      title: 'Déclaration mensuelle (CA3) case par case',
      text: 'Ventes imposables, base et TVA par taux, TVA récupérable sur les équipements et sur les autres dépenses, crédit de TVA reporté : chaque montant est placé dans sa case du formulaire, prêt à être recopié.',
    },
    {
      title: 'Régime simplifié (CA12) et acomptes',
      text: 'Au régime simplifié, Nexus prépare la déclaration annuelle et calcule les deux acomptes de juillet et décembre (55 % et 40 % de la TVA de l’année précédente).',
    },
    {
      title: 'TVA sur les encaissements ou sur les débits',
      text: 'Pour les prestations de services, la TVA est due à l’encaissement : Nexus attend le paiement du client pour la compter. Si vous avez opté pour les débits, cochez la case dans les paramètres.',
    },
    {
      title: 'Justifiée facture par facture',
      text: 'Chaque montant s’appuie sur la liste des factures et des dépenses concernées, avec la date d’exigibilité. Exportez ce détail en Excel pour votre expert-comptable ou en cas de contrôle.',
    },
    {
      title: 'Rappel des échéances',
      text: 'La date limite de dépôt apparaît dans votre liste « À faire ». Si elle est dépassée sans déclaration validée, l’alerte passe en tête de liste.',
    },
    {
      title: 'Validation et écriture automatique',
      text: 'Quand vous validez une déclaration, la TVA du mois est soldée dans la comptabilité et le montant à payer est enregistré. Au paiement, la catégorie « Paiement de TVA » dans l’écran Banque le rapproche.',
    },
    {
      title: 'Crédit de TVA reporté',
      text: 'Un mois où vous récupérez plus que vous ne collectez, le crédit est automatiquement reporté sur la déclaration suivante.',
    },
  ],
  steps: [
    'Tenez vos factures, vos dépenses et votre banque à jour dans Nexus : c’est tout ce qu’il faut.',
    'Ouvrez l’écran TVA et choisissez le mois : la déclaration est déjà calculée.',
    'Vérifiez les montants, exportez le détail si besoin, puis recopiez-les sur impots.gouv.fr.',
    'Cliquez sur « Valider la déclaration » : le mois est marqué déclaré et l’écriture est passée.',
  ],
  audience: [
    { role: 'Sociétés au réel normal', text: 'Une CA3 prête chaque mois, sans ressortir les factures une à une.' },
    { role: 'Entreprises au régime simplifié', text: 'Les acomptes de juillet et décembre calculés, la CA12 préparée en fin d’année.' },
    { role: 'Prestataires de services', text: 'La TVA sur les encaissements gérée correctement, même avec des clients qui paient en retard.' },
  ],
  faq: [
    {
      q: 'Nexus envoie-t-il la déclaration aux impôts ?',
      a: 'Non : Nexus prépare la déclaration case par case et vous recopiez les montants sur votre espace professionnel impots.gouv.fr, en quelques minutes.',
    },
    {
      q: 'Je suis en franchise de TVA, suis-je concerné ?',
      a: 'Non : en franchise, vous ne facturez pas de TVA. Nexus surveille en revanche votre chiffre d’affaires et vous prévient avant de dépasser les seuils (voir la page Micro-entrepreneur).',
    },
    {
      q: 'Puis-je corriger une déclaration déjà validée ?',
      a: 'Une déclaration validée est figée, comme sur impots.gouv.fr. Une erreur se régularise sur la déclaration suivante, avec l’aide de votre expert-comptable si besoin.',
    },
  ],
  related: ['banque', 'depenses', 'compta'],
};
