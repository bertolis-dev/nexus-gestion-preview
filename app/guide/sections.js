/**
 * Guide — assemblage des chapitres pour l'entreprise ouverte : premiers pas, « Comment faire ? »,
 * un chapitre par écran du menu, glossaire et aide. Seul ce qui concerne l'entreprise est montré
 * (micro-entrepreneur ou société, TVA ou franchise, mode avancé).
 */

import { ECRANS, p, liste } from './screens.js?v=269c883';
import { THEMES } from './themes.js?v=269c883';

const dl = (paires) => `<dl class="guide-defs">${paires.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl>`;

const PREMIERS_PAS = [
  {
    id: 'bienvenue',
    groupe: 'Premiers pas',
    titre: 'Bienvenue sur Nexus Gestion',
    icone: 'home',
    intro:
      `<p class="guide-resume">Nexus Gestion tient votre comptabilité de la facture au bilan, sans que vous ayez à connaître le plan comptable : vous facturez, vous enregistrez vos dépenses, vous importez votre relevé, et les écritures se font toutes seules.</p>` +
      `<ol class="guide-steps"><li><strong>Repérez-vous</strong> avec le chapitre « Se repérer » : le menu, la recherche, les mises à jour et votre compte.</li><li><strong>Faites vos premières démarches</strong> avec « Comment faire ? » : facturer, enregistrer une dépense, importer un relevé, déclarer.</li><li><strong>Retrouvez de l’aide</strong> à tout moment : le bouton « ? » en haut explique l’écran affiché, et ce guide est dans le menu de votre compte.</li></ol>` +
      `<div class="guide-actions"><button type="button" class="btn btn-primary btn-sm" data-guide-start-tour>Lancer la visite guidée</button></div>`,
  },
  {
    id: 'reperes',
    groupe: 'Premiers pas',
    titre: 'Se repérer dans l’application',
    icone: 'compass',
    intro:
      `<p class="guide-resume">Quelques éléments toujours présents. Une fois repérés, vous savez utiliser tout le reste.</p>` +
      dl([
        ['Le menu à gauche', 'Il liste vos écrans. Sur téléphone, il s’ouvre avec le bouton ☰ en haut à gauche.'],
        ['La barre de recherche (Ctrl+K)', 'Tapez un numéro de facture, un client ou un fournisseur pour l’ouvrir directement.'],
        ['Le bouton « ? »', 'Il ouvre ce guide à la page de l’écran que vous regardez.'],
        ['Les deux flèches', 'Le bouton Mettre à jour recharge vos données et la dernière version de l’application.'],
        ['Le rond avec vos initiales', 'Votre compte : ce guide, le thème clair ou sombre, les paramètres et la déconnexion.'],
        [
          'En bas du menu',
          '« Toutes les modifications sont enregistrées » confirme que tout est parti ; hors connexion, vos saisies attendent et partent au retour du réseau.',
        ],
      ]) +
      p('Le <strong>mode avancé</strong> (Paramètres → Affichage) ajoute la comptabilité détaillée : journaux, balance, grand livre et FEC.'),
  },
];

const GLOSSAIRE = {
  id: 'glossaire',
  groupe: 'Aide',
  titre: 'Les mots de la comptabilité',
  icone: 'notepad',
  intro:
    `<p class="guide-resume">Les termes que vous croiserez, expliqués simplement.</p>` +
    dl([
      ['HT, TVA, TTC', 'Hors taxes, la taxe sur la valeur ajoutée, et toutes taxes comprises (HT + TVA).'],
      ['TVA collectée / récupérable', 'La TVA que vous facturez à vos clients et reversez à l’État / celle payée sur vos achats, que vous déduisez.'],
      ['TVA sur les encaissements', 'Pour les prestations de services : la TVA est due quand le client paie, et non à la facture.'],
      [
        'Autoliquidation',
        'Pour un achat à un fournisseur étranger (ou de sous-traitance du bâtiment) : vous déclarez vous-même la TVA, que vous récupérez en même temps.',
      ],
      ['CA3, CA12', 'Les déclarations de TVA : mensuelle ou trimestrielle (CA3), annuelle avec deux acomptes (CA12).'],
      ['Avoir', 'Le document qui annule tout ou partie d’une facture émise.'],
      ['Acompte', 'Une somme facturée avant la prestation, déduite ensuite de la facture finale.'],
      ['Rapprochement, lettrage', 'Associer un paiement de la banque à sa facture ; une facture lettrée est entièrement réglée.'],
      ['Immobilisation, amortissement', 'Un équipement durable (plus de 500 € HT) dont le coût est réparti sur plusieurs années.'],
      ['Exercice, clôture', 'La période comptable (souvent l’année civile) ; la clôture arrête les comptes et ouvre l’exercice suivant.'],
      ['FEC', 'Le fichier des écritures comptables à remettre à l’administration fiscale en cas de contrôle.'],
      ['Factur-X', 'Une facture PDF qui contient aussi la facture électronique : lisible par vous et par les logiciels.'],
    ]),
};

const AIDE = {
  id: 'aide',
  groupe: 'Aide',
  titre: 'Astuces et contact',
  icone: 'helpCircle',
  intro:
    liste(
      '<strong>Ctrl+K</strong> (⌘K sur Mac) ouvre la recherche depuis n’importe quel écran.',
      '<strong>Thème sombre :</strong> dans le menu de votre compte, choisissez Clair, Sombre ou Système.',
      '<strong>Installer Nexus :</strong> utilisez l’option « Installer l’application » de Chrome ou Edge (ou « Sur l’écran d’accueil » dans Safari) pour l’ouvrir comme une vraie application.',
      '<strong>Après une mise à jour :</strong> le bouton aux deux flèches charge la dernière version.',
    ) + p('Une question, un problème ? Écrivez-nous à <a href="mailto:contact@bertolis.fr">contact@bertolis.fr</a>.'),
};

/** Le chapitre (ou la question) est-il pertinent pour l'entreprise ouverte ? */
function pertinent(item, profil) {
  if (item.pour === 'micro') return profil.micro;
  if (item.pour === 'societe') return !profil.micro;
  if (item.pour === 'tva') return profil.tva;
  return true;
}

/**
 * Chapitres du guide.
 * @param {{ micro: boolean, tva: boolean, nav: { key: string, label: string, icon: string }[] }} profil
 * @returns {{ id, groupe, titre, icone, intro, entrees, vue? }[]}
 */
export function guideSections(profil) {
  const themes = THEMES.filter((t) => pertinent(t, profil))
    .map((t) => ({ ...t, groupe: 'Comment faire ?', entrees: t.entrees.filter((e) => pertinent(e, profil)) }))
    .filter((t) => t.entrees.length);
  const ecrans = [...profil.nav, { key: 'parametres', label: 'Paramètres', icon: 'gear' }]
    .filter((i) => ECRANS[i.key])
    .map((i) => ({
      id: `ecran-${i.key}`,
      groupe: 'Écrans',
      titre: i.label,
      icone: i.icon,
      vue: i.key,
      intro: `<p class="guide-resume">${ECRANS[i.key].resume}</p>${ECRANS[i.key].intro}`,
      entrees: ECRANS[i.key].faq.map((f, n) => ({ id: `ecran-${i.key}-${n}`, ...f })),
    }));
  return [...PREMIERS_PAS.map((s) => ({ ...s, entrees: [] })), ...themes, ...ecrans, { ...GLOSSAIRE, entrees: [] }, { ...AIDE, entrees: [] }];
}
