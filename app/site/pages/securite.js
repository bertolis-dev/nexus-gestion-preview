/** Page « Fonctionnalités » : securite. Règles de rédaction : voir app/features.js. */
export default {
  slug: 'securite',
  icon: 'shield',
  title: 'Sécurité bancaire',
  text: 'Double authentification obligatoire, données hébergées à Paris, écritures validées infalsifiables et journal d’audit.',
  lead: 'Votre comptabilité contient ce que votre entreprise a de plus sensible. Nexus la protège comme une banque protège un compte : double authentification pour tous, isolement strict entre entreprises et écritures impossibles à falsifier.',
  images: [
    {
      src: 'features/connexion.webp',
      alt: 'Écran de connexion de Nexus Gestion',
      caption: 'La connexion : e-mail et mot de passe, puis un code à usage unique généré par votre téléphone, à chaque connexion.',
    },
    {
      src: 'features/fec.webp',
      alt: 'Validation des écritures et verrouillage de la période',
      caption: 'Les écritures validées sont numérotées et verrouillées : aucune modification possible, la base de données le refuse.',
    },
  ],
  benefits: [
    {
      title: 'Double authentification obligatoire',
      text: 'En plus du mot de passe, un code à six chiffres généré par une application sur votre téléphone (Google Authenticator, Microsoft Authenticator…) est demandé. Sans ce code, les données restent inaccessibles, même avec le bon mot de passe.',
    },
    {
      title: 'Une entreprise ne voit jamais les données d’une autre',
      text: 'L’isolement est appliqué directement par la base de données, pour chaque ligne et chaque fichier, et non seulement par l’affichage. Même une erreur dans l’application ne pourrait pas exposer les données d’une autre entreprise.',
    },
    {
      title: 'Données hébergées à Paris',
      text: 'Vos données et vos justificatifs sont stockés dans un centre de données situé en France, conformément au RGPD.',
    },
    {
      title: 'Écritures infalsifiables',
      text: 'Une écriture validée ne peut plus être modifiée ni supprimée : la base de données le refuse. Les corrections passent par une contre-passation visible, comme l’exige la loi.',
    },
    {
      title: 'Journal d’audit',
      text: 'Chaque création, validation ou correction est enregistrée avec son auteur et sa date dans un journal auquel on peut seulement ajouter des lignes, jamais en retirer.',
    },
    {
      title: 'Accès par rôle',
      text: 'Invitez votre expert-comptable ou un associé avec le rôle adapté. Chacun a son propre compte et sa propre double authentification ; les actions sensibles, comme la clôture d’une société, sont réservées au bon rôle.',
    },
    {
      title: 'Vos données vous appartiennent',
      text: 'Téléchargez à tout moment une copie complète de vos données, ainsi que le FEC et les exports Excel. Rien ne vous retient.',
    },
  ],
  steps: [
    'À l’inscription, créez votre mot de passe et confirmez votre adresse e-mail.',
    'Scannez le QR code affiché avec une application d’authentification sur votre téléphone.',
    'À chaque connexion, saisissez votre mot de passe puis le code à six chiffres du moment.',
    'Invitez votre expert-comptable depuis les paramètres : il suit le même parcours de son côté.',
  ],
  audience: [
    { role: 'Dirigeants', text: 'La tranquillité de savoir que personne d’autre ne peut accéder à vos comptes.' },
    { role: 'Experts-comptables', text: 'Un accès individuel et traçable aux dossiers de leurs clients.' },
    { role: 'Associés', text: 'Des droits adaptés à chacun, avec une trace de toutes les opérations.' },
  ],
  faq: [
    {
      q: 'Que se passe-t-il si je perds mon téléphone ?',
      a: 'Contactez-nous depuis l’adresse e-mail de votre compte : après vérification de votre identité, nous réinitialisons votre double authentification pour que vous puissiez la reconfigurer.',
    },
    {
      q: 'Pourquoi la double authentification est-elle obligatoire ?',
      a: 'Parce qu’un mot de passe seul se vole facilement (hameçonnage, fuite d’un autre site). Pour des données comptables et bancaires, c’est le minimum que nous jugeons acceptable.',
    },
    {
      q: 'L’équipe de Nexus peut-elle voir mes données ?',
      a: 'Les accès techniques sont strictement limités à la maintenance et à l’assistance que vous demandez. Vos données ne sont jamais vendues ni utilisées à d’autres fins.',
    },
  ],
  related: ['compta', 'cloture', 'banque'],
};
