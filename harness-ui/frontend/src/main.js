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
import { montaBarraFinestra } from './components/barra-finestra.js';
import { montaAggiornamenti } from './components/aggiornamenti.js';
import { montaMotoreContesto } from './components/motore-contesto.js';
import { montaFinestraPiena } from './components/finestra-piena.js'; // L1 1.3 (26/10/2026)
import { montaDoveGiranoDiSerie } from './components/dove-girano-di-serie.js'; // owner 27/10/2026: dove girano i comandi, di serie
import { montaSitiFidati } from './components/siti-fidati.js';
import { confermaModale } from './components/modale-td.js';

montaPonteLegacy(document);
/* F7-1 (27/09/2026): la barra del titolo propria, solo nella finestra dell'app. PRIMA del monolite: c'è dal primo disegno
   (sotto il velo) e i comandi di Windows prendono subito il colore del tema; i cambi di tema li segue da sola. */
montaBarraFinestra();
await import('./legacy/app.js');
/* 01/10/2026: l'aggiornamento automatico a schermo. DOPO il monolite: la scheda va nel pannello «Account, Doctor e backup»,
   che esiste solo da qui; uno stato arrivato prima dal guscio si ritrova in `window.__talosAggiornamenti`. Nel browser non
   arriva niente e non nasce niente. */
montaAggiornamenti({ conferma: confermaModale }); // «Riavvia ora» chiede se una sessione sta lavorando
/* C1 (owner 09/10/2026 sera): «Motore del contesto» nel pannello «Memoria e contesto», che esiste solo dopo il monolite. */
montaMotoreContesto();
montaFinestraPiena();
montaDoveGiranoDiSerie();
/* 11/10/2026 (owner: link cliccabili con conferma del sito): i siti che si aprono senza chiedere, in «Sicurezza e privacy». */
montaSitiFidati();

/*
 * 14/09/2026 — Desktop 0.1.7: qui si forzava `data-talos-streaming-animation = 'none'` nella shell standalone, perché le
 * modalità `fade`/`typewriter` del monolite trattenevano testo già ricevuto fino a 300–350 ms (un ritmo fisso più lento del
 * fornitore: arretrato senza limite).
 * ⛔ 22/10/2026 — TOLTO. Misurato dal vivo (giro vero, glm-5.3-flash, Chrome con GPU a 165 Hz): con `none` il testo segue i
 *   PACCHETTI del filo (~35 caratteri ogni ~145 ms) e il 95% dei fotogrammi resta fermo — è lo «scattoso» dell'owner. E la
 *   forzatura non reggeva nemmeno da sola: la prima volta che il monolite riapplica l'aspetto (un tema, la lingua, il modo
 *   chiaro/scuro del sistema) la radice tornava alla preferenza salvata (`fade` di serie), quindi la modalità a schermo
 *   dipendeva da che cosa la persona aveva toccato dopo l'avvio. Il ritmo adesso ha un ritardo massimo dichiarato
 *   (`components/ritmo-streaming.js`, 260 ms) e la preferenza delle Impostazioni torna a valere, sempre («Cursore testo» o
 *   «Dissolvenza»: le Impostazioni non offrono una terza scelta). Chi vuole il testo crudo, senza ritmo, ha «Riduci movimento»
 *   (Impostazioni → Aspetto), che lo rende istantaneo. Il cancello è `STREAMING-FLUIDO-07`.
 * Una superficie embedded (`window.__talosHarnessHost`) continua a tenere la propria preferenza, come prima.
 */

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

/* CP14: custom rendering; existing preferences and event handlers remain the owners. */
const { mountCalmControls } = await import('./components/calm-controls.js');
const calmScope = '#schermoImpostazioni, .td-theme-studio, [data-calm-controls]';
let calmControls = mountCalmControls(document, { scope: calmScope });
window.addEventListener('pagehide', () => calmControls.dispose());
window.addEventListener('pageshow', event => {
  if (event.persisted) calmControls = mountCalmControls(document, { scope: calmScope });
});
