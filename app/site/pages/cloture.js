/** Page « Fonctionnalités » : cloture. Règles de rédaction : voir app/features.js. */
export default {
  slug: 'cloture',
  icon: 'lock',
  title: 'Clôture annuelle et bilan',
  text: 'Check-list de fin d’année, écritures d’inventaire, impôt sur les sociétés, bilan et compte de résultat, puis ouverture de l’exercice suivant.',
  lead: 'La fin d’année n’a plus à être un marathon : Nexus vous guide pas à pas, de la check-list des points à régler jusqu’au bilan, calcule l’impôt sur les sociétés et prépare l’exercice suivant.',
  images: [
    {
      src: 'features/cloture.webp',
      alt: 'Page Clôture : check-list et écritures d’inventaire',
      caption:
        'La check-list de clôture signale ce qui reste à régler (mouvements à justifier, brouillons, TVA, amortissements…), puis les écritures d’inventaire se saisissent dans un formulaire simple.',
    },
  ],
  benefits: [
    {
      title: 'Check-list avant clôture',
      text: 'Opérations bancaires justifiées, justificatifs joints, brouillons émis, créances de plus de 90 jours examinées, déclarations de TVA validées, amortissements passés : chaque point est vérifié et mène à l’écran où le régler.',
    },
    {
      title: 'Écritures d’inventaire guidées',
      text: 'Charges et produits constatés d’avance, factures à recevoir, ventes à facturer, provision pour client douteux : choisissez le type, le compte et le montant, Nexus passe l’écriture et son extourne l’année suivante.',
    },
    { title: 'Amortissements en un clic', text: 'Les dotations de l’année sont calculées pour chaque équipement et passées d’un seul bouton.' },
    {
      title: 'Impôt sur les sociétés calculé',
      text: 'Taux réduit de 15 % jusqu’à 42 500 € de bénéfice puis 25 %, au prorata si l’exercice ne dure pas douze mois, avec imputation des déficits antérieurs.',
    },
    {
      title: 'Bilan et compte de résultat',
      text: 'Des états financiers simplifiés, présentés dans l’esprit du formulaire 2033, équilibrés par construction et imprimables pour votre banquier ou vos associés.',
    },
    {
      title: 'Ouverture de l’exercice suivant',
      text: 'À la clôture, le résultat est calculé, toutes les écritures sont validées définitivement, et le nouvel exercice s’ouvre avec les soldes à nouveau et les extournes.',
    },
    {
      title: 'Affectation du résultat',
      text: 'L’année suivante, Nexus propose la répartition du bénéfice : réserve légale minimale, autres réserves, dividendes et report à nouveau (ou compte de l’exploitant pour une entreprise individuelle).',
    },
  ],
  steps: [
    'Ouvrez la page Clôture et réglez les points signalés dans la check-list.',
    'Saisissez les écritures d’inventaire et passez les amortissements.',
    'Calculez l’impôt sur les sociétés, vérifiez le bilan et le compte de résultat.',
    'Une fois l’exercice terminé, cliquez sur « Clôturer » : l’année suivante s’ouvre automatiquement.',
  ],
  audience: [
    { role: 'Sociétés à l’impôt sur les sociétés', text: 'EURL, SARL, SAS : l’impôt, le bilan et l’affectation du résultat préparés.' },
    { role: 'Entreprises individuelles au réel', text: 'Une clôture guidée et un résultat reporté sur le compte de l’exploitant.' },
    { role: 'Experts-comptables', text: 'Une clôture préparée par le client, à contrôler et à valider plutôt qu’à refaire.' },
  ],
  faq: [
    {
      q: 'Nexus remplace-t-il mon expert-comptable pour la liasse fiscale ?',
      a: 'Non : Nexus prépare la clôture, les états financiers et un dossier complet (FEC, balance, grand livre, check-list) que votre expert-comptable reprend pour établir et déposer la liasse fiscale. Pour une société, la clôture est réservée à l’expert-comptable invité, pour plus de sécurité.',
    },
    {
      q: 'Puis-je revenir en arrière après la clôture ?',
      a: 'Non : un exercice clôturé est définitif, comme l’exige la loi. C’est pourquoi la check-list vous montre les points non réglés avant de confirmer.',
    },
    {
      q: 'Et si mon exercice ne se termine pas le 31 décembre ?',
      a: 'Aucun problème : la date de clôture se règle à l’inscription, et l’impôt est calculé au prorata si l’exercice ne dure pas douze mois.',
    },
  ],
  related: ['compta', 'depenses', 'securite'],
};
