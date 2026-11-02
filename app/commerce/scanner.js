/**
 * Scan d'un code-barres avec la caméra du téléphone (ou de la tablette) en magasin.
 *  - lecteur intégré du navigateur (BarcodeDetector : Chrome et Edge sous Android) quand il existe ;
 *  - sinon ZXing (copie locale, chargée seulement ici) sur les images de la caméra.
 * Une douchette USB ou Bluetooth se comporte comme un clavier : elle tape le code dans le champ de
 * recherche de l'écran Articles, sans passer par ce module.
 */

import { normalizeEan } from '../../core/commerce/ean.js?v=a619ec1';

let open = null;

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = FORMATS.filter((f) => supported.includes(f));
    return formats.length ? new window.BarcodeDetector({ formats }) : null;
  } catch {
    return null;
  }
}

async function zxingDecoder() {
  const Z = await import('../vendor/zxing.js?v=a619ec1');
  const reader = new Z.MultiFormatReader();
  const hints = new Map([
    [
      Z.DecodeHintType.POSSIBLE_FORMATS,
      [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128],
    ],
    [Z.DecodeHintType.TRY_HARDER, true],
  ]);
  reader.setHints(hints);
  return (canvas) => {
    try {
      const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
      return reader.decodeWithState(bitmap).getText();
    } catch {
      return null; // aucun code sur cette image : on essaie la suivante
    }
  };
}

/** Ferme le scan en cours (caméra libérée). */
export function closeScanner() {
  if (!open) return;
  open.stop = true;
  open.stream?.getTracks().forEach((t) => t.stop());
  open.root.remove();
  open = null;
}

/**
 * Ouvre le scan plein écran ; `onCode(ean)` reçoit le premier code lu (EAN normalisé quand c'en est
 * un, sinon le texte lu). Sans caméra ou sans autorisation, un message invite à saisir le code.
 */
export async function openScanner(onCode) {
  closeScanner();
  const root = document.createElement('div');
  root.className = 'scan-overlay';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Scanner un code-barres');
  root.innerHTML = `<div class="scan-box">
      <video class="scan-video" playsinline muted></video>
      <div class="scan-frame" aria-hidden="true"></div>
    </div>
    <p class="scan-status" role="status">Ouverture de la caméra…</p>
    <button type="button" class="btn btn-secondary scan-close">Fermer</button>`;
  document.body.appendChild(root);
  const state = { root, stop: false, stream: null };
  open = state;
  const status = root.querySelector('.scan-status');
  root.querySelector('.scan-close').addEventListener('click', closeScanner);
  root.addEventListener('keydown', (e) => e.key === 'Escape' && closeScanner());
  root.querySelector('.scan-close').focus();
  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = 'Ce navigateur ne donne pas accès à la caméra : tapez le code-barres dans le champ de recherche (ou utilisez une douchette).';
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
  } catch (err) {
    status.textContent =
      err?.name === 'NotAllowedError'
        ? 'Accès à la caméra refusé : autorisez-le dans les réglages du navigateur, ou tapez le code dans le champ de recherche.'
        : 'Aucune caméra disponible : tapez le code-barres dans le champ de recherche.';
    return;
  }
  if (state.stop) return state.stream.getTracks().forEach((t) => t.stop());
  const video = root.querySelector('video');
  video.srcObject = state.stream;
  await video.play().catch(() => {});
  status.textContent = 'Visez le code-barres, bien à plat et éclairé.';
  const native = await nativeDetector();
  const decode = native ? null : await zxingDecoder().catch(() => null);
  if (!native && !decode) {
    status.textContent = 'Lecture impossible sur ce navigateur : tapez le code dans le champ de recherche.';
    return;
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const found = (text) => {
    const code = normalizeEan(text).ean || String(text).trim();
    navigator.vibrate?.(80);
    closeScanner();
    onCode(code);
  };
  const tick = async () => {
    if (state.stop) return;
    if (video.readyState >= 2) {
      if (native) {
        const codes = await native.detect(video).catch(() => []);
        if (codes[0]?.rawValue) return found(codes[0].rawValue);
      } else {
        // Bande centrale de l'image, réduite : plus rapide et suffisant pour un code-barres.
        const w = Math.min(960, video.videoWidth);
        const h = Math.round((w * video.videoHeight) / video.videoWidth);
        canvas.width = w;
        canvas.height = Math.round(h / 2);
        ctx.drawImage(video, 0, video.videoHeight / 4, video.videoWidth, video.videoHeight / 2, 0, 0, w, canvas.height);
        const text = decode(canvas);
        if (text) return found(text);
      }
    }
    setTimeout(tick, native ? 120 : 220);
  };
  tick();
}
