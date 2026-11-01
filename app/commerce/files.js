/**
 * Fichiers du module Articles dans le navigateur : lecture d'un classeur (xls, xlsx, csv) en objet
 * neutre pour core/commerce/sheet.js, empreinte SHA-256 du fichier d'origine (gardée avec la version
 * de grille), écriture du fichier à réimporter dans la caisse. SheetJS n'est chargé qu'ici.
 */

import { pdfToRows } from '../../core/commerce/pdf-table.js?v=e821f3b';

let xlsx = null;
const lib = async () => (xlsx ||= await import('../vendor/xlsx.js?v=e821f3b'));

/** Grille en PDF : texte des pages, mis en tableau par core/commerce/pdf-table.js. pdf.js n'est chargé qu'ici. */
async function readPdf(file) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.js?v=e821f3b');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push({ items: tc.items.map((t) => ({ str: t.str, x: t.transform[4], y: t.transform[5], w: t.width })) });
  }
  return { sheets: [{ name: 'PDF', rows: pdfToRows(pages) }] };
}

/** { sheets: [{ name, rows }] } : cellules brutes (nombres en nombres, dates en texte ISO). Excel, CSV ou PDF. */
export async function readWorkbook(file) {
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return readPdf(file);
  const X = await lib();
  const wb = X.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: false, dense: true });
  return {
    sheets: wb.SheetNames.map((name) => ({ name, rows: X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true }) })),
  };
}

export async function sha256Hex(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Télécharge un tableau en .xls (format Excel 97, celui que Kezia lit et produit ; onglet « A »
 * comme son export Articles).
 */
export async function downloadXls(rows, fileName, sheetName = 'A') {
  const X = await lib();
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), sheetName);
  const data = X.write(wb, { bookType: 'biff8', type: 'array' });
  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.ms-excel' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
