/**
 * Gabarits HTML de l'interface : échappement par défaut (html`…`), contenu brut explicite (raw), et
 * formulaires accessibles — chaque étiquette est reliée à son champ, l'aide est annoncée par
 * aria-describedby, les groupes de boutons radio ont une légende.
 */

export class Raw {
  constructor(s) {
    this.s = s;
  }
}
export const raw = (s) => new Raw(s);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(fmt).join('') : v == null || v === false ? '' : esc(String(v)));
export function html(strings, ...vals) {
  return raw(strings.reduce((acc, s, i) => acc + s + (i < vals.length ? fmt(vals[i]) : ''), ''));
}
export const opt = (value, label, selected) => html`<option value="${value}" ${selected ? raw('selected') : ''}>${label}</option>`;

let autoId = 0;
// Premier champ de saisie (boutons radio et cases à cocher portent leur propre étiquette).
const CONTROL = /<(input|select|textarea)\b(?![^>]*type="(?:radio|checkbox|hidden)")([^>]*)>/;

/**
 * Champ de formulaire : étiquette reliée au premier input/select/textarea du contrôle (identifiant
 * créé s'il manque), aide facultative reliée par aria-describedby.
 */
export function field(label, control, { id, hint } = {}) {
  let body = control instanceof Raw ? control.s : fmt(control);
  const m = CONTROL.exec(body);
  let controlId = id;
  if (m) {
    const existing = /\sid="([^"]+)"/.exec(m[2])?.[1];
    controlId = existing || id || `f-auto-${++autoId}`;
    let attrs = existing ? m[2] : ` id="${controlId}"${m[2]}`;
    if (hint) attrs = ` aria-describedby="${controlId}-hint"${attrs}`;
    body = body.replace(CONTROL, () => `<${m[1]}${attrs}>`); // fonction : « $ » de la valeur pris tel quel
  }
  const labelHtml = label ? html`<label ${controlId ? raw(`for="${controlId}"`) : ''}>${label}</label>` : '';
  const hintHtml = hint ? html`<p class="form-hint" ${controlId ? raw(`id="${controlId}-hint"`) : ''}>${hint}</p>` : '';
  return html`<div class="form-field">${labelHtml}${raw(body)}${hintHtml}</div>`;
}

/** Groupe de boutons radio ou de cases à cocher, annoncé par sa légende. */
export const choiceGroup = (legend, content) =>
  html`<fieldset class="choice-group">
    <legend>${legend}</legend>
    ${content}
  </fieldset>`;
