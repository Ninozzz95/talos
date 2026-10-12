/**
 * La pagina che la persona vede nel BROWSER quando torna da un accesso con l'account (OpenRouter, ChatGPT).
 *
 * Owner 11/10/2026, davanti alla pagina bianca con una riga di testo: «sistema il logo e la schermata di callback dell'oauth».
 * È l'ultima cosa che si vede prima di tornare all'app, e la prima in cui TALOS parla fuori dalla sua finestra: porta il segno
 * di TALOS e i colori del tema di serie (Forge), in chiaro e in scuro secondo il browser.
 *
 * Vincoli della pagina:
 *   · niente rete: nessun font, immagine o script da fuori (la politica della pagina è `default-src 'none'`); il segno è un
 *     SVG nel documento, lo stile porta un nonce;
 *   · niente script: lo stato è deciso dal server, la pagina è ferma;
 *   · ogni testo che arriva da fuori passa da `sicuro()` prima di entrare nell'HTML;
 *   · un solo movimento, il tratto dell'esito che si disegna una volta; con «movimento ridotto» resta fermo e visibile.
 *
 * Colori: i semi del tema Forge (`frontend/src/styles/temi.css:65`: accento `#c98b32`, fondo `#080b11`, linea `#27313e`) e le
 * stesse derivazioni chiaro/scuro di `temi.css:113-128`, calcolate qui a mano perché la pagina non carica il foglio dell'app.
 * Il segno è `public/talos/brand/logo-short.svg`, copiato tratto per tratto.
 */

const SEGNO_TALOS = '<svg class="segno" xmlns="http://www.w3.org/2000/svg" viewBox="80 60 340 380" aria-hidden="true">'
  + '<g stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M 218 123.5 L 121.9 179 A 21 21 0 0 0 111.5 197 L 111.5 333 A 21 21 0 0 0 121.9 351 L 239.6 419 A 21 21 0 0 0 260.4 419 L 378.1 351 A 21 21 0 0 0 388.5 333 L 388.5 197 A 21 21 0 0 0 378.1 179 L 282 123.5" stroke-width="12" opacity="0.18"/>'
  + '<path d="M 250 140 L 250 195" stroke-width="9"/><path d="M 250 255 L 250 315" stroke-width="9"/>'
  + '<circle cx="250" cy="105" r="22" stroke-width="9" fill="currentColor"/><circle cx="250" cy="225" r="18" stroke-width="9" fill="currentColor"/>'
  + '<circle cx="250" cy="338" r="14" stroke-width="9" fill="currentColor"/>'
  + '<g transform="translate(250, 225) rotate(45)"><path d="M 0 32 L 0 95" stroke-width="9"/><circle cx="0" cy="118" r="14" stroke-width="9" fill="currentColor"/></g>'
  + '<g transform="translate(250, 225) rotate(-45)"><path d="M 0 32 L 0 95" stroke-width="9"/><circle cx="0" cy="118" r="14" stroke-width="9" fill="currentColor"/></g>'
  + '</g></svg>';

const ESITO = Object.freeze({
  riuscito: '<svg class="esito" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.25"/><path class="tratto" pathLength="1" d="M7.4 12.4l3.1 3.1 6.1-6.6"/></svg>',
  fallito: '<svg class="esito" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.25"/><path class="tratto" pathLength="1" d="M8.4 8.4l7.2 7.2M15.6 8.4l-7.2 7.2"/></svg>',
});

const STILE = ':root{color-scheme:dark light;--fondo:#080b11;--carta:#0a0d14;--testo:#edf2f7;--tenue:#a4a8ae;--bordo:#212b38;--accento:#c98b32;--bene:#6ad4d4;--male:#f0806b}'
  + '@media (prefers-color-scheme:light){:root{--fondo:#f6f5f2;--carta:#fbfaf9;--testo:#111827;--tenue:#5a5e66;--bordo:#dcd8d0;--accento:#96640f;--bene:#1f7a7a;--male:#b3412c}}'
  + '*{box-sizing:border-box}'
  + 'body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--fondo);color:var(--testo);'
  + 'font:400 16px/1.55 "Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",sans-serif;-webkit-font-smoothing:antialiased}'
  + 'main{width:min(100%,29rem);padding:36px 36px 30px;background:var(--carta);border:1px solid var(--bordo);border-radius:14px}'
  + '.marca{display:flex;align-items:center;gap:10px;margin:0 0 30px -6px;color:var(--accento);font-weight:650;font-size:.875rem;letter-spacing:.14em}'
  + '.segno{width:44px;height:44px;flex:none}'
  + '.testa{display:flex;align-items:flex-start;gap:12px;margin:0 0 10px}'
  + '.esito{width:24px;height:24px;flex:none;margin-top:3px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}'
  + '.riuscito .esito{color:var(--bene)}.fallito .esito{color:var(--male)}'
  + '.esito circle{opacity:.35}'
  + '.tratto{stroke-dasharray:1;stroke-dashoffset:0}'
  + 'h1{margin:0;font-size:1.375rem;line-height:1.3;font-weight:650;letter-spacing:-.005em;text-wrap:balance}'
  + 'p{margin:0;color:var(--tenue);text-wrap:pretty}'
  + '.poi{margin-top:22px;padding-top:16px;border-top:1px solid var(--bordo);color:var(--testo);font-size:.875rem}'
  + '@media (prefers-reduced-motion:no-preference){.tratto{animation:disegna .42s cubic-bezier(.2,.7,.2,1) .12s both}}'
  + '@keyframes disegna{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}'
  + '@media (max-width:420px){main{padding:24px 20px 22px}}';

/** Mette un testo dentro l'HTML senza che possa diventare markup. */
export function sicuro(testo) {
  return String(testo ?? '').replace(/[&<>"']/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * L'HTML della pagina. `esito`: 'riuscito' | 'fallito'. `titolo` dice che cosa è successo, `frase` aggiunge il perché (o chi è
 * collegato), `poi` dice che cosa fare adesso. `nonce` è quello della politica della pagina, deciso da chi risponde.
 */
export function paginaDiRitorno({ lingua = 'en', esito = 'riuscito', titolo, frase = '', poi = '', nonce } = {}) {
  if (!Object.hasOwn(ESITO, esito)) throw new Error('Unknown outcome for the sign-in return page.');
  if (typeof nonce !== 'string' || !/^[A-Za-z0-9+/=_-]{8,}$/u.test(nonce)) throw new Error('The sign-in return page needs a style nonce.');
  if (typeof titolo !== 'string' || titolo === '') throw new Error('The sign-in return page needs a title.');
  return `<!doctype html><html lang="${sicuro(lingua)}"><head><meta charset="utf-8">`
    + '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
    + `<title>${sicuro(titolo)} · TALOS</title><style nonce="${nonce}">${STILE}</style></head>`
    + `<body><main class="${esito}"><div class="marca">${SEGNO_TALOS}<span>TALOS</span></div>`
    + `<div class="testa">${ESITO[esito]}<h1>${sicuro(titolo)}</h1></div>`
    + (frase ? `<p>${sicuro(frase)}</p>` : '')
    + (poi ? `<p class="poi">${sicuro(poi)}</p>` : '')
    + '</main></body></html>';
}

/** Le intestazioni di sicurezza della pagina: niente da fuori, lo stile solo col nonce. */
export function intestazioniDellaPagina({ nonce, lingua = 'en' } = {}) {
  return {
    'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    'Content-Language': lingua,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    Vary: 'Accept-Language',
  };
}
