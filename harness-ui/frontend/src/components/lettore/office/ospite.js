/**
 * F5 File reader (26/09/2026) — la RIPULITURA dell'HTML dei documenti Word e PowerPoint, DENTRO la pagina ospite.
 *
 * ⛔ Perché una cornice e non il nostro DOM, misurato il 26/09 sotto la CSP vera di TALOS (`scratchpad/prova-csp-lettore
 *   .mjs`): la resa di un documento è HTML con stili in linea, e la pagina di TALOS li vieta (`style-src 'self'
 *   'nonce-…'`: un `style=""` impostato con `setAttribute` si perde, e un `srcdoc` eredita la CSP e perde tutto). La
 *   cornice punta a `GET /api/v1/lettore/ospite`, che ha una CSP SUA (stili in linea sì, immagini e font solo `data:`,
 *   nessuna rete, script solo col nonce) e origine nulla (`sandbox allow-scripts`).
 * ⛔ Dal 26/09 pomeriggio (owner: «ora, prima di F6») anche la RESA vive lì: questo modulo entra nei bundle della cornice
 *   (`lettore-ospite-documento.js`, `lettore-ospite-presentazione.js`), non in quello della app. La cornice lato app è
 *   `cornice-ospite.js`.
 * ⛔ Due difese, non una: DOMPurify toglie script, gestori d'evento, moduli, cornici e ogni `href` (un documento si
 *   LEGGE, non si naviga da dentro il lettore); e anche senza, la pagina ospite non esegue script in linea senza nonce.
 */
import DOMPurify from 'dompurify';

/** Solo immagini incorporate: nessun indirizzo esterno sopravvive alla ripulitura. */
export const URI_AMMESSE = /^data:image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml);base64,/iu;
const TAG_VIETATI = ['form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'frame', 'frameset', 'object', 'embed', 'link', 'meta', 'base', 'audio', 'video', 'source', 'track', 'portal'];

/** L'HTML di un documento, ripulito per la cornice ospite. */
export function pulisciHtml(html, finestra = globalThis) {
  const purify = DOMPurify(finestra);
  purify.addHook('uponSanitizeAttribute', (_nodo, dati) => {
    // un documento si legge: i collegamenti restano testo (niente navigazione dentro la cornice, niente rete)
    if (dati.attrName === 'href' || dati.attrName === 'xlink:href' || dati.attrName === 'action' || dati.attrName === 'formaction') dati.keepAttr = false;
  });
  return purify.sanitize(String(html ?? ''), {
    FORCE_BODY: true,
    ADD_TAGS: ['style'],
    FORBID_TAGS: TAG_VIETATI,
    ALLOWED_URI_REGEXP: URI_AMMESSE,
  });
}
