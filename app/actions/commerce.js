/**
 * Actions du module Articles : scan, recherche, comptage du stock, propositions de prix, fournisseurs,
 * assistant d'import de grille, échanges avec la caisse Kezia et l'ancien logiciel. Les formulaires et
 * les fichiers du module ont leurs propres écouteurs (data-form et data-action « commerce-… »).
 */

import { applyPricelist, articleFromLine, eanIndex, saveArticle, withCode } from '../../core/commerce/articles.js?v=3bfbbd4';
import { addTier, removeSupplierLink, removeTier, saveSupplierLink } from '../../core/commerce/tiers.js?v=3bfbbd4';
import { makePrimary, mergeSupplierLinks, misfiledArticles } from '../../core/commerce/consistency.js?v=3bfbbd4';
import { eanCandidates } from '../../core/commerce/ean.js?v=3bfbbd4';
import { isKeziaExport, mergeKeziaArticles, parseKeziaExport, toKeziaRows } from '../../core/commerce/kezia.js?v=3bfbbd4';
import { matchLegacy, parseLegacyRows } from '../../core/commerce/legacy.js?v=3bfbbd4';
import { currentProfile, pricelistsFromImport, saveProfile, saveSupplier } from '../../core/commerce/pricelists.js?v=3bfbbd4';
import { applyProfile, detectProfile, fold, profileSignature, validateProfile } from '../../core/commerce/sheet.js?v=3bfbbd4';
import { priceProposal, stockMove } from '../../core/commerce/stock.js?v=3bfbbd4';
import { buildSnapshot, parseSnapshot } from '../../core/commerce/snapshot.js?v=3bfbbd4';
import { parseEuros } from '../../core/money.js?v=3bfbbd4';
import { canDecide, commerce, decideProposal, loadCommerce, persist } from '../commerce/data.js?v=3bfbbd4';
import { downloadJson, downloadXls, readWorkbook, sha256Hex } from '../commerce/files.js?v=3bfbbd4';
import { openScanner } from '../commerce/scanner.js?v=3bfbbd4';
import { render } from '../render.js?v=3bfbbd4';
import { newId, today, ui, ws } from '../state.js?v=3bfbbd4';
import { save, toast } from '../store.js?v=3bfbbd4';
import { commerceUi, findInPricelists, searchArticles } from '../views/articles.js?v=3bfbbd4';

const fail = (err) => toast(err?.message || String(err), true);

/** Enregistre puis redessine ; en cas de refus du serveur, recharge depuis la base (qui fait foi). */
async function commit(changes, message) {
  try {
    await persist(changes);
    if (message) toast(message);
  } catch (err) {
    fail(err);
    await loadCommerce(true);
  }
  render();
}

/** Code scanné ou tapé : fiche de l'article (EAN, code caisse, ancien code, référence), sinon « inconnu ». */
export function openCode(raw) {
  const code = String(raw || '').trim();
  if (!code) return;
  const st = commerceUi();
  const byEan = eanIndex(commerce.articles);
  const hit =
    eanCandidates(code).flatMap((e) => byEan.get(e) || [])[0] || commerce.articles.find((a) => (a.codes || []).some((c) => fold(c.value) === fold(code)));
  const viaSearch = hit ? null : searchArticles(code);
  const found = hit || (viaSearch?.length === 1 ? viaSearch[0] : null);
  st.scanMiss = found ? null : eanCandidates(code)[0] || code;
  location.hash = found ? `#/articles/${found.id}` : '#/articles/scan';
  render();
}

// ------------------------------------------------------------------ import de grille

async function commitImport() {
  const w = commerceUi().wizard;
  try {
    let suppliers = commerce.suppliers;
    let supplier = commerce.suppliers.find((s) => s.id === w.supplierId);
    if (!supplier) {
      suppliers = saveSupplier(suppliers, { name: w.newName }, { newId });
      supplier = suppliers.find((s) => fold(s.name) === fold(w.newName));
    }
    // Marques lues dans la grille (PPG : Guittet, Gori…) : servent à repérer les doublons de fournisseurs.
    const brands = [...new Set(w.result.lines.map((l) => l.brand).filter(Boolean))].slice(0, 12);
    supplier = { ...supplier, brands: [...new Set([...(supplier.brands || []), ...brands])].slice(0, 50) };
    const before = currentProfile(supplier)?.version || 0;
    supplier = saveProfile(supplier, w.profile, { signature: profileSignature(w.workbook, w.profile) });
    const profile = currentProfile(supplier);
    const versions = pricelistsFromImport(
      { supplier, effectiveDate: w.effectiveDate, fileName: w.fileName, fileHash: w.fileHash, lines: w.result.lines, profileVersion: profile.version },
      { newId, previousEffectiveDate: w.previousDate || null },
    );
    let articles = commerce.articles;
    const history = [];
    const changed = new Set();
    for (const v of versions) {
      const r = applyPricelist(articles, v, { newId });
      r.articles.forEach((a, i) => a !== articles[i] && changed.add(a.id));
      articles = r.articles;
      history.push(...r.history);
    }
    Object.assign(commerce, {
      suppliers: suppliers.map((s) => (s.id === supplier.id ? supplier : s)).concat(suppliers.some((s) => s.id === supplier.id) ? [] : [supplier]),
      articles,
      pricelists: [...commerce.pricelists, ...versions],
      history: [...commerce.history, ...history],
    });
    commerceUi().wizard = null;
    location.hash = `#/articles/fournisseur-${supplier.id}`;
    await commit(
      {
        suppliers: [supplier],
        profiles: profile.version > before ? [{ supplierId: supplier.id, entry: profile }] : [],
        pricelists: versions,
        articles: articles.filter((a) => changed.has(a.id)),
        history,
      },
      `Grille importée : ${changed.size} article${changed.size > 1 ? 's' : ''} mis à jour, ${history.length} prix d’achat changé${history.length > 1 ? 's' : ''}.`,
    );
  } catch (err) {
    fail(err);
  }
}

async function wizardFile(f, fd) {
  const file = fd.get('file');
  if (!f.supplierId) return toast('Choisissez le fournisseur.', true);
  if (f.supplierId === 'nouveau' && !f.newName?.trim()) return toast('Indiquez le nom du nouveau fournisseur.', true);
  if (!file?.size) return toast('Choisissez le fichier de la grille.', true);
  try {
    const workbook = await readWorkbook(file);
    const supplier = commerce.suppliers.find((s) => s.id === f.supplierId);
    const saved = currentProfile(supplier);
    let profile = null;
    let reused = false;
    // Paramétrage mémorisé repris s'il s'applique encore (même onglet, mêmes intitulés de colonnes).
    if (saved && workbook.sheets.some((s) => s.name === saved.profile.sheet)) {
      try {
        if (!saved.signature || profileSignature(workbook, saved.profile) === saved.signature) [profile, reused] = [structuredClone(saved.profile), true];
      } catch {}
    }
    if (saved && !reused) toast('La mise en page de la grille a changé depuis le dernier import : vérifiez les colonnes proposées.');
    profile ||= detectProfile(workbook);
    commerceUi().wizard = { ...f, step: 2, workbook, profile, reused, fileName: file.name, fileHash: await sha256Hex(file), newName: f.newName?.trim() };
  } catch (err) {
    fail(new Error(`Fichier illisible : ${err.message}`));
  }
  render();
}

function wizardColumns(f, fd) {
  const w = commerceUi().wizard;
  const num = (v) => (v === '' || v === undefined ? undefined : Number(v));
  const columns = {};
  for (const [k, v] of Object.entries(f)) if (!/^(designation\d|priceBasis|previousDate|join\w+|tier\d+)$/.test(k) && num(v) !== undefined) columns[k] = num(v);
  const des = [f.designation0, f.designation1, f.designation2].map(num).filter((v) => v !== undefined);
  if (des.length) columns.designation = des;
  const profile = { sheet: w.profile.sheet, firstRow: w.profile.firstRow, columns, priceBasis: f.priceBasis === 'unit' ? 'unit' : 'piece' };
  // Prix par quantité détectés : gardés sauf case décochée.
  const tiers = (w.profile.tiers || []).filter((t) => fd.has(`tier${t.col}`));
  if (tiers.length) profile.tiers = tiers;
  if (f.joinSheet) {
    const prev = w.profile.join?.sheet === f.joinSheet ? w.profile.join : detectProfile(w.workbook, f.joinSheet);
    const j =
      prev.columns?.retailPrice !== undefined && prev.ean !== undefined
        ? prev
        : { sheet: f.joinSheet, firstRow: prev.firstRow, ean: prev.columns?.ean ?? 0, columns: { retailPrice: 0 } };
    profile.join = {
      sheet: f.joinSheet,
      firstRow: j.firstRow,
      ean: num(f.joinEan) ?? j.ean,
      columns: { retailPrice: num(f.joinRetail) ?? j.columns.retailPrice },
    };
  }
  try {
    validateProfile(profile);
    w.profile = profile;
    w.previousDate = f.previousDate || null;
    w.result = applyProfile(w.workbook, profile);
    if (!w.result.lines.length) throw new Error('Aucune ligne lisible avec ces colonnes : vérifiez la colonne EAN et la première ligne.');
    w.step = 4;
  } catch (err) {
    fail(err);
  }
  render();
}

// ------------------------------------------------------------------ fichiers caisse et ancien logiciel

async function keziaFile(file) {
  try {
    const wb = await readWorkbook(file);
    const sheet = wb.sheets.find((s) => isKeziaExport(s.rows));
    if (!sheet) throw new Error('Ce fichier n’est pas un export Articles de Kezia (colonnes IDART, EAN, DEF en première ligne).');
    const parsed = parseKeziaExport(sheet.rows);
    const r = mergeKeziaArticles(parsed, { articles: commerce.articles, suppliers: commerce.suppliers }, { newId });
    const newSuppliers = r.suppliers.filter((s) => !commerce.suppliers.some((x) => x.id === s.id));
    Object.assign(commerce, { articles: r.articles, suppliers: r.suppliers });
    commerceUi().kezia = { created: r.created, updated: r.updated, suppliers: r.suppliers.length, issues: parsed.issues };
    await commit({ suppliers: newSuppliers, articles: r.articles }, `Caisse reprise : ${r.created} articles créés, ${r.updated} mis à jour.`);
  } catch (err) {
    fail(err);
  }
}

async function legacyFile(file) {
  try {
    const wb = await readWorkbook(file);
    const legacy = parseLegacyRows(wb.sheets[0].rows);
    const designations = new Map();
    for (const p of [...commerce.pricelists].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)))
      for (const l of p.lines) if (l.ean) designations.set(l.ean, l.designation);
    commerceUi().legacy = { count: legacy.length, proposals: matchLegacy(legacy, commerce.articles, { designations }) };
  } catch (err) {
    fail(new Error(`Fichier illisible : ${err.message}`));
  }
  render();
}

async function legacyAccept(which) {
  const lg = commerceUi().legacy;
  const chosen = lg.proposals.filter((p) => !p.done && (which === 'sure' ? ['A', 'B'].includes(p.level) : p.articleId === which));
  const changed = [];
  for (const p of chosen) {
    const i = commerce.articles.findIndex((a) => a.id === p.articleId);
    if (i < 0) continue;
    commerce.articles[i] = { ...withCode(commerce.articles[i], 'ancien', p.code), legacyPrice: p.priceHt };
    changed.push(commerce.articles[i]);
    p.done = true;
  }
  await commit(
    { articles: changed },
    `${changed.length} article${changed.length > 1 ? 's' : ''} rattaché${changed.length > 1 ? 's' : ''} à l’ancien logiciel.`,
  );
}

/**
 * Jeu de données chargé en démonstration : il remplace le module, l'active, et donne son nom à
 * l'entreprise de démonstration (ex. Les Revêtements Briards). Rien ne part sur internet.
 */
async function snapshotFile(file) {
  if (!ui.demo) return toast('Le chargement d’un jeu de données se fait en démonstration.', true);
  try {
    toast(`Lecture de « ${file.name} »…`);
    const snap = parseSnapshot(await file.text());
    // Fenêtre de confirmation bloquée par le navigateur (réponse immédiate) : le choix du fichier vaut accord.
    const asked = Date.now();
    if (!confirm(`Remplacer les données du module par ce fichier (${snap.counts.articles} articles, ${snap.counts.suppliers} fournisseurs) ?`)) {
      if (Date.now() - asked > 50) return toast('Chargement annulé : les données du module sont gardées.');
    }
    await loadCommerce();
    Object.assign(commerce, snap.commerce);
    ws.company.modules = { ...(ws.company.modules || {}), commerce: true };
    if (snap.organisation?.name) ws.company.name = snap.organisation.name;
    save();
    await persist();
    commerceUi().scanMiss = null;
    location.hash = '#/articles';
    toast(`Jeu de données chargé : ${snap.counts.articles} articles, ${snap.counts.proposals} prix à valider.`);
  } catch (err) {
    fail(err);
  }
  render();
}

// ------------------------------------------------------------------ clics

export const actionsTable = {
  'commerce-reload': () => loadCommerce(true).then(render),
  'commerce-more': () => {
    commerceUi().limit += 100;
    render();
  },
  'commerce-scan': () => openScanner(openCode),
  'commerce-mode': ({ id }) => {
    if (id) commerceUi().mode = id;
    render();
  },
  'commerce-decide-all': async () => {
    const open = commerce.proposals.filter((p) => p.status === 'proposee');
    if (!canDecide() || !open.length || !confirm(`Valider les ${open.length} prix proposés ? Chaque prix passe dans sa fiche et dans l’historique.`)) return;
    let done = 0;
    try {
      for (const p of open) {
        await decideProposal(p, true, { newId, date: today() });
        done++;
      }
      toast(`${done} prix validés : pensez à les envoyer à la caisse (onglet Caisse).`);
    } catch (err) {
      fail(err);
      await loadCommerce(true);
    }
    render();
  },
  'commerce-decide': async ({ id, index }) => {
    const p = commerce.proposals.find((x) => x.id === id);
    if (!p || !canDecide()) return;
    try {
      await decideProposal(p, index === '1', { newId, date: today() });
      toast(index === '1' ? 'Prix validé : pensez à l’envoyer à la caisse.' : 'Proposition refusée.');
    } catch (err) {
      fail(err);
      await loadCommerce(true);
    }
    render();
  },
  'commerce-create-from-grid': async ({ id }) => {
    const found = findInPricelists(id);
    const supplier = found && commerce.suppliers.find((s) => s.id === found.supplierId);
    if (!supplier) return;
    const a = articleFromLine(found.line, supplier, { newId, rounding: 'psy' });
    a.suppliers[0].pricelistId = found.pricelistId;
    commerce.articles.push(a);
    commerceUi().scanMiss = null;
    location.hash = `#/articles/${a.id}`;
    await commit({ articles: [a] }, 'Article créé, au prix de vente calculé avec le coefficient du fournisseur : vérifiez-le.');
  },
  'commerce-merge': async ({ id, index }) => {
    const from = commerce.suppliers.find((s) => s.id === id);
    const to = commerce.suppliers.find((s) => s.id === index);
    if (!from || !to || !confirm(`Fusionner « ${from.name} » dans « ${to.name} » ? Les articles de « ${from.name} » passeront chez « ${to.name} ».`)) return;
    const changed = mergeSupplierLinks(commerce.articles, from.id, to.id);
    const byId = new Map(changed.map((a) => [a.id, a]));
    commerce.articles = commerce.articles.map((a) => byId.get(a.id) || a);
    const merged = { ...from, mergedInto: to.id };
    const target = { ...to, brands: [...new Set([...(to.brands || []), from.name])] };
    commerce.suppliers = commerce.suppliers.map((s) => (s.id === from.id ? merged : s.id === to.id ? target : s));
    await commit({ suppliers: [merged, target], articles: changed }, `« ${from.name} » fusionné dans « ${to.name} » (${changed.length} articles).`);
  },
  'commerce-make-primary': async ({ id }) => {
    const changed = misfiledArticles(commerce.articles, id).map((m) => makePrimary(m.article, id));
    const byId = new Map(changed.map((a) => [a.id, a]));
    commerce.articles = commerce.articles.map((a) => byId.get(a.id) || a);
    await commit(
      { articles: changed },
      `${changed.length} article${changed.length > 1 ? 's' : ''} rattaché${changed.length > 1 ? 's' : ''} à ce fournisseur, prix d’achat de la grille retenu.`,
    );
  },
  'commerce-link-primary': ({ id, index }) => {
    const a = commerce.articles.find((x) => x.id === id);
    if (a) return commitArticle(makePrimary(a, index), 'Fournisseur principal changé : son prix devient le prix d’achat de référence.');
  },
  'commerce-link-remove': ({ id, index }) => {
    const a = commerce.articles.find((x) => x.id === id);
    if (a && confirm('Retirer ce fournisseur de l’article ?')) return commitArticle(removeSupplierLink(a, index), 'Fournisseur retiré de l’article.');
  },
  'commerce-tier-remove': ({ id, index }) => {
    const a = commerce.articles.find((x) => x.id === id);
    const [supplierId, i] = String(index).split('|');
    if (a) return commitArticle(removeTier(a, supplierId, Number(i)), 'Palier retiré.');
  },
  'commerce-import-for': ({ id }) => {
    commerceUi().wizard = { supplierId: id, step: 1 };
    location.hash = '#/articles/import';
  },
  'commerce-snapshot-save': () => {
    const name = (ws.company.name || 'nexus')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-');
    downloadJson(buildSnapshot(commerce, { organisation: { name: ws.company.name } }), `${name}-articles-${today()}.json`);
    toast('Copie enregistrée : elle contient vos prix d’achat, gardez-la pour vous.');
  },
  'commerce-file-pick': ({ id }) => document.querySelector(`input[data-action="commerce-${id}-file"]`)?.click(),
  'commerce-wiz-back': ({ index }) => {
    const w = commerceUi().wizard;
    if (index === '1') commerceUi().wizard = { supplierId: w.supplierId, newName: w.newName, effectiveDate: w.effectiveDate };
    else w.step = Number(index);
    render();
  },
  'commerce-wiz-commit': commitImport,
  'commerce-legacy-accept': ({ id }) => legacyAccept(id),
};

// ------------------------------------------------------------------ fichiers, cases et listes

document.addEventListener('change', async (e) => {
  const el = e.target;
  const action = el.dataset?.action;
  if (!action?.startsWith('commerce-')) return;
  // Fichier lu puis champ vidé : choisir à nouveau le même fichier relance la lecture.
  const file = el.type === 'file' ? el.files[0] : null;
  if (file) el.value = '';
  if (action === 'commerce-kezia-file' && file) return keziaFile(file);
  if (action === 'commerce-legacy-file' && file) return legacyFile(file);
  if (action === 'commerce-snapshot-file' && file) return snapshotFile(file);
  if (action === 'commerce-mode') {
    commerceUi().mode = el.value;
    return render();
  }
  if (action === 'commerce-wiz-sheet') {
    const w = commerceUi().wizard;
    w.profile = detectProfile(w.workbook, el.value);
    w.reused = false;
    return render();
  }
  if (action === 'commerce-module') {
    ws.company.modules = { ...(ws.company.modules || {}), commerce: el.checked };
    save();
    toast(el.checked ? 'Module Articles et stock activé : il apparaît dans le menu.' : 'Module Articles et stock masqué (les données sont gardées).');
    return render();
  }
});

// ------------------------------------------------------------------ formulaires

const SUBMITS = {
  'commerce-search': (f) => {
    const st = commerceUi();
    Object.assign(st, { search: (f.q || '').trim(), filter: f.filter || '', supplier: f.supplier || '', limit: 100 });
    // Douchette : un code-barres exact ouvre directement la fiche.
    if (/^\d{8,14}$/.test(st.search)) {
      const hit = eanCandidates(st.search).flatMap((x) => eanIndex(commerce.articles).get(x) || []);
      if (hit.length === 1) {
        st.search = '';
        location.hash = `#/articles/${hit[0].id}`;
      }
    }
    render();
  },
  'commerce-code': (f) => openCode(f.code),
  'commerce-count': (f, fd, form) => addMove({ articleId: form.dataset.id, kind: 'comptage', qty: f.qty }),
  'commerce-move': (f, fd, form) => addMove({ articleId: form.dataset.id, kind: f.kind, qty: f.qty, note: f.note }),
  'commerce-suggest': (f) => {
    const coef = Number(String(f.coef || '').replace(',', '.'));
    if (!(coef >= 1 && coef <= 10)) return toast('Coefficient entre 1 et 10 (exemple : 2,00).', true);
    Object.assign(commerceUi(), { proposalCoef: Math.round(coef * 10000), proposalRounding: f.rounding });
    render();
  },
  'commerce-propose': async (f, fd, form) => {
    const a = commerce.articles.find((x) => x.id === form.dataset.id);
    try {
      const p = priceProposal(a, parseEuros(f.price), { reason: f.reason, newId });
      commerce.proposals.push(p);
      await commit({ proposals: [p] }, canDecide() ? 'Prix proposé : validez-le dans « Prix à valider ».' : 'Prix envoyé au dirigeant pour validation.');
    } catch (err) {
      fail(err);
    }
  },
  'commerce-compare': (f, fd, form) => {
    commerceUi().compare = { supplierId: form.dataset.id, a: f.a, b: f.b };
    render();
  },
  'commerce-supplier': async (f, fd, form) => {
    try {
      const num = (v) => Number(String(v).replace(/\s/g, '').replace(',', '.'));
      const coef = f.coef ? Math.round(num(f.coef) * 10000) : null;
      const franco = f.franco ? Math.round(num(f.franco) * 100) : null;
      const lead = f.leadDays ? num(f.leadDays) : null;
      if ((franco !== null && !(franco >= 0)) || (lead !== null && !(Number.isInteger(lead) && lead >= 0)))
        throw new Error('Franco ou délai de livraison illisible.');
      const prev = commerce.suppliers.find((s) => s.id === form.dataset.id);
      const list = saveSupplier(
        commerce.suppliers,
        { ...prev, ...f, id: prev.id, brands: String(f.brands || '').split(','), defaultCoefBp: coef, francoCents: franco, leadDays: lead },
        { newId },
      );
      commerce.suppliers = list;
      await commit({ suppliers: [list.find((s) => s.id === prev.id)] }, 'Fiche fournisseur enregistrée.');
    } catch (err) {
      fail(err);
    }
  },
  'commerce-link': (f, fd, form) =>
    editArticle(form, (a) =>
      saveSupplierLink(a, {
        supplierId: f.supplierId,
        ref: f.ref || undefined,
        netPrice: f.price ? parseEuros(f.price) : undefined,
        packSize: quantity(f.packSize),
        palletSize: quantity(f.palletSize),
      }),
    ),
  'commerce-tier': (f, fd, form) =>
    editArticle(form, (a) => addTier(a, f.supplierId, { qty: quantity(f.qty), per: f.per, netPrice: parseEuros(f.price) }), 'Prix par quantité ajouté.'),
  'commerce-qty': (f, fd, form) => {
    const q = quantity(f.qty);
    const st = commerceUi();
    st.qtyFor = { ...(st.qtyFor || {}), [form.dataset.id]: q > 0 ? q : null };
    render();
  },
  'commerce-class': (f, fd, form) =>
    editArticle(
      form,
      (a) => {
        const [next] = saveArticle(
          [a],
          {
            ...a,
            ...['department', 'family', 'subFamily', 'brand', 'unit', 'colour', 'dimension'].reduce((o, k) => ({ ...o, [k]: f[k] ?? '' }), {}),
            size: quantity(f.size),
            stockMin: quantity(f.stockMin),
            stockMax: quantity(f.stockMax),
            reorderQty: quantity(f.reorderQty),
          },
          { newId },
        );
        return next;
      },
      'Classement et seuils enregistrés.',
    ),
  'commerce-kezia-export': async (f, fd) => {
    const list = fd.has('onlyLinked') ? commerce.articles.filter((a) => (a.codes || []).some((c) => c.type === 'caisse')) : commerce.articles;
    const rows = toKeziaRows(list, commerce.suppliers, { updatePmpa: fd.has('updatePmpa') });
    await downloadXls(rows, `nexus-vers-kezia-${today()}.xls`).catch(fail);
    toast(`${rows.length - 1} lignes pour ${list.length} articles : à importer dans Kezia après une sauvegarde.`);
  },
  'commerce-wiz-file': wizardFile,
  'commerce-wiz-sheet': (f) => {
    const w = commerceUi().wizard;
    const firstRow = Math.max(0, Number(f.firstRow || 1) - 1);
    if (f.sheet !== w.profile.sheet) w.profile = detectProfile(w.workbook, f.sheet);
    w.profile.firstRow = firstRow;
    w.step = 3;
    render();
  },
  'commerce-wiz-columns': wizardColumns,
};

/** Nombre saisi (« 2,5 ») ; null si la case est vide, NaN si illisible (refusé par le contrôle). */
const quantity = (v) => (v === undefined || String(v).trim() === '' ? null : Number(String(v).replace(/\s/g, '').replace(',', '.')));

async function commitArticle(next, message) {
  commerce.articles = commerce.articles.map((x) => (x.id === next.id ? next : x));
  await commit({ articles: [next] }, message);
}

/** Modifie l'article du formulaire ; une saisie refusée laisse l'article tel quel. */
async function editArticle(form, change, message = 'Article enregistré.') {
  const a = commerce.articles.find((x) => x.id === form.dataset.id);
  if (!a) return;
  try {
    await commitArticle(change(a), message);
  } catch (err) {
    fail(err);
  }
}

async function addMove(input) {
  try {
    const m = stockMove({ ...input, date: today() }, { newId });
    commerce.moves.push(m);
    await commit({ moves: [m] }, input.kind === 'comptage' ? `Comptage enregistré : ${m.qty}.` : 'Mouvement de stock enregistré.');
  } catch (err) {
    fail(err);
  }
}

document.addEventListener('submit', (e) => {
  const form = e.target;
  const handler = SUBMITS[form.dataset?.form];
  if (!handler) return;
  e.preventDefault();
  const fd = new FormData(form);
  handler(Object.fromEntries(fd), fd, form);
});
