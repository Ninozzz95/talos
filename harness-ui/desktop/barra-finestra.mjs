/*
 * F7-1 (owner 27/09/2026, «barra propria come Hermes», «senza ponte, coi canali del browser») — le due traduzioni pure della
 * barra del titolo propria. Hermes nasconde la barra di Windows e lascia i comandi veri al sistema
 * (`apps/desktop/electron/main.ts:13945`, `titleBarStyle:'hidden'` + `titleBarOverlay`; altezza 34,
 * `src/app/shell/titlebar.ts:3`); i colori li riceve dalla pagina con un canale IPC (`main.ts:1277`). Da noi un ponte
 * pagina→app NON c'è (prova R01, `preload: undefined`), quindi i due messaggi viaggiano sui canali che il browser ha già:
 * · il colore della striscia è il `<meta name="theme-color">` della pagina, che Electron annuncia con
 *   `did-change-theme-color` (doc Electron, `webContents`): qui diventa `{ color, symbolColor, height }` per
 *   `setTitleBarOverlay` (doc Electron `base-window.md`, «win.setTitleBarOverlay(options)», Windows e Linux);
 * · il pulsante «⋯» apre `talos-desktop://menu?x=&y=` con `window.open`: `setWindowOpenHandler` lo nega e apre il menu
 *   NATIVO di sempre nel punto indicato. Qui si riconosce quell'indirizzo, e nessun altro.
 */
/* 33 px di comandi + 1 px di bordo della striscia SOTTO di loro = i 34 px di Hermes. Con 34 i comandi coprivano anche il
   bordo, che si interrompeva sotto di loro (visto nella foto dello schermo, 27/09 notte). */
export const ALTEZZA_BARRA = 33;
/* Il colore dei simboli: il più leggibile dei due sul fondo (contrasto WCAG 2.x, luminanza relativa sRGB). */
const SIMBOLI_CHIARI = '#e8e8ea';
const SIMBOLI_SCURI = '#1f1f22';

const esadecimale = (n) => n.toString(16).padStart(2, '0');

function rgbDelColore(colore) {
  if (typeof colore !== 'string') return null;
  const testo = colore.trim().toLowerCase();
  const corto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/u.exec(testo);
  if (corto) return corto.slice(1).map((c) => parseInt(c + c, 16));
  const lungo = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/u.exec(testo);
  if (lungo) return lungo.slice(1).map((c) => parseInt(c, 16));
  const funzione = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/u.exec(testo);
  if (!funzione) return null;
  const [r, g, b] = funzione.slice(1, 4).map(Number);
  /* un fondo trasparente o velato non è il colore di una barra: i comandi di Windows sono opachi */
  if (funzione[4] !== undefined && Number(funzione[4]) !== 1) return null;
  return [r, g, b].every((v) => v <= 255) ? [r, g, b] : null;
}

function luminanza([r, g, b]) {
  const lineare = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lineare(r) + 0.7152 * lineare(g) + 0.0722 * lineare(b);
}
const contrasto = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** @returns {{color:string, symbolColor:string, height:number} | null} `null` = colore non leggibile: non si cambia niente */
export function coloriDellaBarra(colore) {
  const rgb = rgbDelColore(colore);
  if (!rgb) return null;
  const fondo = luminanza(rgb);
  const symbolColor = contrasto(fondo, luminanza(rgbDelColore(SIMBOLI_CHIARI))) >= contrasto(fondo, luminanza(rgbDelColore(SIMBOLI_SCURI)))
    ? SIMBOLI_CHIARI : SIMBOLI_SCURI;
  return { color: `#${rgb.map(esadecimale).join('')}`, symbolColor, height: ALTEZZA_BARRA };
}

/** @returns {{x?:number, y?:number} | null} `null` = non è l'indirizzo del menu */
export function puntoDelMenu(indirizzo) {
  let url;
  try { url = new URL(String(indirizzo ?? '')); } catch { return null; }
  if (url.protocol !== 'talos-desktop:' || url.hostname !== 'menu' || (url.pathname !== '' && url.pathname !== '/')) return null;
  const x = Number(url.searchParams.get('x'));
  const y = Number(url.searchParams.get('y'));
  /* un punto che non vale non ferma il menu: si apre dove sta il puntatore, come fa Menu.popup senza coordinate */
  if (!url.searchParams.has('x') || !url.searchParams.has('y') || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 10_000 || y > 10_000) return {};
  return { x, y };
}
