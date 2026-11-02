/**
 * Site public : page d’accueil, pages Fonctionnalités, agrandissement des captures.
 */

import { html, raw } from '../html.js?v=17f2ba9';
import { ICONS } from '../icons.js?v=17f2ba9';
import { $ } from '../render.js?v=17f2ba9';
import { CONTACT_EMAIL, ui } from '../state.js?v=17f2ba9';
import { brand, icon } from '../ui/common.js?v=17f2ba9';

// Pages « Fonctionnalités » du site public (50 Ko) : chargées seulement quand le site public s'affiche.
export let features = null;

export const loadFeatures = async () => (features ??= await import('../features.js?v=17f2ba9'));

export const featureBySlug = (slug) => features?.featureBySlug(slug);

// ------------------------------------------------------------------ site public (même gabarit que Nexus RH)

export const LANDING_FAQ = [
  {
    q: 'Faut-il connaître la comptabilité ?',
    a: 'Non. Vous créez des factures, ajoutez vos dépenses et associez vos virements ; Nexus passe les écritures comptables pour vous. Les termes comptables n’apparaissent qu’en mode avancé, pour votre expert-comptable.',
  },
  {
    q: 'Suis-je prêt pour la facturation électronique ?',
    a: 'Vos factures portent déjà les mentions obligatoires de septembre 2027 (SIREN du client, nature des opérations). Le mode « dépôt » les prépare en un clic (PDF Factur-X) pour la plateforme agréée que vous utilisez, souvent gratuite avec votre banque ou votre logiciel.',
  },
  {
    q: 'Mes données sont-elles en sécurité ?',
    a: 'Elles sont hébergées à Paris, isolées par entreprise, et accessibles uniquement avec votre mot de passe et un code à usage unique sur votre téléphone.',
  },
  {
    q: 'Mon expert-comptable peut-il travailler dessus ?',
    a: 'Oui : il retrouve la balance, le grand livre, les journaux et un export FEC conforme, sans rien ressaisir.',
  },
  {
    q: 'Puis-je importer mon relevé bancaire ?',
    a: 'Oui, aux formats CSV, OFX, CAMT.053 et QIF proposés par les banques. Un relevé importé deux fois ne crée aucun doublon.',
  },
];

export function detectDevicePlatform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function viewLanding() {
  const platform = detectDevicePlatform();
  const platformCard = (key, iconName, title, sub, content) =>
    html` <div class="card landing-platform-card ${platform === key ? 'landing-platform-card-active' : ''}">
      ${platform === key ? html`<div class="landing-platform-badge">Votre appareil</div>` : ''}
      <div class="landing-platform-icon">${raw(ICONS[iconName])}</div>
      <h3>${title}</h3>
      <p class="text-muted">${sub}</p>
      ${content}
    </div>`;
  const steps = (list) =>
    html`<ol class="landing-steps">
      ${list.map((s, i) => html`<li><span class="landing-step-num">${i + 1}</span><span class="landing-step-text">${raw(s)}</span></li>`)}
    </ol>`;
  const plan = (name, price, detail, items, tag) =>
    html` <div class="landing-step-card">
      ${tag ? html`<span class="badge landing-badge-gold">${tag}</span>` : ''}
      <h3>${name}</h3>
      <strong class="landing-gradient-number" style="font-size:30px">${price}</strong>
      <p class="text-muted">${detail}</p>
      <ul style="padding-left:18px;margin:6px 0 0;font-size:14px;line-height:1.7">
        ${items.map((i) => html`<li>${i}</li>`)}
      </ul>
    </div>`;
  return html` <div class="landing-page">
    <header class="landing-topbar">
      <div class="landing-topbar-left">
        <div class="landing-brand">${brand}</div>
        <div class="landing-nav-menu">
          <button
            type="button"
            class="btn btn-secondary btn-sm landing-nav-menu-trigger"
            data-action="landing-menu"
            aria-haspopup="true"
            aria-expanded="false"
            aria-label="Menu"
          >
            ${raw(ICONS.menu)}
          </button>
          <nav class="landing-nav-links" id="landing-nav-links">
            <button type="button" class="landing-nav-link" data-goto="landing-fonctionnalites">Fonctionnalités</button>
            <button type="button" class="landing-nav-link" data-goto="landing-tarifs">Tarifs</button>
            <button type="button" class="landing-nav-link" data-goto="landing-installer">Installer</button>
            <button type="button" class="landing-nav-link" data-goto="landing-faq">Questions</button>
          </nav>
        </div>
      </div>
      <nav class="landing-topbar-nav">
        <button type="button" class="btn btn-secondary" data-action="goto-login">Se connecter</button>
        <button type="button" class="btn btn-gold landing-topbar-cta btn-arrow-cta" data-action="goto-signup">
          <span class="landing-topbar-cta-full">Créer mon entreprise</span><span class="landing-topbar-cta-short">S'inscrire</span>
          <span class="btn-arrow">→</span>
        </button>
      </nav>
    </header>

    <section class="landing-hero">
      <div class="landing-hero-inner">
        <div class="landing-hero-text">
          <span class="badge landing-badge-gold">Nouveau · Prêt pour la facture électronique</span>
          <h1>La comptabilité de votre TPE, de la facture au bilan, sans jargon</h1>
          <p>
            Nexus Gestion tient votre comptabilité à votre place : vous facturez, vous ajoutez vos dépenses, vous associez vos virements. Les écritures, la TVA
            et le FEC se font tout seuls.
          </p>
          <div class="landing-hero-cta">
            <button type="button" class="btn btn-gold btn-arrow-cta" data-action="goto-signup">Créer mon entreprise <span class="btn-arrow">→</span></button>
            <button type="button" class="btn btn-ghost-light" data-action="demo">Voir la démonstration</button>
          </div>
          <div class="landing-trust-row">
            <span>${icon('lock', 14)} Double authentification obligatoire</span>
            <span>${icon('shield', 14)} Accès isolé par entreprise</span>
            <span>${icon('checkCircle', 14)} Export FEC conforme</span>
            <span>${icon('globe', 14)} Données hébergées à Paris · Conforme RGPD</span>
          </div>
        </div>
        <div class="landing-hero-mock">
          <img
            class="landing-hero-screenshot"
            src="landing-screenshot.webp"
            alt="Tableau de bord Nexus Gestion : trésorerie, créances clients, liste À faire"
            width="1280"
            height="760"
            loading="eager"
          />
        </div>
      </div>
    </section>

    <section class="landing-stats-band">
      <div class="landing-stat-tile">
        <strong class="landing-gradient-number">0 €</strong><span>Pour les micro-entrepreneurs : facturation, livre des recettes et URSSAF</span>
      </div>
      <div class="landing-stat-tile">
        <strong class="landing-gradient-number">2 min</strong><span>Pour créer et envoyer une facture conforme, paramétrage compris</span>
      </div>
      <div class="landing-stat-tile">
        <strong class="landing-gradient-number">0</strong><span>Numéro de compte comptable à connaître : vous choisissez une catégorie en français</span>
      </div>
      <div class="landing-stat-tile">
        <strong class="landing-gradient-number">100%</strong><span>Des écritures générées automatiquement à partir de vos factures et de votre banque</span>
      </div>
    </section>

    <section class="landing-section" id="landing-fonctionnalites">
      <div class="landing-section-head">
        <h2>Tout ce qu'il faut, rien de superflu</h2>
        <p>Pensé pour les dirigeants qui ne sont pas comptables : chaque écran parle votre langue, pas celle du plan comptable.</p>
      </div>
      <div class="landing-features-grid">
        ${features.FEATURE_PAGES.map(
          (f) =>
            html`<a
              class="card landing-feature-card"
              href="#fonctionnalite/${f.slug}"
              style="display:block;color:inherit;text-decoration:none"
              aria-label="En savoir plus sur ${f.title}"
              ><div class="landing-feature-icon">${raw(ICONS[f.icon])}</div>
              <h3>${f.title}</h3>
              <p>${f.text}</p>
              <span class="landing-feature-more">En savoir plus →</span></a
            >`,
        )}
      </div>
    </section>

    <section class="landing-section landing-section-alt" id="landing-comment">
      <div class="landing-section-head"><h2>Comment ça marche</h2></div>
      <div class="landing-steps-grid">
        <div class="landing-step-card">
          <div class="landing-step-badge">1</div>
          <h3>Saisissez votre SIREN</h3>
          <p class="text-muted">Nom, adresse et forme juridique sont remplis automatiquement. Quatre questions simples suffisent à régler votre régime.</p>
        </div>
        <div class="landing-step-card">
          <div class="landing-step-badge">2</div>
          <h3>Ajoutez votre banque</h3>
          <p class="text-muted">Importez votre relevé : Nexus associe chaque mouvement à la bonne facture ou vous propose une catégorie.</p>
        </div>
        <div class="landing-step-card">
          <div class="landing-step-badge">3</div>
          <h3>C'est tenu</h3>
          <p class="text-muted">Factures, TVA, balance et FEC sont à jour en permanence. Votre liste « À faire » vous dit quoi faire et quand.</p>
        </div>
      </div>
    </section>

    <section class="landing-section" id="landing-fiabilite">
      <div class="landing-section-head">
        <h2>Vos données ne se perdent pas</h2>
        <p>Une comptabilité doit être juste et disponible, toujours. Nexus est construit pour ne rien perdre.</p>
      </div>
      <div class="landing-features-grid">
        ${[
          [
            'archive',
            'Sauvegarde chaque nuit',
            'Une copie complète de votre comptabilité est faite toutes les nuits et conservée 30 jours, en plus des sauvegardes de l’hébergeur.',
          ],
          [
            'shield',
            'Double authentification',
            'Mot de passe et code à usage unique sur votre téléphone, pour tout le monde : un mot de passe volé ne suffit pas.',
          ],
          [
            'lock',
            'Journal infalsifiable',
            'Chaque modification est tracée dans un journal chaîné : impossible d’effacer ou de réécrire une opération sans que cela se voie.',
          ],
          [
            'refresh',
            'Rien ne s’écrase',
            'Deux onglets, deux appareils, votre expert-comptable en même temps que vous : chaque modification arrive, dans l’ordre, sans écraser celle des autres.',
          ],
          [
            'checkCircle',
            'Vous restez connecté',
            'Pas de déconnexion surprise : une coupure de réseau ne vous renvoie pas à l’écran de connexion, Nexus reprend tout seul.',
          ],
          [
            'folder',
            'Vos données vous appartiennent',
            'Hébergées à Paris, exportables à tout moment en un clic (FEC et fichier complet), lisibles par n’importe quel autre logiciel.',
          ],
        ].map(
          ([icon, title, text]) =>
            html`<div class="card landing-feature-card">
              <div class="landing-feature-icon">${raw(ICONS[icon])}</div>
              <h3>${title}</h3>
              <p>${text}</p>
            </div>`,
        )}
      </div>
    </section>

    <section class="landing-section" id="landing-tarifs">
      <div class="landing-section-head">
        <h2>Des formules simples</h2>
        <p>Prix affichés en clair, sans engagement. Les tarifs des formules société seront publiés à l'ouverture.</p>
      </div>
      <div class="landing-steps-grid">
        ${plan('Micro-entrepreneur', '0 €', 'Pour facturer et suivre votre activité', ['Factures et avoirs conformes', 'Livre des recettes et registre des achats', 'Montant URSSAF par trimestre', 'Alerte seuils de TVA'])}
        ${plan('Société', 'Bientôt', 'EURL à l’IR ou à l’IS', ['Tout Micro-entrepreneur', 'Rapprochement bancaire et lettrage', 'TVA préparée (CA3 / CA12)', 'Balance, grand livre, FEC'], 'Ouverture prochaine')}
        ${plan('Société + clôture', 'Bientôt', 'Jusqu’au bilan', ['Tout Société', 'Écritures d’inventaire assistées', 'Bilan et compte de résultat', 'Dossier de clôture pour l’expert-comptable'], 'En préparation')}
      </div>
      <div class="landing-compare-table-wrap">
        <table class="landing-compare-table">
          <thead>
            <tr>
              <th></th>
              <th>Nexus Gestion</th>
              <th>La plupart des logiciels du marché</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Vocabulaire</td>
              <td>« Ce que mes clients me doivent », « Dépense », « Recette »</td>
              <td>Comptes 411, 401, lettrage</td>
            </tr>
            <tr>
              <td>Banque</td>
              <td>Toutes les banques, par import de relevé</td>
              <td>Souvent liée à une seule banque</td>
            </tr>
            <tr>
              <td>Sécurité</td>
              <td>Double authentification obligatoire</td>
              <td>Souvent en option</td>
            </tr>
            <tr>
              <td>Avec Nexus RH</td>
              <td>Notes de frais, tickets restaurant et salaires importés en un fichier</td>
              <td>Deux outils séparés</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="landing-section" id="landing-faq">
      <div class="landing-section-head"><h2>Questions fréquentes</h2></div>
      <div class="landing-faq-list">
        ${LANDING_FAQ.map(
          (item, i) =>
            html` <div class="landing-faq-item ${ui.faqOpen === String(i) ? 'landing-faq-item-open' : ''}">
              <button
                type="button"
                class="landing-faq-question"
                data-action="faq"
                data-index="${i}"
                aria-expanded="${ui.faqOpen === String(i) ? 'true' : 'false'}"
                aria-controls="faq-${i}"
              >
                <span>${item.q}</span><span class="landing-faq-chevron" aria-hidden="true">⌄</span>
              </button>
              <div class="landing-faq-answer" id="faq-${i}" ${ui.faqOpen === String(i) ? '' : raw('hidden')}><p>${item.a}</p></div>
            </div>`,
        )}
      </div>
    </section>

    <section class="landing-section landing-install-section" id="landing-installer">
      <div class="landing-section-head">
        <h2>Installez Nexus Gestion en 1 minute</h2>
        <p>Une icône sur votre bureau ou votre écran d'accueil, ouverture instantanée, comme une vraie application. Gratuit, sans magasin d'applications.</p>
      </div>
      <div class="landing-install-grid">
        ${platformCard(
          'desktop',
          'desktop',
          'Ordinateur',
          'Windows, via Chrome ou Edge',
          html` <button type="button" class="btn btn-gold" data-action="install">${icon('desktop', 14)} Installer Nexus Gestion</button>
            ${steps(['Ouvrez ce site dans <strong>Chrome</strong> ou <strong>Edge</strong>', 'Cliquez sur l’icône d’installation, à droite de la barre d’adresse', 'Confirmez : Nexus s’ouvre comme une application'])}`,
        )}
        ${platformCard('ios', 'mobile', 'iPhone & iPad', 'Via Safari (obligatoire)', steps(['Ouvrez ce site dans <strong>Safari</strong>', 'Appuyez sur <strong>Partager</strong>, en bas de l’écran', 'Choisissez <strong>« Sur l’écran d’accueil »</strong>, puis « Ajouter »']))}
        ${platformCard(
          'android',
          'mobile',
          'Android',
          'Via Chrome',
          html` ${platform === 'android' ? html`<button type="button" class="btn btn-gold" data-action="install">${icon('mobileAlert', 14)} Installer Nexus Gestion</button>` : ''}
          ${steps(['Ouvrez ce site dans <strong>Chrome</strong>', 'Appuyez sur <strong>⋮</strong>, en haut à droite', 'Choisissez <strong>« Installer l’application »</strong>'])}`,
        )}
      </div>
    </section>

    <section class="landing-cta-banner">
      <h2>Prêt à ne plus vous soucier de votre comptabilité ?</h2>
      <p>Créez votre entreprise en quelques minutes, aucune carte bancaire requise.</p>
      <div class="landing-cta-banner-actions">
        <button type="button" class="btn btn-gold btn-arrow-cta" data-action="goto-signup">Créer mon entreprise <span class="btn-arrow">→</span></button>
        <button type="button" class="btn btn-ghost-light" data-action="goto-login">Se connecter</button>
      </div>
    </section>

    <footer class="landing-footer">
      <div class="landing-footer-top">
        <div class="landing-brand">${brand}</div>
        <nav class="landing-footer-links">
          <button type="button" class="btn-link" data-action="goto-login">Se connecter</button>
          <button type="button" class="btn-link" data-action="goto-signup">Créer mon entreprise</button>
          <button type="button" class="btn-link" data-action="demo">Démonstration</button>
        </nav>
      </div>
      <p class="landing-footer-bottom">© ${new Date().getFullYear()} BERTOLIS · Nexus Gestion · <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
    </footer>
  </div>`;
}

/** Slug de la page « Fonctionnalité » demandée dans l'adresse (#fonctionnalite/banque), sinon null. */
export function featureSlug() {
  const m = /^#fonctionnalite\/([a-z-]+)$/.exec(location.hash);
  if (!m) return null;
  // Avant chargement des pages, l'adresse suffit ; ensuite, le slug doit exister.
  return !features || featureBySlug(m[1]) ? m[1] : null;
}

/** Vraie page par fonctionnalité (adresse partageable, retour du navigateur), même gabarit que Nexus RH,
 * illustrée par de vraies captures de l'application (scripts/screenshots.mjs). */
export function viewFeature(slug) {
  const f = featureBySlug(slug);
  const [hero] = f.images;
  const shot = (img, cls = 'feature-shot') =>
    html`<img
      class="${cls} landing-hero-screenshot-zoomable"
      src="${img.src}"
      alt="${img.alt}"
      width="1440"
      height="900"
      loading="lazy"
      data-action="lightbox"
      data-src="${img.src}"
    />`;
  return html` <div class="landing-page feature-detail-page">
    <header class="landing-topbar">
      <div class="landing-topbar-left">
        <div class="landing-brand">${brand}</div>
        <button
          type="button"
          class="btn btn-secondary btn-sm feature-page-back-btn"
          data-action="feature-back"
          aria-label="Retour à toutes les fonctionnalités"
        >
          <span class="feature-page-back-full">← Toutes les fonctionnalités</span><span class="feature-page-back-short" aria-hidden="true">←</span>
        </button>
      </div>
      <nav class="landing-topbar-nav">
        <button type="button" class="btn btn-secondary" data-action="goto-login">Se connecter</button>
        <button type="button" class="btn btn-gold landing-topbar-cta btn-arrow-cta" data-action="goto-signup">
          <span class="landing-topbar-cta-full">Créer mon entreprise</span><span class="landing-topbar-cta-short">S'inscrire</span>
          <span class="btn-arrow">→</span>
        </button>
      </nav>
    </header>

    <section class="feature-page-hero">
      <div class="landing-hero-inner">
        <div class="landing-hero-text">
          <span class="feature-page-eyebrow">Fonctionnalité</span>
          <div class="feature-page-icon-badge">${raw(ICONS[f.icon])}</div>
          <h1>${f.title}</h1>
          <p>${f.lead}</p>
          <div class="landing-hero-cta">
            <button type="button" class="btn btn-gold btn-arrow-cta" data-action="goto-signup">Créer mon entreprise <span class="btn-arrow">→</span></button>
            <button type="button" class="btn btn-secondary" data-action="demo">Voir la démonstration</button>
          </div>
        </div>
        <div class="landing-hero-mock">${shot(hero, 'landing-hero-screenshot')}</div>
      </div>
    </section>

    <section class="landing-section">
      <div class="landing-section-head"><h2>Ce que vous obtenez</h2></div>
      <div class="feature-benefits-grid">
        ${f.benefits.map(
          (b) =>
            html`<div class="card feature-benefit-card">
              <h3>${icon('checkCircle', 16)} ${b.title}</h3>
              <p>${b.text}</p>
            </div>`,
        )}
      </div>
    </section>

    <section class="landing-section landing-section-alt">
      <div class="landing-section-head">
        <h2>À l'écran</h2>
        <p>Captures de l'application, prises sur l'entreprise de démonstration. Cliquez sur une image pour l'agrandir.</p>
      </div>
      <div class="feature-gallery">
        ${f.images.map(
          (img) =>
            html`<figure class="feature-figure">
              ${shot(img)}
              <figcaption>${img.caption}</figcaption>
            </figure>`,
        )}
      </div>
    </section>

    <section class="landing-section">
      <div class="landing-section-head"><h2>Comment ça fonctionne</h2></div>
      <div class="landing-steps-grid">
        ${f.steps.map(
          (s, i) =>
            html`<div class="landing-step-card">
              <div class="landing-step-badge">${i + 1}</div>
              <p class="text-muted">${s}</p>
            </div>`,
        )}
      </div>
    </section>

    <section class="landing-section landing-section-alt">
      <div class="landing-section-head"><h2>Pour qui ?</h2></div>
      <div class="feature-audience-grid">
        ${f.audience.map(
          (a) =>
            html`<div class="card feature-audience-card">
              <h3>${a.role}</h3>
              <p class="text-muted">${a.text}</p>
            </div>`,
        )}
      </div>
    </section>

    <section class="landing-section">
      <div class="landing-section-head"><h2>Questions fréquentes</h2></div>
      <div class="landing-faq-list">
        ${f.faq.map(
          (item, i) =>
            html` <div class="landing-faq-item ${ui.faqOpen === `${slug}-${i}` ? 'landing-faq-item-open' : ''}">
              <button
                type="button"
                class="landing-faq-question"
                data-action="faq"
                data-index="${slug}-${i}"
                aria-expanded="${ui.faqOpen === `${slug}-${i}` ? 'true' : 'false'}"
                aria-controls="faq-${slug}-${i}"
              >
                <span>${item.q}</span><span class="landing-faq-chevron" aria-hidden="true">⌄</span>
              </button>
              <div class="landing-faq-answer" id="faq-${slug}-${i}" ${ui.faqOpen === `${slug}-${i}` ? '' : raw('hidden')}><p>${item.a}</p></div>
            </div>`,
        )}
      </div>
    </section>

    <section class="landing-section landing-section-alt">
      <div class="landing-section-head"><h2>Fonctionnalités liées</h2></div>
      <div class="feature-related-grid">
        ${f.related
          .map((s) => featureBySlug(s))
          .map(
            (r) =>
              html`<a class="card feature-related-card" href="#fonctionnalite/${r.slug}" style="display:block;color:inherit;text-decoration:none"
                ><div class="landing-feature-icon">${raw(ICONS[r.icon])}</div>
                <h3>${r.title}</h3>
                <p class="text-muted">${r.text}</p></a
              >`,
          )}
      </div>
    </section>

    <section class="landing-cta-banner">
      <h2>Prêt à ne plus vous soucier de votre comptabilité ?</h2>
      <p>Créez votre entreprise en quelques minutes, aucune carte bancaire requise.</p>
      <div class="landing-cta-banner-actions">
        <button type="button" class="btn btn-gold btn-arrow-cta" data-action="goto-signup">Créer mon entreprise <span class="btn-arrow">→</span></button>
        <button type="button" class="btn btn-ghost-light" data-action="demo">Voir la démonstration</button>
      </div>
    </section>

    <footer class="landing-footer">
      <div class="landing-footer-top">
        <div class="landing-brand">${brand}</div>
        <nav class="landing-footer-links">
          <button type="button" class="btn-link" data-action="feature-back">Toutes les fonctionnalités</button>
          <button type="button" class="btn-link" data-action="goto-login">Se connecter</button>
          <button type="button" class="btn-link" data-action="goto-signup">Créer mon entreprise</button>
        </nav>
      </div>
      <p class="landing-footer-bottom">© ${new Date().getFullYear()} BERTOLIS · Nexus Gestion · <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
    </footer>
  </div>`;
}

/** Agrandissement d'une capture au clic (même comportement que Nexus RH). */
export function openLightbox(src, alt) {
  let root = $('modal-root');
  if (!root) {
    root = Object.assign(document.createElement('div'), { id: 'modal-root' });
    document.body.append(root);
  }
  root.innerHTML = html`<div class="modal modal-image-lightbox" role="dialog" aria-modal="true" aria-label="${alt}">
    <button type="button" class="btn-icon lightbox-close-btn" data-action="lightbox-close" aria-label="Fermer">${raw(ICONS.close)}</button>
    <img class="lightbox-image" src="${src}" alt="${alt}" />
  </div>`.s;
  root.classList.add('open');
  root.querySelector('.lightbox-close-btn').focus();
}

export function closeLightbox() {
  $('modal-root')?.classList.remove('open');
}
