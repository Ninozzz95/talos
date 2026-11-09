/*
 * FE-070: l'ingresso della pagina del segno, una per schermo. La finestra trasparente è del guscio (`segno-finestra.mjs`), che passa lo schermo nella query in pixel fisici.
 * Gli eventi arrivano sul canale della bolla; il ripiego (la posizione vera del mouse) lo manda il guscio con `postMessage` dentro questa pagina.
 */
import { CANALE_BOLLA, INDIRIZZO_RIPIEGO } from './components/computer-use/bolla-messaggi.js'; // FE-072: il segno resta leggero
import { creaSegno, leggiSchermo } from './components/computer-use/segno.js';

const segno = creaSegno({
  document,
  canale: new BroadcastChannel(CANALE_BOLLA),
  schermo: leggiSchermo(location.search),
  adesso: () => Date.now(),
  timer: { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id) },
  anima: (el, fotogrammi, opzioni) => el.animate(fotogrammi, opzioni),
  ridotto: matchMedia('(prefers-reduced-motion: reduce)').matches,
  chiedi: () => window.open(INDIRIZZO_RIPIEGO), // FE-074: il guscio nega la finestra e risponde con la posizione vera del mouse
});
document.body.append(segno.nodo);
window.addEventListener('message', (e) => { if (e.source === window && e.origin === location.origin) segno.ripiego(e.data); });
