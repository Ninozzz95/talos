/**
 * F5 File reader (26/09/2026) — WORD (.docx/.docm) in sola lettura, con docx-preview 0.4.1 (Apache-2.0; decisione owner
 * del 26/09). Gira nella pagina ospite: la carica lei (`/lettore-ospite-documento.js`) solo quando si apre un documento.
 *
 * ⛔ Le opzioni che contano per la sicurezza, lette nel sorgente della libreria (`defaultOptions`, docx-preview.mjs):
 *   `renderAltChunks` di serie è `true` — gli «altChunk» sono pezzi di HTML incorporati nel documento — e qui è SPENTO;
 *   `useBase64URL: true` mette immagini e font in `data:`, l'unico schema che la pagina ospite ammette.
 * ⛔ Dal 26/09 pomeriggio questo modulo gira DENTRO la pagina ospite (bundle `lettore-ospite-documento.js`): la
 *   libreria crea i nodi col `document` globale, che lì è quello della cornice, dove gli stili in linea sono ammessi.
 *   Nella pagina di TALOS ogni suo attributo `style` faceva scattare la CSP (39 avvisi per il Word di prova).
 */
import { renderAsync } from 'docx-preview';
import { pulisciHtml } from './ospite.js';

export const OPZIONI_DOCX = Object.freeze({
  className: 'docx',
  inWrapper: true,
  ignoreWidth: false,
  ignoreHeight: false,
  ignoreFonts: false,
  breakPages: true,
  ignoreLastRenderedPageBreak: true,
  experimental: false,
  trimXmlDeclaration: true,
  useBase64URL: true,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: true,
  renderComments: false,
  renderChanges: false,
  renderAltChunks: false,
  debug: false,
});

/** Dentro la pagina ospite: l'HTML del documento, già ripulito. */
export async function resaDocumento({ doc = globalThis.document, finestra = globalThis, byte }) {
  const corpo = doc.createElement('div');
  const stili = doc.createElement('div');
  await renderAsync(byte, corpo, stili, OPZIONI_DOCX);
  return pulisciHtml(stili.innerHTML + corpo.innerHTML, finestra);
}
