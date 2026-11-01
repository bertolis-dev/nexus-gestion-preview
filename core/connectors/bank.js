/**
 * Connecteurs bancaires : une seule interface pour les écrans, quelle que soit la source des
 * mouvements (API Qonto aujourd'hui, agrégateur DSP2 plus tard ; l'import de fichier reste le
 * secours, voir bank-import.js).
 *
 * Interface d'un connecteur :
 *   provider                                   'qonto' | 'aggregator'
 *   listAccounts()                             → [{ externalId, label, ibanLast4 }]
 *   listTransactions({ externalId, accountId, since })
 *                                              → mouvements au format de bank-import.js
 * Une erreur porte un message qui dit quoi faire (« reconnectez votre compte… »).
 *
 * Chaque échange est journalisé (table sync_log) : date, compte, nombre de mouvements reçus et
 * ajoutés, erreur éventuelle.
 */

/**
 * Récupère les mouvements d'un compte et les ajoute au Workspace (sans doublon : identifiants
 * stables fournis par la banque).
 * @returns {Promise<{ fetched: number, added: object[] }>}
 */
export async function runBankSync({ ws, connector, accountId, externalId, since, log = () => {}, now = () => new Date().toISOString() }) {
  const startedAt = now();
  const entry = { provider: connector.provider, accountId, status: 'ok', fetched: 0, added: 0, error: null, startedAt, finishedAt: null };
  try {
    const txs = await connector.listTransactions({ externalId, accountId, since });
    const added = ws.importTransactions(txs);
    Object.assign(entry, { fetched: txs.length, added: added.length, finishedAt: now() });
    log(entry);
    return { fetched: txs.length, added };
  } catch (err) {
    Object.assign(entry, { status: 'error', error: err.message, finishedAt: now() });
    log(entry);
    throw err;
  }
}
