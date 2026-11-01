/** Page « Fonctionnalités » : micro. Règles de rédaction : voir app/features.js. */
export default {
  slug: 'micro',
  icon: 'scale',
  title: 'Micro-entrepreneur',
  text: 'Livre des recettes, déclaration URSSAF guidée et suivie jusqu’au paiement, alerte avant de dépasser les seuils de TVA.',
  lead: 'La micro-entreprise a ses propres règles : pas de comptabilité complète, mais un livre des recettes, une déclaration à l’URSSAF et des seuils à surveiller. Nexus s’adapte et vous montre uniquement ce qui vous concerne.',
  images: [
    {
      src: 'features/micro.webp',
      alt: 'Écran URSSAF et seuils : montants à déclarer par trimestre, suivi du seuil de TVA et livre des recettes',
      caption:
        'Chaque période avec son chiffre d’affaires encaissé, son échéance et son état (à déclarer, en retard, déclarée, payée). Le bouton « Déclarer » ouvre le parcours guidé.',
    },
  ],
  benefits: [
    {
      title: 'Le montant URSSAF prêt chaque trimestre ou chaque mois',
      text: 'Le montant à déclarer est votre chiffre d’affaires réellement encaissé sur la période, et non facturé. Nexus le calcule à partir des paiements reçus, selon votre rythme de déclaration (trimestriel ou mensuel).',
    },
    {
      title: 'Déclaration guidée, suivie jusqu’au paiement',
      text: 'Un bouton « Déclarer » copie le montant, ouvre votre espace URSSAF et vous invite à reporter les cotisations calculées. Chaque période affiche son échéance et son état : à déclarer, en retard, déclarée, payée. Le prélèvement de l’URSSAF, classé en « Cotisations URSSAF » dans Banque, solde automatiquement la déclaration.',
    },
    {
      title: 'Cotisations estimées et somme à mettre de côté',
      text: 'Pour chaque période, Nexus estime vos cotisations selon votre activité, votre caisse de retraite (régime général ou CIPAV) et votre ACRE, et affiche la somme à mettre de côté pour le trimestre en cours. L’estimation pré-remplit votre déclaration ; le montant qui fait foi reste celui de l’URSSAF. Certaines contributions (formation professionnelle, versement libératoire, chambre consulaire) seront ajoutées à l’estimation une fois leurs taux validés par notre expert-comptable.',
    },
    {
      title: 'Rappel avant chaque échéance',
      text: 'La prochaine déclaration apparaît dans votre liste « À faire » avec sa date limite (30 avril, 31 juillet, 31 octobre, 31 janvier au trimestre). Passé ce délai, l’alerte passe en tête de liste.',
    },
    {
      title: 'Livre des recettes tenu automatiquement',
      text: 'Chaque encaissement est inscrit avec sa date, la facture, le client et le mode de paiement. Le livre est exportable en Excel à tout moment, comme l’exige la loi.',
    },
    {
      title: 'Une réponse claire sur la TVA',
      text: 'En tête de l’accueil et de l’écran URSSAF : « Vous êtes en franchise de TVA : aucune déclaration de TVA à faire », avec le rappel de la mention obligatoire sur vos factures. Nexus suit votre chiffre d’affaires encaissé et vous alerte à 80 % du seuil. En cas de dépassement, il explique quand la franchise prend fin (en tenant compte de l’année précédente) et le régime qui s’applique alors par défaut : le réel simplifié, avec une déclaration annuelle et deux acomptes.',
    },
    {
      title: 'Activité mixte prise en compte',
      text: 'Vous vendez des biens et des services ? Les deux seuils sont suivis séparément, comme le prévoit la règle.',
    },
    {
      title: 'Une interface allégée',
      text: 'Pas de TVA à déclarer, pas de bilan : le menu ne montre que Factures, Dépenses, Banque et URSSAF. Les factures portent automatiquement la mention « TVA non applicable, art. 293 B du CGI ».',
    },
    {
      title: 'Registre des achats',
      text: 'Si vous vendez des marchandises, vos achats sont tenus dans un registre, lui aussi obligatoire pour cette activité.',
    },
  ],
  steps: [
    'À l’inscription, indiquez que vous êtes micro-entrepreneur, puis précisez votre activité, votre caisse de retraite et votre ACRE dans Paramètres > Ma micro-entreprise.',
    'Émettez vos factures et importez votre relevé bancaire pour enregistrer les encaissements.',
    'À la fin du trimestre, Nexus vous le rappelle : ouvrez « URSSAF et seuils » et cliquez sur « Déclarer ».',
    'Copiez le montant, déclarez-le sur votre espace URSSAF, puis reportez les cotisations dans Nexus : la période passe « Déclarée », puis « Payée » au prélèvement.',
  ],
  audience: [
    { role: 'Freelances et indépendants', text: 'Des factures professionnelles et une déclaration URSSAF sans calcul.' },
    { role: 'Artisans et commerçants en micro', text: 'Le livre des recettes et le registre des achats tenus automatiquement.' },
    {
      role: 'Micro-entrepreneurs qui grandissent',
      text: 'Une alerte avant de perdre la franchise de TVA, et le passage au régime réel sans changer de logiciel.',
    },
  ],
  faq: [
    {
      q: 'Pourquoi le montant URSSAF est-il différent de ce que j’ai facturé ?',
      a: 'En micro-entreprise, on déclare ce qui a été encaissé, pas ce qui a été facturé. Une facture émise en mars mais payée en avril compte pour le deuxième trimestre.',
    },
    {
      q: 'Puis-je déclarer et payer directement depuis Nexus ?',
      a: 'Nexus prépare tout et vous guide : le montant à déclarer se copie en un clic et votre espace URSSAF s’ouvre directement. Vous validez la déclaration sur le site de l’URSSAF, puis reportez le montant des cotisations dans Nexus, qui suit leur paiement.',
    },
    {
      q: 'Que se passe-t-il si je dépasse le seuil de TVA ?',
      a: 'Nexus vous prévient dès 80 % du seuil. En cas de dépassement, il vous indique si la franchise est perdue immédiatement ou l’année suivante, pour que vous puissiez en parler à votre expert-comptable.',
    },
  ],
  related: ['factures', 'banque', 'relances'],
};
