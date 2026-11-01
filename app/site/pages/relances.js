/** Page « Fonctionnalités » : relances. Règles de rédaction : voir app/features.js. */
export default {
  slug: 'relances',
  icon: 'bell',
  title: 'Relances clients',
  text: 'Rappel à 3 jours, relance à 15 jours, dernière relance à 30 jours : envoyées par e-mail en un clic, ou automatiquement chaque matin si vous l’activez. L’historique est conservé.',
  lead: 'Un retard de paiement sur deux vient d’un simple oubli. Nexus repère chaque facture échue, vous la signale au bon moment et envoie la relance par e-mail : en un clic, ou tout seul chaque matin si vous l’activez.',
  images: [
    {
      src: 'features/relance.webp',
      alt: 'Facture F2026-0002 en retard avec le bouton Relancer le client',
      caption: 'Sur une facture impayée, le reste dû s’affiche en haut et le bouton « Relancer le client » ouvre un e-mail déjà rédigé.',
    },
    {
      src: 'features/accueil.webp',
      alt: 'Liste À faire avec les factures en retard',
      caption: 'Chaque matin, la liste « À faire » vous dit qui relancer, avec le nombre de jours de retard. Les retards les plus anciens passent en premier.',
    },
  ],
  benefits: [
    {
      title: 'Retards détectés automatiquement',
      text: 'Dès le lendemain de l’échéance, la facture passe « En retard » et apparaît dans votre liste « À faire », avec le client, le numéro et le nombre de jours de retard.',
    },
    {
      title: 'Trois relances, au bon moment',
      text: 'Un rappel courtois 3 jours après l’échéance, une relance à 15 jours, une dernière relance à 30 jours : « À faire » propose l’étape atteinte, une seule fois. « Relancer le client par e-mail » envoie le message du bon niveau (numéro, date, reste dû, jours de retard) directement au client ; ses réponses arrivent dans votre boîte e-mail. La relance est ajoutée à l’historique de la facture.',
    },
    {
      title: 'Vos propres modèles',
      text: 'Les trois messages se modifient dans les Paramètres, avec des variables (client, numéro, montant, échéance, jours de retard) : vous gardez votre ton, Nexus remplit les détails.',
    },
    {
      title: 'Balance âgée des créances',
      text: 'L’écran Factures classe ce qu’on vous doit par ancienneté : à échoir, en retard de 0 à 30 jours, de 31 à 60 jours et de plus de 60 jours. Vous voyez immédiatement où agir.',
    },
    {
      title: 'Paiements partiels suivis',
      text: 'Si un client paie une partie, seul le reste dû est relancé. Le montant de l’e-mail est toujours le montant réellement restant.',
    },
    {
      title: 'Mentions légales de pénalités',
      text: 'Vos factures portent les pénalités de retard et l’indemnité forfaitaire de 40 € prévues par le Code de commerce : un argument utile dans la relance.',
    },
    {
      title: 'Relances automatiques',
      text: 'Cochez une case dans les Paramètres : chaque matin, les relances dues partent seules, avec vos modèles. Les factures en litige, avec un avoir ou déjà encaissées ne sont jamais relancées, et chaque envoi est listé avec son résultat.',
    },
    { title: 'Priorités claires', text: 'Les retards de plus de 30 jours passent en haut de la liste, avant les tâches moins urgentes.' },
  ],
  steps: [
    'Renseignez l’e-mail de facturation de vos clients dans leur fiche.',
    'Consultez votre liste « À faire » sur l’accueil : les factures en retard y apparaissent.',
    'Cliquez sur la ligne, puis sur « Relancer le client par e-mail » : la relance part tout de suite.',
    'Ou activez les relances automatiques dans Paramètres › Relances clients. Au paiement, le virement est rapproché dans l’écran Banque et la facture sort de la liste.',
  ],
  audience: [
    { role: 'Prestataires de services', text: 'Des clients professionnels qui paient à 30 ou 45 jours, et qu’il faut parfois relancer.' },
    { role: 'Dirigeants qui détestent relancer', text: 'Un e-mail poli et précis déjà écrit : il ne reste qu’à cliquer.' },
    { role: 'Entreprises attentives à leur trésorerie', text: 'Une vue claire de ce qu’on vous doit, par ancienneté, pour agir avant que ça coince.' },
  ],
  faq: [
    {
      q: 'Les relances partent-elles toutes seules ?',
      a: 'Si vous l’activez, oui : chaque matin, Nexus envoie les relances dues à 3, 15 et 30 jours. Sinon, vous gardez la main et envoyez chaque relance d’un clic depuis la facture.',
    },
    {
      q: 'Puis-je modifier le texte de la relance ?',
      a: 'Oui : les trois modèles se modifient dans Paramètres › Relances clients, avec vos propres formulations.',
    },
    {
      q: 'Comment une facture sort-elle de la liste ?',
      a: 'Dès que le paiement est associé à la facture dans l’écran Banque, elle passe « Payée » et disparaît de la liste des retards.',
    },
  ],
  related: ['factures', 'banque', 'devis'],
};
