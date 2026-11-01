/**
 * Statistiques de l'accueil, calculées sur les factures émises : chiffre d'affaires HT mois par mois
 * (12 derniers mois, comparés aux 12 précédents), meilleurs clients, délai moyen de paiement et part
 * des factures réglées après l'échéance. Les avoirs viennent en déduction du mois où ils sont émis.
 */

const monthOf = (iso) => iso.slice(0, 7);

/** Mois AAAA-MM décalé de `delta` mois. */
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

const signedHt = (inv) => (inv.type === 'credit' ? -1 : 1) * (inv.totals?.totalHt || 0);
const counted = (inv) => inv.status === 'issued' && ['invoice', 'deposit', 'credit'].includes(inv.type) && inv.issueDate;
/** Acompte (et avoir sur acompte) : pas de chiffre d'affaires, la facture finale le reprend en entier. */
const isDepositDoc = (inv, depositNumbers) => inv.type === 'deposit' || (inv.type === 'credit' && depositNumbers.has(inv.creditOf));

/**
 * @param {object[]} invoices factures du carnet (ws.book.invoices)
 * @param {object} payments règlements par facture (ws.book.payments)
 * @param {string} today date du jour (AAAA-MM-JJ)
 */
export function salesStats(invoices, payments, today) {
  const current = monthOf(today);
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(current, i - 11));
  const byMonth = new Map();
  const byClient = new Map();
  const firstMonth = months[0];
  const previousFirst = shiftMonth(firstMonth, -12);
  const depositNumbers = new Set(invoices.filter((i) => i.type === 'deposit').map((i) => i.number));
  for (const inv of invoices.filter((i) => counted(i) && !isDepositDoc(i, depositNumbers))) {
    const m = monthOf(inv.issueDate);
    byMonth.set(m, (byMonth.get(m) || 0) + signedHt(inv));
    if (m >= firstMonth && m <= current) {
      const key = inv.client?.code || inv.client?.name || 'Sans nom';
      const prev = byClient.get(key) || { name: inv.client?.name || 'Sans nom', revenue: 0 };
      byClient.set(key, { name: inv.client?.name || prev.name, revenue: prev.revenue + signedHt(inv) });
    }
  }
  const series = months.map((month) => ({ month, revenue: byMonth.get(month) || 0, previous: byMonth.get(shiftMonth(month, -12)) || 0 }));
  const total = series.reduce((s, x) => s + x.revenue, 0);
  const previousTotal = [...byMonth].filter(([m]) => m >= previousFirst && m < firstMonth).reduce((s, [, v]) => s + v, 0);
  const positives = [...byClient.values()].filter((c) => c.revenue > 0);
  const positiveTotal = positives.reduce((sum, c) => sum + c.revenue, 0);
  const topClients = positives
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3)
    .map((c) => ({ name: c.name, revenue: c.revenue, share: positiveTotal > 0 ? c.revenue / positiveTotal : 0 }));

  // Factures (hors avoirs) soldées sur les 12 derniers mois : date du dernier règlement.
  const settled = [];
  for (const inv of invoices.filter((i) => counted(i) && i.type !== 'credit')) {
    const list = payments?.[inv.id] || [];
    const paid = list.reduce((s, p) => s + p.amount, 0);
    const due = inv.totals?.netToPay ?? inv.totals?.totalTtc ?? 0;
    if (!list.length || due <= 0 || paid < due) continue;
    const last = list
      .map((p) => p.date)
      .sort()
      .at(-1);
    if (monthOf(last) < firstMonth) continue;
    const days = Math.round((Date.parse(last) - Date.parse(inv.issueDate)) / 86400000);
    settled.push({ days: Math.max(0, days), late: inv.dueDate ? last > inv.dueDate : false });
  }
  const avgPaymentDays = settled.length ? Math.round(settled.reduce((s, x) => s + x.days, 0) / settled.length) : null;
  const lateShare = settled.length ? settled.filter((x) => x.late).length / settled.length : null;
  return { series, total, previousTotal, topClients, avgPaymentDays, lateShare, settledCount: settled.length };
}
