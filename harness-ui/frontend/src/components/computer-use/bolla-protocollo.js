/*
 * FE-066: che cosa si dicono la bolla e la pagina principale di TALOS. La bolla non ha uno stream suo: gli eventi del computer use li riceve dalla pagina principale, che li ha già,
 * e le risposte tornano di lì verso le rotte di sempre (forma `FORMA-BOLLA-COMPUTER-USE-2026-11-03.md`). `BroadcastChannel`: stessa origine e stessa sessione del browser, niente ipc.
 * ⛔ Si legge per forma, come ogni ingresso: ciò che non è riconosciuto si scarta. Una pagina della stessa origine può scrivere sul canale, quindi qui si disegna soltanto: non
 *   c'è niente che agisca da solo, e ogni risposta nasce da un gesto nella bolla.
 */
import { STATO_PILLOLA_INIZIALE, statoPillola } from './pillola.js';

/* FE-072: il canale e il lettore stanno in `bolla-messaggi.js`, senza dipendenze, perché il segno non si porti dietro la pillola; qui si riesportano. */
export { CANALE_BOLLA, INDIRIZZO_PORTA_DAVANTI, leggiMessaggio } from './bolla-messaggi.js';

/*
 * FE-073: `segnoAssente` è `null` (niente da dire), `'atteso'` (il guscio l'ha detto, nessun compito ancora), `'mostrato'` (la pillola del primo compito lo dice) o `'fatto'`
 * (il primo esito di un passo, o la fine del compito, l'ha tolto: non torna più finché la bolla vive, cioè fino al prossimo avvio dell'app). Sta qui e non in `pillola.js`
 * perché lo stato della pillola disegna anche quella della pagina principale, che il segno non lo riguarda.
 */
export const STATO_INIZIALE_BOLLA = Object.freeze({ pillola: STATO_PILLOLA_INIZIALE, domanda: null, fine: null, sessionId: null, segnoAssente: null, motivoSegno: null });

/**
 * FE-074: lo stato dell'avviso salvato nell'archivio della sessione, alla ripartenza della bolla (la stessa finestra che si ricarica). Il guscio non lo ripete, quindi
 * `'atteso'` resta da dire; `'mostrato'` e `'fatto'` la persona l'ha già letto e non torna. Il resto è niente.
 */
export function riprendiSegnoAssente(salvato) {
  if (salvato === 'atteso' || salvato === ATTESO_PROTEZIONE) return 'atteso';
  return salvato === 'mostrato' || salvato === 'fatto' ? 'fatto' : null;
}

/* Il motivo conta solo finché l'avviso è da dire: `'atteso'` (salvato prima di questa cura) resta Windows vecchio, `'atteso-protezione'` è la protezione. */
const ATTESO_PROTEZIONE = 'atteso-protezione';
export function riprendiMotivoSegno(salvato) {
  if (salvato === ATTESO_PROTEZIONE) return 'protezione';
  return salvato === 'atteso' ? 'windows-vecchio' : null;
}
export function segnoDaSalvare(stato) {
  return stato.segnoAssente === 'atteso' && stato.motivoSegno === 'protezione' ? ATTESO_PROTEZIONE : stato.segnoAssente;
}

function avvisoDopo(avviso, evento, pillola, finito) {
  if (avviso === 'atteso' && pillola.lavora) return 'mostrato';
  const esitoDiUnPasso = evento.name === 'talos.computer-use-passo' && evento.value.fase === 'esito';
  if (avviso === 'mostrato' && (esitoDiUnPasso || finito)) return 'fatto';
  return avviso;
}

export function riduciBolla(stato, m) {
  switch (m.tipo) {
    case 'domanda': return { ...stato, domanda: { id: m.id, porta: m.porta, dati: m.dati } };
    case 'chiudi-domanda': return stato.domanda?.id === m.id ? { ...stato, domanda: null } : stato;
    case 'sessione': return { ...stato, sessionId: m.sessionId };
    case 'segno-assente': return stato.segnoAssente === null ? { ...stato, segnoAssente: 'atteso', motivoSegno: m.motivo } : stato;
    case 'evento': {
      const pillola = statoPillola(stato.pillola, m.evento);
      const finito = m.evento.name === 'talos.computer-use-fermato' || m.evento.name === 'talos.computer-use-esito';
      const segnoAssente = avvisoDopo(stato.segnoAssente, m.evento, pillola, finito);
      if (finito) return { ...stato, pillola, segnoAssente, domanda: null, fine: m.evento.value };
      return { ...stato, pillola, segnoAssente, fine: pillola.lavora ? null : stato.fine };
    }
    default: return stato;
  }
}
