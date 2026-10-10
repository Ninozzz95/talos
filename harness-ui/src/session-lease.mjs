/*
 * ⭐⭐⭐ 10/10/2026 — L'AFFITTO FRA PROCESSI SULL'ARCHIVIO DELLE SESSIONI (owner 09/10 sera: «Affitto come Hermes»;
 *   10/10: «Ricaricarla da sola»).
 *
 * Il fatto: il 4174 e l'app desktop installata usano lo STESSO archivio (`%APPDATA%\TALOS\sessions`, decisione owner del
 *   07/10), e la CLI può avere più processi sul suo (`%LOCALAPPDATA%\TALOS-CLI\sessions`: due terminali, `talos -p`,
 *   `automation serve`). Nessun lucchetto fra processi:
 *   · ogni replay può RIPARARE una coda spezzata (`session-store.mjs`, `riparaCodaSpezzataInterna`: copia del prefisso sano
 *     e `rename` sopra il giornale). libuv apre i file SEMPRE con FILE_SHARE_DELETE su Windows (docs.libuv.org `fs.rst`,
 *     «O_SHARE_DELETE, O_SHARE_WRITE and O_SHARE_READ are always added»), quindi il rename riesce anche mentre l'altro
 *     processo scrive: il record accodato fra la copia e il rename finisce nel file sostituito, perso in silenzio;
 *   · ogni processo tiene in memoria le sessioni rigiocate: scrivere in una sessione che l'altro ha continuato intreccia
 *     due storie nello stesso giornale.
 *
 * ⭐ Hermes, letto nel codice (clone `hermes-agent-2026-10-07`): `hermes_cli/active_sessions.py` tiene un registro
 *   `runtime/active_sessions.json` sotto un lucchetto del sistema operativo (`msvcrt.locking`/`fcntl.flock`), con pid +
 *   `process_start_time` per non scambiare un pid riusato per il proprietario; la CLI prende l'affitto all'apertura della chat
 *   (`cli.py:921-946`, `_claim_active_session`) e una seconda finestra rifiuta con un messaggio che dice dove è aperta
 *   (`shared_session_attach.py:47-52`). Se il meccanismo stesso fallisce, Hermes lascia passare (`cli.py:933-935`, «Failed to
 *   claim active session slot» → `return True`).
 *
 * ⇒ Adattato a TALOS, con due differenze dichiarate:
 *   1. Node non ha `flock`. La forma è quella di proper-lockfile (README, letto il 10/10/2026): creazione ESCLUSIVA atomica
 *      (`open(…, 'wx')`), `mtime` rinfrescato mentre si tiene, scaduto oltre una soglia. In più, come Hermes guarda il pid:
 *      un pid che sullo stesso host non esiste più (`process.kill(pid, 0)` → `ESRCH`) libera SUBITO l'affitto, senza
 *      aspettare la scadenza (CLI 10/10, F-ENG-3: un TALOS ucciso a metà giro non deve restare chiuso fuori). Un pid riusato
 *      da un altro programma sembra vivo: lì vale la scadenza dell'`mtime`, che il programma estraneo non rinfresca.
 *   2. Un server TALOS tiene MOLTE sessioni, e i due processi le caricano tutte all'avvio: se l'affitto si prendesse
 *      all'apertura, il primo ad avviarsi le possiederebbe tutte. Si prende all'ATTIVITÀ (la prima scrittura, o una
 *      riparazione) e si rilascia quando la sessione non è più in uso in questo processo e non scrive da `rilascioDopoMs`.
 *
 * Un file per sessione: `<archivio>/.affitti/<sessionId>.json` = `{ istanza, pid, host, avviatoIl, presoIl, etichetta }`.
 *   ⛔ La cartella comincia col punto e non finisce in `.jsonl`: l'elenco delle sessioni non la vede.
 *
 * Oltre all'affitto, qui sta la DIMENSIONE NOTA di ogni giornale (`ricordaDimensione`): quella dell'ultima lettura intera o
 *   dell'ultimo rilascio. Quando l'affitto si prende di nuovo e il giornale ha un'altra dimensione, un altro processo ci ha
 *   scritto: `daRicaricare(sessionId)` lo dice finché una lettura non lo rimette in pari (decisione owner del 10/10: la sessione
 *   si ricarica da sola prima di scrivere).
 */
import { randomUUID } from 'node:crypto';
import {
  closeSync, linkSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, utimesSync, writeSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

export const CARTELLA_AFFITTI = '.affitti';
export const BATTITO_MS = 5_000;
export const SCADENZA_MS = 30_000;
export const RILASCIO_DOPO_MS = 30_000;

export class SessionLeaseError extends Error {
  constructor(message, code, dettaglio = {}) {
    super(message);
    this.name = 'SessionLeaseError';
    this.code = code;
    Object.assign(this, dettaglio);
  }
}

/* Vivo, morto o non si sa. `EPERM` = esiste ma non è nostro: vivo. */
export function processoVivoPredefinito(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (errore) { return errore?.code === 'EPERM'; }
}

/** La frase del rifiuto, in inglese (testo per chi chiama: l'interfaccia sceglie la sua dal codice). */
export function fraseDetentore(sessionId, detentore) {
  const chi = detentore?.etichetta ? `${detentore.etichetta}, ` : '';
  const dal = detentore?.presoIl ? `, since ${detentore.presoIl}` : '';
  return `Session ${sessionId} is open in another TALOS process (${chi}pid ${detentore?.pid ?? '?'}${dal}): continue it there, or wait until it finishes.`;
}

/**
 * @param {object} opzioni
 * @param {string} opzioni.cartellaStore l'archivio delle sessioni
 * @param {(sessionId:string)=>string} opzioni.percorsoGiornale dove sta il giornale di una sessione
 * @param {string} [opzioni.etichetta] chi è questo processo, per il messaggio dell'altro (es. «TALOS desktop server»)
 */
export function creaAffittiArchivio({
  cartellaStore,
  percorsoGiornale,
  etichetta = 'TALOS',
  istanza = randomUUID(),
  pid = process.pid,
  host = hostname(),
  avviatoIl = new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString(),
  battitoMs = BATTITO_MS,
  scadenzaMs = SCADENZA_MS,
  rilascioDopoMs = RILASCIO_DOPO_MS,
  adesso = () => Date.now(),
  processoVivo = processoVivoPredefinito,
  impostaIntervallo = setInterval,
  cancellaIntervallo = clearInterval,
} = {}) {
  if (typeof cartellaStore !== 'string' || !cartellaStore) throw new TypeError('creaAffittiArchivio requires cartellaStore.');
  if (typeof percorsoGiornale !== 'function') throw new TypeError('creaAffittiArchivio requires percorsoGiornale(sessionId).');
  const cartella = join(cartellaStore, CARTELLA_AFFITTI);
  const fileDi = (sessionId) => join(cartella, `${sessionId}.json`);
  /* sessionId → { ultimaAttivita } per gli affitti che QUESTO processo tiene */
  const tenuti = new Map();
  const dimensioniNote = new Map();
  const daRicaricareSet = new Set();
  const predicatiInUso = new Set();
  let intervallo = null;
  let chiuso = false;

  const dimensioneGiornale = (sessionId) => {
    try { return statSync(percorsoGiornale(sessionId)).size; }
    catch (errore) { if (errore?.code === 'ENOENT') return 0; throw errore; }
  };
  const leggiDetentore = (file) => {
    let testo, mtimeMs;
    try { mtimeMs = statSync(file).mtimeMs; testo = readFileSync(file, 'utf8'); }
    catch (errore) { if (errore?.code === 'ENOENT') return null; throw errore; }
    let dati = null;
    try { dati = JSON.parse(testo); } catch { /* scritto a metà (crash fra `wx` e `write`): conta solo l'mtime */ }
    return { ...(dati && typeof dati === 'object' ? dati : {}), mtimeMs };
  };
  /* Scaduto: il pid sullo stesso host non esiste più, o l'mtime è più vecchio della scadenza. */
  const scaduto = (detentore) => {
    if (!detentore) return true;
    if (detentore.host === host && Number.isSafeInteger(detentore.pid) && !processoVivo(detentore.pid)) return true;
    return adesso() - detentore.mtimeMs > scadenzaMs;
  };
  const contenuto = () => JSON.stringify({ istanza, pid, host, avviatoIl, presoIl: new Date(adesso()).toISOString(), etichetta });
  const creaEsclusivo = (file) => {
    const fd = openSync(file, 'wx');
    try { writeSync(fd, contenuto()); } finally { closeSync(fd); }
  };
  /*
   * Si porta via un affitto scaduto: `rename` su un nome unico (ne vince uno solo), POI si controlla che quello portato via
   *   sia proprio quello giudicato scaduto. Se nel frattempo un altro l'aveva già preso e rinfrescato, si rimette al suo posto
   *   con `link` (fallisce se il posto è già occupato, cioè non sovrascrive mai) e si dice «tenuto da lui».
   */
  const portaVia = (file, giudicato) => {
    const via = `${file}.${randomUUID()}.scaduto`;
    try { renameSync(file, via); }
    catch (errore) { if (errore?.code === 'ENOENT') return true; throw errore; }
    const preso = leggiDetentore(via);
    const stesso = preso && preso.istanza === giudicato.istanza && preso.mtimeMs === giudicato.mtimeMs;
    if (!stesso && preso && !scaduto(preso)) {
      try { linkSync(via, file); } catch { /* il posto è già occupato da un terzo: resta suo */ }
      try { unlinkSync(via); } catch { /* nome unico, nessuno lo legge */ }
      return false;
    }
    try { unlinkSync(via); } catch { /* nome unico, nessuno lo legge */ }
    return true;
  };

  const avviaBattito = () => {
    if (intervallo || chiuso || battitoMs <= 0) return;
    intervallo = impostaIntervallo(() => { try { api.battito(); } catch { /* il prossimo battito ritenta */ } }, battitoMs);
    intervallo?.unref?.(); // CLI 10/10: `talos -p` deve uscire sempre, l'affitto non tiene vivo il processo
  };
  const fermaBattitoSeVuoto = () => {
    if (intervallo && tenuti.size === 0) { cancellaIntervallo(intervallo); intervallo = null; }
  };

  const api = {
    cartella,
    istanza,

    /**
     * Prende l'affitto (o conferma che è già nostro).
     * @returns {{preso:true, nuovo:boolean} | {preso:false, detentore:object}}
     */
    prendi(sessionId) {
      if (chiuso) throw new SessionLeaseError('The session lease registry is closed.', 'SESSION_LEASE_CLOSED');
      const file = fileDi(sessionId);
      const mio = tenuti.get(sessionId);
      if (mio) {
        const attuale = leggiDetentore(file);
        if (attuale?.istanza === istanza) { mio.ultimaAttivita = adesso(); return { preso: true, nuovo: false }; }
        tenuti.delete(sessionId); // perso (cancellato a mano, o portato via mentre questo processo era fermo): si riprende da capo
      }
      mkdirSync(cartella, { recursive: true });
      for (let tentativo = 0; tentativo < 3; tentativo += 1) {
        try {
          creaEsclusivo(file);
        } catch (errore) {
          if (errore?.code !== 'EEXIST') throw errore;
          const detentore = leggiDetentore(file);
          if (detentore?.istanza === istanza) break; // nostro da prima (un `tenuti` perso): si tiene
          if (detentore && !scaduto(detentore)) return { preso: false, detentore };
          if (!portaVia(file, detentore ?? {})) return { preso: false, detentore: leggiDetentore(file) ?? detentore };
          continue;
        }
        break;
      }
      const attuale = leggiDetentore(file);
      if (attuale?.istanza !== istanza) return { preso: false, detentore: attuale };
      tenuti.set(sessionId, { ultimaAttivita: adesso() });
      if (dimensioniNote.has(sessionId) && dimensioneGiornale(sessionId) !== dimensioniNote.get(sessionId)) daRicaricareSet.add(sessionId);
      avviaBattito();
      return { preso: true, nuovo: true };
    },

    /** Chi tiene l'affitto, se è un ALTRO processo vivo; `null` se è libero, scaduto o nostro. Non prende niente. */
    detentoreAltrui(sessionId) {
      if (tenuti.has(sessionId)) return null;
      const detentore = leggiDetentore(fileDi(sessionId));
      if (!detentore || detentore.istanza === istanza || scaduto(detentore)) return null;
      return detentore;
    },

    tiene(sessionId) { return tenuti.has(sessionId); },

    /** Segna un'attività (una scrittura): il rilascio conta da qui. */
    tocca(sessionId) { const mio = tenuti.get(sessionId); if (mio) mio.ultimaAttivita = adesso(); },

    /** Rilascia l'affitto, ricordando la dimensione del giornale com'è adesso (tutto ciò che è stato scritto da noi). */
    rilascia(sessionId, { dimensione } = {}) {
      if (!tenuti.has(sessionId)) return false;
      tenuti.delete(sessionId);
      try { dimensioniNote.set(sessionId, Number.isSafeInteger(dimensione) ? dimensione : dimensioneGiornale(sessionId)); }
      catch { dimensioniNote.delete(sessionId); }
      const file = fileDi(sessionId);
      const attuale = (() => { try { return leggiDetentore(file); } catch { return null; } })();
      if (attuale?.istanza === istanza) { try { unlinkSync(file); } catch { /* già via */ } }
      fermaBattitoSeVuoto();
      return true;
    },

    /** Una lettura INTERA del giornale ha visto `dimensione` byte: è la dimensione nota, e la sessione è in pari. */
    ricordaDimensione(sessionId, dimensione) {
      if (!Number.isSafeInteger(dimensione)) return;
      dimensioniNote.set(sessionId, dimensione);
      daRicaricareSet.delete(sessionId);
    },
    dimensioneNota(sessionId) { return dimensioniNote.get(sessionId) ?? null; },
    /** Il giornale è cambiato rispetto alla dimensione nota (lo scrive un altro): `true` finché una lettura non lo rimette in pari. */
    daRicaricare(sessionId) { return daRicaricareSet.has(sessionId); },
    /** Come `daRicaricare`, ma misurato adesso, senza prendere l'affitto (per chi legge soltanto). */
    cambiatoAltrove(sessionId) {
      if (daRicaricareSet.has(sessionId)) return true;
      if (tenuti.has(sessionId)) return false; // con l'affitto in mano il giornale cresce solo per le NOSTRE scritture
      if (!dimensioniNote.has(sessionId)) return false;
      try { return dimensioneGiornale(sessionId) !== dimensioniNote.get(sessionId); } catch { return false; }
    },
    dimentica(sessionId) { dimensioniNote.delete(sessionId); daRicaricareSet.delete(sessionId); },

    /** Un predicato «questa sessione è in uso qui» (un giro vivo, una ricerca): finché è vero l'affitto non si rilascia. */
    aggiungiInUso(predicato) { predicatiInUso.add(predicato); return () => predicatiInUso.delete(predicato); },

    /** Un battito: rinfresca gli affitti tenuti e rilascia quelli inattivi. Esposto per i test. */
    battito() {
      const ora = adesso();
      for (const [sessionId, mio] of [...tenuti]) {
        const inUso = [...predicatiInUso].some((p) => { try { return p(sessionId) === true; } catch { return true; } });
        if (!inUso && ora - mio.ultimaAttivita >= rilascioDopoMs) { api.rilascia(sessionId); continue; }
        const file = fileDi(sessionId);
        const attuale = leggiDetentore(file);
        if (attuale?.istanza !== istanza) { tenuti.delete(sessionId); continue; } // portato via: la prossima scrittura lo riprende o rifiuta
        const quando = new Date(ora);
        utimesSync(file, quando, quando);
      }
      fermaBattitoSeVuoto();
    },

    /** Chiude: rilascia tutto e ferma il battito. Sincrona, per `process.on('exit')`. */
    chiudi() {
      for (const sessionId of [...tenuti.keys()]) api.rilascia(sessionId);
      if (intervallo) { cancellaIntervallo(intervallo); intervallo = null; }
      chiuso = true;
    },
  };
  return api;
}
