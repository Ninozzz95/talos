/*
 * Punto d'ingresso della app.
 *
 * Piano «il mockup diventa la app» (05/09/2026): il corpo è il markup del
 * mockup approvato, il cervello resta `legacy/app.js` (il monolite, identico
 * a `public/app.js` salvo il byte NUL scritto come escape e gli innesti di
 * Fase 1 marcati «05/9»). Fra i due sta il ponte `bridge/legacy-dom.js`, che
 * dice al vecchio cervello dove stanno gli elementi nel corpo nuovo.
 *
 * ⛔ L'ordine è tutto, e un `import` statico NON lo garantisce: gli import
 * sono issati e valutati prima di qualunque istruzione del modulo, quindi
 * `app.js` girerebbe PRIMA che il ponte abbia piantato gli id — e si
 * romperebbe sul primo `$('#composerForm')`. Per questo il monolite si carica
 * con un `import()` dinamico DOPO `montaPonteLegacy()`.
 *
 * Da qui in poi ogni pezzo che disegna DOM esce dal monolite e diventa un
 * elemento a Light DOM sotto `src/components/`, uno per blocco `data-c` del
 * mockup; il ponte si accorcia di una riga a ogni estrazione.
 */
import { montaPonteLegacy } from './bridge/legacy-dom.js';

montaPonteLegacy(document);
await import('./legacy/app.js');

/* TALOS-DESKTOP-FINAL-UI */
const { initTalosDesktopBackground } = await import('./motion/desktop-background.js');
initTalosDesktopBackground();

/*
 * 11/09 — le animazioni del mockup che rispondono a un clic (pressione dei pulsanti, gruppi della
 * barra, schede, pannelli delle impostazioni, collasso della barra).
 * ⛔ DOPO il monolite, non prima: l'ascoltatore di `animazioni-mockup.js` sta su `document` e legge
 *   lo stato GIÀ cambiato dai gestori del monolite, che stanno su `document.documentElement`.
 *   Montarlo prima non cambierebbe quell'ordine (lo decide la risalita dell'evento, non la
 *   registrazione), ma montarlo qui rende la dipendenza leggibile.
 */
const { montaAnimazioniMockup } = await import('./components/animazioni-mockup.js');
montaAnimazioniMockup(document);
