/**
 * Guide — « Comment faire ? » : les démarches courantes, pas à pas. Chaque question est retrouvable par
 * la recherche ; `vue` ajoute un bouton qui ouvre l'écran concerné ; `pour` limite au profil
 * (« micro » ou « societe ») et `avance` au mode avancé.
 */

import { capture, etapes, p } from './screens.js?v=a619ec1';

export const THEMES = [
  {
    id: 'faire-facturer',
    titre: 'Facturer',
    icone: 'receipt',
    intro: p('Créer une facture conforme, l’envoyer, suivre son paiement et relancer.'),
    entrees: [
      {
        id: 'f-creer',
        q: 'Comment créer et envoyer une facture ?',
        vue: 'ventes',
        mots: 'nouvelle facture emettre envoyer client',
        r:
          etapes(
            'Ouvrez <strong>Factures</strong> et cliquez sur <strong>Créer une facture</strong>.',
            'Choisissez le client (ou créez-le), puis ajoutez les lignes : désignation, quantité, prix HT, TVA et nature (service ou bien).',
            'Cliquez sur <strong>Émettre et envoyer au client</strong> : la facture reçoit son numéro et part par e-mail avec le PDF joint.',
          ) + p('Pour la garder en brouillon, utilisez <strong>Enregistrer le brouillon</strong> : vous l’émettrez plus tard depuis sa fiche.'),
      },
      {
        id: 'f-remise',
        q: 'Comment faire une remise sur une ligne ?',
        mots: 'reduction rabais pourcentage',
        r: p(
          'Dans le formulaire de facture, remplissez la case <strong>Remise</strong> de la ligne en pourcentage (par exemple 10). Le total se recalcule aussitôt et la remise est imprimée sous la désignation, sur le PDF.',
        ),
      },
      {
        id: 'f-catalogue',
        q: 'Comment retrouver mes prestations habituelles avec leur prix ?',
        mots: 'catalogue article prestation prix',
        r: p(
          'Enregistrez-les dans <strong>Paramètres → Prestations et articles</strong>. Dans une facture, commencez à taper la désignation : Nexus la propose et remplit le prix et la TVA.',
        ),
      },
      {
        id: 'f-acompte',
        q: 'Comment facturer un acompte puis le solde ?',
        mots: 'acompte avance solde finale',
        r: etapes(
          'Écran Factures : bouton <strong>Facture d’acompte</strong>, puis émettez-la.',
          'À la fin, créez la facture finale du montant total : cochez l’acompte proposé, il est déduit automatiquement du net à payer.',
        ),
      },
      {
        id: 'f-avoir',
        q: 'Comment annuler ou corriger une facture émise ?',
        mots: 'annuler corriger erreur avoir rembourser',
        r: p(
          'Une facture émise ne se modifie pas. Ouvrez sa fiche et créez un <strong>avoir</strong> (total ou partiel), puis refaites une facture juste si besoin. Un avoir ne peut pas dépasser ce qui reste à créditer.',
        ),
      },
      {
        id: 'f-devis',
        q: 'Comment faire un devis et le transformer en facture ?',
        vue: 'ventes',
        mots: 'devis proposition accepte transformer',
        r:
          capture('devis-detail', 'Fiche d’un devis avec le bouton Transformer en facture') +
          p(
            'Créez un devis avec le bouton <strong>Créer un devis</strong> de l’écran Factures. Quand le client l’accepte, ouvrez-le et cliquez sur <strong>Transformer en facture</strong> : un brouillon de facture reprend les mêmes lignes.',
          ),
      },
      {
        id: 'f-recurrente',
        q: 'Comment facturer automatiquement chaque mois ?',
        mots: 'recurrente abonnement mensuel automatique',
        r:
          capture('recurrentes', 'Onglet Récurrentes : modèles de factures avec leur fréquence') +
          p(
            'Onglet <strong>Récurrentes</strong> de l’écran Factures : bouton <strong>Nouvelle facture récurrente</strong> (client, prestation, fréquence). Les factures sont préparées en brouillon à chaque échéance, ou émises automatiquement si vous cochez l’option.',
          ),
      },
      {
        id: 'f-relance',
        q: 'Comment relancer un client qui n’a pas payé ?',
        vue: 'ventes',
        mots: 'relance impaye retard rappel',
        r:
          capture('relance', 'Fiche d’une facture en retard avec le bouton de relance') +
          p(
            'L’Accueil propose la relance au bon moment (3, 15 et 30 jours de retard). Ouvrez la facture et cliquez sur <strong>Relancer le client</strong>. Les textes se modifient dans Paramètres → Relances clients, où vous pouvez aussi activer les relances automatiques.',
          ),
      },
      {
        id: 'f-reception',
        q: 'Dois-je recevoir mes factures fournisseurs par une plateforme agréée ?',
        mots: 'plateforme agreee reception obligation septembre 2026 facture electronique pa',
        r: p(
          'Oui : depuis le 1er septembre 2026, toute entreprise doit pouvoir <strong>recevoir</strong> ses factures électroniques par une plateforme agréée (l’émission devient obligatoire pour les TPE en septembre 2027). Choisissez-en une : plusieurs proposent une offre gratuite, souvent votre banque. Téléchargez ensuite les factures reçues (XML ou PDF Factur-X) et importez-les dans <strong>Dépenses</strong> → « Importer des factures reçues » : Nexus les enregistre toutes seules.',
        ),
      },
      {
        id: 'f-electronique',
        q: 'Mes factures sont-elles prêtes pour la facturation électronique ?',
        mots: 'facture electronique factur x plateforme agreee depot 2027',
        r: p(
          'Oui : chaque facture contient les nouvelles mentions obligatoires et se télécharge en PDF Factur-X (la facture électronique est jointe au PDF). Le mode <strong>dépôt</strong> prépare vos factures pour la plateforme agréée que vous utilisez (souvent gratuite avec votre banque ou votre logiciel), et vous importez dans Dépenses celles que vous y recevez.',
        ),
      },
    ],
  },
  {
    id: 'faire-pilotage',
    titre: 'Piloter son activité',
    icone: 'trendingUp',
    intro: p('Anticiper vos échéances, suivre votre budget, facturer votre temps et partager vos documents avec vos clients.'),
    entrees: [
      {
        id: 'p-echeances',
        q: 'Quelles sont mes prochaines échéances fiscales ?',
        vue: 'pilotage',
        mots: 'echeance calendrier fiscal impot cfe liasse das2 date limite',
        r: p(
          'Écran <strong>Pilotage</strong>, onglet Échéances : les 12 prochains mois, avec le montant estimé quand Nexus peut le calculer (impôt sur les sociétés). Celles des 15 prochains jours sont aussi dans « À faire ».',
        ),
      },
      {
        id: 'p-budget',
        q: 'Comment fixer et suivre mon budget ?',
        vue: 'pilotage',
        mots: 'budget objectif previsionnel realise',
        r: etapes(
          'Ouvrez <strong>Pilotage</strong>, onglet <strong>Budget</strong>.',
          'Saisissez les montants HT de l’année par rubrique, puis <strong>Enregistrer le budget</strong>.',
          'Le tableau compare ensuite le réalisé au budget et à ce qui était prévu à la date du jour.',
        ),
      },
      {
        id: 'p-remuneration',
        q: 'Vaut-il mieux me verser un salaire ou des dividendes ?',
        vue: 'pilotage',
        pour: 'societe',
        mots: 'salaire dividendes remuneration dirigeant simulateur',
        r: p(
          'Onglet <strong>Salaire ou dividendes</strong> de l’écran Pilotage : indiquez le bénéfice avant rémunération, Nexus compare cinq répartitions et indique la plus favorable. C’est une estimation par taux moyens : décidez avec votre expert-comptable (le salaire ouvre aussi des droits à la retraite).',
        ),
      },
      {
        id: 'p-temps',
        q: 'Comment noter mon temps et le facturer ?',
        vue: 'ventes',
        mots: 'temps passe heures taux horaire facturer regie',
        r: p(
          'Factures → onglet <strong>Temps passé</strong> : notez chaque intervention, puis <strong>Préparer la facture</strong> pour le client. Les temps facturés sont rattachés à la facture ; si vous supprimez le brouillon, ils redeviennent à facturer.',
        ),
      },
      {
        id: 'p-espace-client',
        q: 'Comment mes clients acceptent-ils un devis en ligne ?',
        vue: 'clients',
        mots: 'espace client devis accepter en ligne signature bon pour accord portail',
        r:
          etapes(
            'Émettez le devis (Factures → Devis).',
            'Sur la fiche du client, carte <strong>Espace client</strong>, créez le lien et envoyez-le-lui.',
            'Le client ouvre le lien, lit le devis, saisit son nom et clique sur <strong>Accepter le devis</strong> : son nom, la date et l’heure sont enregistrés.',
          ) +
          p(
            'Le devis apparaît alors « Accepté en ligne » : transformez-le en facture en un clic. Ce n’est pas une signature électronique certifiée, mais une acceptation datée et nominative.',
          ),
      },
    ],
  },
  {
    id: 'faire-depenses',
    titre: 'Dépenses et justificatifs',
    icone: 'paperclip',
    intro: p('Enregistrer vos achats et garder leurs justificatifs.'),
    entrees: [
      {
        id: 'd-photo',
        q: 'Comment enregistrer une dépense avec la photo du ticket ?',
        vue: 'depenses',
        mots: 'photo ticket justificatif telephone',
        r:
          etapes(
            'Ouvrez <strong>Dépenses</strong>, saisissez le fournisseur, la date, le montant TTC et la catégorie.',
            'Dans <strong>Justificatif</strong>, prenez la photo (sur téléphone, l’appareil photo s’ouvre) ou choisissez un PDF.',
            'Cliquez sur <strong>Enregistrer la dépense</strong>.',
          ) + p('Une grande photo est allégée avant l’envoi ; un PDF est conservé tel quel.'),
      },
      {
        id: 'd-electronique',
        q: 'Comment importer une facture électronique reçue ?',
        vue: 'depenses',
        mots: 'xml factur x zip import facture recue',
        r: p(
          'Bouton <strong>Importer des factures reçues</strong> de l’écran Dépenses : fichier XML, PDF Factur-X ou ZIP. Nexus lit le fournisseur, les montants et la TVA ; vérifiez la catégorie et enregistrez.',
        ),
      },
      {
        id: 'd-nexusrh',
        q: 'Comment importer les notes de frais et salaires de Nexus RH ?',
        vue: 'depenses',
        mots: 'nexus rh note frais ticket restaurant salaire paie import',
        r:
          etapes(
            'Dans Nexus RH, exportez le fichier du mois vers Nexus Gestion.',
            'Dans Nexus Gestion, écran <strong>Dépenses</strong>, cliquez sur <strong>Importer depuis Nexus RH</strong> et choisissez ce fichier.',
            'Vérifiez l’aperçu (rien n’est enregistré avant votre confirmation), puis cliquez sur <strong>Importer</strong>.',
          ) +
          p(
            'Une note déjà importée est ignorée. Les salaires servent à la trésorerie prévisionnelle, ou sont aussi comptabilisés selon le réglage « Qui saisit les salaires ? » (Paramètres → Mon entreprise).',
          ),
      },
      {
        id: 'd-equipement',
        q: 'Comment enregistrer un ordinateur ou un meuble ?',
        mots: 'immobilisation equipement amortissement materiel',
        r:
          capture('immobilisations', 'Onglet Équipements : biens amortis avec leur dotation de l’année') +
          p(
            'Saisissez-le comme une dépense, avec la catégorie correspondante. Au-delà de 500 € HT, il devient un <strong>équipement</strong> amorti sur plusieurs années : suivez-le dans l’onglet Équipements de l’écran Dépenses.',
          ),
      },
    ],
  },
  {
    id: 'faire-banque',
    titre: 'Banque',
    icone: 'card',
    intro: p('Importer vos relevés et justifier chaque mouvement.'),
    entrees: [
      {
        id: 'b-releve',
        q: 'Comment importer mon relevé bancaire ?',
        vue: 'banque',
        mots: 'releve import csv ofx camt qif banque',
        r: etapes(
          'Dans l’espace client de votre banque, téléchargez le relevé au format CSV, OFX, CAMT.053 ou QIF.',
          'Écran <strong>Banque</strong> : cliquez sur <strong>Importer un relevé</strong> et choisissez le fichier.',
          'Associez ensuite chaque mouvement à la facture ou dépense proposée, ou choisissez une catégorie.',
        ),
      },
      {
        id: 'b-categorie',
        q: 'Que faire d’un mouvement sans facture ?',
        mots: 'categorie frais bancaires apport sans facture',
        r: p(
          'Choisissez une <strong>catégorie</strong> (frais bancaires, apport, paiement de la TVA, cotisations…). S’il s’agit d’une dépense dont vous retrouverez la facture, ajoutez le justificatif plus tard avec <strong>Ajouter le justificatif</strong>.',
        ),
      },
      {
        id: 'b-comptes',
        q: 'Comment gérer plusieurs comptes bancaires ?',
        mots: 'plusieurs comptes livret second compte',
        r: p('Écran Banque : <strong>Ajouter un compte bancaire</strong>, puis importez le relevé de chaque compte en le sélectionnant en haut de l’écran.'),
      },
    ],
  },
  {
    id: 'faire-declarations',
    titre: 'TVA et URSSAF',
    icone: 'percent',
    intro: p('Déclarer sans erreur et payer à temps.'),
    entrees: [
      {
        id: 't-declarer',
        q: 'Comment déclarer ma TVA ?',
        vue: 'tva',
        pour: 'tva',
        mots: 'declaration ca3 ca12 impots',
        r: etapes(
          'Écran <strong>TVA</strong> : choisissez la période à déclarer (l’Accueil vous prévient avant l’échéance).',
          'Recopiez les montants case par case sur votre espace professionnel impots.gouv.fr.',
          'Revenez dans Nexus et cliquez sur <strong>Valider la déclaration</strong>.',
        ),
      },
      {
        id: 'u-declarer',
        q: 'Comment déclarer mon chiffre d’affaires à l’URSSAF ?',
        vue: 'urssaf',
        pour: 'micro',
        mots: 'urssaf declaration micro chiffre affaires cotisations',
        r: etapes(
          'Écran <strong>URSSAF et seuils</strong> : cliquez sur <strong>Déclarer</strong> sur la période concernée.',
          'Copiez le montant et déclarez-le sur votre espace URSSAF.',
          'Reportez dans Nexus les cotisations calculées par l’URSSAF et enregistrez.',
        ),
      },
    ],
  },
  {
    id: 'faire-cloture',
    titre: 'Fin d’exercice',
    icone: 'lock',
    pour: 'societe',
    intro: p('Préparer la clôture et transmettre le dossier à votre expert-comptable.'),
    entrees: [
      {
        id: 'c-preparer',
        q: 'Comment préparer ma clôture ?',
        vue: 'cloture',
        mots: 'cloture fin exercice bilan check list',
        r: p(
          'Ouvrez <strong>Préparer ma clôture</strong> (<strong>Clôture</strong> en mode avancé) et suivez la check-list point par point : chaque point non fait ouvre l’écran qui permet de le régler (transactions à justifier, TVA à valider, créances anciennes…).',
        ),
      },
      {
        id: 'c-dossier',
        q: 'Comment envoyer mon dossier à l’expert-comptable ?',
        vue: 'cloture',
        mots: 'dossier zip expert comptable fec balance grand livre',
        r: p(
          'Bouton <strong>Dossier pour l’expert-comptable (ZIP)</strong> de l’écran Clôture : FEC, balance, grand livre et check-list en un seul fichier, à lui transmettre. Le FEC n’y figure que si toutes les écritures sont validées.',
        ),
      },
    ],
  },
  {
    id: 'faire-compte',
    titre: 'Compte et sécurité',
    icone: 'shield',
    intro: p('Votre connexion, vos accès et vos e-mails.'),
    entrees: [
      {
        id: 's-double',
        q: 'Pourquoi un code à chaque connexion ?',
        mots: 'double authentification code application connexion securite',
        r: p(
          'Vos comptes sont protégés par la <strong>double authentification</strong> : en plus du mot de passe, un code de votre application d’authentification. Ajoutez un second appareil de secours dans Paramètres → Connexion et sécurité, pour ne jamais être bloqué.',
        ),
      },
      {
        id: 's-emails',
        q: 'Mes factures partent-elles vraiment par e-mail ?',
        mots: 'email mail envoi test brevo',
        r: p(
          'Oui, quand l’envoi est en service : Paramètres → Relances clients indique son état, et le bouton <strong>M’envoyer un e-mail de test</strong> vérifie qu’un message arrive. Les réponses de vos clients arrivent dans votre boîte e-mail.',
        ),
      },
      {
        id: 's-conformite',
        q: 'Nexus respecte-t-il les règles des logiciels de comptabilité ?',
        mots: 'conformite inalterabilite securisation conservation archivage controle fiscal loi anti fraude',
        r: p(
          'Oui pour les quatre conditions demandées : <strong>inaltérabilité</strong> (une écriture validée ou une facture émise ne se modifie plus ; on corrige par une nouvelle écriture ou un avoir), <strong>sécurisation</strong> (journal d’audit chaîné, double authentification), <strong>conservation</strong> (données gardées par exercice, exercices clos en lecture seule) et <strong>archivage</strong> (FEC, dossier de clôture, export complet). La page « Conformité » du site les détaille.',
        ),
      },
      {
        id: 's-recharger',
        q: 'Une modification n’apparaît pas, ou l’application semble ancienne',
        mots: 'mise a jour recharger synchronisation version probleme',
        r: p(
          'Cliquez sur le bouton <strong>Mettre à jour</strong> (les deux flèches, en haut à droite) : il recharge vos données et la dernière version de l’application. En bas du menu, « Toutes les modifications sont enregistrées » confirme que tout est bien parti.',
        ),
      },
    ],
  },
];
