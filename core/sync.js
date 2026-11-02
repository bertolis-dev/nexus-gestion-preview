/**
 * Synchronisation Workspace ⇄ base Supabase, sans dépendance au transport.
 *
 * - `planSync(before, after, meta)` compare deux états sérialisés (Workspace.toJSON()) et produit la
 *   liste ORDONNÉE des opérations à rejouer côté serveur (les clés étrangères imposent l'ordre :
 *   écritures avant factures, dépenses, règlements et transactions ; validation en dernier).
 * - `stateFromRows(rows)` reconstruit l'état d'un Workspace à partir des lignes lues en base.
 *
 * Une opération est un objet neutre : { kind: 'upsert'|'update'|'delete'|'rpc', ... }. L'application
 * l'exécute via supabase-js (app/sync.js), les tests via SQL sur PGlite (test/sync.test.js) : même plan,
 * mêmes charges utiles. Le serveur revérifie tout (triggers, RLS) ; en cas de divergence (numéro de
 * facture ou nombre d'écritures validées différent), l'application recharge l'état depuis la base.
 */

const byId = (list) => new Map((list || []).map((x) => [x.id, x]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------------ état → lignes

export function companyRow(company) {
  const { name, siren, legalForm, taxRegime, vatRegime, vatOnDebits, fiscalYear, ...settings } = company;
  return {
    name,
    siren,
    legal_form: legalForm,
    tax_regime: taxRegime,
    vat_regime: vatRegime,
    vat_on_debits: Boolean(vatOnDebits),
    settings: { ...settings, vatOnDebits: Boolean(vatOnDebits) },
  };
}

/**
 * Modifications de l'entreprise : colonnes de la fiche (mise à jour, dirigeant seulement) et réglages
 * clé par clé (merge_structure_settings, migration 0021) — deux onglets qui changent des réglages
 * différents ne s'écrasent plus, et l'expert peut enregistrer ses déclarations.
 */
function companyOps(before, after, meta) {
  const { settings: bSettings = {}, ...bCols } = before ? companyRow(before) : { settings: {} };
  const { settings: aSettings, ...aCols } = companyRow(after);
  const ops = [];
  if (!before || !same(bCols, aCols)) ops.push({ kind: 'update', table: 'structures', match: { id: meta.structureId }, values: aCols });
  const set = Object.fromEntries(Object.entries(aSettings).filter(([k, v]) => !same(bSettings[k], v)));
  const unset = Object.keys(bSettings).filter((k) => !(k in aSettings));
  if (Object.keys(set).length || unset.length)
    ops.push({ kind: 'rpc', fn: 'merge_structure_settings', args: { p_structure: meta.structureId, p_set: set, p_unset: unset } });
  return ops;
}

export function entryPayload(e, meta) {
  return {
    id: e.id,
    structure_id: meta.structureId,
    fiscal_year_id: meta.fiscalYearId,
    journal: e.journal,
    entry_date: e.date,
    label: e.label,
    piece_ref: e.pieceRef || '',
    piece_date: e.pieceDate || e.date,
    source: e.source ?? null,
    reversal_of: e.reversalOf ?? null,
    seq: e.seq,
    lines: e.lines.map((l) => ({
      account: l.account,
      aux: l.aux,
      auxLabel: l.auxLabel,
      label: l.label,
      debit: l.debit,
      credit: l.credit,
      letter: l.letter,
      letterDate: l.letterDate,
    })),
  };
}

export function invoiceDraftRow(inv, meta) {
  return {
    id: inv.id,
    structure_id: meta.structureId,
    type: inv.type || 'invoice',
    series: inv.series || 'F',
    issue_date: inv.issueDate || null,
    due_date: inv.dueDate || null,
    client: inv.client || {},
    lines: inv.lines || [],
    credit_of: inv.creditOf || null,
    entry_id: inv.entryId || null,
    // Informations du brouillon sans colonne dédiée (acomptes à déduire, devis d'origine, modèle récurrent).
    extra: {
      deposits: inv.deposits || [],
      quoteRef: inv.quoteRef || null,
      recurringId: inv.recurringId || null,
      period: inv.period || null,
      // Livraison : seulement si elle diffère de la date d'émission ou de l'adresse du client.
      ...Object.fromEntries(['deliveryDate', 'deliveryAddress', 'deliveryCountry', 'reason'].filter((k) => inv[k]).map((k) => [k, inv[k]])),
    },
  };
}

export function clientRow(c, meta) {
  const { id, code, name, ...data } = c;
  return { id, structure_id: meta.structureId, code, name, data };
}

export function purchaseRow(p, meta) {
  return {
    id: p.id,
    structure_id: meta.structureId,
    purchase_date: p.date,
    number: p.number || '',
    supplier: p.supplier,
    lines: p.lines,
    total_ttc: p.totalTtc,
    entry_id: p.entryId,
    aux: p.aux || '',
    third_party_account: p.thirdPartyAccount,
    document_name: p.documentName || '',
    kind: p.type === 'credit' ? 'credit' : 'invoice',
    reverse_charge: Boolean(p.reverseCharge),
    // Import Nexus RH (migration 0029) : pièce d'origine, échéance, justificatif conservé par Nexus RH.
    external_ref: p.externalRef || null,
    due_date: p.dueDate || null,
    receipt_url: p.receiptUrl || null,
  };
}

/** Paie du mois importée de Nexus RH (migration 0030) : ajout seul. */
export function payrollRow(p, meta) {
  const { id, ref, period, entryId, ...data } = p;
  return { id, structure_id: meta.structureId, period, ref, data, entry_id: entryId || null };
}

/** Compte bancaire ajouté (le compte principal existe déjà en base, créé avec l'entreprise). */
export function bankAccountRow(a, meta) {
  return {
    id: a.id,
    structure_id: meta.structureId,
    label: a.label,
    provider: a.provider || 'manual',
    iban_last4: a.ibanLast4 || null,
    gl_account: a.glAccount,
  };
}

export function transactionRow(t, meta) {
  return {
    structure_id: meta.structureId,
    id: t.id,
    // « default » : compte principal, dont l'identifiant en base est connu au chargement.
    bank_account_id: t.accountId && t.accountId !== 'default' ? t.accountId : meta.bankAccountId,
    tx_date: t.date,
    label: t.label,
    amount: t.amount,
    status: t.status,
    entry_id: t.entryId || null,
    missing_receipt: Boolean(t.missingReceipt),
  };
}

function settlementRows(state, meta) {
  const rows = [];
  for (const [invoiceId, list] of Object.entries(state.book?.payments || {})) {
    for (const p of list)
      rows.push({
        structure_id: meta.structureId,
        doc_kind: 'invoice',
        doc_id: invoiceId,
        amount: p.amount,
        pay_date: p.date,
        vat_date: p.vatDate || null,
        ref: p.ref,
        entry_id: p.entryId,
        line_index: p.lineIndex,
      });
  }
  for (const pu of state.purchases || []) {
    for (const p of pu.payments || [])
      rows.push({
        structure_id: meta.structureId,
        doc_kind: 'purchase',
        doc_id: pu.id,
        amount: p.amount,
        pay_date: p.date,
        vat_date: p.vatDate || null,
        ref: p.ref,
        entry_id: p.entryId,
        line_index: p.lineIndex,
      });
  }
  return rows;
}

const settlementKey = (r) => `${r.doc_kind}|${r.doc_id}|${r.entry_id}|${r.line_index}`;

// ------------------------------------------------------------------ plan

/** Instantané figé d'une facture émise, stocké tel quel dans invoices.issued. */
export function issuedSnapshot(inv) {
  const { id, status, ...rest } = inv;
  return rest;
}

export function planSync(before, after, meta) {
  const ops = [];
  const b = before || {};

  ops.push(...companyOps(b.company, after.company, meta));

  // Clients
  const bClients = byId(b.clients);
  const clients = (after.clients || []).filter((c) => !same(bClients.get(c.id), c)).map((c) => clientRow(c, meta));
  if (clients.length) ops.push({ kind: 'upsert', table: 'clients', rows: clients, onConflict: 'id' });

  // Écritures : suppressions de brouillons, puis créations / modifications dans l'ordre de saisie.
  const bEntries = byId(b.ledger?.entries);
  const aEntries = byId(after.ledger?.entries);
  for (const [id, e] of bEntries) {
    if (!aEntries.has(id) && e.status === 'draft') ops.push({ kind: 'delete', table: 'entries', match: { id } });
  }
  const letterChanges = [];
  for (const e of [...aEntries.values()].sort((x, y) => x.seq - y.seq)) {
    const prev = bEntries.get(e.id);
    if (prev && prev.status === 'validated') {
      prev.lines.forEach((l, i) => {
        const n = e.lines[i];
        if (n && (n.letter !== l.letter || n.letterDate !== l.letterDate))
          letterChanges.push({ entry_id: e.id, line_no: i + 1, letter: n.letter, letterDate: n.letterDate });
      });
      continue;
    }
    const comparable = (x) => x && { ...x, status: undefined, number: undefined, validatedAt: undefined };
    if (!prev || !same(comparable(prev), comparable(e))) {
      // Déjà envoyée : la base refuse de la recréer si un autre appareil l'a supprimée entre-temps.
      ops.push({ kind: 'rpc', fn: 'save_draft_entry', args: { p: { ...entryPayload(e, meta), ...(prev ? { existing: true } : {}) } } });
    }
  }

  // Factures
  const bInv = byId(b.book?.invoices);
  const aInv = byId(after.book?.invoices);
  for (const [id, inv] of bInv) {
    if (!aInv.has(id) && inv.status === 'draft') ops.push({ kind: 'delete', table: 'invoices', match: { id } });
  }
  for (const inv of aInv.values()) {
    const prev = bInv.get(inv.id);
    if (prev?.status === 'issued') continue;
    // Brouillon déjà envoyé : mise à jour (0 ligne = supprimé sur un autre appareil, signalé) au lieu
    // d'un « upsert » qui le ferait réapparaître.
    if (!prev) ops.push({ kind: 'upsert', table: 'invoices', rows: [invoiceDraftRow(inv, meta)], onConflict: 'id' });
    else if (!same(prev, inv)) {
      const { id: _id, structure_id: _s, ...values } = invoiceDraftRow(inv, meta);
      ops.push({ kind: 'update', table: 'invoices', match: { id: inv.id }, values });
    }
    if (inv.status === 'issued') {
      ops.push({
        kind: 'rpc',
        fn: 'issue_invoice',
        args: { p_invoice: inv.id, p_snapshot: issuedSnapshot(inv) },
        expect: { type: 'invoiceNumber', value: inv.number },
      });
    }
  }

  // Dépenses (création seule : une dépense enregistrée ne se modifie pas, son statut payé est dérivé)
  const bPurch = byId(b.purchases);
  const purchases = (after.purchases || []).filter((p) => !bPurch.has(p.id)).map((p) => purchaseRow(p, meta));
  if (purchases.length) ops.push({ kind: 'upsert', table: 'purchases', rows: purchases, onConflict: 'id', ignoreDuplicates: true });
  const bPay = byId(b.payrolls);
  const payrolls = (after.payrolls || []).filter((p) => !bPay.has(p.id)).map((p) => payrollRow(p, meta));
  if (payrolls.length) ops.push({ kind: 'upsert', table: 'payrolls', rows: payrolls, onConflict: 'id', ignoreDuplicates: true });

  // Règlements
  const bSet = new Set(settlementRows(b, meta).map(settlementKey));
  const settlements = settlementRows(after, meta).filter((r) => !bSet.has(settlementKey(r)));
  if (settlements.length)
    ops.push({
      kind: 'upsert',
      table: 'settlements',
      rows: settlements,
      onConflict: 'structure_id,doc_kind,doc_id,entry_id,line_index',
      ignoreDuplicates: true,
    });

  // Comptes bancaires ajoutés (avant leurs mouvements)
  const bBanks = byId(b.bankAccounts);
  const banks = (after.bankAccounts || []).filter((a) => a.id !== 'default' && !same(bBanks.get(a.id), a)).map((a) => bankAccountRow(a, meta));
  if (banks.length) ops.push({ kind: 'upsert', table: 'bank_accounts', rows: banks, onConflict: 'id' });

  // Transactions bancaires
  const bTx = byId(b.transactions);
  const txs = (after.transactions || []).filter((t) => !same(bTx.get(t.id), t)).map((t) => transactionRow(t, meta));
  if (txs.length) ops.push({ kind: 'upsert', table: 'bank_transactions', rows: txs, onConflict: 'structure_id,id' });

  // Cycle de vie des factures (ajout seul)
  const eventRows = (state) =>
    Object.entries(state.book?.lifecycle || {}).flatMap(([invoiceId, events]) =>
      events.map((e, position) => ({
        structure_id: meta.structureId,
        invoice_id: invoiceId,
        position,
        status: e.status,
        event_date: e.date,
        source: e.source || 'manuel',
        detail: e.detail || '',
      })),
    );
  const bEvents = new Set(eventRows(b).map((r) => `${r.invoice_id}|${r.position}`));
  const events = eventRows(after).filter((r) => !bEvents.has(`${r.invoice_id}|${r.position}`));
  if (events.length) ops.push({ kind: 'upsert', table: 'invoice_events', rows: events, onConflict: 'invoice_id,position', ignoreDuplicates: true });

  // Modèles de factures récurrentes (JSON libre, sans incidence comptable directe)
  const bRec = byId(b.recurring);
  const aRec = byId(after.recurring);
  for (const id of bRec.keys()) if (!aRec.has(id)) ops.push({ kind: 'delete', table: 'recurring_invoices', match: { id } });
  const recs = [...aRec.values()].filter((r) => !same(bRec.get(r.id), r)).map(({ id, ...data }) => ({ id, structure_id: meta.structureId, data }));
  if (recs.length) ops.push({ kind: 'upsert', table: 'recurring_invoices', rows: recs, onConflict: 'id' });

  // Validation de période, puis lettrage des écritures déjà validées.
  if (after.ledger?.lockedThrough && after.ledger.lockedThrough !== b.ledger?.lockedThrough) {
    const count = (after.ledger.entries || []).filter((e) => e.status === 'validated' && bEntries.get(e.id)?.status !== 'validated').length;
    ops.push({
      kind: 'rpc',
      fn: 'validate_through',
      args: { p_fiscal_year: meta.fiscalYearId, p_date: after.ledger.lockedThrough },
      expect: { type: 'count', value: count },
    });
  }
  // Une écriture encore brouillon avant ce lot a déjà transmis ses lettres via save_draft_entry ;
  // set_letters ne concerne que les écritures validées lors d'un lot précédent.
  if (letterChanges.length) ops.push({ kind: 'rpc', fn: 'set_letters', args: { p_changes: letterChanges } });

  return ops;
}

// ------------------------------------------------------------------ lignes → état

function letterValue(code) {
  let n = 0;
  for (const ch of code) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/**
 * @param {object} r lignes lues en base : { structure, fiscalYear, bankAccountId, entries (avec
 *   entry_lines), invoices, counters, settlements, clients, purchases, transactions }
 */
function draftFromRow(i) {
  const x = i.extra || {};
  const draft = {
    id: i.id,
    type: i.type,
    series: i.series,
    status: 'draft',
    number: null,
    deposits: x.deposits || [],
    client: i.client,
    issueDate: i.issue_date,
    dueDate: i.due_date,
    lines: i.lines,
  };
  if (i.credit_of) draft.creditOf = i.credit_of;
  for (const k of ['quoteRef', 'recurringId', 'period', 'deliveryDate', 'deliveryAddress', 'deliveryCountry', 'reason']) if (x[k]) draft[k] = x[k];
  return draft;
}

/** Grand livre d'un exercice (clos ou non) à partir de ses écritures en base, pour consultation. */
export function ledgerStateFromRows(entries, fiscalYear) {
  const list = [...entries]
    .sort((a, b) => a.seq - b.seq)
    .map((e) => ({
      seq: Number(e.seq),
      id: e.id,
      journal: e.journal,
      date: e.entry_date,
      label: e.label,
      pieceRef: e.piece_ref,
      pieceDate: e.piece_date,
      source: e.source,
      status: e.status,
      number: e.number,
      validatedAt: e.validated_at,
      reversalOf: e.reversal_of,
      lines: [...e.entry_lines]
        .sort((a, b) => a.line_no - b.line_no)
        .map((l) => ({
          account: l.account,
          aux: l.aux,
          auxLabel: l.aux_label,
          label: l.label,
          debit: Number(l.debit),
          credit: Number(l.credit),
          letter: l.letter,
          letterDate: l.letter_date || '',
        })),
    }));
  return {
    entries: list,
    lockedThrough: fiscalYear.locked_through,
    lastNumber: fiscalYear.last_entry_number,
    lastLetter: 0,
    auditLog: [],
    seq: list.length ? list.at(-1).seq : 0,
    fiscalYear: { start: fiscalYear.start_date, end: fiscalYear.end_date },
  };
}

/** Regroupement par clé (Object.groupBy n'existe qu'à partir de Node 21 et des navigateurs de 2024). */
function groupBy(list, key) {
  const out = {};
  for (const x of list) (out[key(x)] ||= []).push(x);
  return out;
}

export function stateFromRows(r) {
  const s = r.structure;
  const company = {
    ...(s.settings || {}),
    name: s.name,
    siren: s.siren,
    legalForm: s.legal_form,
    taxRegime: s.tax_regime,
    vatRegime: s.vat_regime,
    vatOnDebits: s.vat_on_debits,
    fiscalYear: { start: r.fiscalYear.start_date, end: r.fiscalYear.end_date },
  };
  // Relances envoyées par e-mail depuis la base (journal email_log) : ajoutées à l'historique de la
  // facture si ce niveau n'y figure pas déjà.
  for (const e of r.emails || []) {
    if (!e.invoice_id || !e.level) continue;
    const history = company.reminders?.[e.invoice_id] || [];
    if (history.some((h) => h.level === e.level)) continue;
    company.reminders = { ...(company.reminders || {}), [e.invoice_id]: [...history, { level: e.level, date: parisDateOf(e.sent_at) }] };
  }

  // Comptes bancaires : le compte en 512000 est le compte principal (« default » dans l'état local).
  const bankRows = r.bankAccounts || [];
  const primaryBankId = (bankRows.find((x) => x.gl_account === '512000') || bankRows[0])?.id || r.bankAccountId || null;
  const bankAccounts = [
    ...bankRows
      .filter((x) => x.id === primaryBankId)
      .map((x) => ({ ...DEFAULT_BANK_ACCOUNT, label: x.label || DEFAULT_BANK_ACCOUNT.label, ibanLast4: x.iban_last4 || null })),
    ...bankRows
      .filter((x) => x.id !== primaryBankId)
      .map((x) => ({ id: x.id, label: x.label, glAccount: x.gl_account, provider: x.provider || 'manual', ibanLast4: x.iban_last4 || null })),
  ];
  if (!bankAccounts.length) bankAccounts.push({ ...DEFAULT_BANK_ACCOUNT });

  const entries = [...r.entries]
    .sort((a, b) => a.seq - b.seq)
    .map((e) => ({
      seq: Number(e.seq),
      id: e.id,
      journal: e.journal,
      date: e.entry_date,
      label: e.label,
      pieceRef: e.piece_ref,
      pieceDate: e.piece_date,
      source: e.source,
      status: e.status,
      number: e.number,
      validatedAt: e.validated_at,
      reversalOf: e.reversal_of,
      lines: [...e.entry_lines]
        .sort((a, b) => a.line_no - b.line_no)
        .map((l) => ({
          account: l.account,
          aux: l.aux,
          auxLabel: l.aux_label,
          label: l.label,
          debit: Number(l.debit),
          credit: Number(l.credit),
          letter: l.letter,
          letterDate: l.letter_date || '',
        })),
    }));
  const letters = entries.flatMap((e) => e.lines.map((l) => l.letter)).filter(Boolean);

  const payments = {};
  const purchasePayments = {};
  for (const st of [...r.settlements].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    const p = {
      amount: Number(st.amount),
      date: st.pay_date,
      ref: st.ref,
      entryId: st.entry_id,
      lineIndex: st.line_index,
      ...(st.vat_date ? { vatDate: st.vat_date } : {}),
    };
    const target = st.doc_kind === 'invoice' ? payments : purchasePayments;
    (target[st.doc_id] ||= []).push(p);
  }

  const invoices = [...r.invoices]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((i) => (i.status === 'issued' ? { ...i.issued, id: i.id, status: 'issued', number: i.number } : draftFromRow(i)));

  return {
    company,
    ledger: {
      entries,
      lockedThrough: r.fiscalYear.locked_through,
      lastNumber: r.fiscalYear.last_entry_number,
      // Code n° n = valeur − 702 (codes à 3 lettres, voir Ledger) ; un ancien code plus court compte pour 0.
      lastLetter: letters.length ? Math.max(0, ...letters.map((c) => letterValue(c) - 702)) : 0,
      auditLog: [],
      seq: entries.length ? Math.max(...entries.map((e) => e.seq)) : 0,
    },
    book: {
      invoices,
      counters: Object.fromEntries(r.counters.map((c) => [c.series_key, c.last_number])),
      seq: invoices.length,
      payments,
      lifecycle: Object.fromEntries(
        Object.entries(groupBy(r.events || [], (e) => e.invoice_id)).map(([id, list]) => [
          id,
          list.sort((a, b) => a.position - b.position).map((e) => ({ status: e.status, date: e.event_date, source: e.source, detail: e.detail })),
        ]),
      ),
    },
    clients: r.clients.map((c) => ({ ...c.data, id: c.id, code: c.code, name: c.name })),
    purchases: [...r.purchases]
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((p) => {
        const pays = purchasePayments[p.id] || [];
        return {
          id: p.id,
          supplier: p.supplier,
          date: p.purchase_date,
          number: p.number,
          documentName: p.document_name,
          lines: p.lines,
          entryId: p.entry_id,
          ...(p.kind === 'credit' ? { type: 'credit' } : {}),
          ...(p.reverse_charge ? { reverseCharge: true } : {}),
          ...(p.external_ref ? { externalRef: p.external_ref } : {}),
          ...(p.due_date ? { dueDate: p.due_date } : {}),
          ...(p.receipt_url ? { receiptUrl: p.receipt_url } : {}),
          totalTtc: Number(p.total_ttc),
          paid: pays.reduce((sum, x) => sum + x.amount, 0),
          payments: pays,
          aux: p.aux,
          thirdPartyAccount: p.third_party_account,
        };
      }),
    bankAccounts,
    transactions: [...r.transactions]
      .sort((a, b) => String(a.imported_at).localeCompare(String(b.imported_at)) || a.id.localeCompare(b.id))
      .map((t) => ({
        id: t.id,
        accountId: t.bank_account_id && t.bank_account_id !== primaryBankId ? t.bank_account_id : 'default',
        date: t.tx_date,
        label: t.label,
        amount: Number(t.amount),
        status: t.status,
        entryId: t.entry_id || undefined,
        missingReceipt: t.missing_receipt || undefined,
      })),
    recurring: (r.recurring || []).map((x) => ({ ...x.data, id: x.id })),
    payrolls: (r.payrolls || []).map((x) => ({ ...x.data, id: x.id, ref: x.ref, period: x.period, ...(x.entry_id ? { entryId: x.entry_id } : {}) })),
    seq: 0,
  };
}

/**
 * Applique à l'appareil la réponse du serveur à une opération : le numéro d'ordre d'une écriture est
 * attribué par le serveur (migration 0014) et doit être repris localement.
 * @returns {boolean} vrai si l'état local a changé
 */
export function applySyncResult(ws, op, result) {
  if (op.kind !== 'rpc' || op.fn !== 'save_draft_entry' || !result || typeof result !== 'object' || result.seq == null) return false;
  const entry = ws.ledger.entries.find((e) => e.id === op.args.p.id);
  const seq = Number(result.seq);
  if (!entry || entry.seq === seq) return false;
  entry.seq = seq;
  ws.ledger.seq = Math.max(ws.ledger.seq, seq);
  return true;
}

/** Erreur qui signale que la base a évolué ailleurs (autre appareil, autre onglet) : recharger. */
/**
 * Refus qui ne disparaîtra pas en réessayant : doublon (23505), règle métier levée par la base
 * (P0001, ex. « Facture déjà émise » quand la réponse précédente s'est perdue) ou droits (42501).
 * L'interface propose alors de recharger depuis la base, au lieu de bloquer la file indéfiniment.
 */
export function isDivergence(error) {
  return Boolean(error?.divergence || ['23505', 'P0001', '42501'].includes(error?.code));
}

/** Mise à jour qui n'a touché aucune ligne : refusée par la base (droits) ou ligne disparue. */
export function refusedUpdate(op) {
  return Object.assign(new Error(`Modification refusée par la base (${op.table}) : droits insuffisants ou données modifiées ailleurs.`), {
    divergence: true,
  });
}
import { DEFAULT_BANK_ACCOUNT } from './bank.js?v=269c883';
import { parisDateOf } from './dates.js?v=269c883';
