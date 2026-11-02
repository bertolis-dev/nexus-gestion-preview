/**
 * Facture Factur-X (profil EN 16931) : PDF/A-3B lisible par le client, auquel est jointe la facture
 * électronique CII (factur-x.xml, voir einvoice.js), avec les métadonnées Factur-X.
 *
 * La bibliothèque PDF (pdf-lib + fontkit), les polices et le profil de couleur sont injectés : ce
 * module reste en JavaScript pur, testé sous Node et validé par Mustang (PDF/A-3 et Factur-X) dans
 * scripts/validate-einvoice.mjs ; le navigateur lui passe les copies locales de app/vendor/.
 */

import { issuerName } from './invoices.js?v=269c883';

export const FACTURX_FILE_NAME = 'factur-x.xml';
const FX_NS = 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#';

const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const isoSeconds = (d) => `${d.toISOString().slice(0, 19)}Z`;

/** Métadonnées XMP : identification PDF/A-3B, Dublin Core, extension Factur-X (schéma déclaré). */
export function facturXXmp({ title, author, date, conformance = 'EN 16931', documentType = 'INVOICE', facturx = true }) {
  const prop = (name, description) =>
    `<rdf:li rdf:parseType="Resource"><pdfaProperty:name>${name}</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>${description}</pdfaProperty:description></rdf:li>`;
  // Devis (sans facture électronique jointe) : PDF/A-3 simple, sans l'extension Factur-X.
  const fxBlock = `<rdf:Description rdf:about="" xmlns:fx="${FX_NS}"><fx:DocumentType>${documentType}</fx:DocumentType><fx:DocumentFileName>${FACTURX_FILE_NAME}</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>${conformance}</fx:ConformanceLevel></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
<pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
<pdfaSchema:namespaceURI>${FX_NS}</pdfaSchema:namespaceURI>
<pdfaSchema:prefix>fx</pdfaSchema:prefix>
<pdfaSchema:property><rdf:Seq>
${prop('DocumentFileName', 'name of the embedded XML invoice file')}
${prop('DocumentType', 'INVOICE')}
${prop('Version', 'The actual version of the Factur-X XML schema')}
${prop('ConformanceLevel', 'The conformance level of the embedded Factur-X data')}
</rdf:Seq></pdfaSchema:property>
</rdf:li></rdf:Bag></pdfaExtension:schemas>
</rdf:Description>`;
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(title)}</rdf:li></rdf:Alt></dc:title><dc:creator><rdf:Seq><rdf:li>${xmlEsc(author)}</rdf:li></rdf:Seq></dc:creator></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>Nexus Gestion</pdf:Producer></rdf:Description>
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreatorTool>Nexus Gestion</xmp:CreatorTool><xmp:CreateDate>${isoSeconds(date)}</xmp:CreateDate><xmp:ModifyDate>${isoSeconds(date)}</xmp:ModifyDate></rdf:Description>
${facturx ? fxBlock : ''}
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

// ---------------------------------------------------------------- mise en page

const NAVY = [0.11, 0.169, 0.29]; // #1c2b4a
const GOLD = [0.788, 0.604, 0.329]; // #c99a54
const TEXT = [0.102, 0.114, 0.141]; // #1a1d24
const MUTED = [0.357, 0.384, 0.439]; // #5b6270
const A4 = [595.28, 841.89];
const M = 48; // marges

const money = (cents) => {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const euros = String(Math.trunc(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '-' : ''}${euros},${String(abs % 100).padStart(2, '0')} €`;
};
const frDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const rate = (bp) => `${String(bp / 100).replace('.', ',')} %`;
const TITLES = { invoice: 'FACTURE', credit: 'AVOIR', deposit: 'FACTURE D’ACOMPTE', quote: 'DEVIS' };

/** Identifiant de document (trailer /ID) stable pour une facture donnée. */
function documentId(text) {
  let h = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  for (let i = 0; i < text.length; i++) h = h.map((x, j) => Math.imul(x ^ text.charCodeAt(i), 0x01000193 + j * 2) >>> 0);
  return h.map((x) => x.toString(16).padStart(8, '0')).join('');
}

/**
 * PDF/A-3B Factur-X d'une facture émise.
 * @param {object} p
 * @param {object} p.lib pdf-lib ({ PDFDocument, PDFName, PDFString, PDFHexString, rgb, fontkit })
 * @param {{regular: Uint8Array, bold: Uint8Array}} p.fonts polices TTF incorporées
 * @param {Uint8Array} p.icc profil de couleur sRGB (intention de sortie PDF/A)
 * @param {{bytes: Uint8Array, type: "png"|"jpg"}} [p.logo] logo de l’entreprise
 * @param {object} p.invoice facture émise (numéro, émetteur, client, lignes, totaux, mentions)
 * @param {string} p.xml facture électronique CII (buildCii)
 * @returns {Promise<Uint8Array>}
 */
export async function buildFacturXPdf({ lib, fonts, icc, logo = null, invoice, xml, now = new Date(), paymentQr = null }) {
  const { PDFDocument, PDFName, PDFString, PDFHexString, rgb, fontkit } = lib;
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  // Copie des octets : pdf-lib lit le tampon sous-jacent sans tenir compte d'un éventuel décalage (Buffer de Node).
  const logoBytes = logo ? Uint8Array.from(logo.bytes) : null;
  const logoImg = logo ? await (logo.type === 'jpg' ? doc.embedJpg(logoBytes) : doc.embedPng(logoBytes)) : null;
  const color = (c) => rgb(...c);
  const issuer = invoice.issuer || {};
  const client = invoice.client || {};
  const title = `${TITLES[invoice.type] ? TITLES[invoice.type][0] + TITLES[invoice.type].slice(1).toLowerCase() : 'Facture'} ${invoice.number}`;

  // Caractères absents de la police remplacés (PDF/A interdit le glyphe .notdef).
  const clean = (font, s) =>
    [...String(s ?? '').replace(/[\u00A0\u202F\u2009]/g, ' ')]
      .map((ch) => (ch === '\n' || font.embedder?.font?.hasGlyphForCodePoint?.(ch.codePointAt(0)) !== false ? ch : '?'))
      .join('');
  const width = (text, size, font = regular) => font.widthOfTextAtSize(clean(font, text), size);
  const wrap = (text, size, max, font = regular) => {
    const out = [];
    for (const para of clean(font, text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (line && font.widthOfTextAtSize(next, size) > max) {
          out.push(line);
          line = word;
        } else line = next;
      }
      out.push(line);
    }
    return out;
  };

  let page;
  let y;
  const pages = [];
  const newPage = () => {
    page = doc.addPage(A4);
    pages.push(page);
    y = A4[1] - M;
  };
  const text = (s, x, yy, { size = 10, font = regular, c = TEXT, align = 'left', maxWidth } = {}) => {
    const t = clean(font, s);
    const w = font.widthOfTextAtSize(t, size);
    const xx = align === 'right' ? x - w : x;
    page.drawText(t, { x: xx, y: yy, size, font, color: color(c), ...(maxWidth ? { maxWidth } : {}) });
  };
  const ensure = (h) => {
    if (y - h < M + 40) {
      newPage();
      tableHeader();
    }
  };

  // ---- en-tête : émetteur, titre et références
  newPage();
  let x0 = M;
  if (logoImg) {
    // Logo à 40 px de haut, largeur proportionnelle (au plus 120 px).
    const scale = Math.min(40 / logoImg.height, 120 / logoImg.width);
    page.drawImage(logoImg, { x: M, y: y - logoImg.height * scale + 4, width: logoImg.width * scale, height: logoImg.height * scale });
    x0 = M + logoImg.width * scale + 12;
  }
  text(issuerName(issuer), x0, y - 14, { size: 14, font: bold, c: NAVY });
  const issuerLines = [
    issuer.address,
    issuer.siren ? `SIREN ${issuer.siren}` : '',
    issuer.vatNumber ? `N° TVA ${issuer.vatNumber}` : '',
    [issuer.registration, issuer.capital ? `capital ${issuer.capital}` : ''].filter(Boolean).join(' · '),
  ].filter(Boolean);
  issuerLines.forEach((l, i) => text(l, x0, y - 30 - i * 12, { size: 9, c: MUTED }));
  const right = A4[0] - M;
  text(TITLES[invoice.type] || 'FACTURE', right, y - 18, { size: 22, font: bold, c: NAVY, align: 'right' });
  text(`N° ${invoice.number}`, right, y - 36, { size: 11, font: bold, align: 'right' });
  text(`Date : ${frDate(invoice.issueDate)}`, right, y - 50, { size: 9.5, c: MUTED, align: 'right' });
  if (invoice.type !== 'quote' && invoice.dueDate) text(`Échéance : ${frDate(invoice.dueDate)}`, right, y - 63, { size: 9.5, c: MUTED, align: 'right' });
  if (invoice.type === 'quote' && invoice.dueDate) text(`Valable jusqu’au ${frDate(invoice.dueDate)}`, right, y - 63, { size: 9.5, c: MUTED, align: 'right' });
  if (invoice.creditOf) text(`Avoir sur la facture ${invoice.creditOf}`, right, y - 76, { size: 9.5, c: MUTED, align: 'right' });
  y -= Math.max(40 + issuerLines.length * 12, 86);
  page.drawRectangle({ x: M, y, width: 64, height: 3, color: color(GOLD) });
  y -= 22;

  // ---- client et livraison
  text('Facturé à', M, y, { size: 9, font: bold, c: MUTED });
  const clientLines = [
    client.name,
    client.address,
    client.country && client.country !== 'FR' ? client.country : '',
    client.siren ? `SIREN ${client.siren}` : '',
    client.vatNumber ? `N° TVA ${client.vatNumber}` : '',
  ].filter(Boolean);
  clientLines.forEach((l, i) => text(l, M, y - 14 - i * 13, { size: 10, font: i === 0 ? bold : regular }));
  if (invoice.deliveryDate || invoice.deliveryAddress) {
    text('Livraison', A4[0] / 2, y, { size: 9, font: bold, c: MUTED });
    [invoice.deliveryDate ? `Le ${frDate(invoice.deliveryDate)}` : '', invoice.deliveryAddress || '']
      .filter(Boolean)
      .forEach((l, i) => text(l, A4[0] / 2, y - 14 - i * 13, { size: 10 }));
  }
  y -= 20 + clientLines.length * 13;

  // ---- lignes
  const cols = { label: M + 8, qty: 365, price: 440, vat: 482, total: right - 8 };
  const exempt = invoice.totals?.vatBreakdown?.every((r) => r.rateBp === 0);
  function tableHeader() {
    page.drawRectangle({ x: M, y: y - 20, width: right - M, height: 20, color: color(NAVY) });
    const h = { size: 9, font: bold, c: [1, 1, 1] };
    text('Désignation', cols.label, y - 13.5, h);
    text('Qté', cols.qty, y - 13.5, { ...h, align: 'right' });
    text('Prix unitaire HT', cols.price, y - 13.5, { ...h, align: 'right' });
    if (!exempt) text('TVA', cols.vat, y - 13.5, { ...h, align: 'right' });
    text('Total HT', cols.total, y - 13.5, { ...h, align: 'right' });
    y -= 34;
  }
  tableHeader();
  for (const l of invoice.lines || []) {
    const labelLines = wrap(l.label, 9.5, cols.qty - cols.label - 50);
    // Remise de la ligne : mention obligatoire (C. com. art. L.441-9), sous la désignation.
    if (l.discountBp) labelLines.push(`Remise ${rate(l.discountBp)}`);
    const h = labelLines.length * 12 + 8;
    ensure(h);
    labelLines.forEach((t, i) => text(t, cols.label, y - i * 12, { size: 9.5 }));
    const qtyMilli = Math.round(Number(l.qty) * 1000);
    const gross = Math.round((qtyMilli * l.unitPrice) / 1000);
    const ht = gross - Math.round((gross * (l.discountBp || 0)) / 10000);
    text(String(l.qty).replace('.', ','), cols.qty, y, { size: 9.5, align: 'right' });
    text(money(l.unitPrice), cols.price, y, { size: 9.5, align: 'right' });
    if (!exempt) text(rate(l.vatRateBp), cols.vat, y, { size: 9.5, align: 'right' });
    text(money(ht), cols.total, y, { size: 9.5, align: 'right' });
    y -= h;
    // Filet entre deux lignes : sous les jambages de la ligne écrite, au-dessus de la suivante.
    page.drawLine({ start: { x: M, y: y + 11 }, end: { x: right, y: y + 11 }, thickness: 0.5, color: color([0.84, 0.855, 0.878]) });
  }

  // ---- totaux
  const t = invoice.totals || {};
  const rows = [['Total HT', money(t.totalHt || 0)]];
  if (!exempt) for (const r of t.vatBreakdown || []) rows.push([`TVA ${rate(r.rateBp)} sur ${money(r.base)}`, money(r.vat)]);
  rows.push(['Total TTC', money(t.totalTtc || 0)]);
  if (t.depositsDeducted) rows.push(['Acomptes déjà versés', money(-t.depositsDeducted)]);
  ensure(rows.length * 15 + 40);
  y -= 6;
  for (const [label, value] of rows) {
    text(label, cols.price - 60, y, { size: 9.5, c: MUTED });
    text(value, cols.total, y, { size: 9.5, align: 'right' });
    y -= 15;
  }
  page.drawRectangle({ x: cols.price - 60, y: y + 6, width: right - (cols.price - 60), height: 1.5, color: color(GOLD) });
  y -= 10;
  const net = t.netToPay ?? t.totalTtc ?? 0;
  text(invoice.type === 'credit' ? 'Montant de l’avoir' : invoice.type === 'quote' ? 'Montant total' : 'Net à payer', cols.price - 60, y, {
    size: 12,
    font: bold,
    c: NAVY,
  });
  text(money(net), cols.total, y, { size: 12, font: bold, c: NAVY, align: 'right' });
  y -= 30;

  // ---- paiement et mentions
  const payment = [];
  if (invoice.type !== 'quote' && invoice.type !== 'credit' && invoice.dueDate) payment.push(`À régler au plus tard le ${frDate(invoice.dueDate)}.`);
  if (issuer.iban && invoice.type !== 'quote' && invoice.type !== 'credit')
    payment.push(`Virement : IBAN ${issuer.iban}${issuer.bic ? ` · BIC ${issuer.bic}` : ''}`);
  // QR code de virement SEPA (core/epc.js) : matrice de modules fournie par l'appelant.
  if (paymentQr?.length) {
    const size = 74;
    const cell = size / paymentQr.length;
    ensure(size + 18);
    const top = y + 6;
    paymentQr.forEach((row, r) => {
      // Modules sombres consécutifs d'une ligne regroupés en un seul rectangle.
      for (let c = 0; c < row.length; c++) {
        if (!row[c]) continue;
        let end = c;
        while (end + 1 < row.length && row[end + 1]) end++;
        page.drawRectangle({ x: M + c * cell, y: top - (r + 1) * cell, width: (end - c + 1) * cell, height: cell, color: color([0, 0, 0]) });
        c = end;
      }
    });
    const tx = M + size + 14;
    text('Payer par virement', tx, top - 16, { size: 10, font: bold, c: NAVY });
    text('Scannez ce code avec l’application de votre banque :', tx, top - 31, { size: 8.5, c: MUTED });
    text('bénéficiaire, IBAN, montant et référence sont pré-remplis.', tx, top - 43, { size: 8.5, c: MUTED });
    y = top - size - 22;
  }
  const notes = [...payment, ...(invoice.mentions || [])];
  for (const note of notes) {
    const lines = wrap(note, 8.5, right - M);
    ensure(lines.length * 11 + 4);
    lines.forEach((l, i) => text(l, M, y - i * 11, { size: 8.5, c: MUTED }));
    y -= lines.length * 11 + 4;
  }

  // ---- pied de page (toutes les pages)
  pages.forEach((p, i) => {
    page = p;
    text(
      `${issuerName(issuer)} · SIREN ${issuer.siren || ''} · ${invoice.number} · page ${i + 1} / ${pages.length}`,
      A4[0] / 2 - width(`${issuerName(issuer)} · SIREN ${issuer.siren || ''} · ${invoice.number} · page ${i + 1} / ${pages.length}`, 7.5) / 2,
      24,
      { size: 7.5, c: MUTED },
    );
  });

  // ---- structure PDF/A-3 : métadonnées, intention de sortie, facture électronique jointe
  const ctx = doc.context;
  doc.setTitle(title);
  doc.setAuthor(issuerName(issuer));
  doc.setCreator('Nexus Gestion');
  doc.setProducer('Nexus Gestion');
  doc.setCreationDate(now);
  doc.setModificationDate(now);
  const xmp = new TextEncoder().encode(facturXXmp({ title, author: issuerName(issuer), date: now, facturx: Boolean(xml) }));
  const meta = ctx.stream(xmp, { Type: 'Metadata', Subtype: 'XML', Length: xmp.length });
  doc.catalog.set(PDFName.of('Metadata'), ctx.register(meta));

  const profile = ctx.flateStream(icc, { N: 3 });
  const intent = ctx.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: ctx.register(profile),
  });
  doc.catalog.set(PDFName.of('OutputIntents'), ctx.obj([ctx.register(intent)]));

  if (xml) embedFacturX(doc, xml, now);
  doc.catalog.set(PDFName.of('ViewerPreferences'), ctx.obj({ DisplayDocTitle: true }));
  doc.catalog.set(PDFName.of('Lang'), PDFString.of('fr-FR'));

  const id = PDFHexString.of(documentId(`${issuer.siren}|${invoice.number}|${now.toISOString()}`));
  ctx.trailerInfo.ID = ctx.obj([id, id]);
  return doc.save({ useObjectStreams: false });

  /** Facture électronique jointe (fichier factur-x.xml, relation « Alternative »). */
  function embedFacturX(doc, xml, now) {
    const xmlBytes = new TextEncoder().encode(xml);
    const pdfDate = PDFString.fromDate(now);
    const file = ctx.flateStream(xmlBytes, { Type: 'EmbeddedFile', Subtype: 'text/xml', Params: { Size: xmlBytes.length, ModDate: pdfDate } });
    const fileRef = ctx.register(file);
    const spec = ctx.register(
      ctx.obj({
        Type: 'Filespec',
        F: PDFString.of(FACTURX_FILE_NAME),
        UF: PDFHexString.fromText(FACTURX_FILE_NAME),
        Desc: PDFString.of('Factur-X'),
        AFRelationship: 'Alternative',
        EF: { F: fileRef, UF: fileRef },
      }),
    );
    doc.catalog.set(PDFName.of('AF'), ctx.obj([spec]));
    doc.catalog.set(PDFName.of('Names'), ctx.obj({ EmbeddedFiles: { Names: [PDFHexString.fromText(FACTURX_FILE_NAME), spec] } }));
  }
}

/** Noms usuels du XML joint à une facture PDF (Factur-X, ZUGFeRD, XRechnung). */
const EMBEDDED_NAMES = /^(factur-x|zugferd-invoice|xrechnung|order-x)\.xml$/i;

/**
 * XML de la facture électronique jointe à un PDF reçu (Factur-X) ; erreur claire si le PDF n'en
 * contient pas (simple PDF, à saisir comme une dépense ordinaire).
 */
export async function extractFacturXml(bytes, lib) {
  const { PDFDocument, PDFName, PDFArray, PDFDict, decodePDFRawStream } = lib;
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const specs = [];
  const af = doc.catalog.lookupMaybe(PDFName.of('AF'), PDFArray);
  if (af) for (let i = 0; i < af.size(); i++) specs.push(af.lookup(i, PDFDict));
  const names = doc.catalog
    .lookupMaybe(PDFName.of('Names'), PDFDict)
    ?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict)
    ?.lookupMaybe(PDFName.of('Names'), PDFArray);
  if (names) for (let i = 1; i < names.size(); i += 2) specs.push(names.lookup(i, PDFDict));
  for (const spec of specs) {
    const name = (spec.lookup(PDFName.of('UF')) || spec.lookup(PDFName.of('F')))?.decodeText?.() || '';
    if (!EMBEDDED_NAMES.test(name)) continue;
    const ef = spec.lookup(PDFName.of('EF'), PDFDict);
    const stream = ef.lookup(PDFName.of('F')) || ef.lookup(PDFName.of('UF'));
    return new TextDecoder().decode(decodePDFRawStream(stream).decode());
  }
  throw new Error('Ce PDF ne contient aucune facture électronique (Factur-X) : enregistrez-le comme une dépense avec son justificatif.');
}
