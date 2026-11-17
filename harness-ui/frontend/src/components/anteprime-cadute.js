/*
 * 0.2.2, giro di sicurezza 3 (10/11/2026; controllore del giro 2, reperto N1; owner 22:51: «l'app se ne accorga e riapra l'anteprima»).
 * Una pagina resa può far cadere il processo che la disegna (misurato con Electron 44.3.0 / Chrome 152: `RTCPeerConnection` in una
 * cornice figlia `srcdoc` di una pagina con la lista delle connessioni; Chromium chiude quel processo). Dal giro 3 ogni pagina resa ha
 * un processo suo, quindi cade SOLO lei; il guscio del PC se ne accorge (`desktop/finestra-artefatto.mjs`, `sorvegliaAnteprime`) e lo
 * dice al documento dell'app con l'evento qui sotto. Qui sta la regola, una sola per il pannello «A lato» e per il lettore:
 *   · la prima caduta: la pagina si ricarica da sé, UNA volta;
 *   · la seconda: niente più ricariche, si mostra «Pagina non caricata.» con «Riprova» (lo decide chi chiama, con `arresa`).
 * Il conto NON si azzera con la ricarica automatica: solo `azzera()`, cioè un gesto della persona. Così non nasce mai un giro di ricariche.
 * ⛔ Nel browser del remoto e nel telefono l'evento non arriva (lo manda solo il guscio del PC): qui dentro non succede niente.
 * Hermes ricarica la finestra caduta con un tetto di tentativi (`apps/desktop/electron/window-renderer-lifecycle.ts:13-23`).
 */

export const EVENTO_ANTEPRIME_CADUTE = 'talos:anteprime-cadute';
export const RICARICHE_AUTOMATICHE = 1;

/** Percorso e domanda di un indirizzo, come li manda il guscio (`pathname + search`); `null` se non è un indirizzo. */
export function percorsoAnteprima(indirizzo, finestra = globalThis) {
  if (typeof indirizzo !== 'string' || !indirizzo) return null;
  try {
    const Indirizzo = finestra.URL ?? globalThis.URL;
    const url = new Indirizzo(indirizzo, finestra.location?.href ?? 'http://127.0.0.1/');
    return `${url.pathname}${url.search}`;
  } catch { return null; }
}

/**
 * Guarda UNA anteprima per tutta la sua apertura.
 * @param {{ finestra?: any, indirizzo: () => string|null|undefined, ricarica: () => void, arresa: () => void }} o
 *   `indirizzo()` è l'indirizzo della cornice di adesso (o niente se non c'è); `ricarica()` la rifà; `arresa()` mostra la riga con «Riprova».
 * @returns {{ ferma: () => void, azzera: () => void, readonly ricariche: number }}
 */
export function guardaAnteprima({ finestra = globalThis, indirizzo, ricarica, arresa }) {
  let ricariche = 0;
  let ferma = false;
  const ascolta = (evento) => {
    if (ferma) return;
    const cadute = evento?.detail?.indirizzi;
    const mio = percorsoAnteprima(indirizzo(), finestra);
    if (!Array.isArray(cadute) || mio === null || !cadute.includes(mio)) return;
    if (ricariche < RICARICHE_AUTOMATICHE) { ricariche += 1; ricarica(); } else arresa();
  };
  finestra.addEventListener?.(EVENTO_ANTEPRIME_CADUTE, ascolta);
  return {
    ferma() { ferma = true; finestra.removeEventListener?.(EVENTO_ANTEPRIME_CADUTE, ascolta); },
    azzera() { ricariche = 0; },
    get ricariche() { return ricariche; },
  };
}
