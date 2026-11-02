/**
 * Facture PDF Factur-X dans le navigateur : pdf-lib, polices et profil de couleur (copies locales de
 * app/vendor/, 1,4 Mo) chargés seulement à la première facture téléchargée ou envoyée.
 */

import { buildFacturXPdf } from '../core/facturx.js?v=17f2ba9';
import { buildCii } from '../core/einvoice.js?v=17f2ba9';
import { invoicePaymentQr } from '../core/epc.js?v=17f2ba9';

let assets = null;
const bytes = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());

async function loadAssets() {
  if (!assets) {
    const [lib, regular, bold, icc] = await Promise.all([
      import('./vendor/pdf-lib.js?v=17f2ba9'),
      bytes('vendor/fonts/manrope-400.ttf'),
      bytes('vendor/fonts/manrope-700.ttf'),
      bytes('vendor/srgb.icc'),
    ]);
    assets = { lib, fonts: { regular, bold }, icc };
  }
  return assets;
}

/** Logo de l'entreprise (Paramètres), enregistré en data URL PNG ou JPEG. */
function logoOf(company) {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(company?.logo || '');
  return m ? { bytes: Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0)), type: m[1] === 'png' ? 'png' : 'jpg' } : null;
}

export const pdfFileName = (inv) => `${inv.type === 'credit' ? 'avoir' : 'facture'}-${inv.number}.pdf`;

/** PDF/A-3 Factur-X de la facture émise, avec le logo actuel de l'entreprise et le QR code de virement. */
export async function invoicePdf(inv, company, { outstanding } = {}) {
  const payload = invoicePaymentQr(inv, inv.issuer || company, outstanding);
  const paymentQr = payload ? (await import('./vendor/qrcode.js?v=17f2ba9')).qrMatrix(payload) : null;
  // Devis : PDF simple, sans facture électronique jointe (un devis ne se transmet pas en Factur-X).
  return buildFacturXPdf({ ...(await loadAssets()), logo: logoOf(company), invoice: inv, xml: inv.type === 'quote' ? null : buildCii(inv), paymentQr });
}
