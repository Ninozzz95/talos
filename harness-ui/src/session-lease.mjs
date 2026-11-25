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
 *
 * ⭐⭐⭐ 13/11/2026 — L'AFFITTO COMPROMESSO (giudice v1649/v1656, prova `REV-A14` del revisore di P4). Un processo FERMO più della
 *   scadenza (PC sospeso, programma bloccato) non sa di esserlo: l'altro gli prende l'affitto, scrive, rilascia, e al risveglio il
 *   primo `rilascia` segnava come «nota» la dimensione CON DENTRO le scritture dell'altro: la chat in memoria restava vecchia e la
 *   scrittura dopo usava numeri d'ordine già usati sul disco. Ora, come `proper-lockfile` (doc letta via ctx7 il 13/11/2026:
 *   `onCompromised`/`ECOMPROMISED`, «Unable to update lock within the stale threshold», «The lock is no longer owned — stop using
 *   the guarded resource»):
 *   · l'affitto è COMPROMESSO se il file non è più nostro (`battito`, `rilascia`, `prendi`): via dai tenuti, la dimensione attesa
 *     NON si aggiorna, e la chat è «da ricaricare» se il giornale non ha più la dimensione attesa. Se fra due rinfreschi riusciti è
 *     passata più della scadenza, l'affitto NON si dà per buono: si rinfresca e si rilegge subito, e se non è più nostro è
 *     compromesso; se lo è ancora nessuno l'ha preso (chi lo porta via lo rinomina e scrive il suo; `portaVia` rimette quello
 *     rinfrescato), e il rilascio non segna la dimensione di adesso. Un fermo di 31 s in cui nessuno ha scritto non ricarica niente;
 *   · la dimensione ATTESA (`statoAtteso`) segue ogni NOSTRA scrittura (`dopoScrittura`, dallo store) e ogni lettura intera,
 *     col numero d'ordine più alto che ci sta dentro: lo store la confronta prima di ogni accodamento (il recinto, pezzo 2);
 *   · `cambiatoAltrove` con l'affitto in mano non si fida più a occhi chiusi quando l'ultimo rinfresco è più vecchio della
 *     scadenza (la finestra fra il risveglio e il primo battito, pezzo 3).
 *   Hermes fa il recinto nel database (`hermes_state_messages.py:256-258`, «Session turn lease lost; refusing transcript write»).
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
  collegaSync = linkSync, // iniettabile: le prove simulano un file system che rifiuta i collegamenti (Android, exFAT)
  /* 13/11/2026 (P1-b del revisore affitto 1 di 3): SOLO per le prove, mai passato dal prodotto (lo controlla una prova sui sorgenti):
     chiamato fra il rinfresco di un affitto fermo oltre la scadenza e la sua rilettura, dove un altro processo può portarlo via */
  dopoIlRinfresco = null,
} = {}) {
  if (typeof cartellaStore !== 'string' || !cartellaStore) throw new TypeError('creaAffittiArchivio requires cartellaStore.');
  if (typeof percorsoGiornale !== 'function') throw new TypeError('creaAffittiArchivio requires percorsoGiornale(sessionId).');
  const cartella = join(cartellaStore, CARTELLA_AFFITTI);
  const fileDi = (sessionId) => join(cartella, `${sessionId}.json`);
  /* sessionId → { ultimaAttivita, ultimoRinfresco } per gli affitti che QUESTO processo tiene */
  const tenuti = new Map();
  /* sessionId → { dimensione, sequenza }: il giornale come lo sa QUESTO processo (ultima lettura intera o ultima nostra scrittura) */
  const attese = new Map();
  const daRicaricareSet = new Set();
  /* il recinto dello store ha già accolto la coda scritta altrove (`adotta`): si scrive, ma la chat in memoria va ricaricata da ferma */
  const adottate = new Set();
  const predicatiInUso = new Set();
  let intervallo = null;
  let chiuso = false;

  const dimensioneGiornale = (sessionId) => {
    try { return statSync(percorsoGiornale(sessionId)).size; }
    catch (errore) { if (errore?.code === 'ENOENT') return 0; throw errore; }
  };
  /* Il giornale non è più come lo sa questo processo (o non si sa com'è): qualcun altro ci ha scritto. */
  const diversoDallAtteso = (sessionId) => {
    const atteso = attese.get(sessionId);
    if (!atteso || !Number.isSafeInteger(atteso.dimensione)) return true;
    try { return dimensioneGiornale(sessionId) !== atteso.dimensione; } catch { return true; }
  };
  /*
   * 13/11/2026 — l'affitto COMPROMESSO: perso (il file non è più nostro) o non rinfrescato entro la scadenza. Via dai tenuti; la
   *   dimensione attesa resta quella di prima (mai la dimensione di adesso, che può avere dentro le scritture dell'altro); la chat
   *   è da ricaricare solo se il giornale non è più come lo sappiamo.
   */
  const compromesso = (sessionId) => {
    tenuti.delete(sessionId);
    if (diversoDallAtteso(sessionId)) daRicaricareSet.add(sessionId);
  };
  const scadutoPerTempo = (mio, ora) => Boolean(mio) && ora - mio.ultimoRinfresco > scadenzaMs;
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
      /*
       * 12/10/2026 — su Android (utente shell) e su exFAT `link` è RIFIUTATO (EACCES/EPERM…), non «posto occupato»: il catch di prima
       * lo inghiottiva e la riga dopo cancellava `via`, cioè l'affitto VIVO del terzo (misurato dalla sessione mobile sul Pad, AFF-06).
       * Ora: posto occupato (EEXIST) ⇒ è del terzo, `via` si toglie; collegamento rifiutato ⇒ i byte tornano al loro posto con una
       * creazione ESCLUSIVA (`wx`: mai sopra un affitto altrui); se nemmeno quella riesce, `via` resta dov'è invece di sparire.
       */
      let rimesso = false;
      try { collegaSync(via, file); rimesso = true; }
      catch (errore) {
        if (errore?.code === 'EEXIST') rimesso = true; // il posto è già occupato da un terzo: resta suo
        else {
          try {
            const fd = openSync(file, 'wx');
            try { writeSync(fd, readFileSync(via)); } finally { closeSync(fd); }
            rimesso = true;
          } catch (copia) { if (copia?.code === 'EEXIST') rimesso = true; }
        }
      }
      if (rimesso) { try { unlinkSync(via); } catch { /* nome unico, nessuno lo legge */ } }
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
        const ora = adesso();
        let ancoraNostro = attuale?.istanza === istanza;
        if (ancoraNostro && scadutoPerTempo(mio, ora)) {
          /* fermo oltre la scadenza ma il file è ancora nostro: si rinfresca SUBITO e si rilegge (chi l'avesse portato via nel
             frattempo l'avrebbe rinominato: la rilettura lo dice) */
          try { utimesSync(file, new Date(ora), new Date(ora)); } catch { /* sparito: lo dice la rilettura */ }
          dopoIlRinfresco?.(file, sessionId);
          ancoraNostro = leggiDetentore(file)?.istanza === istanza;
          if (ancoraNostro) mio.ultimoRinfresco = ora;
        }
        if (ancoraNostro) { mio.ultimaAttivita = ora; return { preso: true, nuovo: false }; }
        compromesso(sessionId); // perso (cancellato a mano, o portato via mentre questo processo era fermo): si riprende da capo
      }
      mkdirSync(cartella, { recursive: true });
      for (let tentativo = 0; tentativo < 3; tentativo += 1) {
        try {
          creaEsclusivo(file);
        } catch (errore) {
          if (errore?.code !== 'EEXIST') throw errore;
          const detentore = leggiDetentore(file);
          if (detentore?.istanza === istanza) { // nostro da prima (un `tenuti` perso): si tiene, rinfrescato adesso (13/11)
            try { const quando = new Date(adesso()); utimesSync(file, quando, quando); } catch { /* sparito: lo dice la rilettura sotto */ }
            break;
          }
          if (detentore && !scaduto(detentore)) return { preso: false, detentore };
          if (!portaVia(file, detentore ?? {})) return { preso: false, detentore: leggiDetentore(file) ?? detentore };
          continue;
        }
        break;
      }
      const attuale = leggiDetentore(file);
      if (attuale?.istanza !== istanza) return { preso: false, detentore: attuale };
      const presoAlle = adesso();
      tenuti.set(sessionId, { ultimaAttivita: presoAlle, ultimoRinfresco: presoAlle });
      if (attese.has(sessionId) && diversoDallAtteso(sessionId)) daRicaricareSet.add(sessionId);
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

    /**
     * Rilascia l'affitto. Con l'affitto SANO (file nostro, rinfrescato entro la scadenza) ricorda la dimensione del giornale com'è
     *   adesso: tutto ciò che c'è l'abbiamo scritto noi. 13/11/2026: con l'affitto COMPROMESSO no — prima si guarda di chi è il file,
     *   e la dimensione si segna solo se è ancora nostro (prima la segnava PRIMA di guardare, con dentro le scritture dell'altro).
     */
    rilascia(sessionId, { dimensione } = {}) {
      const mio = tenuti.get(sessionId);
      if (!mio) return false;
      const file = fileDi(sessionId);
      const attuale = (() => { try { return leggiDetentore(file); } catch { return null; } })();
      const nostro = attuale?.istanza === istanza;
      if (Number.isSafeInteger(dimensione)) { // chi chiama sa la dimensione (lo store dopo aver tolto il giornale)
        tenuti.delete(sessionId);
        attese.set(sessionId, { dimensione, sequenza: null });
      } else if (!nostro) {
        compromesso(sessionId);
      } else {
        tenuti.delete(sessionId);
        if (!scadutoPerTempo(mio, adesso())) {
          try { attese.set(sessionId, { dimensione: dimensioneGiornale(sessionId), sequenza: attese.get(sessionId)?.sequenza ?? null }); }
          catch { attese.delete(sessionId); }
        }
        // fermo oltre la scadenza ma il file è ancora nostro: la dimensione attesa resta quella delle nostre scritture
      }
      if (nostro) { try { unlinkSync(file); } catch { /* già via */ } }
      fermaBattitoSeVuoto();
      return true;
    },

    /** Una lettura INTERA del giornale ha visto `dimensione` byte (e `sequenza` come numero d'ordine più alto): la sessione è in pari. */
    ricordaDimensione(sessionId, dimensione, sequenza = null) {
      if (!Number.isSafeInteger(dimensione)) return;
      attese.set(sessionId, { dimensione, sequenza: Number.isSafeInteger(sequenza) ? sequenza : null });
      daRicaricareSet.delete(sessionId);
      adottate.delete(sessionId);
    },
    dimensioneNota(sessionId) { return attese.get(sessionId)?.dimensione ?? null; },
    /** Il giornale come lo sa questo processo: `{ dimensione, sequenza }` (la sequenza può essere `null`), o `null` se non lo sa. */
    statoAtteso(sessionId) { const atteso = attese.get(sessionId); return atteso ? { ...atteso } : null; },
    /**
     * Lo store ha accodato `byte` byte (con `sequenza`, se la riga ne ha una) partendo da un giornale di `prima` byte. La dimensione
     *   attesa cresce dei byte scritti; se non era nota, nasce da `prima`.
     */
    dopoScrittura(sessionId, { byte, sequenza = null, prima = null } = {}) {
      if (!Number.isSafeInteger(byte) || byte < 0) return;
      const atteso = attese.get(sessionId);
      const base = atteso && Number.isSafeInteger(atteso.dimensione) ? atteso.dimensione : prima;
      if (!Number.isSafeInteger(base)) { attese.delete(sessionId); return; }
      const sequenzaNota = Number.isSafeInteger(atteso?.sequenza) ? atteso.sequenza : null;
      const nuova = Number.isSafeInteger(sequenza) ? Math.max(sequenzaNota ?? sequenza, sequenza) : sequenzaNota;
      attese.set(sessionId, { dimensione: base + byte, sequenza: nuova });
    },
    /** Il recinto dello store ha visto il giornale diverso dall'atteso: la chat è da ricaricare e le scritture si fermano. */
    segnaCambiato(sessionId) { daRicaricareSet.add(sessionId); },
    /**
     * Il recinto ha LETTO la coda scritta altrove (dalla dimensione attesa a `dimensione`, numeri fino a `sequenza`): da qui si può
     *   accodare dopo di lei, ma la chat in memoria non ce l'ha ancora (`daRicaricare` resta vero finché una lettura intera non la
     *   rimette in pari).
     */
    adotta(sessionId, { dimensione, sequenza = null } = {}) {
      if (!Number.isSafeInteger(dimensione)) return;
      attese.set(sessionId, { dimensione, sequenza: Number.isSafeInteger(sequenza) ? sequenza : null });
      daRicaricareSet.delete(sessionId);
      adottate.add(sessionId);
    },
    /** Il giornale è cambiato rispetto alla dimensione nota (lo scrive un altro): `true` finché una lettura non lo rimette in pari. */
    daRicaricare(sessionId) { return daRicaricareSet.has(sessionId) || adottate.has(sessionId); },
    /** Lo store rifiuta le scritture (la coda scritta altrove non è stata ancora né letta né adottata). */
    scritturaBloccata(sessionId) { return daRicaricareSet.has(sessionId); },
    /** Come `daRicaricare`, ma misurato adesso, senza prendere l'affitto (per chi legge soltanto). */
    cambiatoAltrove(sessionId) {
      if (daRicaricareSet.has(sessionId) || adottate.has(sessionId)) return true;
      /* con l'affitto in mano, e rinfrescato entro la scadenza, il giornale cresce solo per le NOSTRE scritture. 13/11/2026 (pezzo 3):
         oltre la scadenza (un risveglio, prima del primo battito) non ci si fida: si misura */
      const mio = tenuti.get(sessionId);
      if (mio && !scadutoPerTempo(mio, adesso())) return false;
      const atteso = attese.get(sessionId);
      if (!atteso || !Number.isSafeInteger(atteso.dimensione)) return false;
      try { return dimensioneGiornale(sessionId) !== atteso.dimensione; } catch { return false; }
    },
    dimentica(sessionId) { attese.delete(sessionId); daRicaricareSet.delete(sessionId); adottate.delete(sessionId); },

    /** Un predicato «questa sessione è in uso qui» (un giro vivo, una ricerca): finché è vero l'affitto non si rilascia. */
    aggiungiInUso(predicato) { predicatiInUso.add(predicato); return () => predicatiInUso.delete(predicato); },

    /**
     * Un battito: rinfresca gli affitti tenuti e rilascia quelli inattivi. Esposto per i test.
     * 13/11/2026: PRIMA si guarda se l'affitto è ancora nostro e rinfrescato entro la scadenza (prima si rilasciava per primo, e il
     *   rilascio segnava la dimensione con dentro le scritture dell'altro); se no è COMPROMESSO.
     */
    battito() {
      const ora = adesso();
      for (const [sessionId, mio] of [...tenuti]) {
        const file = fileDi(sessionId);
        const attuale = leggiDetentore(file);
        if (attuale?.istanza !== istanza) { compromesso(sessionId); continue; }
        if (scadutoPerTempo(mio, ora)) {
          /* fermo oltre la scadenza ma il file dice ancora noi: nessuno l'ha preso (chi lo porta via lo rinomina e scrive il suo).
             Si rinfresca SUBITO e si rilegge, come in `prendi`: se nel frattempo l'hanno portato via (o rimesso perché rinfrescato,
             `portaVia`), la rilettura lo dice e l'affitto è compromesso. */
          try { utimesSync(file, new Date(ora), new Date(ora)); } catch { /* sparito: lo dice la rilettura */ }
          dopoIlRinfresco?.(file, sessionId);
          if (leggiDetentore(file)?.istanza !== istanza) { compromesso(sessionId); continue; }
          mio.ultimoRinfresco = ora;
        }
        const inUso = [...predicatiInUso].some((p) => { try { return p(sessionId) === true; } catch { return true; } });
        if (!inUso && ora - mio.ultimaAttivita >= rilascioDopoMs) { api.rilascia(sessionId); continue; }
        const quando = new Date(ora);
        utimesSync(file, quando, quando);
        mio.ultimoRinfresco = ora;
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
