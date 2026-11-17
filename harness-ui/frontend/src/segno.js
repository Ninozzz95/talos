/*
 * FE-070: l'ingresso della pagina del segno, una per schermo. La finestra trasparente è del guscio (`segno-finestra.mjs`), che passa lo schermo nella query in pixel fisici.
 * Gli eventi arrivano sul canale della bolla; il ripiego (la posizione vera del mouse) lo manda il guscio con `postMessage` dentro questa pagina.
 */
import { CANALE_BOLLA, INDIRIZZO_BATTITO, INDIRIZZO_RIPIEGO, MS_BATTITO, motoRidottoDa } from './components/computer-use/bolla-messaggi.js'; // FE-072: il segno resta leggero
import { creaBattito, creaSegno, leggiSchermo } from './components/computer-use/segno.js';

/* reperto 17 (13/11): «Riduci movimento» di TALOS, dallo stesso archivio della pagina principale (la chiave di `bolla.js`, CHIAVE_IMPOSTAZIONI; qui scritta di nuovo
   per non portare la bolla dentro il segno, FE-072) */
const CHIAVE_IMPOSTAZIONI = 'talos.harness.desktop.settings.v1';
const impostazioniSalvate = () => { try { return JSON.parse(window.localStorage.getItem(CHIAVE_IMPOSTAZIONI) ?? 'null'); } catch { return null; } };
const media = matchMedia('(prefers-reduced-motion: reduce)');
const ridottoOra = () => motoRidottoDa({ impostazioni: impostazioniSalvate(), mediaRidotto: media.matches });

const segno = creaSegno({
  document,
  canale: new BroadcastChannel(CANALE_BOLLA),
  schermo: leggiSchermo(location.search),
  adesso: () => Date.now(),
  timer: { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id) },
  anima: (el, fotogrammi, opzioni) => el.animate(fotogrammi, opzioni),
  ridotto: motoRidottoDa({ impostazioni: impostazioniSalvate(), mediaRidotto: matchMedia('(prefers-reduced-motion: reduce)').matches }),
  chiedi: () => window.open(INDIRIZZO_RIPIEGO), // FE-074: il guscio nega la finestra e risponde con la posizione vera del mouse
});
document.body.append(segno.nodo);
window.addEventListener('message', (e) => { if (e.source === window && e.origin === location.origin) segno.ripiego(e.data); });
/* giro 4 della bolla (13/11): la pagina del segno resta aperta per tutto l'avvio; «Riduci movimento» cambiato con TALOS aperto arriva qui. `storage` parte nelle
   ALTRE pagine della stessa origine quando una scrive (MDN, «Window: storage event»; `null` = archivio svuotato); `change` quando cambia la preferenza di Windows. */
window.addEventListener('storage', (e) => { if (e.key === CHIAVE_IMPOSTAZIONI || e.key === null) segno.moto(ridottoOra()); });
media.addEventListener?.('change', () => segno.moto(ridottoOra()));
/* giro 5 della bolla (14/11): per ultimo, il battito al guscio, solo dopo il disegno. Se qualcosa qui sopra si rompe, non batte mai e il guscio rimette il cursore
   dell'aiutante; con lo schermo non valido il segno è nascosto e non batte. `window.open` senza ponte, come il ripiego: il guscio nega e lo conta. */
creaBattito({ nodo: segno.nodo, batti: () => window.open(INDIRIZZO_BATTITO), fotogramma: (f) => requestAnimationFrame(f),
  timer: { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id), setInterval: (f, ms) => setInterval(f, ms), clearInterval: (id) => clearInterval(id) },
  ms: MS_BATTITO }); // giro 6: `setTimeout` per il primo battito nella finestra mai mostrata, dove i fotogrammi non arrivano
