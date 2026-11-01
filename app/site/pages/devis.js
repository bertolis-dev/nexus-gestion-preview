/** Page « Fonctionnalités » : devis. Règles de rédaction : voir app/features.js. */
export default {
  slug: 'devis',
  icon: 'clipboard',
  title: 'Devis, acomptes et abonnements',
  text: 'Un devis accepté devient une facture en un clic, et vos prestations mensuelles se facturent toutes seules à chaque échéance.',
  lead: 'Du premier devis à la dernière facture d’un contrat, Nexus enchaîne les documents sans ressaisie : le devis se transforme en facture, l’acompte se déduit tout seul, et les abonnements se préparent automatiquement chaque mois.',
  images: [
    {
      src: 'features/devis-detail.webp',
      alt: 'Devis D2026-0001 avec le bouton Transformer en facture',
      caption: 'Un devis envoyé, avec sa date de validité et la mention « Bon pour accord ». Le bouton « Transformer en facture » reprend toutes les lignes.',
    },
    {
      src: 'features/recurrentes.webp',
      alt: 'Formulaire de facture récurrente et liste des abonnements',
      caption: 'Les factures récurrentes : client, montant, fréquence et date de la prochaine facture. Vous les suspendez quand vous voulez.',
    },
  ],
  benefits: [
    {
      title: 'Des devis numérotés à part',
      text: 'Vos devis ont leur propre série (D2026-0001…), distincte de celle des factures. Ils portent une date de validité et la mention « Bon pour accord : date et signature du client ».',
    },
    {
      title: 'Devis vers facture en un clic',
      text: 'Quand le client accepte, « Transformer en facture » crée un brouillon de facture avec les mêmes lignes et le même client. Le devis passe au statut « Facturé » : vous savez toujours ce qui a été converti.',
    },
    {
      title: 'Suivi des devis',
      text: 'Chaque devis affiche son état : envoyé, facturé ou expiré une fois la date de validité passée. Plus besoin d’un tableau à part pour savoir où en sont vos propositions.',
    },
    {
      title: 'Factures d’acompte',
      text: 'Demandez un acompte avant de commencer un chantier ou une mission. À la facture finale, les acomptes déjà versés sont déduits automatiquement et le reste à payer est juste.',
    },
    {
      title: 'Factures récurrentes',
      text: 'Maintenance, loyer, suivi mensuel, abonnement : indiquez le client, le montant, la fréquence (chaque mois, trimestre ou année) et la date de départ. La période (« octobre 2026 ») est ajoutée à la désignation automatiquement.',
    },
    {
      title: 'Brouillon ou émission automatique, au choix',
      text: 'Par défaut, chaque échéance prépare un brouillon qui apparaît dans votre liste « À faire » pour que vous le vérifiiez. Si vous préférez, cochez l’émission automatique : la facture part avec son numéro sans intervention.',
    },
    {
      title: 'Une date de fin si besoin',
      text: 'Pour un contrat de douze mois, indiquez la date de la dernière facture : les échéances s’arrêtent d’elles-mêmes. Vous pouvez aussi suspendre ou supprimer un abonnement à tout moment.',
    },
  ],
  steps: [
    'Cliquez sur « Créer un devis », choisissez le client et ajoutez vos lignes, exactement comme pour une facture.',
    'Émettez le devis, imprimez-le ou enregistrez-le en PDF pour l’envoyer à votre client.',
    'Une fois accepté, ouvrez-le et cliquez sur « Transformer en facture » : vérifiez le brouillon, puis émettez-le.',
    'Pour une prestation qui revient chaque mois, créez une facture récurrente dans l’onglet « Récurrentes » : Nexus s’occupe des échéances suivantes.',
  ],
  audience: [
    { role: 'Artisans du bâtiment', text: 'Devis détaillé, acompte à la commande, facture finale avec déduction : le parcours classique d’un chantier.' },
    { role: 'Agences et prestataires', text: 'Des contrats de maintenance ou d’accompagnement mensuels qui se facturent sans oubli.' },
    { role: 'Formateurs et consultants', text: 'Des propositions commerciales suivies jusqu’à la facture, sans rien ressaisir.' },
  ],
  faq: [
    {
      q: 'Un devis a-t-il une valeur comptable ?',
      a: 'Non : un devis n’entre pas dans la comptabilité. Seule la facture, une fois émise, génère une écriture. C’est pourquoi Nexus les numérote dans deux séries séparées.',
    },
    {
      q: 'Puis-je modifier le montant d’un abonnement ?',
      a: 'Oui. La modification s’applique aux prochaines échéances ; les factures déjà émises ne changent pas, comme la loi l’exige.',
    },
    {
      q: 'Que se passe-t-il si je ne me connecte pas pendant plusieurs mois ?',
      a: 'Les échéances en retard sont rattrapées à votre prochaine connexion, dans l’ordre, avec une limite de douze à la fois par sécurité.',
    },
  ],
  related: ['factures', 'relances', 'banque'],
};
