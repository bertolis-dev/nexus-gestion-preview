/**
 * QR code de paiement par virement SEPA (format EPC069-12, « QR code SCT ») : scanné avec
 * l'application de sa banque, il pré-remplit le bénéficiaire, l'IBAN, le montant et la référence
 * (numéro de facture). Aucune commission, aucun service tiers.
 */

import { issuerName } from './invoices.js?v=d415f7a';

/** IBAN sans espaces, en majuscules, avec clé de contrôle valide (modulo 97) ; sinon null. */
export function normalizeIban(raw) {
  const iban = String(raw || '')
    .replace(/\s+/g, '')
    .toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return null;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1 ? iban : null;
}

/**
 * Texte du QR code EPC, ou null quand un virement ne peut pas être pré-rempli (IBAN absent ou
 * invalide, montant nul ou négatif). Montant en centimes ; le nom est tronqué à 70 caractères et la
 * référence à 140, comme le format l'exige.
 */
export function epcPayload({ name, iban, bic = '', amount, reference = '' }) {
  const account = normalizeIban(iban);
  if (!account || !Number.isInteger(amount) || amount <= 0 || amount > 99999999999) return null;
  const euros = `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`;
  const clean = (s, max) =>
    String(s || '')
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, max);
  return [
    'BCD',
    '002',
    '1',
    'SCT',
    clean(bic, 11).replace(/\s+/g, '').toUpperCase(),
    clean(name, 70),
    account,
    `EUR${euros}`,
    '',
    '',
    clean(reference, 140),
  ].join('\n');
}

/** Paiement par QR code pour une facture émise (pas un devis ni un avoir), ou null. */
export function invoicePaymentQr(invoice, issuer, outstanding) {
  if (!invoice || invoice.status !== 'issued' || invoice.type === 'quote' || invoice.type === 'credit') return null;
  const amount = outstanding ?? invoice.totals?.netToPay ?? invoice.totals?.totalTtc;
  return epcPayload({ name: issuer ? issuerName(issuer) : '', iban: issuer?.iban, bic: issuer?.bic, amount, reference: `Facture ${invoice.number}` });
}
