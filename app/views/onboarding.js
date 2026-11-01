/**
 * Écran « onboarding ».
 */

import { firstFiscalYear } from '../../core/dates.js?v=e821f3b';
import { openingBalanceFromFec, parseFec } from '../../core/fecimport.js?v=e821f3b';
import { isValidSiren } from '../../core/invoices.js?v=e821f3b';
import { ACTIVITY_TYPES, CIPAV_PROFESSIONS } from '../../core/micro.js?v=e821f3b';
import { buildChart } from '../../core/pcg.js?v=e821f3b';
import { Workspace } from '../../core/workspace.js?v=e821f3b';
import * as cloud from '../cloud.js?v=e821f3b';
import { lookupSiren } from '../company-lookup.js?v=e821f3b';
import { companyFromOnboarding } from '../../core/company.js?v=e821f3b';
import { choiceGroup, field, html, opt, raw } from '../html.js?v=e821f3b';
import { render } from '../render.js?v=e821f3b';
import { cloudState, eur, newId, setWs, ui, ws } from '../state.js?v=e821f3b';
import { save, toast } from '../store.js?v=e821f3b';
import { onSyncResult, onSyncStatus } from '../sync-ui.js?v=e821f3b';
import { badge, brand } from '../ui/common.js?v=e821f3b';

// ------------------------------------------------------------------ assistant d'installation (§3.1)

export function viewOnboarding() {
  const { step, data, error, loading } = ui.ob;
  const choice = (key, value, label) =>
    html`<label class="choice-card"
      ><input type="radio" name="${key}" data-ob="${key}" value="${value}" ${data[key] === value ? raw('checked') : ''} />${label}</label
    >`;
  const nav = (next = 'Continuer') =>
    html`<div style="display:flex;gap:8px;margin-top:6px">
      ${step > 1 ? html`<button type="button" class="btn btn-secondary" data-action="ob-back">Retour</button>` : ''}
      <button type="button" class="btn btn-primary" style="flex:1" data-action="ob-next" ${loading ? raw('disabled') : ''}>
        ${loading ? 'Un instant…' : next}
      </button>
    </div>`;
  const errBox = error ? html`<p class="login-error" role="alert">${error}</p>` : '';
  let body;
  if (step === 1) {
    body = html`<h1>Votre entreprise</h1>
      <p class="text-muted">Saisissez votre SIREN : nous récupérons le nom, l'adresse et la forme juridique.</p>
      <div class="form-field">
        <label for="ob-siren">SIREN (9 chiffres)</label>
        <div style="display:flex;gap:8px">
          <input class="input" id="ob-siren" data-ob="siren" inputmode="numeric" maxlength="11" value="${data.siren || ''}" placeholder="123 456 789" />
          <button type="button" class="btn btn-secondary" data-action="ob-lookup" ${loading ? raw('disabled') : ''}>
            ${loading ? 'Recherche…' : 'Rechercher'}
          </button>
        </div>
      </div>
      ${field("Nom de l'entreprise", html`<input class="input" id="ob-name" data-ob="name" value="${data.name || ''}" />`, { id: 'ob-name' })}
      ${field(
        'Forme juridique',
        html`<select class="input" id="ob-form" data-ob="legalForm">
          ${['EI', 'EURL', 'SARL', 'SAS', 'SASU'].map((f) => opt(f, f === 'EI' ? 'Entreprise individuelle (EI, micro)' : f, data.legalForm === f))}
        </select>`,
        { id: 'ob-form' },
      )}
      ${field('Adresse', html`<input class="input" id="ob-address" data-ob="address" value="${data.address || ''}" />`, { id: 'ob-address' })} ${errBox}${nav()}`;
  } else if (step === 2) {
    body = html`<h1>Quelques questions simples</h1>
      <p class="text-muted">Vos réponses suffisent à déterminer votre régime et votre plan comptable.</p>
      ${data.legalForm === 'EI' ? choiceGroup('Êtes-vous micro-entrepreneur (auto-entrepreneur) ?', html`<div class="choice-cards">${choice('micro', 'oui', 'Oui')}${choice('micro', 'non', 'Non, au régime réel')}</div>`) : ''}
      ${choiceGroup(
        'Facturez-vous la TVA à vos clients ?',
        html`${html`<div class="choice-cards">${choice('chargesVat', 'oui', 'Oui')}${choice('chargesVat', 'non', 'Non (franchise en base)')}</div>`}
          <p class="form-hint">${'Si vos factures portent la mention « TVA non applicable, art. 293 B du CGI », répondez non.'}</p>`,
      )}
      ${data.chargesVat === 'oui' ? choiceGroup('Déclarez-vous la TVA chaque mois ou une fois par an ?', html`<div class="choice-cards">${choice('vatFrequency', 'mensuelle', 'Chaque mois (CA3)')}${choice('vatFrequency', 'annuelle', 'Une fois par an (CA12)')}</div>`) : ''}
      ${choiceGroup('Vendez-vous des biens, des services ou les deux ?', html`<div class="choice-cards">${choice('nature', 'biens', 'Des biens')}${choice('nature', 'services', 'Des services')}${choice('nature', 'mixte', 'Les deux')}</div>`)}
      ${field('Date de fin de votre exercice comptable', html`<input class="input" id="ob-fy" type="date" data-ob="fyEnd" value="${data.fyEnd}" style="max-width:220px" />`, { id: 'ob-fy', hint: 'Le plus souvent le 31 décembre.' })}
      ${field('Date de début d’activité (entreprise créée cette année)', html`<input class="input" id="ob-start" type="date" data-ob="activityStart" value="${data.activityStart || ''}" style="max-width:220px" />`, { id: 'ob-start', hint: 'Facultatif : le premier exercice court alors de cette date à la date de fin (24 mois au plus).' })}
      ${errBox}${nav()}`;
  } else if (step === 3) {
    body = html`<h1>Votre banque</h1>
      <p class="text-muted">Vos transactions alimentent le rapprochement automatique avec vos factures.</p>
      <div class="notice-gold">
        Importez le relevé de votre banque (CSV, OFX, CAMT.053 ou QIF), téléchargé depuis son espace client : toutes les banques françaises le proposent.
      </div>
      ${field('Relevé bancaire (facultatif)', html`<input class="input" id="ob-bank" type="file" accept=".csv,.ofx,.qfx,.xml,.qif,.txt" data-action="ob-bank-file" />`, { id: 'ob-bank' })}
      ${data.bankFileName ? html`<p class="text-muted">Relevé prêt : <strong>${data.bankFileName}</strong> (${data.bankTx.length} transactions)</p>` : ''}
      ${errBox}${nav()}`;
  } else if (step === 4) {
    body = html`<h1>Facturation électronique</h1>
      <p class="text-muted">
        Depuis le 1er septembre 2026, toute entreprise doit pouvoir <strong>recevoir</strong> ses factures électroniques via une plateforme agréée. L'émission
        devient obligatoire pour les TPE le 1er septembre 2027.
      </p>
      <div class="notice-gold">
        Vos factures sont déjà conformes. Pour recevoir et transmettre vos factures électroniques, utilisez la plateforme agréée de votre banque ou de votre
        logiciel (souvent gratuite) : le mode « dépôt » de Nexus prépare vos factures pour elle, et vous importez celles que vous y recevez dans Dépenses.
      </div>
      ${errBox}${nav('Terminer et ouvrir mon espace')}`;
  }
  return html`<div class="login-card onboarding-card">
    <div class="login-logo">${brand}</div>
    <div class="onboarding-steps" role="img" aria-label="Étape ${step} sur 4">
      ${[1, 2, 3, 4].map((i) => html`<span class="${i <= step ? 'done' : ''}"></span>`)}
    </div>
    ${body}<button type="button" class="btn-link" data-action="sign-out">Se déconnecter</button>
  </div>`;
}

/** Situation du micro-entrepreneur : sert à estimer les cotisations (écran URSSAF). */
export function microSettingsCard() {
  const c = ws.company;
  const cipav = CIPAV_PROFESSIONS.length
    ? html`Relèvent de la CIPAV : ${CIPAV_PROFESSIONS.join(', ')}.`
    : 'La liste des professions concernées sera affichée ici après validation par notre expert-comptable ; en attendant, votre attestation d’affiliation indique votre caisse.';
  return html`<form class="card" data-form="micro" style="display:flex;flex-direction:column;gap:14px">
    <h2>Ma micro-entreprise</h2>
    <p class="text-muted" style="margin:0">
      Ces informations servent à estimer vos cotisations URSSAF. Le montant qui fait foi reste celui calculé par l’URSSAF.
    </p>
    <div class="form-grid">
      ${field(
        'Activité déclarée à l’URSSAF',
        html`<select class="input" name="microActivity">
          ${Object.entries(ACTIVITY_TYPES).map(([k, a]) => opt(k, a.label, (c.microActivity || 'bnc') === k))}
        </select>`,
      )}
      ${field(
        'Caisse de retraite',
        html`<select class="input" name="retraite">
          ${opt('general', 'Régime général (Sécurité sociale des indépendants)', c.retraite !== 'cipav')}${opt('cipav', 'CIPAV', c.retraite === 'cipav')}
        </select>`,
        {
          hint: html`Ne concerne que les professions libérales. La plupart cotisent au régime général ; seules certaines professions réglementées relèvent de la
          CIPAV. ${cipav}`,
        },
      )}
      ${field('Début d’activité', html`<input class="input" type="date" name="activityStart" value="${c.activityStart || ''}" />`, { hint: 'Sert aux rappels : pas de CFE l’année de création.' })}
      ${field('Début de l’ACRE (si vous en bénéficiez)', html`<input class="input" type="date" name="acreStart" value="${c.acreStart || ''}" />`, { hint: 'Aide à la création : cotisations réduites pendant les premiers trimestres.' })}
      ${field('Fin de l’ACRE', html`<input class="input" type="date" name="acreEnd" value="${c.acreEnd || ''}" />`, { hint: 'Indiquée sur votre attestation d’ACRE envoyée par l’URSSAF.' })}
    </div>
    <label class="form-field-checkbox" style="display:flex;gap:8px;align-items:center"
      ><input type="checkbox" name="artisan" ${c.artisan ? raw('checked') : ''} />Je suis artisan (inscrit au registre des métiers) — ne concerne que les
      prestations commerciales ou artisanales</label
    >
    <label class="form-field-checkbox" style="display:flex;gap:8px;align-items:center"
      ><input type="checkbox" name="versementLiberatoire" ${c.versementLiberatoire ? raw('checked') : ''} />J’ai opté pour le versement libératoire de l’impôt
      sur le revenu (payé avec mes cotisations)</label
    >
    <div><button class="btn btn-primary" type="submit">Enregistrer</button></div>
  </form>`;
}

/** Accès partagés : expert-comptable et collaborateurs (mode connecté uniquement). */
/** Double authentification : appareils enregistrés, ajout d'un appareil de secours, retrait. */
export function securityCard() {
  if (ui.demo || !cloudState.session) return '';
  if (!ui.security) {
    ui.security = { loading: true };
    cloud
      .mfaStatus()
      .then((s) => {
        ui.security = { factors: s.factors };
        render();
      })
      .catch(() => (ui.security = { factors: [] }));
  }
  const s = ui.security;
  const factors = s.factors || [];
  const a = s.adding;
  return html`<div class="card" style="display:flex;flex-direction:column;gap:10px">
    <h2>Double authentification</h2>
    ${
      factors.length === 1
        ? html`<div class="notice-gold">
            Un seul appareil enregistré : si vous perdez ce téléphone, vous ne pourrez plus ouvrir votre comptabilité. Ajoutez un appareil de secours (second
            téléphone, tablette ou gestionnaire de mots de passe).
          </div>`
        : ''
    }
    ${
      factors.length
        ? html`<table class="table">
            <tbody>
              ${factors.map(
                (x) =>
                  html`<tr>
                    <td>${x.name}</td>
                    <td class="num">
                      ${factors.length > 1 ? html`<button class="btn btn-secondary btn-sm" data-action="mfa-remove" data-id="${x.id}">Retirer</button>` : ''}
                    </td>
                  </tr>`,
              )}
            </tbody>
          </table>`
        : ''
    }
    ${
      a
        ? html`<p>Scannez ce code avec l'application de secours, puis saisissez le code à 6 chiffres qu'elle affiche.</p>
            <img class="mfa-qr" src="${a.qrCode}" alt="QR code à scanner avec l'application de secours" width="190" height="190" />
            <p class="form-hint">Impossible de scanner ? Saisissez cette clé : <span class="mono">${a.secret}</span></p>
            <form data-form="mfa-add" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
              ${field('Code à 6 chiffres', html`<input class="input" id="f-mfa-add" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required />`, { id: 'f-mfa-add' })}
              <button class="btn btn-primary" type="submit" style="margin-bottom:2px">Valider</button>
            </form>
            ${a.error ? html`<p class="login-error" role="alert">${a.error}</p>` : ''}`
        : html`<div><button class="btn btn-secondary" data-action="mfa-add" ${s.loading ? raw('disabled') : ''}>Ajouter un appareil de secours</button></div>`
    }
  </div>`;
}

export function membersCard() {
  if (ui.demo) return '';
  if (!ui.members && cloudState.meta) {
    cloud
      .listMembers(cloudState.meta.structureId)
      .then((m) => {
        ui.members = m;
        render();
      })
      .catch(() => {
        ui.members = [];
      });
  }
  const roleLabel = { dirigeant: 'Dirigeant', expert: 'Expert-comptable', collaborateur: 'Collaborateur' };
  return html`<div class="card" style="display:flex;flex-direction:column;gap:10px">
    <h2>Mon expert-comptable et mon équipe</h2>
    <p class="text-muted">
      Votre expert-comptable voit toute la comptabilité, passe les écritures d'inventaire et valide la clôture ; un collaborateur saisit dépenses et
      justificatifs sans rien valider.
    </p>
    ${
      (ui.members || []).length
        ? html`<table class="table">
            <tbody>
              ${ui.members.map(
                (m) =>
                  html`<tr>
                    <td>${m.email || '—'}</td>
                    <td>${badge(roleLabel[m.role] || m.role, m.role === 'expert' ? 'primary' : 'muted')}</td>
                    <td class="num">
                      ${m.role === 'dirigeant' ? '' : html`<button class="btn btn-secondary btn-sm" data-action="remove-member" data-id="${m.user_id}">Retirer l’accès</button>`}
                    </td>
                  </tr>`,
              )}
            </tbody>
          </table>`
        : ''
    }
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      ${field('Adresse e-mail', html`<input class="input" type="email" data-invite-email placeholder="expert@cabinet.fr" />`)}
      ${field(
        'Rôle',
        html`<select class="input" data-invite-role>
          ${opt('expert', 'Expert-comptable', true)}${opt('collaborateur', 'Collaborateur')}
        </select>`,
      )}
      <button class="btn btn-primary" data-action="invite-member" style="margin-bottom:2px">Donner accès</button>
    </div>
    <p class="form-hint">La personne doit d'abord créer son compte Nexus Gestion avec cette adresse.</p>
  </div>`;
}

/** Aperçu d'une reprise de FEC, à valider avant import (§3.1 étape 5). */
export function openingPreview(opening, fileName) {
  const unmapped = opening.mapping.filter((m) => m.unmapped);
  const approx = opening.mapping.filter((m) => !m.exact && !m.unmapped);
  const cash = opening.lines.filter((l) => l.account.startsWith('512')).reduce((s, l) => s + l.debit - l.credit, 0);
  const receivable = opening.clients.reduce((s, c) => s + c.balance, 0);
  return html`<div class="card" style="box-shadow:none;border:1px solid var(--color-border);display:flex;flex-direction:column;gap:8px">
    <strong>${fileName || 'FEC'} : ${opening.balanced ? 'prêt à être repris' : 'déséquilibré, impossible à reprendre'}</strong>
    <table class="table">
      <tbody>
        <tr>
          <td>Résultat de l'exercice précédent</td>
          <td class="num">${eur(opening.result)}</td>
        </tr>
        <tr>
          <td>Trésorerie à l'ouverture</td>
          <td class="num">${eur(cash)}</td>
        </tr>
        <tr>
          <td>Ce que les clients doivent encore</td>
          <td class="num">${eur(receivable)}</td>
        </tr>
        <tr>
          <td>Clients repris</td>
          <td class="num">${opening.clients.length}</td>
        </tr>
        <tr>
          <td>Comptes de bilan repris</td>
          <td class="num">${opening.lines.length}</td>
        </tr>
      </tbody>
    </table>
    ${approx.length ? html`<p class="form-hint">${approx.length} compte(s) rattaché(s) au compte Nexus le plus proche (ex. ${approx[0].source} → ${approx[0].account}).</p>` : ''}
    ${unmapped.length ? html`<div class="notice-gold">${unmapped.length} compte(s) sans équivalent placé(s) en « à classer » (471) : ${unmapped.map((m) => `${m.source} ${m.label}`).join(', ')}. Votre expert-comptable pourra les reclasser.</div>` : ''}
  </div>`;
}

export async function readOpeningFile(file) {
  const opening = openingBalanceFromFec(parseFec(await file.text()), ws?.chart || buildChart());
  if (!opening.balanced) throw new Error('Ce FEC n’est pas équilibré : impossible de constituer le bilan d’ouverture.');
  return opening;
}

export async function finishOnboarding() {
  if (ui.ob.loading) return;
  let company;
  try {
    company = companyFromOnboarding(ui.ob.data);
  } catch (e) {
    ui.ob.error = e.message;
    return render();
  }
  ui.ob.loading = true;
  render();
  try {
    const created = await cloud.createStructure(company);
    cloudState.meta = { structureId: created.structure_id, fiscalYearId: created.fiscal_year_id, bankAccountId: created.bank_account_id };
    cloudState.outbox = new cloud.Outbox({ key: `${cloud.OUTBOX_PREFIX}${created.structure_id}`, onStatus: onSyncStatus, onResult: onSyncResult });
    cloudState.synced = null;
  } catch (e) {
    ui.ob.loading = false;
    ui.ob.error = `Création impossible : ${cloud.friendly(e)}`;
    return render();
  }
  ui.ob.loading = false;
  setWs(new Workspace({ company, newId }));
  if (ui.ob.data.bankTx?.length) ws.importTransactions(ui.ob.data.bankTx);
  save();
  location.hash = '#/accueil';
  render();
  toast('Votre espace est prêt.');
}

export async function onboardingAction(action) {
  const ob = ui.ob;
  if (action === 'ob-lookup') {
    const siren = (ob.data.siren || '').replace(/\s/g, '');
    if (!isValidSiren(siren)) {
      ob.error = 'Ce SIREN ne semble pas valide : vérifiez les 9 chiffres.';
      return render();
    }
    Object.assign(ob, { loading: true, error: '' });
    render();
    try {
      const found = await lookupSiren(siren);
      Object.assign(ob.data, found, { siren });
      // Forme juridique non prise en charge : expliquée, et à choisir dans la liste.
      if (found.warning) ob.error = found.warning;
    } catch (e) {
      ob.error = `${e.message}. Vous pouvez compléter les champs vous-même.`;
    }
    ob.loading = false;
    return render();
  }
  if (action === 'ob-back') {
    ob.step--;
    ob.error = '';
    return render();
  }
  if (action === 'ob-next') {
    ob.error = '';
    if (ob.step === 1) {
      const siren = (ob.data.siren || '').replace(/\s/g, '');
      if (!isValidSiren(siren)) ob.error = 'Le SIREN est obligatoire (9 chiffres) : il figure sur toutes vos factures.';
      else if (!ob.data.name?.trim() || !ob.data.address?.trim()) ob.error = "Le nom et l'adresse de l'entreprise sont obligatoires.";
      if (ob.error) return render();
    }
    if (ob.step === 2) {
      try {
        firstFiscalYear({ end: ob.data.fyEnd, activityStart: ob.data.activityStart || null });
      } catch (err) {
        ob.error = err.message;
        return render();
      }
    }
    if (ob.step === 4) return finishOnboarding();
    ob.step++;
    return render();
  }
}
