/** Page « Fonctionnalités » : conformite. Règles de rédaction : voir app/features.js. */
export default {
  slug: 'conformite',
  icon: 'scale',
  title: 'Conformité et facture électronique',
  text: 'Les règles des logiciels de comptabilité respectées : écritures inaltérables, données sécurisées, conservées et archivées. Factures prêtes pour la réforme.',
  lead: 'Un logiciel de comptabilité doit garantir que vos données ne peuvent pas être modifiées en cachette, qu’elles sont protégées, conservées et archivées. Nexus est construit autour de ces quatre obligations, et vos factures sont prêtes pour la facturation électronique.',
  images: [
    {
      src: 'features/fec.webp',
      alt: 'Écritures validées et numérotées, période verrouillée',
      caption:
        'Une écriture validée est numérotée et verrouillée : la base de données refuse toute modification ; une correction passe par une nouvelle écriture visible.',
    },
  ],
  benefits: [
    {
      title: 'Inaltérabilité',
      text: 'Une facture émise ne se modifie plus (on émet un avoir) et une écriture validée ne se supprime plus (on passe une contre-passation). Le refus est appliqué par la base de données elle-même, pas seulement par l’affichage.',
    },
    {
      title: 'Sécurisation',
      text: 'Chaque création, validation ou correction est inscrite dans un journal d’audit chaîné, auquel on ne peut qu’ajouter des lignes. L’accès demande la double authentification.',
    },
    {
      title: 'Conservation',
      text: 'Les données sont gardées exercice par exercice ; un exercice clos reste consultable en lecture seule, avec ses justificatifs.',
    },
    {
      title: 'Archivage',
      text: 'Fichier des écritures comptables (FEC) au format de l’administration, dossier de clôture complet et export de toutes vos données à tout moment.',
    },
    {
      title: 'Factures prêtes pour la réforme',
      text: 'Nouvelles mentions obligatoires, PDF Factur-X (la facture électronique est jointe au PDF), statuts du cycle de vie et import des factures reçues au format XML ou Factur-X.',
    },
    {
      title: 'Réception par une plateforme agréée',
      text: 'Depuis le 1er septembre 2026, toute entreprise doit pouvoir recevoir ses factures électroniques par une plateforme agréée. Nexus n’est pas lui-même une plateforme : choisissez-en une (plusieurs ont une offre gratuite) et importez dans Nexus les factures que vous y recevez.',
    },
  ],
  steps: [
    'Émettez vos factures dans Nexus : elles portent toutes les mentions obligatoires et se téléchargent en Factur-X.',
    'Déposez-les sur la plateforme agréée de votre choix, et téléchargez-y les factures reçues de vos fournisseurs.',
    'Importez les factures reçues dans Dépenses : Nexus les enregistre et les comptabilise.',
    'En fin d’année, remettez le FEC et le dossier de clôture à votre expert-comptable.',
  ],
  audience: [
    { role: 'Dirigeants', text: 'L’assurance d’une comptabilité recevable en cas de contrôle fiscal.' },
    { role: 'Experts-comptables', text: 'Des écritures verrouillées, un journal d’audit et un FEC prêt à contrôler.' },
    { role: 'Micro-entrepreneurs', text: 'Des factures conformes et un livre des recettes tenu automatiquement.' },
  ],
  faq: [
    {
      q: 'Nexus est-il une plateforme agréée ?',
      a: 'Non. Nexus prépare des factures électroniques conformes (Factur-X) et lit celles que vous recevez ; l’envoi et la réception officiels passent par la plateforme agréée que vous choisissez.',
    },
    {
      q: 'Que se passe-t-il en cas de contrôle fiscal ?',
      a: 'Vous remettez le FEC, que Nexus produit au format demandé par l’administration, ainsi que les factures et justificatifs conservés dans l’application.',
    },
    {
      q: 'Puis-je corriger une erreur dans une facture émise ?',
      a: 'Oui, par un avoir qui annule tout ou partie de la facture, puis une nouvelle facture si besoin : c’est la seule méthode admise, et Nexus la propose en un clic.',
    },
  ],
  related: ['securite', 'factures', 'compta'],
};
