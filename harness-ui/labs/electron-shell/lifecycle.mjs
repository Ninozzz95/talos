/**
 * ⭐⭐⭐ 04/9 — W2-13, LAB: il ciclo di vita del figlio Node (piano 57.2).
 *
 * Una macchina a stati PURA: non conosce Electron, non conosce
 * child_process. Riceve funzioni iniettate (avviare, uccidere, sondare la
 * salute, orologio) e decide SOLO le transizioni — così si prova per intero
 * in `node --test`, anche al verso contrario, senza aprire una finestra.
 *
 *   fermo ──avvia()──▶ avvio ──(salute ok)──▶ pronto ──chiudi()──▶ in-chiusura ──▶ chiuso
 *                        │                       │
 *                        └──(uscita inattesa)────┴──▶ crash ──(backoff)──▶ avvio   (× tentativiMassimi)
 *                                                                          └──▶ arreso
 *   pronto ──sospendi()──▶ sospeso ──riprendi()──▶ (salute ok ? pronto : crash)
 *
 * Regole che i test fissano:
 * - un'uscita del figlio DURANTE `in-chiusura` non è un crash (l'abbiamo chiesta noi);
 * - dopo `tentativiMassimi` riavvii consecutivi falliti si passa ad `arreso` e si
 *   avvisa: mai un ciclo infinito silenzioso di riavvii;
 * - un riavvio riuscito azzera il contatore;
 * - al `riprendi()` dopo una sospensione si SONDA la salute invece di darla
 *   per scontata (la macchina può aver ucciso il figlio nel sonno).
 *
 * ⛔ `windowStatePersistence` NON esiste in Electron 44 (verificato sulla
 * documentazione ufficiale il 04/09: la guida del 03/09 lo dava per buono).
 * Lo stato della finestra si salva in `window-state.mjs`, a mano.
 */

export const STATI = Object.freeze(['fermo', 'avvio', 'pronto', 'in-chiusura', 'chiuso', 'crash', 'sospeso', 'arreso']);
export const BACKOFF_MS_DEFAULT = Object.freeze([500, 1000, 2000, 4000, 8000]);

export function creaCicloDiVita({
  avviaFiglio, // () => { pid?, exitCode: null|number } | Promise<...> — deve avviare e restituire un handle
  uccidiFiglio, // (handle) => void
  attendiSalute, // (handle) => Promise<boolean> — true quando /api/v1/health risponde
  onStato = () => {}, // (stato, dettaglio) => void
  onAvviso = () => {}, // (messaggio) => void
  pianifica = (fn, ms) => setTimeout(fn, ms), // iniettabile per i test (nessun timer vero)
  backoffMs = BACKOFF_MS_DEFAULT,
  tentativiMassimi = backoffMs.length,
} = {}) {
  if (typeof avviaFiglio !== 'function' || typeof uccidiFiglio !== 'function' || typeof attendiSalute !== 'function') {
    throw new Error('creaCicloDiVita richiede avviaFiglio, uccidiFiglio, attendiSalute');
  }
  let stato = 'fermo';
  let handle = null;
  let riavviiConsecutivi = 0;
  let generazione = 0; // ogni avvio ne apre una nuova: gli esiti tardivi di un figlio vecchio si ignorano
  const transizioni = [];

  function vaiA(nuovo, dettaglio = null) {
    if (!STATI.includes(nuovo)) throw new Error(`stato sconosciuto: ${nuovo}`);
    stato = nuovo;
    transizioni.push({ stato: nuovo, dettaglio });
    onStato(nuovo, dettaglio);
  }

  async function avvia() {
    if (stato !== 'fermo' && stato !== 'crash' && stato !== 'chiuso') return stato;
    generazione += 1;
    const mia = generazione;
    vaiA('avvio', { generazione: mia, tentativo: riavviiConsecutivi });
    try {
      handle = await avviaFiglio();
      const sano = await attendiSalute(handle);
      if (mia !== generazione) return stato; // superato da un altro avvio o da una chiusura
      if (!sano) { return figlioUscito(handle?.exitCode ?? null, { motivo: 'salute-non-raggiunta' }); }
      riavviiConsecutivi = 0;
      vaiA('pronto', { generazione: mia });
      return stato;
    } catch (errore) {
      if (mia !== generazione) return stato;
      return figlioUscito(null, { motivo: 'avvio-fallito', errore: errore?.message ?? String(errore) });
    }
  }

  /** Il figlio è uscito (evento 'exit') o non è mai diventato sano. Decide se è un crash e se riavviare. */
  function figlioUscito(codice, dettaglio = {}) {
    if (stato === 'in-chiusura') { vaiA('chiuso', { codice }); handle = null; return stato; }
    if (stato === 'chiuso' || stato === 'fermo' || stato === 'arreso') return stato;
    handle = null;
    generazione += 1; // invalida esiti tardivi del figlio morto
    vaiA('crash', { codice, ...dettaglio, riavviiConsecutivi });
    if (riavviiConsecutivi >= tentativiMassimi) {
      vaiA('arreso', { codice, riavvii: riavviiConsecutivi });
      onAvviso(`Il server locale è caduto ${riavviiConsecutivi} volte di fila: non lo riavvio più da solo. Chiudi e riapri TALOS, o guarda il Doctor.`);
      return stato;
    }
    const attesa = backoffMs[Math.min(riavviiConsecutivi, backoffMs.length - 1)];
    riavviiConsecutivi += 1;
    onAvviso(`Il server locale si è fermato (codice ${codice ?? 'n/d'}): lo riavvio fra ${attesa} ms (tentativo ${riavviiConsecutivi} di ${tentativiMassimi}).`);
    pianifica(() => { if (stato === 'crash') void avvia(); }, attesa);
    return stato;
  }

  function chiudi() {
    if (stato === 'chiuso' || stato === 'fermo') return stato;
    if (stato === 'crash' || stato === 'arreso') { generazione += 1; vaiA('chiuso', { daStato: 'crash' }); return stato; }
    const daChiudere = handle;
    vaiA('in-chiusura');
    generazione += 1; // un avvio in corso non deve più completare
    if (daChiudere) uccidiFiglio(daChiudere);
    else vaiA('chiuso', { nessunFiglio: true });
    return stato;
  }

  function sospendi() {
    if (stato !== 'pronto') return stato;
    vaiA('sospeso');
    return stato;
  }

  async function riprendi() {
    if (stato !== 'sospeso') return stato;
    const sano = handle ? await attendiSalute(handle) : false;
    if (sano) { vaiA('pronto', { daSospensione: true }); return stato; }
    vaiA('pronto', { daSospensione: true, figlioMorto: true }); // torna pronto per far scattare le regole del crash
    return figlioUscito(handle?.exitCode ?? null, { motivo: 'morto-durante-sospensione' });
  }

  return Object.freeze({
    avvia, chiudi, sospendi, riprendi, figlioUscito,
    stato: () => stato,
    handle: () => handle,
    transizioni: () => transizioni.slice(),
    riavviiConsecutivi: () => riavviiConsecutivi,
  });
}
