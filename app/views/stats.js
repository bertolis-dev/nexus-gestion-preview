/**
 * « Mon activité » (accueil) : chiffre d'affaires HT des 12 derniers mois comparé à l'année
 * précédente, meilleurs clients, délai moyen de paiement et part des factures réglées en retard.
 * Graphique en marine (cette année) et or (année précédente), comme le reste de Nexus.
 */

import { salesStats } from '../../core/stats.js?v=d415f7a';
import { html, raw } from '../html.js?v=d415f7a';
import { eur, today, ws } from '../state.js?v=d415f7a';

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const monthLabel = (m) => MONTHS[Number(m.slice(5, 7)) - 1];
const monthLong = (m) => `${monthLabel(m)} ${m.slice(0, 4)}`;
const percent = (x) => `${Math.round(x * 100)} %`;

/** Histogramme SVG : barres de l'année en cours, trait or pour le même mois un an plus tôt. */
function revenueChart(series) {
  const W = 720;
  const H = 200;
  const top = 12;
  const bottom = 26;
  const max = Math.max(1, ...series.flatMap((s) => [s.revenue, s.previous]));
  const slot = W / series.length;
  const bar = Math.min(34, slot * 0.56);
  const y = (v) => top + (H - top - bottom) * (1 - Math.max(0, v) / max);
  const parts = series.map((s, i) => {
    const cx = slot * i + slot / 2;
    const title = `${monthLong(s.month)} : ${eur(s.revenue)} HT (${eur(s.previous)} un an plus tôt)`;
    const h = Math.max(0, H - bottom - y(s.revenue));
    return `<g><title>${title}</title>
      <rect class="stats-bar${i === series.length - 1 ? ' stats-bar-current' : ''}" x="${(cx - bar / 2).toFixed(1)}" y="${(H - bottom - h).toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="3"/>
      ${s.previous > 0 ? `<rect class="stats-prev" x="${(cx - bar / 2 - 3).toFixed(1)}" y="${(y(s.previous) - 1.5).toFixed(1)}" width="${(bar + 6).toFixed(1)}" height="3" rx="1.5"/>` : ''}
      <text class="stats-axis" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${monthLabel(s.month)}</text></g>`;
  });
  return raw(
    `<svg class="stats-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chiffre d'affaires HT des 12 derniers mois, comparé à l'année précédente"><line class="stats-base" x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}"/>${parts.join('')}</svg>`,
  );
}

export function activityCard() {
  const s = salesStats(ws.book.invoices, ws.book.payments, today());
  if (!s.total && !s.previousTotal) return '';
  const trend = s.previousTotal > 0 ? (s.total - s.previousTotal) / s.previousTotal : null;
  return html`<div class="card stats-card">
    <div class="stats-head">
      <h2>Mon activité</h2>
      <div class="stats-legend" aria-hidden="true"><span class="stats-key-bar"></span>12 derniers mois <span class="stats-key-prev"></span>un an plus tôt</div>
    </div>
    <div class="stats-figures">
      <div>
        <div class="stats-figure">${eur(s.total)}</div>
        <div class="stats-caption">
          Chiffre d’affaires HT sur 12 mois${trend === null ? '' : html` · <strong>${trend >= 0 ? '+' : '−'}${percent(Math.abs(trend))}</strong> sur un an`}
        </div>
      </div>
      <div>
        <div class="stats-figure">${s.avgPaymentDays === null ? '—' : `${s.avgPaymentDays} jours`}</div>
        <div class="stats-caption">
          Délai moyen de paiement${s.settledCount ? ` (${s.settledCount} facture${s.settledCount > 1 ? 's' : ''} réglée${s.settledCount > 1 ? 's' : ''})` : ''}
        </div>
      </div>
      <div>
        <div class="stats-figure">${s.lateShare === null ? '—' : percent(s.lateShare)}</div>
        <div class="stats-caption">Factures réglées après l’échéance</div>
      </div>
    </div>
    <div class="stats-chart-wrap" tabindex="0" role="region" aria-label="Graphique du chiffre d’affaires mensuel">${revenueChart(s.series)}</div>
    ${
      s.topClients.length
        ? html`<div class="stats-clients">
            <h3>Meilleurs clients sur 12 mois</h3>
            ${s.topClients.map(
              (c) =>
                html`<div class="stats-client">
                  <span class="stats-client-name">${c.name}</span>
                  <span class="stats-client-track"><span class="stats-client-fill" style="width:${Math.max(2, Math.round(c.share * 100))}%"></span></span>
                  <span class="stats-client-value">${eur(c.revenue)} · ${percent(c.share)}</span>
                </div>`,
            )}
          </div>`
        : ''
    }
  </div>`;
}
