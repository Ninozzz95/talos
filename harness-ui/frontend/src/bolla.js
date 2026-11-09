/* FE-066: l'ingresso della pagina della bolla. La finestra è del guscio; dati e risposte passano dal canale verso la pagina principale. */
import { applicaLingua } from './components/lingua.js';
import { CANALE_BOLLA } from './components/computer-use/bolla-protocollo.js';
import { CHIAVE_IMPOSTAZIONI, CHIAVE_SEGNO_ASSENTE, creaBolla, linguaDellaBolla } from './components/computer-use/bolla.js';

/* La lingua prima di disegnare: i testi della bolla si leggono con t() quando nascono. */
let salvate = null;
try { salvate = window.localStorage.getItem(CHIAVE_IMPOSTAZIONI); } catch { salvate = null; }
applicaLingua(document, linguaDellaBolla({ salvate, lingueBrowser: navigator.languages || [navigator.language], ancora: location.hash }));
/* FE-074: l'avviso «segno assente» oltre un ricarico. L'archivio della sessione vive quanto la finestra della bolla, cioè un avvio dell'app. */
const memoria = {
  leggi: () => { try { return window.sessionStorage.getItem(CHIAVE_SEGNO_ASSENTE); } catch { return null; } },
  scrivi: (v) => { try { window.sessionStorage.setItem(CHIAVE_SEGNO_ASSENTE, v); } catch { /* senza archivio vale per questa pagina */ } },
};
document.body.append(creaBolla({ document, finestra: window, canale: new BroadcastChannel(CANALE_BOLLA), memoria }).nodo);
