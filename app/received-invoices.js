/**
 * Factures reçues (réimport depuis la plateforme agréée) : XML CII ou UBL, PDF Factur-X (XML joint
 * extrait) ou archive ZIP contenant ces fichiers. pdf-lib n'est chargé que pour un PDF.
 */

import { readIncomingInvoice } from '../core/einvoice-in.js?v=a619ec1';
import { extractFacturXml } from '../core/facturx.js?v=a619ec1';
import { readZip } from '../core/zip.js?v=a619ec1';

/** Décompression « deflate » native du navigateur. */
async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function xmlOf(name, bytes) {
  if (/\.pdf$/i.test(name)) return extractFacturXml(bytes, await import('./vendor/pdf-lib.js?v=a619ec1'));
  return new TextDecoder().decode(bytes);
}

/** { invoices: [{ inv, file }], errors: [message] } pour les fichiers choisis. */
export async function readReceivedInvoices(files, ownSiren) {
  const entries = [];
  const errors = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (/\.zip$/i.test(f.name)) {
      try {
        for (const e of await readZip(bytes, { inflate: inflateRaw }))
          if (/\.(xml|pdf)$/i.test(e.name)) entries.push({ name: e.name.split('/').pop(), bytes: e.data });
      } catch (err) {
        errors.push(`${f.name} : ${err.message}`);
      }
    } else entries.push({ name: f.name, bytes });
  }
  const invoices = [];
  for (const e of entries) {
    try {
      const inv = readIncomingInvoice(await xmlOf(e.name, e.bytes), { ownSiren });
      const type = /\.pdf$/i.test(e.name) ? 'application/pdf' : 'application/xml';
      invoices.push({ inv, file: new File([e.bytes], e.name, { type }) });
    } catch (err) {
      errors.push(`${e.name} : ${err.message}`);
    }
  }
  return { invoices, errors };
}
