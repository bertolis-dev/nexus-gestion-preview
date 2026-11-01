/**
 * Cycle de vie des factures électroniques (§2, §3.5) : statuts échangés entre plateformes agréées.
 * Quatre sont obligatoires dans la réforme — déposée, rejetée, refusée, encaissée — les autres sont
 * facultatifs mais utiles au suivi. Tant que Nexus n'est pas raccordé à une PA, les statuts se posent
 * à la main (facture envoyée par e-mail, réponse du client) ; « encaissée » se pose seule au paiement
 * complet. Le connecteur PA les alimentera ensuite automatiquement (source « PA »).
 *
 * Libellés alignés sur la norme de cycle de vie (AFNOR XP Z12-012) ; codes à confirmer avec la PA retenue.
 */

export const LIFECYCLE = {
  deposee: { label: 'Déposée', mandatory: true, step: 1 },
  emise: { label: 'Émise par la plateforme', step: 2 },
  recue: { label: 'Reçue par la plateforme du client', step: 3 },
  mise_a_disposition: { label: 'Mise à disposition du client', step: 4 },
  prise_en_charge: { label: 'Prise en charge par le client', step: 5 },
  approuvee: { label: 'Approuvée', step: 6 },
  approuvee_partiellement: { label: 'Approuvée partiellement', step: 6 },
  en_litige: { label: 'En litige', step: 6, alert: true },
  suspendue: { label: 'Suspendue', step: 6, alert: true },
  refusee: { label: 'Refusée par le client', mandatory: true, step: 6, alert: true, final: true },
  rejetee: { label: 'Rejetée par la plateforme (non conforme)', mandatory: true, step: 2, alert: true, final: true },
  paiement_transmis: { label: 'Paiement transmis', step: 7 },
  encaissee: { label: 'Encaissée', mandatory: true, step: 8, final: true },
};

/**
 * Statut qui compte : un statut final (encaissée, refusée, rejetée) l'emporte sur un dépôt enregistré
 * après lui ; sinon le dernier statut. Les statuts sont toujours ajoutés en fin de liste (la position
 * est la clé de synchronisation : une insertion au milieu se perdrait en base).
 */
export function currentStatus(events = []) {
  if (!events.length) return null;
  return [...events].reverse().find((e) => LIFECYCLE[e.status]?.final) || events.at(-1);
}

/** Statuts proposés à la main après le statut courant (on n'ajoute rien après un statut final). */
export function nextStatuses(events = []) {
  const cur = currentStatus(events);
  if (cur && LIFECYCLE[cur.status]?.final) return [];
  return Object.keys(LIFECYCLE).filter((k) => k !== 'encaissee' && k !== cur?.status);
}

/**
 * Statuts « encaissée » pas encore transmis : obligation 2027 pour les prestations de services
 * (données de paiement), à envoyer par la PA. Renvoie { invoiceId, event }.
 */
export function pendingPaymentStatuses(lifecycle = {}) {
  const out = [];
  for (const [invoiceId, events] of Object.entries(lifecycle)) {
    for (const event of events) if (event.status === 'encaissee' && !event.transmittedAt) out.push({ invoiceId, event });
  }
  return out;
}
