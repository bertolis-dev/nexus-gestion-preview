/**
 * Guide — un chapitre par écran du menu : à quoi il sert, une capture réelle (données de démonstration,
 * jamais de données réelles), comment l'utiliser et les questions fréquentes. La clé est celle de la route.
 */

export const p = (t) => `<p>${t}</p>`;
export const etapes = (...e) => `<ol class="guide-steps">${e.map((x) => `<li>${x}</li>`).join('')}</ol>`;
export const liste = (...e) => `<ul class="guide-tips-list">${e.map((x) => `<li>${x}</li>`).join('')}</ul>`;
/** Capture réelle de l'écran (app/features), agrandie au clic. */
export const capture = (fichier, alt, legende = '') =>
  `<figure class="guide-figure guide-shot"><img class="guide-shot-img" src="features/${fichier}.webp" alt="${alt}" width="800" height="500" loading="lazy" tabindex="0" role="button"><figcaption>${legende || alt}</figcaption></figure>`;

export const ECRANS = {
  accueil: {
    resume: 'Votre tableau de bord : où en est votre trésorerie, ce que vos clients vous doivent, et la liste de ce qu’il reste à faire.',
    intro:
      capture('accueil', 'Accueil : indicateurs, liste « À faire » et trésorerie prévisionnelle') +
      p(
        'Les quatre chiffres du haut résument votre activité : trésorerie, ce que vos clients vous doivent, chiffre d’affaires de l’exercice et résultat estimé. Un clic ouvre l’écran correspondant.',
      ) +
      p(
        'La liste <strong>À faire</strong> est classée par urgence : factures à relancer, TVA à déclarer, transactions à justifier, brouillons à émettre… Un clic sur une ligne ouvre directement l’écran qui permet de la traiter.',
      ) +
      p(
        'En bas, la <strong>trésorerie prévisionnelle</strong> estime votre solde à 30, 60 et 90 jours à partir de vos factures, dépenses, factures récurrentes, TVA, cotisations et impôt.',
      ),
    faq: [
      {
        q: 'Pourquoi une alerte « Trésorerie prévue sous zéro » ?',
        r: p(
          'La prévision montre que votre solde bancaire pourrait passer sous zéro à la date indiquée, avec le montant à couvrir. Cliquez dessus pour voir le détail des mouvements prévus : relancez une facture en retard ou décalez une dépense.',
        ),
        mots: 'negatif decouvert alerte prevision',
      },
      {
        q: 'D’où vient le chiffre « Trésorerie » ?',
        r: p(
          'C’est le solde de vos comptes bancaires dans Nexus, d’après les relevés importés dans l’écran Banque. Importez votre dernier relevé pour qu’il soit à jour.',
        ),
        mots: 'solde banque',
      },
      {
        q: 'Le résultat estimé est-il définitif ?',
        r: p(
          'Non : c’est une estimation à partir de ce qui est saisi. Le résultat définitif est arrêté à la clôture de l’exercice, après les écritures d’inventaire (amortissements, charges à payer…).',
        ),
        mots: 'benefice perte',
      },
    ],
  },
  ventes: {
    resume: 'Vos devis, factures, factures d’acompte et avoirs : création, émission, envoi au client, suivi des paiements et relances.',
    intro:
      capture('factures', 'Écran Factures : liste des factures avec leur statut, le reste dû et l’âge des impayés') +
      p(
        'La liste montre chaque facture avec son statut (brouillon, émise, payée, en retard) et ce qu’il reste à encaisser. Les onglets séparent les factures, les devis et les factures récurrentes.',
      ) +
      capture('facture-edition', 'Formulaire de facture : client, lignes, remise, TVA et totaux calculés') +
      p(
        'Une facture <strong>brouillon</strong> se modifie librement. Une fois <strong>émise</strong>, elle reçoit son numéro définitif et ne se modifie plus (obligation légale) : une erreur se corrige par un avoir.',
      ),
    faq: [
      {
        q: 'Comment facturer mes heures ?',
        r: p(
          'Onglet <strong>Temps passé</strong> : notez la date, le client, ce qui a été fait, la durée (1h30, 45 min…) et votre taux horaire. Dans « À facturer », <strong>Préparer la facture</strong> crée le brouillon avec une ligne par prestation : vérifiez-le, puis émettez-le.',
        ),
        mots: 'heures temps passe taux horaire regie',
      },
      {
        q: 'Comment savoir si un client a accepté mon devis en ligne ?',
        r: p(
          'Dans l’onglet Devis, le statut devient <strong>Accepté en ligne le …</strong> dès que votre client l’a accepté depuis son espace client (fiche du client). Ouvrez le devis et transformez-le en facture.',
        ),
        mots: 'devis accepte signe bon pour accord en ligne',
      },
      {
        q: 'Pourquoi Nexus refuse d’émettre ma facture ?',
        r: p(
          'Une mention obligatoire manque : le cadre rouge en haut du formulaire dit laquelle (SIREN du client, adresse, numéro de TVA…) et un clic sur le message place le curseur dans le champ à compléter.',
        ),
        mots: 'erreur mention obligatoire siren bloque',
      },
      {
        q: 'Puis-je modifier une facture déjà émise ?',
        r: p(
          'Non, c’est interdit par la loi pour garantir la numérotation. Faites un <strong>avoir</strong> (bouton sur la fiche de la facture) puis une nouvelle facture si besoin.',
        ),
        mots: 'corriger erreur changer',
      },
      {
        q: 'Que veut dire « numéro en attente de confirmation » ?',
        r: p(
          'Le numéro est attribué par le serveur pour qu’il n’y ait jamais de trou ni de doublon. Il s’affiche dès que la connexion le confirme, en général en une seconde. Hors connexion, il arrive au retour du réseau.',
        ),
        mots: 'numero hors ligne',
      },
    ],
  },
  clients: {
    resume: 'Le fichier de vos clients : coordonnées, SIREN, conditions, et pour chacun son chiffre d’affaires et ce qu’il vous doit.',
    intro:
      p(
        'La liste montre chaque client avec son chiffre d’affaires sur 12 mois et le montant dû. Un clic ouvre sa fiche : ses factures, ses paiements, et un bouton pour lui faire une nouvelle facture ou un devis.',
      ) +
      p(
        'Pour créer un client, cliquez sur <strong>Nouveau client</strong> : avec son SIREN, le bouton <strong>Remplir</strong> complète le nom et l’adresse depuis l’annuaire officiel des entreprises.',
      ),
    faq: [
      {
        q: 'Comment donner à un client l’accès à ses factures ?',
        r: p(
          'Sur la fiche du client, carte <strong>Espace client</strong> : créez le lien, puis copiez-le dans un e-mail. Votre client y voit ses factures et devis, les télécharge en PDF, paie par virement avec le QR code et accepte un devis en ligne. Le lien est valable un an ; <strong>Désactiver</strong> le coupe aussitôt.',
        ),
        mots: 'espace client portail lien acces factures devis en ligne',
      },
      {
        q: 'Comment importer mes clients depuis un fichier ?',
        r: p(
          'Bouton <strong>Importer une liste</strong> de l’écran Clients : un fichier CSV (export Excel) avec au moins une colonne « Nom ». Nexus reconnaît aussi SIREN, adresse, e-mail, pays et type de client, et vous montre les lignes ignorées.',
        ),
        mots: 'csv excel import fichier',
      },
      {
        q: 'Le SIREN est-il obligatoire ?',
        r: p('Pour un client entreprise en France, oui : il doit figurer sur la facture. Pour un particulier, non.'),
        mots: 'particulier entreprise',
      },
    ],
  },
  depenses: {
    resume:
      'Vos factures d’achat : saisie en quelques secondes, photo du justificatif, factures électroniques reçues et import des notes de frais de Nexus RH.',
    intro:
      capture('depenses', 'Écran Dépenses : formulaire d’ajout et liste des dépenses avec leur justificatif') +
      p(
        'Indiquez le fournisseur, le montant TTC et la <strong>catégorie</strong> en langage courant (Loyer, Téléphone, Carburant…) : Nexus en déduit le compte comptable et la TVA récupérable, y compris les règles particulières (voiture de tourisme, cadeaux, hôtel…).',
      ) +
      p(
        'Un équipement de plus de 500 € HT est automatiquement enregistré comme <strong>immobilisation</strong> et amorti : retrouvez-le dans l’onglet Équipements.',
      ),
    faq: [
      {
        q: 'Comment enregistrer mes trajets en voiture personnelle ?',
        r: p(
          'Onglet <strong>Trajets en voiture</strong> (sociétés et entreprises au réel) : date, départ, arrivée, motif, distance et puissance fiscale. Nexus calcule l’indemnité au barème kilométrique de l’administration, compte tenu des kilomètres déjà parcourus dans l’année, et l’inscrit comme somme due au dirigeant.',
        ),
        mots: 'kilometrique indemnite voiture trajet bareme deplacement',
      },
      {
        q: 'Comment exporter mes dépenses dans Excel ?',
        r: p(
          'Bouton <strong>Exporter (Excel)</strong> en haut de l’écran : un fichier avec date, fournisseur, catégorie, HT, TVA, TTC et reste à payer. Même bouton dans Factures pour vos ventes.',
        ),
        mots: 'export excel csv tableur liste',
      },
      {
        q: 'Pourquoi la TVA d’une prestation n’est pas récupérée tout de suite ?',
        r: p(
          'La loi la rend récupérable au moment où vous payez le prestataire (sauf s’il a opté pour la TVA « d’après les débits », case à cocher sur la dépense). Nexus la met en attente et la récupère automatiquement quand vous rapprochez le paiement dans l’écran Banque.',
        ),
        mots: 'tva deductible service paiement debits',
      },
      {
        q: 'Nexus m’indique un doublon, que faire ?',
        r: p(
          'Une dépense du même fournisseur avec le même montant et la même date (ou le même numéro) existe déjà. Vérifiez la liste ; si ce n’est pas un doublon, cliquez sur <strong>L’enregistrer quand même</strong>.',
        ),
        mots: 'double deux fois',
      },
      {
        q: 'Comment enregistrer un remboursement de fournisseur ?',
        r: p(
          'Choisissez le type de pièce <strong>Avoir</strong> dans le formulaire : la charge et la TVA diminuent, et le remboursement se rapproche ensuite dans l’écran Banque.',
        ),
        mots: 'avoir fournisseur remboursement',
      },
    ],
  },
  banque: {
    resume: 'Vos relevés bancaires : chaque mouvement est associé à une facture, une dépense ou une catégorie, pour une comptabilité à jour.',
    intro:
      capture('banque', 'Écran Banque : mouvements à justifier avec les propositions de rapprochement') +
      p(
        'Importez le relevé téléchargé depuis l’espace client de votre banque (CSV, OFX, CAMT.053 ou QIF). Pour chaque mouvement, Nexus propose la facture ou la dépense correspondante : un clic sur <strong>Associer</strong> suffit.',
      ) +
      p(
        'Un mouvement sans facture (frais bancaires, abonnement prélevé, apport…) se range avec une <strong>catégorie</strong>. Nexus retient votre choix et le proposera pour les mouvements semblables.',
      ),
    faq: [
      {
        q: 'Puis-je rapprocher plusieurs paiements d’un coup ?',
        r: p(
          'Oui : quand au moins deux paiements correspondent exactement à une facture ou une dépense (même montant, même tiers, sans autre choix possible), un bandeau propose <strong>Tout rapprocher</strong>. Les autres restent à valider un par un.',
        ),
        mots: 'tout rapprocher masse plusieurs automatique',
      },
      {
        q: 'Un relevé déjà importé crée-t-il des doublons ?',
        r: p('Non : chaque mouvement est reconnu, un relevé importé deux fois n’ajoute que les mouvements nouveaux.'),
        mots: 'doublon deux fois import',
      },
      {
        q: 'Un client a payé quelques centimes de moins, que faire ?',
        r: p('Associez le paiement à la facture : jusqu’à 1 €, l’écart est absorbé automatiquement (frais, arrondi) et la facture est soldée.'),
        mots: 'ecart centimes difference',
      },
      {
        q: 'Un client a payé plusieurs factures en un virement ?',
        r: p('Nexus le détecte et propose un <strong>paiement groupé</strong> des factures de ce client dont la somme correspond.'),
        mots: 'groupe plusieurs virement',
      },
      {
        q: 'Comment ajouter un justificatif à un mouvement déjà classé ?',
        r: p(
          'Dans « Déjà justifiées », bouton <strong>Ajouter le justificatif</strong> : sur téléphone, l’appareil photo s’ouvre directement. La photo est allégée avant l’envoi.',
        ),
        mots: 'photo justificatif ticket',
      },
    ],
  },
  tva: {
    resume: 'Vos déclarations de TVA préparées case par case (CA3 mensuelle ou trimestrielle, CA12 annuelle), à recopier sur impots.gouv.fr.',
    intro:
      capture('tva', 'Écran TVA : déclaration préparée avec les montants par case et le détail par facture') +
      p(
        'Choisissez la période : Nexus calcule la TVA collectée sur vos ventes (à la facturation ou à l’encaissement selon la nature) et la TVA récupérable sur vos achats, et affiche le montant de chaque case du formulaire officiel.',
      ) +
      p(
        'Recopiez les montants sur votre espace professionnel impots.gouv.fr, puis cliquez sur <strong>Valider la déclaration</strong> : la période est enregistrée comme déclarée et la TVA à payer apparaît dans la trésorerie prévisionnelle.',
      ),
    faq: [
      {
        q: 'Dois-je valider dans Nexus une déclaration déjà déposée sur impots.gouv.fr ?',
        r: p(
          'Oui : la validation enregistre la déclaration dans votre comptabilité (écriture de TVA) et l’exercice ne peut pas être clôturé tant que toutes les périodes ne sont pas validées.',
        ),
        mots: 'valider deposer impots',
      },
      {
        q: 'Un paiement est arrivé après la déclaration de son mois : est-il perdu ?',
        r: p('Non : sa TVA est automatiquement reportée dans la première période qui n’est pas encore déclarée.'),
        mots: 'retard paiement apres declaration',
      },
      {
        q: 'Que veut dire « crédit de TVA » ?',
        r: p(
          'Vous avez récupéré plus de TVA sur vos achats que vous n’en avez collecté : rien à payer, le crédit se reporte sur la déclaration suivante (ou se rembourse sur demande).',
        ),
        mots: 'credit remboursement',
      },
    ],
  },
  urssaf: {
    resume: 'Pour les micro-entrepreneurs : le chiffre d’affaires à déclarer chaque mois ou trimestre, les cotisations estimées et le suivi des seuils.',
    intro:
      capture('micro', 'Écran URSSAF et seuils : déclarations de l’année, montant à mettre de côté et livre des recettes') +
      p(
        'Pour chaque période, Nexus calcule le chiffre d’affaires <strong>encaissé</strong> à déclarer. Le bouton <strong>Déclarer</strong> ouvre un pas-à-pas : <strong>Copier le montant</strong>, <strong>Ouvrir mon espace URSSAF</strong> pour y déclarer, puis <strong>Enregistrer la déclaration</strong> avec les cotisations calculées par l’URSSAF.',
      ) +
      p(
        'L’encadré <strong>À mettre de côté</strong> estime ce qu’il faut prévoir pour les cotisations. Plus bas, le suivi du seuil de franchise de TVA et le livre des recettes (exportable).',
      ),
    faq: [
      {
        q: 'Pourquoi l’estimation des cotisations diffère de l’URSSAF ?',
        r: p(
          'Certains taux (formation professionnelle, chambre consulaire, versement libératoire) attendent la validation de notre expert-comptable et ne sont pas encore inclus : l’encadré en haut de l’écran le précise. Le montant qui fait foi est celui de l’URSSAF.',
        ),
        mots: 'estimation difference taux',
      },
      {
        q: 'Comment marquer les cotisations comme payées ?',
        r: p(
          'Quand le prélèvement apparaît sur votre relevé, classez-le dans l’écran Banque avec la catégorie <strong>Cotisations URSSAF</strong> : la période passe à « Payée ».',
        ),
        mots: 'paye prelevement',
      },
    ],
  },
  compta: {
    resume: 'Mode avancé : journaux, balance, grand livre, validation des écritures et export du FEC pour votre expert-comptable.',
    intro:
      capture('compta', 'Écran Comptabilité : onglets journaux, balance, grand livre et exercices clos') +
      p(
        'Toutes les écritures sont générées automatiquement par vos factures, dépenses et rapprochements. Cet écran les montre au format comptable et permet de les exporter (Excel ou FEC).',
      ) +
      p('<strong>Valider</strong> une période fige ses écritures (obligation légale avant la clôture) : elles ne pourront plus être modifiées.'),
    faq: [
      {
        q: 'Qu’est-ce que le FEC ?',
        r: p(
          'Le fichier des écritures comptables exigé par l’administration fiscale en cas de contrôle. Nexus le produit au format officiel ; il ne contient que les écritures validées.',
        ),
        mots: 'fichier ecritures controle fiscal',
      },
      { q: 'Comment afficher cet écran ?', r: p('Paramètres → Affichage → cochez <strong>Mode avancé</strong>.'), mots: 'mode avance afficher' },
    ],
  },
  cloture: {
    resume:
      'La fin de l’exercice : check-list de ce qu’il reste à faire, écritures d’inventaire, impôt, comptes annuels et dossier pour votre expert-comptable.',
    intro:
      capture('cloture', 'Écran Clôture : check-list, inventaire, impôt et comptes annuels') +
      p(
        'La <strong>check-list</strong> indique ce qui manque : transactions à justifier, déclarations de TVA à valider, factures anciennes impayées… Un clic sur un point ouvre l’écran qui permet de le traiter.',
      ) +
      p('Le bouton <strong>Dossier pour l’expert-comptable (ZIP)</strong> rassemble en un fichier le FEC, la balance, le grand livre et la check-list.'),
    faq: [
      {
        q: 'Pourquoi la clôture est-elle refusée ?',
        r: p(
          'Le message dit pourquoi : le plus souvent, des déclarations de TVA de l’exercice ne sont pas validées dans l’écran TVA. Validez-les (même celles déjà déposées sur impots.gouv.fr) puis recommencez.',
        ),
        mots: 'refuse bloque impossible',
      },
      {
        q: 'Qui clôture l’exercice d’une société ?',
        r: p('Votre expert-comptable, invité depuis Paramètres → Utilisateurs : il valide la clôture depuis son propre accès.'),
        mots: 'expert comptable societe',
      },
    ],
  },
  parametres: {
    resume: 'Votre entreprise, vos réglages de facturation, la sécurité de votre compte et vos données.',
    intro:
      capture('parametres', 'Écran Paramètres : rubriques de l’entreprise, de la facturation et de la sécurité') +
      p(
        'Les rubriques sont rangées à gauche : <strong>Mon entreprise</strong> (coordonnées, TVA, logo, qui saisit les salaires), <strong>Relances clients</strong>, <strong>Prestations et articles</strong> (votre catalogue), <strong>Catégories bancaires</strong>, <strong>Connexion et sécurité</strong>, <strong>Mes données</strong> et <strong>Affichage</strong>.',
      ),
    faq: [
      {
        q: 'Comment suivre mon stock ?',
        r: p(
          'Paramètres → <strong>Prestations et articles</strong> : en ajoutant un article, dépliez « Suivre le stock » et indiquez le stock de départ et le seuil d’alerte. Les ventes sont déduites à l’émission des factures (les avoirs les remettent) ; notez les livraisons dans « Entrée ou correction de stock ». Un stock bas apparaît dans « À faire ».',
        ),
        mots: 'stock inventaire article quantite alerte',
      },
      {
        q: 'Comment inviter mon expert-comptable ?',
        r: p(
          'Paramètres → <strong>Utilisateurs</strong> : saisissez son adresse e-mail et choisissez le rôle « Expert-comptable ». Il accède à vos comptes depuis son propre compte, avec la double authentification.',
        ),
        mots: 'inviter collaborateur acces',
      },
      {
        q: 'Comment récupérer toutes mes données ?',
        r: p(
          'Paramètres → Mes données → <strong>Exporter toutes mes données</strong> (réservé au dirigeant) : un fichier complet, conforme au droit à la portabilité.',
        ),
        mots: 'export rgpd sauvegarde',
      },
    ],
  },
  pilotage: {
    resume: 'Vos prochaines échéances fiscales, le budget de l’année comparé au réalisé, et en société le simulateur salaire ou dividendes.',
    intro:
      capture('pilotage', 'Écran Pilotage : budget de l’année comparé au réalisé') +
      p(
        '<strong>Échéances</strong> : les 12 prochains mois d’impôts et de formalités (impôt sur les sociétés, déclaration de résultats, honoraires à déclarer, CFE, approbation et dépôt des comptes, déclaration de revenus). Celles des 15 prochains jours apparaissent aussi dans « À faire ».',
      ) +
      p(
        '<strong>Budget</strong> : fixez vos montants de l’année par rubrique (chiffre d’affaires, achats, charges externes, salaires…). Nexus compare au réalisé et à ce qui était prévu à la date du jour.',
      ) +
      p(
        '<strong>Salaire ou dividendes</strong> (sociétés à l’impôt sur les sociétés) : pour un bénéfice donné, ce qui vous reste selon la part versée en salaire. Estimation simplifiée, à valider avec votre expert-comptable.',
      ),
    faq: [
      {
        q: 'Les dates des échéances sont-elles exactes ?',
        r: p(
          'Ce sont les dates habituelles pour un exercice standard. Le calendrier officiel est publié chaque année sur impots.gouv.fr ; votre expert-comptable confirme en cas de doute.',
        ),
        mots: 'calendrier fiscal date limite liasse cfe das2',
      },
      {
        q: 'Que signifie « Prévu à date » dans le budget ?',
        r: p(
          'La part du budget annuel correspondant aux jours déjà écoulés de l’exercice : si votre chiffre d’affaires réalisé est en dessous, vous êtes en retard sur votre objectif.',
        ),
        mots: 'budget previsionnel objectif realise',
      },
    ],
  },
};
