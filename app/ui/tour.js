/**
 * Visite guidée (même fonctionnement que celle de Nexus RH) : un halo autour d'un élément réel de
 * l'écran et une carte d'explication à côté ; Suivant / Précédent / Passer, flèches du clavier, Échap.
 * Lancée seule à la première ouverture d'un compte sur cet appareil, relancée depuis le guide.
 */

import { html } from '../html.js?v=3bfbbd4';

const VUE_PREFIX = 'nexus_gestion_visite_vue_';

/** Étapes : chaque étape vise le premier élément visible de `cibles`, ou s'affiche au centre. */
const ETAPES = [
  {
    titre: 'Bienvenue sur Nexus Gestion',
    texte: 'Une visite de moins d’une minute pour repérer l’essentiel. Vous pouvez la quitter à tout moment, et la relancer depuis le guide.',
  },
  {
    cibles: ['#sidebar-nav', '#btn-mobile-nav-toggle'],
    titre: 'Le menu',
    texte: 'Vos écrans sont ici : factures, clients, dépenses, banque, déclarations et clôture. Sur téléphone, ouvrez-le avec le bouton ☰.',
    placement: 'right',
  },
  {
    cibles: ['.action-center'],
    titre: 'À faire',
    texte:
      'Ce qui demande votre attention, classé par urgence : factures à relancer, TVA à déclarer, transactions à justifier… Un clic ouvre l’écran qui permet de le traiter.',
    placement: 'bottom',
  },
  {
    cibles: ['#global-search-input'],
    titre: 'La recherche',
    texte: 'Retrouvez une facture, un client ou un fournisseur en tapant son nom ou son numéro. Raccourci : Ctrl+K.',
    placement: 'bottom',
  },
  {
    cibles: ['[data-action="guide-help"]'],
    titre: 'L’aide de l’écran',
    texte: 'Sur n’importe quel écran, ce bouton « ? » ouvre le guide à la page qui l’explique, avec les questions fréquentes.',
    placement: 'bottom-end',
  },
  {
    cibles: ['[data-action="reload"]'],
    titre: 'Mettre à jour',
    texte: 'Ce bouton recharge vos données et la dernière version de l’application, par exemple après une modification faite sur un autre appareil.',
    placement: 'bottom-end',
  },
  {
    cibles: ['#sidebar-nav-pinned .sync-status', '#sidebar-nav-pinned'],
    titre: 'Vos modifications',
    texte: '« Toutes les modifications sont enregistrées » confirme que tout est parti. Hors connexion, vos saisies attendent et partent au retour du réseau.',
    placement: 'right',
  },
  {
    cibles: ['#btn-user-menu'],
    titre: 'Votre compte et le guide',
    texte: 'Cliquez sur ce rond pour ouvrir le guide de l’application, changer de thème, régler vos paramètres ou vous déconnecter.',
    placement: 'bottom-end',
  },
  {
    titre: 'Vous êtes prêt',
    texte: 'Commencez par créer votre première facture ou importer votre relevé bancaire. Le guide reste disponible à tout moment, avec le bouton « ? ».',
  },
];

const cibleDe = (etape) => {
  for (const sel of etape.cibles || []) {
    const el = document.querySelector(sel);
    let r = el?.getBoundingClientRect();
    if (!r || !r.width || !r.height) continue;
    // Élément hors de la partie visible (bas de l'accueil sur un petit écran) : on le fait venir.
    if (r.top < 0 || r.top > window.innerHeight - 80) {
      el.scrollIntoView({ block: 'center' });
      r = el.getBoundingClientRect();
    }
    return r;
  }
  return null;
};

let visite = null;

/** Garde Tab / Maj+Tab dans `conteneur` (fenêtre modale : la page derrière n'est pas atteignable). */
export function garderFocus(e, conteneur) {
  if (e.key !== 'Tab' || !conteneur) return;
  const elems = [...conteneur.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.disabled && el.getClientRects().length,
  );
  if (!elems.length) return;
  const [premier, dernier] = [elems[0], elems.at(-1)];
  if (!conteneur.contains(document.activeElement)) {
    e.preventDefault();
    premier.focus();
  } else if (e.shiftKey && document.activeElement === premier) {
    e.preventDefault();
    dernier.focus();
  } else if (!e.shiftKey && document.activeElement === dernier) {
    e.preventDefault();
    premier.focus();
  }
}

/** Place la carte à côté de l'élément visé, sans jamais sortir de l'écran. */
function placer(carte, rect, placement) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const largeur = Math.min(340, vw - 24);
  carte.style.width = `${largeur}px`;
  const hauteur = carte.offsetHeight || 190;
  const ecart = 14;
  let top;
  let left;
  if (placement === 'right' && rect.right + ecart + largeur < vw - 12) {
    left = rect.right + ecart;
    top = Math.min(Math.max(rect.top + 12, 12), vh - hauteur - 12);
  } else {
    top = rect.bottom + ecart;
    if (top + hauteur > vh - 12) top = Math.max(12, rect.top - hauteur - ecart);
    left = placement === 'bottom-end' ? rect.right - largeur : rect.left;
  }
  carte.style.top = `${top}px`;
  carte.style.left = `${Math.min(Math.max(left, 12), vw - largeur - 12)}px`;
}

function afficher(focus = true) {
  const { etapes, index, root } = visite;
  const etape = etapes[index];
  const carte = root.querySelector('.tour-card');
  const halo = root.querySelector('.tour-spot');
  const dernier = index === etapes.length - 1;
  carte.innerHTML = html`<div class="tour-step-count">Étape ${index + 1} sur ${etapes.length}</div>
    <h3 id="tour-title">${etape.titre}</h3>
    <p>${etape.texte}</p>
    <div class="tour-actions">
      ${dernier ? html`<span></span>` : html`<button type="button" class="btn-link" data-tour="skip">Passer la visite</button>`}
      <span class="tour-actions-main">
        ${index > 0 ? html`<button type="button" class="btn btn-secondary btn-sm" data-tour="prev">Précédent</button>` : ''}
        <button type="button" class="btn btn-primary btn-sm" data-tour="next">${dernier ? 'Terminer' : 'Suivant'}</button>
      </span>
    </div>`.s;
  const rect = cibleDe(etape);
  root.classList.toggle('tour-centered', !rect);
  if (rect) {
    const m = 6;
    Object.assign(halo.style, {
      display: 'block',
      top: `${rect.top - m}px`,
      left: `${rect.left - m}px`,
      width: `${rect.width + m * 2}px`,
      height: `${rect.height + m * 2}px`,
    });
    placer(carte, rect, etape.placement || 'bottom');
  } else {
    halo.style.display = 'none';
    carte.style.top = '';
    carte.style.left = '';
  }
  if (focus) carte.querySelector('[data-tour="next"]').focus();
}

function aller(delta) {
  const suivant = visite.index + delta;
  if (suivant < 0) return;
  if (suivant >= visite.etapes.length) return finirVisite();
  visite.index = suivant;
  afficher();
}

export function finirVisite() {
  if (!visite) return;
  document.removeEventListener('keydown', visite.surTouche, true);
  window.removeEventListener('resize', visite.surTaille);
  window.removeEventListener('scroll', visite.surTaille, true);
  visite.root.remove();
  try {
    localStorage.setItem(VUE_PREFIX + visite.cle, '1');
  } catch {
    // stockage indisponible : la visite ne sera simplement pas mémorisée
  }
  visite = null;
}

/**
 * Lance la visite. `force` : relance volontaire (depuis le guide). Sinon, seulement la première fois pour
 * ce compte (`cle`) sur cet appareil, et jamais par-dessus une fenêtre ouverte.
 */
export function startTour({ force = false, cle = 'demo' } = {}) {
  if (visite || !document.getElementById('app-shell')?.dataset.ready) return false;
  if (!force) {
    try {
      if (localStorage.getItem(VUE_PREFIX + cle) === '1') return false;
    } catch {
      return false;
    }
    if (document.getElementById('modal-root')?.classList.contains('open')) return false;
  }
  const etapes = ETAPES.filter((e) => !e.cibles || cibleDe(e));
  document.getElementById('user-menu-panel')?.classList.remove('open');
  const root = document.createElement('div');
  root.id = 'tour-root';
  root.innerHTML = '<div class="tour-spot"></div><div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title"></div>';
  document.body.append(root);
  visite = {
    etapes,
    index: 0,
    root,
    cle,
    surTouche: (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finirVisite();
      } else if (e.key === 'Tab') garderFocus(e, root.querySelector('.tour-card'));
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        // Pas de raccourci vers la page sous le voile pendant la visite.
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === 'ArrowRight') aller(1);
      else if (e.key === 'ArrowLeft') aller(-1);
    },
    // Redessine le halo sur l'élément visé (taille de fenêtre, page qui défile) sans reprendre le focus.
    surTaille: () => afficher(false),
  };
  root.addEventListener('click', (e) => {
    const action = e.target.closest('[data-tour]')?.dataset.tour;
    if (action === 'skip') finirVisite();
    else if (action === 'next') aller(1);
    else if (action === 'prev') aller(-1);
  });
  document.addEventListener('keydown', visite.surTouche, true);
  window.addEventListener('resize', visite.surTaille);
  window.addEventListener('scroll', visite.surTaille, true);
  afficher();
  return true;
}
