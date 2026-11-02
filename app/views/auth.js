/**
 * Écran « auth ».
 */

import { field, html, opt, raw } from '../html.js?v=17f2ba9';
import { ui } from '../state.js?v=17f2ba9';
import { brand, icon } from '../ui/common.js?v=17f2ba9';

// ------------------------------------------------------------------ connexion (même carte que Nexus RH)

export function viewAuth() {
  const a = ui.auth;
  const err = a.error ? html`<p class="login-error" role="alert">${a.error}</p>` : '';
  const info = a.info ? html`<p class="text-muted">${a.info}</p>` : '';
  const busy = a.busy ? raw('disabled') : '';
  const emailField = (autocomplete = 'username') =>
    field('Email', html`<input class="input" type="email" id="f-email" name="email" required autocomplete="${autocomplete}" value="${a.email || ''}" />`, {
      id: 'f-email',
    });
  const passwordField = (label, autocomplete) =>
    field(
      label,
      html`<div class="password-input-wrapper">
        <input
          class="input"
          type="password"
          id="f-password"
          name="password"
          required
          minlength="${autocomplete === 'new-password' ? 8 : 1}"
          autocomplete="${autocomplete}"
        /><button type="button" class="btn-icon password-toggle" data-action="toggle-password" aria-label="Afficher le mot de passe" aria-pressed="false">
          ${icon('eye', 14)}
        </button>
      </div>`,
      { id: 'f-password' },
    );
  const link = (view, label) => html`<button type="button" class="btn-link" data-action="auth-view" data-view="${view}">${label}</button>`;
  let body;
  if (a.view === 'signup') {
    body = html`<h1>Créer mon entreprise</h1>
      <p class="text-muted">Créez votre accès, puis laissez-vous guider : votre SIREN suffit pour démarrer.</p>
      <form data-form="signup">
        ${emailField()}${passwordField('Mot de passe', 'new-password')}
        <p class="form-hint">8 caractères minimum. Un code sur votre téléphone vous sera aussi demandé à chaque connexion.</p>
        ${err}${info}<button type="submit" class="btn btn-primary" style="width:100%" ${busy}>${a.busy ? 'Création…' : 'Créer mon compte'}</button>
      </form>
      ${link('login', 'J’ai déjà un compte')}`;
  } else if (a.view === 'forgot') {
    body = html`<h1>Mot de passe oublié</h1>
      <form data-form="forgot">
        ${emailField()}${err}${info}<button type="submit" class="btn btn-primary" style="width:100%" ${busy}>Recevoir un lien de réinitialisation</button>
      </form>
      ${link('login', 'Retour à la connexion')}`;
  } else if (a.view === 'resend') {
    body = html`<h1>Email de confirmation</h1>
      <p class="text-muted">Saisissez l'adresse utilisée à l'inscription : nous vous renvoyons un lien de confirmation.</p>
      <form data-form="resend">
        ${emailField()}${err}${info}<button type="submit" class="btn btn-primary" style="width:100%" ${busy}>Renvoyer l'email de confirmation</button>
      </form>
      ${link('login', 'Retour à la connexion')}`;
  } else if (a.view === 'new-password') {
    body = html`<h1>Nouveau mot de passe</h1>
      <form data-form="new-password">
        ${passwordField('Nouveau mot de passe', 'new-password')}${err}<button type="submit" class="btn btn-primary" style="width:100%" ${busy}>
          Enregistrer
        </button>
      </form>`;
  } else {
    body = html`<h1>Connexion</h1>
      <form data-form="login">
        ${emailField()}${passwordField('Mot de passe', 'current-password')}${err}${info}
        <button type="submit" class="btn btn-primary" style="width:100%" ${busy}>${a.busy ? 'Connexion…' : 'Se connecter'}</button>
      </form>
      ${link('forgot', 'Mot de passe oublié ?')} ${link('signup', 'Créer mon entreprise')} ${link('resend', "Vous n'avez pas reçu l'email de confirmation ?")}
      <button type="button" class="btn-link" data-action="demo">Voir la démonstration</button>
      <button type="button" class="btn-link" data-action="goto-landing">← Accueil</button>`;
  }
  return html`<div class="login-card">
    <div class="login-logo">${brand}</div>
    ${body}
  </div>`;
}

/** Choix de l'entreprise quand le compte en gère plusieurs. */
export function viewStructurePicker() {
  return html`<div class="login-card">
    <div class="login-logo">${brand}</div>
    <h1>Quelle entreprise ouvrir ?</h1>
    <div class="action-center-list">
      ${(ui.structures || []).map(
        (s) =>
          html`<button type="button" class="action-center-item" data-action="structure-open" data-id="${s.id}">
            <span class="action-center-label"><strong>${s.name}</strong> <span class="text-muted">SIREN ${s.siren}</span></span>
            <span class="action-center-arrow">→</span>
          </button>`,
      )}
    </div>
    <button type="button" class="btn-link" data-action="sign-out">Se déconnecter</button>
  </div>`;
}

export function viewMfa() {
  const m = ui.mfa;
  const err = m.error ? html`<p class="login-error" role="alert">${m.error}</p>` : '';
  const choices = m.factors?.length > 1 ? m.factors : null;
  const form = html`<form data-form="mfa">
      ${
        choices
          ? field(
              'Application utilisée',
              html`<select class="input" id="f-mfa-factor" name="factor">
                ${choices.map((x) => opt(x.id, x.name, x.id === m.factorId))}
              </select>`,
              { id: 'f-mfa-factor' },
            )
          : ''
      }
      ${field('Code à 6 chiffres', html`<input class="input" id="f-mfa" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required autofocus />`, { id: 'f-mfa' })}
      ${err}<button type="submit" class="btn btn-primary" style="width:100%" ${m.busy ? raw('disabled') : ''}>Valider</button>
    </form>
    <button type="button" class="btn-link" data-action="sign-out">Se déconnecter</button>`;
  const body =
    m.step === 'enroll'
      ? html`<h1>Protégez votre comptabilité</h1>
          <p class="text-muted">
            La double authentification est obligatoire : sans votre téléphone, personne ne peut ouvrir vos comptes, même avec votre mot de passe.
          </p>
          <ol class="landing-steps">
            <li>
              <span class="landing-step-num">1</span
              ><span class="landing-step-text">Installez <strong>Google Authenticator</strong> ou <strong>Microsoft Authenticator</strong></span>
            </li>
            <li><span class="landing-step-num">2</span><span class="landing-step-text">Scannez ce code avec l'application</span></li>
            <li><span class="landing-step-num">3</span><span class="landing-step-text">Saisissez le code à 6 chiffres affiché</span></li>
          </ol>
          <img class="mfa-qr" src="${m.qrCode}" alt="QR code à scanner avec votre application d'authentification" width="190" height="190" />
          <p class="form-hint">Impossible de scanner ? Saisissez cette clé : <span class="mono">${m.secret}</span></p>
          ${form}`
      : html`<h1>Code de vérification</h1>
          <p class="text-muted">Saisissez le code à 6 chiffres affiché par votre application d'authentification.</p>
          ${form}`;
  return html`<div class="login-card">
    <div class="login-logo">${brand}</div>
    ${body}
  </div>`;
}
