/**
 * QR code en SVG (copie locale de qrcode-generator, app/vendor/qrcode.js) : modules sombres en un
 * seul tracé, marge de 4 modules comme la norme le demande, fond blanc même en thème sombre (un QR
 * code inversé n'est pas lu par toutes les applications bancaires).
 */

import { qrMatrix } from '../vendor/qrcode.js?v=3bfbbd4';
import { raw } from '../html.js?v=3bfbbd4';

export function qrSvg(text, { size = 120, label = 'QR code' } = {}) {
  const m = qrMatrix(text);
  const n = m.length + 8;
  let d = '';
  m.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    }),
  );
  const safe = String(label).replace(/[<>&"]/g, '');
  return raw(
    `<svg class="qr-code" role="img" aria-label="${safe}" width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`,
  );
}
