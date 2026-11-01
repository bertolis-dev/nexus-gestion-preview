/** Page « Fonctionnalités » : compta. Règles de rédaction : voir app/features.js. */
export default {
  slug: 'compta',
  icon: 'chart',
  title: 'Comptabilité complète et FEC',
  text: 'Balance, grand livre, journaux et fichier FEC pour votre expert-comptable, sans ressaisie. La partie double tourne en arrière-plan.',
  lead: 'Chaque facture, dépense et mouvement bancaire génère son écriture comptable en partie double, sans que vous ayez à la voir. En mode avancé, vous et votre expert-comptable retrouvez une comptabilité complète, conforme et exportable.',
  images: [
    {
      src: 'features/compta.webp',
      alt: 'Balance comptable avec les comptes, leur libellé officiel et leur explication en français',
      caption: 'La balance : chaque compte avec son libellé officiel et, en dessous, sa signification en français (« Ce que mes clients me doivent »).',
    },
    {
      src: 'features/fec.webp',
      alt: 'Validation des écritures et téléchargement du FEC',
      caption: 'La validation verrouille la période et numérote les écritures ; le FEC se télécharge ensuite en un clic.',
    },
  ],
  benefits: [
    {
      title: 'Écritures générées automatiquement',
      text: 'Facture émise, dépense saisie, paiement rapproché, déclaration de TVA validée : l’écriture est passée dans le bon journal, sur les bons comptes, en partie double. Vous n’avez rien à saisir.',
    },
    {
      title: 'Balance, grand livre et journaux',
      text: 'Les trois états que votre expert-comptable consulte, à jour en permanence, avec des libellés en français à côté des numéros de compte. Chacun s’exporte en Excel ou s’imprime.',
    },
    {
      title: 'Fichier des écritures comptables (FEC)',
      text: 'Le fichier exigé par l’administration en cas de contrôle, conforme à l’article A47 A-1 du Livre des procédures fiscales et contrôlable avec l’outil Test Compta Demat de la DGFiP.',
    },
    {
      title: 'Intangibilité des écritures',
      text: 'La validation numérote définitivement les écritures dans l’ordre chronologique et verrouille la période. Une écriture validée ne se modifie plus : elle se corrige par une contre-passation, comme l’exige la loi.',
    },
    {
      title: 'Reprise de votre historique',
      text: 'Vous venez d’un autre logiciel ? Importez le FEC de l’exercice précédent : Nexus reprend les soldes d’ouverture, le résultat et la liste de vos clients.',
    },
    {
      title: 'Exercices clos consultables',
      text: 'Les années clôturées restent consultables : bilan, compte de résultat, balance de clôture et FEC de chaque exercice, en lecture seule.',
    },
    {
      title: 'Mode standard ou mode avancé',
      text: 'Au quotidien, vous ne voyez que vos factures, dépenses et banque. Le mode avancé, activable dans les paramètres, affiche la comptabilité pour vous ou votre expert-comptable.',
    },
  ],
  steps: [
    'Utilisez Nexus normalement : factures, dépenses, banque. Les écritures se passent en arrière-plan.',
    'Activez le mode avancé dans les paramètres pour afficher la comptabilité.',
    'Consultez la balance, le grand livre ou les journaux, et exportez-les si besoin.',
    'Validez la période puis téléchargez le FEC pour votre expert-comptable ou l’administration.',
  ],
  audience: [
    { role: 'Experts-comptables', text: 'Une comptabilité propre, lettrée et exportable, sans ressaisie ni reclassement.' },
    { role: 'Dirigeants qui veulent comprendre', text: 'Chaque compte expliqué en français, pour enfin lire sa comptabilité.' },
    { role: 'Entreprises qui changent de logiciel', text: 'La reprise de l’historique par import du FEC, sans repartir de zéro.' },
  ],
  faq: [
    {
      q: 'Dois-je connaître la comptabilité pour utiliser Nexus ?',
      a: 'Non. La comptabilité est tenue automatiquement et reste cachée en mode standard. Elle n’est affichée que si vous activez le mode avancé.',
    },
    {
      q: 'Mon expert-comptable peut-il travailler directement dans Nexus ?',
      a: 'Oui : invitez-le depuis les paramètres. Il accède à votre comptabilité avec son propre compte et sa propre double authentification.',
    },
    {
      q: 'Le FEC est-il accepté par l’administration ?',
      a: 'Il respecte le format de l’article A47 A-1 du LPF. Nous recommandons de le vérifier une fois avec l’outil gratuit Test Compta Demat de la DGFiP.',
    },
  ],
  related: ['cloture', 'tva', 'securite'],
};
