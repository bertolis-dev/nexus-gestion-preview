/** Page « Fonctionnalités » : banque. Règles de rédaction : voir app/features.js. */
export default {
  slug: 'banque',
  icon: 'card',
  title: 'Banque rapprochée automatiquement',
  text: 'Importez votre relevé : chaque virement est associé à sa facture (montant, numéro, nom du client), les paiements groupés et partiels compris.',
  lead: 'Importez le relevé de votre banque et laissez Nexus faire le lien entre chaque mouvement et la facture ou la dépense qui lui correspond. Ce qui prend une demi-journée par mois dans un tableur se règle en quelques clics.',
  images: [
    {
      src: 'features/banque.webp',
      alt: 'Écran Banque : virement associé à sa facture avec un indice de confiance',
      caption:
        'Pour chaque mouvement, Nexus propose la facture correspondante et explique pourquoi : montant identique, numéro de facture dans le libellé, nom du client. Ici, confiance à 100 %.',
    },
    {
      src: 'features/accueil.webp',
      alt: 'Accueil avec la trésorerie et la liste À faire',
      caption: 'Sur l’accueil, votre trésorerie est à jour et les mouvements à justifier remontent dans la liste « À faire ».',
    },
  ],
  benefits: [
    {
      title: 'Import de relevé en CSV, OFX, CAMT.053 ou QIF',
      text: 'Toutes les banques françaises proposent au moins l’un de ces formats dans leur espace client. Nexus reconnaît les colonnes, les dates et les montants (y compris les exports de Qonto, Shine, Société Générale, Crédit Agricole, BNP Paribas, Boursorama et LCL). Une ligne illisible vous est signalée avec son numéro, sans bloquer le reste du relevé.',
    },
    {
      title: 'Aucun doublon, même en réimportant',
      text: 'Vous pouvez importer deux fois le même relevé, ou des relevés qui se chevauchent : les mouvements déjà connus sont reconnus et ignorés.',
    },
    {
      title: 'Rapprochement intelligent',
      text: 'Pour chaque encaissement, Nexus cherche la facture qui correspond : même montant, numéro de facture dans le libellé du virement, nom du client. Chaque proposition affiche ses raisons et un niveau de confiance ; vous validez d’un clic sur « Associer ».',
    },
    {
      title: 'Paiements groupés et partiels',
      text: 'Un client règle trois factures en un seul virement ? Nexus retrouve la combinaison. Il paie la moitié ? Le paiement partiel est enregistré et le reste dû reste suivi sur la facture.',
    },
    {
      title: 'Nexus retient vos choix',
      text: 'Quand vous catégorisez un prélèvement (Orange → Téléphone, TVA 20 %), Nexus le retient et le propose pour les suivants du même fournisseur. Vous validez toujours ; les règles se consultent et s’oublient dans les Paramètres.',
    },
    {
      title: 'Une catégorie pour tout le reste',
      text: 'Frais bancaires, billet de train, paiement de la TVA, acompte d’impôt, apport personnel : choisissez la catégorie dans une liste en français, indiquez le taux de TVA et si vous avez la facture. L’écriture est passée pour vous.',
    },
    {
      title: 'Justificatif manquant signalé',
      text: 'Si vous indiquez ne pas avoir la facture d’une dépense, elle reste signalée dans « À faire » jusqu’à ce que vous l’ajoutiez : indispensable pour récupérer la TVA et en cas de contrôle.',
    },
    {
      title: 'État de rapprochement',
      text: 'Saisissez le solde affiché par votre banque : Nexus le compare au solde comptable et vous montre l’écart éventuel, pour être sûr que rien n’a été oublié.',
    },
    {
      title: 'Lettrage automatique',
      text: 'Chaque paiement associé solde la facture dans les comptes clients et fournisseurs. Votre expert-comptable retrouve un compte client propre, sans pointage manuel.',
    },
  ],
  steps: [
    'Dans l’espace client de votre banque, téléchargez votre relevé (CSV, OFX, CAMT.053 ou QIF).',
    'Dans Nexus, cliquez sur « Importer un relevé » et choisissez le fichier.',
    'Pour chaque mouvement, validez la facture proposée ou choisissez une catégorie.',
    'Les mouvements passent dans « Déjà justifiées », vos factures sont marquées payées et votre trésorerie est à jour.',
  ],
  audience: [
    { role: 'Dirigeants pressés', text: 'Dix minutes par mois pour une banque entièrement justifiée, au lieu d’une soirée de pointage.' },
    {
      role: 'Entreprises avec beaucoup d’encaissements',
      text: 'Paiements groupés, partiels ou avec des libellés approximatifs : Nexus retrouve les bonnes factures.',
    },
    { role: 'Experts-comptables', text: 'Un compte banque rapproché et des comptes clients lettrés, sans reprise en fin d’année.' },
  ],
  faq: [
    {
      q: 'Nexus se connecte-t-il directement à ma banque ?',
      a: 'Non : vous importez le relevé de votre banque (CSV, OFX, CAMT.053 ou QIF) en quelques secondes, depuis son espace client. Cela fonctionne avec toutes les banques, sans abonnement à un service de connexion.',
    },
    {
      q: 'Et si Nexus se trompe de facture ?',
      a: 'Rien n’est associé sans votre validation. Vous voyez toujours la proposition et ses raisons avant de cliquer, et vous pouvez choisir une autre facture ou une catégorie à la place.',
    },
    { q: 'Que faire d’un mouvement qui ne me concerne pas ?', a: 'Cliquez sur « Ignorer » : il sort de la liste à justifier sans créer d’écriture.' },
  ],
  related: ['factures', 'depenses', 'tva'],
};
