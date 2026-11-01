/**
 * Archive ZIP minimale (sans dépendance) : écriture sans compression, lecture des entrées stockées ou
 * compressées (la décompression « deflate » est fournie par l'appelant : DecompressionStream dans le
 * navigateur, zlib sous Node). Sert à l'export groupé des factures et au réimport depuis une
 * plateforme agréée.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

/** Archive ZIP (méthode « stockée ») ; noms en UTF-8 (bit 11). */
export function createZip(files, { date = new Date() } = {}) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime(date), true);
    lv.setUint16(12, dosDate(date), true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const entry = new Uint8Array(46 + name.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(12, dosTime(date), true);
    cv.setUint16(14, dosDate(date), true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    entry.set(name, 46);
    parts.push(local, data);
    central.push(entry);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((s, e) => s + e.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const p of [...parts, ...central, end]) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Entrées d'une archive ZIP : [{ name, data }] (dossiers ignorés). */
export async function readZip(bytes, { inflate = null } = {}) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Archive ZIP illisible.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const utf8 = new TextDecoder();
  const latin1 = new TextDecoder('latin1');
  const out = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Archive ZIP illisible.');
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const rawName = data.subarray(p + 46, p + 46 + nameLen);
    const name = (flags & 0x0800 ? utf8 : latin1).decode(rawName);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const content = data.subarray(start, start + size);
    if (method === 0) out.push({ name, data: content.slice() });
    else if (method === 8) {
      if (!inflate) throw new Error(`Fichier compressé dans l'archive (${name}) : décompression indisponible.`);
      out.push({ name, data: new Uint8Array(await inflate(content)) });
    } else throw new Error(`Méthode de compression non prise en charge (${name}).`);
  }
  return out;
}
