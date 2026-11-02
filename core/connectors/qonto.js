/**
 * Connecteur API Qonto (Business API, gratuite pour les clients Qonto) : comptes et mouvements
 * réglés. Interface commune : voir connectors/bank.js.
 *
 * Le transport est injecté (`request(path, query)` → JSON) : dans l'application, il passe par une
 * fonction serveur qui détient le jeton OAuth (jamais exposé au navigateur) ; dans les tests, par un
 * faux serveur. Activation : création de l'application OAuth Qonto par BERTOLIS (prérequis externe).
 */

import { parisDateOf, addDays } from '../dates.js?v=17f2ba9';

const cleanLabel = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** Transaction Qonto → mouvement ; null si non réglée (en attente, refusée, annulée) ou hors euros. */
export function mapQontoTransaction(t, accountId) {
  if (t.status !== 'completed' || t.currency !== 'EUR' || !Number.isSafeInteger(t.amount_cents)) return null;
  const abs = Math.abs(t.amount_cents);
  const label = cleanLabel([t.label, t.reference && !String(t.label).includes(t.reference) ? t.reference : ''].filter(Boolean).join(' '));
  return {
    id: `qonto-${t.transaction_id || t.id}`,
    accountId,
    date: parisDateOf(t.settled_at || t.emitted_at),
    label: label || 'Opération Qonto',
    amount: t.side === 'debit' ? -abs : abs,
    status: 'open',
  };
}

const friendly = (err) => {
  if (err?.status === 401 || err?.status === 403) {
    return new Error('Qonto refuse l’accès : reconnectez votre compte Qonto depuis la page Banque.');
  }
  if (err?.status === 429) return new Error('Qonto limite le nombre de demandes : réessayez dans une minute.');
  return new Error(`Qonto est momentanément injoignable (${err?.message || 'erreur inconnue'}) : réessayez plus tard ou importez un relevé.`);
};

export function createQontoConnector({ request }) {
  const call = async (path, query = {}) => {
    try {
      return await request(path, query);
    } catch (err) {
      throw friendly(err);
    }
  };
  return {
    provider: 'qonto',

    async listAccounts() {
      const { organization } = await call('/v2/organization');
      return (organization?.bank_accounts || []).map((a) => ({
        externalId: a.id,
        label: a.name || 'Compte Qonto',
        ibanLast4: a.iban ? String(a.iban).replace(/\s/g, '').slice(-4) : null,
      }));
    },

    /** Mouvements réglés depuis `since` (AAAA-MM-JJ), toutes pages confondues. */
    async listTransactions({ externalId, accountId, since }) {
      const out = [];
      let page = 1;
      while (page) {
        const res = await call('/v2/transactions', {
          bank_account_id: externalId,
          'status[]': ['completed'],
          // La veille en UTC : une opération réglée juste après minuit à Paris est encore la veille en UTC.
          settled_at_from: new Date(`${addDays(since, -1)}T00:00:00Z`).toISOString(),
          sort_by: 'settled_at:asc',
          per_page: 100,
          current_page: page,
        });
        for (const t of res.transactions || []) {
          const tx = mapQontoTransaction(t, accountId);
          if (tx && tx.date >= since) out.push(tx);
        }
        page = res.meta?.next_page || null;
      }
      return out;
    },
  };
}
