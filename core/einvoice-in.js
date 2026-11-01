/**
 * Réception des factures électroniques fournisseurs (§2 : obligatoire depuis le 1er septembre 2026 ;
 * §3.3 « récupération automatique des factures électroniques »). En attendant le raccordement à la
 * plateforme agréée, le dirigeant peut importer le fichier XML reçu (CII / partie XML d'un Factur-X,
 * ou UBL) : la dépense est pré-remplie — fournisseur, SIREN, numéro, dates, montants par taux — et il
 * ne reste qu'à choisir la catégorie.
 *
 * Lecteur XML minimal, sans dépendance (le moteur doit tourner sous Node comme dans le navigateur) :
 * suffisant pour ces formats sans DTD ; les préfixes d'espace de noms sont ignorés.
 */

/** Arbre { name, attrs, children, text } d'un document XML bien formé. */
export function parseXml(xml) {
  const src = xml
    .replace(/^\uFEFF/, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+)/g;
  const decode = (s) =>
    s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&amp;/g, '&');
  let m;
  while ((m = re.exec(src))) {
    const [, closing, name, attrText, selfClosing, cdata, text] = m;
    const top = stack.at(-1);
    if (text !== undefined || cdata !== undefined) {
      top.text += cdata ?? decode(text);
      continue;
    }
    const local = name.split(':').pop();
    if (closing) {
      if (stack.length < 2 || top.local !== local) throw new Error(`XML mal formé : balise </${name}> inattendue`);
      stack.pop();
      continue;
    }
    const attrs = {};
    for (const [, k, v] of (attrText || '').matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[k.split(':').pop()] = decode(v ?? '');
    const node = { name, local, attrs, children: [], text: '' };
    top.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (stack.length !== 1) throw new Error('XML mal formé : balises non fermées');
  if (!root.children.length) throw new Error('Fichier vide ou illisible');
  return root.children[0];
}

const kids = (node, local) => (node ? node.children.filter((c) => c.local === local) : []);
/** Descend un chemin de noms locaux : path(node, 'A', 'B', 'C') → premier nœud trouvé. */
function path(node, ...names) {
  let cur = node;
  for (const n of names) {
    cur = kids(cur, n)[0];
    if (!cur) return null;
  }
  return cur;
}
function findAll(node, local, out = []) {
  if (!node) return out;
  if (node.local === local) out.push(node);
  for (const c of node.children) findAll(c, local, out);
  return out;
}
const txt = (node) => (node ? node.text.trim() : '');

function cents(s) {
  const t = String(s || '').trim();
  if (!t) return 0;
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) throw new Error(`Montant illisible : ${s}`);
  const frac = (m[3] || '').padEnd(3, '0');
  const value = Number(m[2]) * 100 + Number(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1 : 0);
  return m[1] ? -value : value;
}
const rateBp = (s) => Math.round(Number(s || 0) * 100);
const isoDate = (s) => {
  const t = String(s || '').trim();
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};

function ciiParty(p) {
  const addr = path(p, 'PostalTradeAddress');
  const legal = txt(path(p, 'SpecifiedLegalOrganization', 'ID'));
  const vat =
    kids(p, 'SpecifiedTaxRegistration')
      .map((r) => txt(path(r, 'ID')))
      .find((v) => /^[A-Z]{2}/.test(v)) || '';
  return {
    name: txt(path(p, 'Name')),
    siren: /^\d{9}/.test(legal) ? legal.slice(0, 9) : /^FR\d{2}(\d{9})$/.test(vat) ? vat.slice(4) : '',
    vatNumber: vat,
    country: txt(path(addr, 'CountryID')) || 'FR',
    address: [txt(path(addr, 'LineOne')), [txt(path(addr, 'PostcodeCode')), txt(path(addr, 'CityName'))].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  };
}

function fromCii(root) {
  const doc = path(root, 'ExchangedDocument');
  const tx = path(root, 'SupplyChainTradeTransaction');
  const agreement = path(tx, 'ApplicableHeaderTradeAgreement');
  const settlement = path(tx, 'ApplicableHeaderTradeSettlement');
  const sum = path(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation');
  const type = txt(path(doc, 'TypeCode'));
  return {
    format: 'CII',
    number: txt(path(doc, 'ID')),
    type: type === '381' ? 'credit' : type === '386' ? 'deposit' : 'invoice',
    issueDate: isoDate(txt(path(doc, 'IssueDateTime', 'DateTimeString'))),
    dueDate: isoDate(txt(path(settlement, 'SpecifiedTradePaymentTerms', 'DueDateDateTime', 'DateTimeString'))),
    currency: txt(path(settlement, 'InvoiceCurrencyCode')) || 'EUR',
    seller: ciiParty(path(agreement, 'SellerTradeParty')),
    buyer: ciiParty(path(agreement, 'BuyerTradeParty')),
    taxes: kids(settlement, 'ApplicableTradeTax').map((t) => ({
      category: txt(path(t, 'CategoryCode')),
      rateBp: rateBp(txt(path(t, 'RateApplicablePercent'))),
      base: cents(txt(path(t, 'BasisAmount'))),
      vat: cents(txt(path(t, 'CalculatedAmount'))),
    })),
    totalHt: cents(txt(path(sum, 'TaxBasisTotalAmount')) || txt(path(sum, 'LineTotalAmount'))),
    totalVat: cents(txt(findAll(sum, 'TaxTotalAmount').find((n) => !n.attrs.currencyID || n.attrs.currencyID === 'EUR'))),
    totalTtc: cents(txt(path(sum, 'GrandTotalAmount'))),
    dueAmount: cents(txt(path(sum, 'DuePayableAmount'))),
    lines: kids(tx, 'IncludedSupplyChainTradeLineItem').map((l) => ({
      label: txt(path(l, 'SpecifiedTradeProduct', 'Name')),
      ht: cents(txt(path(l, 'SpecifiedLineTradeSettlement', 'SpecifiedTradeSettlementLineMonetarySummation', 'LineTotalAmount'))),
    })),
    iban: txt(findAll(settlement, 'IBANID')[0]),
  };
}

function ublParty(p) {
  const party = path(p, 'Party');
  const addr = path(party, 'PostalAddress');
  const legal = txt(path(party, 'PartyLegalEntity', 'CompanyID'));
  const vat = txt(path(party, 'PartyTaxScheme', 'CompanyID'));
  return {
    name: txt(path(party, 'PartyLegalEntity', 'RegistrationName')) || txt(path(party, 'PartyName', 'Name')),
    siren: /^\d{9}/.test(legal) ? legal.slice(0, 9) : /^FR\d{2}(\d{9})$/.test(vat) ? vat.slice(4) : '',
    vatNumber: vat,
    country: txt(path(addr, 'Country', 'IdentificationCode')) || 'FR',
    address: [txt(path(addr, 'StreetName')), [txt(path(addr, 'PostalZone')), txt(path(addr, 'CityName'))].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  };
}

function fromUbl(root) {
  const credit = root.local === 'CreditNote';
  const totals = path(root, 'LegalMonetaryTotal');
  const taxTotal = kids(root, 'TaxTotal').find((t) => kids(t, 'TaxSubtotal').length) || kids(root, 'TaxTotal')[0];
  return {
    format: 'UBL',
    number: txt(path(root, 'ID')),
    type: credit ? 'credit' : txt(path(root, 'InvoiceTypeCode')) === '386' ? 'deposit' : 'invoice',
    issueDate: isoDate(txt(path(root, 'IssueDate'))),
    dueDate: isoDate(txt(path(root, 'DueDate')) || txt(path(root, 'PaymentMeans', 'PaymentDueDate'))),
    currency: txt(path(root, 'DocumentCurrencyCode')) || 'EUR',
    seller: ublParty(path(root, 'AccountingSupplierParty')),
    buyer: ublParty(path(root, 'AccountingCustomerParty')),
    taxes: kids(taxTotal, 'TaxSubtotal').map((s) => ({
      category: txt(path(s, 'TaxCategory', 'ID')),
      rateBp: rateBp(txt(path(s, 'TaxCategory', 'Percent'))),
      base: cents(txt(path(s, 'TaxableAmount'))),
      vat: cents(txt(path(s, 'TaxAmount'))),
    })),
    totalHt: cents(txt(path(totals, 'TaxExclusiveAmount'))),
    totalVat: cents(txt(path(taxTotal, 'TaxAmount'))),
    totalTtc: cents(txt(path(totals, 'TaxInclusiveAmount'))),
    dueAmount: cents(txt(path(totals, 'PayableAmount'))),
    lines: [...kids(root, credit ? 'CreditNoteLine' : 'InvoiceLine')].map((l) => ({
      label: txt(path(l, 'Item', 'Name')),
      ht: cents(txt(path(l, 'LineExtensionAmount'))),
    })),
    iban: txt(findAll(root, 'PayeeFinancialAccount').map((a) => path(a, 'ID'))[0]),
  };
}

/**
 * Lit une facture électronique reçue. Contrôle que le client est bien la structure (SIREN) et que les
 * totaux sont cohérents ; les anomalies sont renvoyées dans `warnings`, jamais corrigées en silence.
 */
export function readIncomingInvoice(xml, { ownSiren } = {}) {
  const root = parseXml(xml);
  let inv;
  if (root.local === 'CrossIndustryInvoice') inv = fromCii(root);
  else if (root.local === 'Invoice' || root.local === 'CreditNote') inv = fromUbl(root);
  else throw new Error('Format non reconnu : ce fichier n’est ni une facture CII (Factur-X) ni une facture UBL.');
  const warnings = [];
  if (!inv.number) warnings.push('Numéro de facture absent.');
  if (!inv.seller.name) warnings.push('Nom du fournisseur absent.');
  if (inv.currency !== 'EUR') warnings.push(`Facture en ${inv.currency} : la conversion en euros n’est pas encore gérée.`);
  if (ownSiren && inv.buyer.siren && inv.buyer.siren !== ownSiren)
    warnings.push(`Cette facture est adressée au SIREN ${inv.buyer.siren}, pas à votre entreprise (${ownSiren}).`);
  const taxSum = inv.taxes.reduce((s, t) => s + t.vat, 0);
  if (inv.taxes.length && taxSum !== inv.totalVat) warnings.push('Le total de TVA ne correspond pas au détail par taux.');
  if (inv.totalHt + inv.totalVat !== inv.totalTtc) warnings.push('Le total TTC ne correspond pas à HT + TVA.');
  return { ...inv, warnings };
}

/** Lignes d'achat Nexus (une par taux de TVA) à partir du détail des taxes de la facture reçue. */
export function purchaseLinesFrom(inv, categoryId) {
  const byRate = inv.taxes.length ? inv.taxes : [{ rateBp: 0, base: inv.totalHt, vat: 0 }];
  // Autoliquidation (AE) ou livraison intracommunautaire (K) : la facture porte 0 %, mais la TVA est due
  // par l'acheteur au taux français ; sans taux, purchaseEntry applique le taux normal (20 %).
  return byRate
    .filter((t) => t.base)
    .map((t) => ({ categoryId, ht: t.base, ...(['AE', 'K'].includes(t.category) && !t.rateBp ? {} : { vatRateBp: t.rateBp }) }));
}
