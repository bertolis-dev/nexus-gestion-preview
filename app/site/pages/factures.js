/** Page « Fonctionnalités » : factures. Règles de rédaction : voir app/features.js. */
export default {
  slug: 'factures',
  icon: 'receipt',
  title: 'Factures conformes 2026-2027',
  text: 'SIREN du client, nature des opérations, mentions obligatoires : la facture est bloquée tant qu’elle n’est pas conforme, avec la liste de ce qu’il manque.',
  lead: 'Créez une facture en deux minutes, sans connaître le Code de commerce : Nexus vérifie chaque mention obligatoire avant l’envoi, numérote sans trou, et prépare déjà le format électronique exigé à partir de septembre 2027.',
  images: [
    {
      src: 'features/factures.webp',
      alt: 'Liste des factures avec les montants à échoir et en retard',
      caption:
        'Vos factures d’un coup d’œil : ce qui est à échoir, ce qui est en retard (0-30, 31-60, plus de 60 jours), le reste dû par client et le statut de chaque facture.',
    },
    {
      src: 'features/facture-edition.webp',
      alt: 'Formulaire de création d’une facture',
      caption: 'La saisie : un client, des dates, des lignes. La TVA et les totaux se calculent pendant que vous tapez.',
    },
  ],
  benefits: [
    {
      title: 'QR code de paiement',
      text: 'Chaque facture porte un QR code de virement SEPA : votre client le scanne avec l’application de sa banque, et bénéficiaire, IBAN, montant et numéro de facture sont pré-remplis. Vous êtes payé plus vite, sans commission.',
    },
    {
      title: 'Catalogue de prestations',
      text: 'Enregistrez vos prestations habituelles avec leur prix et leur TVA : dans une facture ou un devis, il suffit de commencer à taper la désignation.',
    },
    {
      title: 'Contrôle de conformité avant l’émission',
      text: 'Votre SIREN, votre adresse, votre capital social (pour une société), votre numéro de TVA, le SIREN et l’adresse du client, les dates, les désignations et les taux : tout est vérifié. S’il manque quelque chose, la facture n’est pas émise et Nexus vous dit exactement quoi compléter, champ par champ.',
    },
    {
      title: 'Numérotation continue et définitive',
      text: 'Le numéro (F2026-0001, F2026-0002…) n’est attribué qu’au moment de l’émission, dans l’ordre, sans trou ni doublon. Tant que la facture est en brouillon, vous la modifiez librement ; une fois émise, elle ne se modifie plus : on la corrige par un avoir, comme l’exige la loi.',
    },
    {
      title: 'Les nouvelles mentions de la réforme',
      text: 'Le SIREN du client et la nature des opérations (biens, services ou les deux) figurent déjà sur chaque facture, comme l’exige la facturation électronique obligatoire. Vous n’aurez rien à changer dans vos habitudes le jour venu.',
    },
    {
      title: 'Facture électronique au format européen',
      text: 'Chaque facture émise se télécharge en XML au format CII, conforme à la norme européenne EN 16931 : le format que les plateformes agréées échangeront. Le mode « dépôt » prépare en un clic vos factures pour la plateforme agréée que vous utilisez.',
    },
    {
      title: 'PDF Factur-X, envoyé en un clic',
      text: 'Le PDF de la facture, à votre logo, contient aussi la version électronique : c’est le format Factur-X, lisible par votre client comme par son logiciel (PDF/A-3, vérifié avec les outils officiels de validation). « Envoyer au client » prépare le PDF et le message ; sur téléphone, le PDF part directement par votre messagerie.',
    },
    {
      title: 'Avoirs et factures d’acompte',
      text: 'Un avoir se crée en un clic depuis la facture qu’il corrige, et la référence de la facture d’origine y figure automatiquement. Pour un gros projet, émettez une facture d’acompte : elle sera déduite automatiquement de la facture finale.',
    },
    {
      title: 'TVA et cas particuliers gérés pour vous',
      text: 'Taux de 20 %, 10 %, 5,5 % ou 2,1 %, ligne par ligne. Pour un client professionnel dans un autre pays de l’Union, la TVA n’est pas facturée et la mention d’autoliquidation est ajoutée. En franchise de TVA, la mention « TVA non applicable, art. 293 B du CGI » apparaît seule.',
    },
    {
      title: 'Pénalités de retard et IBAN',
      text: 'Les mentions légales de pénalités de retard et d’indemnité forfaitaire de 40 € sont imprimées automatiquement, avec votre IBAN pour faciliter le virement.',
    },
    { title: 'Impression et PDF', text: 'Une mise en page sobre aux couleurs de Nexus, prête à imprimer ou à enregistrer en PDF pour l’envoyer par e-mail.' },
  ],
  steps: [
    'Cliquez sur « Créer une facture » et choisissez un client, ou créez-le sur place (nom, SIREN, adresse et e-mail de facturation).',
    'Ajoutez vos lignes : désignation, quantité, prix hors taxes, taux de TVA et nature (bien ou service). Les totaux se mettent à jour en direct.',
    'Cliquez sur « Émettre » : si une mention manque, Nexus vous la signale ; sinon la facture reçoit son numéro définitif.',
    'Envoyez-la au client, téléchargez le PDF Factur-X ou la version électronique (XML). L’écriture comptable est déjà passée.',
  ],
  audience: [
    { role: 'Artisans et commerçants', text: 'Des factures propres et conformes sans logiciel compliqué, même sur le chantier ou en boutique.' },
    {
      role: 'Consultants et indépendants',
      text: 'Prestations de services, clients en France comme à l’étranger : la bonne TVA et les bonnes mentions à chaque fois.',
    },
    { role: 'Dirigeants de TPE', text: 'Une facturation prête pour la réforme de 2026-2027, sans changer d’outil au dernier moment.' },
  ],
  faq: [
    {
      q: 'Puis-je modifier une facture après l’avoir émise ?',
      a: 'Non, et c’est voulu : la loi interdit de modifier une facture émise. Vous créez un avoir en un clic depuis la facture concernée, puis une nouvelle facture si besoin. Tant qu’elle est en brouillon, en revanche, tout reste modifiable.',
    },
    {
      q: 'Que se passe-t-il en septembre 2027 ?',
      a: 'Les entreprises devront envoyer leurs factures par une plateforme agréée, au format électronique. Nexus produit déjà ce format et les nouvelles mentions. Dès aujourd’hui, le mode « dépôt » prépare en un clic vos factures (PDF Factur-X) pour la plateforme agréée que vous utilisez, souvent gratuite avec votre banque ou votre logiciel (Qonto, Shine, Pennylane, Tiime…), et réimporte les factures que vous y recevez.',
    },
    {
      q: 'Mon client est en Belgique, que dois-je faire ?',
      a: 'Renseignez son numéro de TVA européen dans sa fiche. Nexus ne facture pas la TVA et ajoute la mention d’autoliquidation. Si le numéro manque, la facture est bloquée avec une explication.',
    },
  ],
  related: ['devis', 'relances', 'banque'],
};
