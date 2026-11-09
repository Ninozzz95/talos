/*
 * FE-072 (Desktop 05/11 17:09): il canale della bolla e il lettore dei suoi messaggi, senza dipendenze. Il segno (una finestra per schermo) li importa da qui e non
 * dal protocollo della bolla, che porta con sé la pillola e le traduzioni di tutta l'app: 1,56 MB minificato per disegnare un cursore. `bolla-protocollo.js` li riesporta.
 * ⛔ Si legge per forma, come ogni ingresso: ciò che non è riconosciuto si scarta.
 */
export const CANALE_BOLLA = 'talos-bolla';
/** L'indirizzo che `setWindowOpenHandler` del guscio riconosce, nega, e usa per portare davanti la finestra principale: stessa forma di `azioneAggiornamenti`. */
export const INDIRIZZO_PORTA_DAVANTI = 'talos-bolla:porta-davanti';
/** FE-074: la pagina del segno chiede con `window.open` la posizione vera del mouse; il guscio nega e risponde con `segno-ripiego` (`segno-finestra.mjs`). */
export const INDIRIZZO_RIPIEGO = 'talos-segno:ripiego';

const EVENTI = new Set(['talos.computer-use-passo', 'talos.computer-use-annuncio', 'talos.computer-use-guarda', 'talos.computer-use-pausa', 'talos.computer-use-fermato', 'talos.computer-use-esito', 'talos.computer-use-protezione', 'talos.computer-use-permessi']);
const PORTE = new Set(['consenso', 'conferma', 'conferme', 'mano']);
const testoPieno = (x) => typeof x === 'string' && x !== '';
const oggetto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Il messaggio dalla pagina principale, o `null` se la forma non è nota. */
const MOTIVI_SEGNO = new Set(['windows-vecchio', 'protezione']);
export function leggiMessaggio(m) {
  if (!oggetto(m)) return null;
  if (m.tipo === 'evento') return oggetto(m.evento) && EVENTI.has(m.evento.name) && oggetto(m.evento.value) ? { tipo: 'evento', evento: { name: m.evento.name, value: m.evento.value } } : null;
  if (m.tipo === 'domanda') return testoPieno(m.id) && PORTE.has(m.porta) && oggetto(m.dati) ? { tipo: 'domanda', id: m.id, porta: m.porta, dati: m.dati } : null;
  if (m.tipo === 'chiudi-domanda') return testoPieno(m.id) ? { tipo: 'chiudi-domanda', id: m.id } : null;
  if (m.tipo === 'sessione') return testoPieno(m.sessionId) ? { tipo: 'sessione', sessionId: m.sessionId } : null;
  /* FE-073: il guscio dice che su questo Windows il segno non si disegna (`windows-vecchio`), o che Windows ha rifiutato di tenerlo fuori dalle foto dello schermo
     (`protezione`, segno-finestra.mjs MESSAGGIO_SENZA_PROTEZIONE). Arriva solo dalla finestra stessa (`bolla.js`), mai dal canale. Un altro motivo si scarta. */
  if (m.tipo === 'segno-assente') return MOTIVI_SEGNO.has(m.motivo) ? { tipo: 'segno-assente', motivo: m.motivo } : null;
  return null;
}
