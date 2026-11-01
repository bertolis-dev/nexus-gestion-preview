/**
 * Recherche dans le guide de l'application (même fonctionnement que le guide de Nexus RH) : accents,
 * pluriels et petits mots ignorés, synonymes du vocabulaire courant (« facture » ↔ « émettre »…),
 * réponse la plus pertinente d'abord. Sans dépendance au navigateur.
 */

const MOTS_VIDES = new Set(
  (
    'le la les l un une des du de d et ou a au aux en dans sur pour par avec sans je tu il elle on nous vous ils mon ma mes ton ta tes son sa ses ' +
    'leur leurs ce cet cette ces que qui quoi comment est sont suis etre ai as avons ont peut peux peuvent puis faire fais fait c n s qu y ne pas se si ca cela mais donc car ni quel quelle quels quelles'
  ).split(' '),
);

/** Minuscules, sans accents ni ponctuation : « Clôture ! » et « cloture » deviennent identiques. */
export function normaliser(texte) {
  return String(texte || '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Racine grossière d'un mot : « factures », « facture » et « facturer » se rejoignent. */
export function racine(mot) {
  let r = mot;
  if (r.length > 4 && /[sx]$/.test(r)) r = r.slice(0, -1); // « mois », « pays » restent entiers
  if (r.length >= 6 && /(er|ir|ez)$/.test(r)) r = r.slice(0, -2);
  else if (r.length >= 5 && /e$/.test(r)) r = r.slice(0, -1);
  return r;
}

/** Mots que l'on tape à la place de ceux du guide : chacun est ajouté comme équivalent du mot cherché. */
const SYNONYMES = (() => {
  const brut = {
    facture: ['emettre', 'vente'],
    vente: ['facture'],
    devis: ['proposition'],
    avoir: ['rembourse', 'annul'],
    annuler: ['avoir'],
    remise: ['reduction', 'rabais'],
    reduction: ['remise'],
    rabais: ['remise'],
    acompte: ['avance'],
    depense: ['achat', 'frais'],
    achat: ['depense'],
    frais: ['depense', 'note'],
    justificatif: ['photo', 'ticket', 'piece'],
    photo: ['justificatif'],
    ticket: ['justificatif'],
    releve: ['banque'],
    banque: ['releve', 'rapproch'],
    rapprocher: ['associer', 'banque'],
    paiement: ['reglement', 'encaiss'],
    reglement: ['paiement'],
    impaye: ['relance', 'retard'],
    relance: ['impaye', 'retard'],
    retard: ['relance'],
    tva: ['declaration', 'ca3', 'ca12'],
    declaration: ['tva', 'urssaf'],
    urssaf: ['cotisation', 'micro'],
    cotisation: ['urssaf'],
    bilan: ['cloture'],
    cloture: ['bilan', 'exercice'],
    comptable: ['expert'],
    expert: ['comptable'],
    fec: ['export', 'comptable'],
    exporter: ['telecharg', 'export'],
    telecharger: ['export'],
    mdp: ['mot de passe'],
    password: ['mot de passe'],
    connexion: ['connecter', 'double authentification'],
    salaire: ['paie'],
    paie: ['salaire'],
    rh: ['nexus rh'],
    tresorerie: ['prevision'],
    mail: ['e mail', 'courriel'],
    email: ['e mail'],
    bug: ['probleme', 'erreur'],
    erreur: ['probleme'],
  };
  const map = {};
  for (const [cle, alts] of Object.entries(brut)) map[racine(normaliser(cle))] = alts.map(normaliser);
  return map;
})();

/** Découpe la recherche en mots utiles, avec leur racine et leurs équivalents. */
export function termes(requete) {
  const tous = normaliser(requete).split(' ').filter(Boolean);
  const utiles = tous.filter((t) => !MOTS_VIDES.has(t) && (t.length > 1 || /\d/.test(t)));
  const retenus = utiles.length ? utiles : tous.filter((t) => t.length > 1);
  return retenus.map((t) => {
    const r = racine(t);
    return { brut: t, racine: r, alts: SYNONYMES[r] || [] };
  });
}

const contient = (texte, motif) => {
  if (!motif) return false;
  const court = motif.length <= 3 && !motif.includes(' ');
  return court ? ` ${texte} `.includes(` ${motif} `) : ` ${texte}`.includes(` ${motif}`);
};
const correspond = (texte, t) => contient(texte, t.racine) || t.alts.some((a) => contient(texte, a));

/** Texte brut d'un fragment HTML du guide (captures retirées). */
export function texteBrut(html) {
  return String(html || '')
    .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<\/(p|li|dd|dt|div|h\d|ol|ul|dl|summary|details)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Une « unité » de recherche par chapitre (son introduction) et par question. */
function indexer(sections) {
  const unites = [];
  for (const s of sections) {
    const intro = texteBrut(s.intro);
    unites.push({
      sectionId: s.id,
      sectionTitre: s.titre,
      entreeId: null,
      titre: s.titre,
      brut: intro,
      titreN: normaliser(s.titre),
      motsN: normaliser(s.mots),
      corps: normaliser(intro),
    });
    for (const e of s.entrees || []) {
      const brut = texteBrut(e.r);
      unites.push({
        sectionId: s.id,
        sectionTitre: s.titre,
        entreeId: e.id,
        titre: e.q,
        brut,
        titreN: normaliser(e.q),
        motsN: normaliser(e.mots),
        corps: normaliser(brut),
      });
    }
  }
  return unites;
}

function noter(u, ts) {
  let score = 0;
  let trouves = 0;
  let dansTitre = 0;
  for (const t of ts) {
    if (correspond(u.titreN, t)) {
      score += 10;
      trouves++;
      dansTitre++;
    } else if (correspond(u.motsN, t)) {
      score += 6;
      trouves++;
    } else if (correspond(u.corps, t)) {
      score += 2;
      trouves++;
    }
  }
  if (ts.length > 1 && dansTitre === ts.length) score += 8;
  return { score, trouves };
}

/**
 * Cherche `requete` dans les sections du guide. Tous les mots doivent être présents ; sans résultat,
 * repli sur « au moins la moitié des mots » (`approchant: true`).
 * @param {{ id, titre, intro?, mots?, entrees?: { id, q, r, mots? }[] }[]} sections
 */
export function rechercher(sections, requete, { max = 30 } = {}) {
  const ts = termes(requete);
  if (!ts.length) return { termes: ts, resultats: [], approchant: false };
  const notes = indexer(sections).map((u, ordre) => ({ u, ordre, ...noter(u, ts) }));
  const tri = (a, b) => b.score - a.score || a.ordre - b.ordre;
  let resultats = notes.filter((n) => n.trouves === ts.length).sort(tri);
  let approchant = false;
  if (!resultats.length && ts.length > 1) {
    const seuil = Math.ceil(ts.length / 2);
    resultats = notes.filter((n) => n.trouves >= seuil).sort((a, b) => b.trouves - a.trouves || tri(a, b));
    approchant = resultats.length > 0;
  }
  return { termes: ts, resultats: resultats.slice(0, max).map((n) => ({ ...n.u, score: n.score })), approchant };
}

/** Début d'un texte, coupé à un mot. */
export function extrait(brut, longueur = 150) {
  const t = String(brut || '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > longueur ? `${t.slice(0, longueur).replace(/\s+\S*$/, '')}…` : t;
}

const ACCENTS = { a: 'aàâä', c: 'cç', e: 'eéèêë', i: 'iîï', o: 'oôö', u: 'uùûü', y: 'yÿ' };
const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Met en évidence (<mark>) les mots cherchés dans un texte, accents ignorés ; le reste est échappé. */
export function surligner(texte, ts) {
  const brut = String(texte || '');
  const plages = [];
  const lettre = 'A-Za-zÀ-ÿ0-9';
  for (const t of ts) {
    const motif = t.racine
      .split('')
      .map((ch) => (ACCENTS[ch] ? `[${ACCENTS[ch]}]` : ch))
      .join('');
    if (!motif) continue;
    const re = new RegExp(`(^|[^${lettre}])(${motif}${t.racine.length <= 3 ? `(?![${lettre}])` : `[${lettre}]*`})`, 'gi');
    let m;
    while ((m = re.exec(brut)) !== null) {
      const debut = m.index + m[1].length;
      plages.push([debut, debut + m[2].length]);
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  plages.sort((a, b) => a[0] - b[0]);
  const fusion = [];
  for (const p of plages) {
    const dernier = fusion.at(-1);
    if (dernier && p[0] <= dernier[1]) dernier[1] = Math.max(dernier[1], p[1]);
    else fusion.push([...p]);
  }
  let sortie = '';
  let curseur = 0;
  for (const [d, f] of fusion) {
    sortie += `${echapper(brut.slice(curseur, d))}<mark>${echapper(brut.slice(d, f))}</mark>`;
    curseur = f;
  }
  return sortie + echapper(brut.slice(curseur));
}
