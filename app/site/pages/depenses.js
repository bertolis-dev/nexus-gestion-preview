/** Page « Fonctionnalités » : depenses. Règles de rédaction : voir app/features.js. */
export default {
  slug: 'depenses',
  icon: 'paperclip',
  title: 'Dépenses en une catégorie',
  text: '« Carburant », « Loyer », « Logiciel » : vous choisissez la catégorie, Nexus applique les bonnes règles de TVA et repère les doublons.',
  lead: 'Pas besoin de connaître le plan comptable ni les règles de récupération de TVA : vous choisissez une catégorie en français, Nexus choisit le bon compte, applique la bonne TVA et range le justificatif.',
  images: [
    {
      src: 'features/depenses.webp',
      alt: 'Formulaire d’ajout de dépense et liste des dépenses payées avec justificatif',
      caption:
        'Ajouter une dépense : fournisseur, date, numéro, catégorie, montant TTC et justificatif. La liste montre ce qui est payé et ce qui a son justificatif.',
    },
    {
      src: 'features/immobilisations.webp',
      alt: 'Onglet Immobilisations avec le plan d’amortissement',
      caption: 'Un ordinateur ou un meuble est reconnu comme équipement durable : son coût est réparti sur sa durée d’usage.',
    },
  ],
  benefits: [
    {
      title: '26 catégories en langage courant',
      text: 'Loyer, carburant, assurances, logiciels, déplacements, hôtels, honoraires, publicité, fournitures, sous-traitance… Chaque catégorie correspond au bon compte comptable, sans que vous ayez à le connaître.',
    },
    {
      title: 'Les règles de TVA appliquées automatiquement',
      text: 'Carburant d’une voiture : 80 % de TVA récupérable. Location, entretien d’une voiture de tourisme, billets de train ou d’avion, hôtels : TVA non récupérable. Cadeaux clients : récupérable seulement sous le seuil de 73 € TTC par bénéficiaire. Vous ne récupérez que ce qui est permis.',
    },
    {
      title: 'Détection des doublons',
      text: 'Même fournisseur, même numéro ou même montant à la même date : Nexus vous prévient avant d’enregistrer une facture déjà saisie.',
    },
    {
      title: 'Justificatif rangé avec la dépense',
      text: 'Joignez la photo ou le PDF de la facture : il est conservé dans son format d’origine, rattaché à la dépense, et retrouvable par votre expert-comptable.',
    },
    {
      title: 'Import des factures électroniques',
      text: 'Vos fournisseurs vous envoient des factures au format XML (CII ou UBL) ? Importez le fichier : fournisseur, numéro, date, montants et TVA sont remplis automatiquement.',
    },
    {
      title: 'Équipements amortis automatiquement',
      text: 'Un ordinateur, du mobilier : Nexus les enregistre comme immobilisations, propose une durée d’amortissement et calcule la dotation de l’année et la valeur restante, avec le plan détaillé.',
    },
    {
      title: 'Avoirs fournisseurs',
      text: 'Un fournisseur vous rembourse ? Choisissez le type de pièce « Avoir » : l’écriture est inversée et la TVA corrigée.',
    },
    {
      title: 'Fournisseurs étrangers',
      text: 'Pour un achat auprès d’une entreprise étrangère, la TVA due en France est calculée et déduite en même temps (autoliquidation), sans effet sur votre trésorerie.',
    },
  ],
  steps: [
    'Dans « Dépenses », indiquez le fournisseur, la date et le numéro de la facture.',
    'Choisissez la catégorie et saisissez le montant TTC : le taux de TVA est proposé.',
    'Joignez le justificatif (photo ou PDF) et enregistrez.',
    'Au moment du paiement, le mouvement bancaire est rapproché de la dépense dans l’écran Banque.',
  ],
  audience: [
    { role: 'Dirigeants non comptables', text: 'Une catégorie à choisir, pas un numéro de compte à retrouver.' },
    { role: 'Entreprises avec véhicule', text: 'Les règles de TVA sur le carburant et les voitures appliquées sans erreur.' },
    { role: 'Experts-comptables', text: 'Des dépenses bien imputées, avec leur justificatif et une TVA juste, sans reclassement.' },
  ],
  faq: [
    {
      q: 'Dois-je saisir le montant hors taxes ?',
      a: 'Non, saisissez le montant TTC figurant sur la facture : Nexus calcule le hors taxes et la TVA selon le taux choisi.',
    },
    {
      q: 'Nexus lit-il automatiquement mes factures papier ?',
      a: 'Non : pour une photo, vous saisissez le fournisseur, le montant et la catégorie (la photo est jointe à la dépense). Les factures électroniques (XML ou PDF Factur-X), elles, se remplissent toutes seules.',
    },
    { q: 'Où sont stockés mes justificatifs ?', a: 'Dans un espace sécurisé hébergé à Paris, accessible uniquement aux membres de votre entreprise.' },
  ],
  related: ['banque', 'tva', 'cloture'],
};
