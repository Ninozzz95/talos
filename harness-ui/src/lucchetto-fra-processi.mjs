/**
 * Un lucchetto FRA PROCESSI su un file: un lavoro alla volta fra tutti i processi TALOS che condividono lo stesso file.
 *
 * Nato il 13/10/2026 per il rinnovo di ChatGPT (`chatgpt-lucchetto-rinnovo.mjs`, che ora lo usa); reso generico il 27/10/2026 per i file
 * del controllo remoto (`consents.json`, `phones.json`), che la finestra e `talos remote` della CLI scrivono insieme: la revisione del
 * blocco 9 (E-R1) ha visto una cartella revocata dal terminale tornare consentita 16 volte su 20, e un telefono revocato tornare ammesso
 * 20 su 20. Hermes chiude la stessa gara col suo `_locked()` attorno a lettura → modifica → scrittura (`gateway/pairing.py:376-388`: «the
 * CLI runs in its own process, so self._lock alone is not enough»; `hermes_cli/auth.py:659-716`, `flock`/`msvcrt.locking`). Node non ha
 * un `flock`: la forma è quella della CLI (`cli/src/provider/chatgpt-plan.ts`, `withRenewalLock`/`takeOver`) e di `session-lease.mjs`.
 *   · chi CREA il file in esclusiva (`wx`) tiene il lucchetto; chi lo trova aspetta e riprova;
 *   · un lucchetto ABBANDONATO (pid che su questo host non esiste più, o file più vecchio della scadenza) si prende — sotto un secondo
 *     file di guardia, perché due processi che lo prendono insieme non si cancellino il lucchetto nuovo a vicenda;
 *   · oltre l'attesa massima: l'errore col codice di chi chiama (riprovabile);
 *   · ⛔ se il MECCANISMO non funziona (cartella non scrivibile) si lascia passare, come Hermes (`cli.py:933-935`): il lucchetto protegge
 *     una gara rara, non deve diventare il motivo per cui una funzione non si usa;
 *   · si toglie SOLO il proprio (gettone): se nel frattempo è scaduto e un altro l'ha preso, quello è suo.
 *
 * Nel file: `{ pid, host, at, token }`. Nessun segreto.
 */
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { dirname } from 'node:path';

import { processoVivoPredefinito } from './session-lease.mjs';

const GUARDIA = '.presa';
const GUARDIA_VECCHIA_MS = 5_000;
const ILLEGGIBILE_VECCHIO_MS = 2_000;

const esiste = (file) => { try { statSync(file); return true; } catch { return false; } };
const eta = (file) => { try { return Date.now() - statSync(file).mtimeMs; } catch { return null; } };
const creaEsclusivo = (file, testo, tentativo = 1) => {
  try { writeFileSync(file, testo, { flag: 'wx' }); return true; }
  catch (guasto) {
    if (guasto?.code === 'EEXIST') return false;
    /* il file sparito proprio fra il rifiuto e il controllo (l'altro l'ha appena tolto): un secondo tentativo, prima di dire «non funziona» */
    if ((guasto?.code === 'EPERM' || guasto?.code === 'EBUSY') && !esiste(file) && tentativo < 2) return creaEsclusivo(file, testo, tentativo + 1);
    /* EPERM/EBUSY su Windows: l'altro lo sta togliendo proprio adesso ⇒ come «c'è», si riprova. ⛔ C-R1 (revisione del blocco 10,
       27/10/2026): MA solo se il file c'è davvero. In una cartella dove non si possono creare file (ACL, sola lettura) Windows dice
       EPERM con il file ASSENTE: è il meccanismo che non funziona, e la promessa in testa è lasciar passare — prima si aspettavano
       10 s e si diceva «un'altra finestra», falso. */
    if ((guasto?.code === 'EPERM' || guasto?.code === 'EBUSY') && esiste(file)) return false;
    throw guasto;
  }
};
const leggi = (file) => { try { const o = JSON.parse(readFileSync(file, 'utf8')); return o && typeof o === 'object' ? o : null; } catch { return null; } };

/**
 * @param {object} opzioni
 * @param {string} opzioni.file il file del lucchetto: lo stesso per tutti i processi che condividono la risorsa
 * @param {number} opzioni.attesaMs quanto si aspetta prima di arrendersi
 * @param {number} opzioni.scadenzaMs oltre questa età un lucchetto si considera abbandonato
 * @param {string} opzioni.codice il codice dell'errore quando l'attesa finisce
 * @param {string} opzioni.messaggio la frase di quell'errore
 * @returns {<T>(lavoro: () => Promise<T>) => Promise<T>} esegue `lavoro` tenendo il lucchetto
 */
export function creaLucchettoFraProcessi({
  file, attesaMs, riprovaMs = 50, scadenzaMs, codice, messaggio,
  processoVivo = processoVivoPredefinito, pid = process.pid, host = hostname(),
} = {}) {
  const abbandonato = () => {
    const anni = eta(file);
    if (anni === null) return false; // non c'è più: il giro dopo lo crea
    const chi = leggi(file);
    if (!chi) return anni > ILLEGGIBILE_VECCHIO_MS; // a metà scrittura è illeggibile per un attimo: solo se resta così
    if (chi.host === host && Number.isSafeInteger(chi.pid) && !processoVivo(chi.pid)) return true;
    return anni > scadenzaMs;
  };
  const prendiAbbandonato = () => {
    const guardia = file + GUARDIA;
    let mia = false;
    try { mia = creaEsclusivo(guardia, JSON.stringify({ pid, at: Date.now() })); } catch { return; }
    if (!mia) {
      const anni = eta(guardia);
      if (anni !== null && anni > GUARDIA_VECCHIA_MS) { try { rmSync(guardia, { force: true }); } catch { /* l'ha tolta un altro */ } }
      return;
    }
    try { if (abbandonato()) rmSync(file, { force: true }); }
    catch { /* resta: il giro dopo riprova */ }
    finally { try { rmSync(guardia, { force: true }); } catch { /* una guardia vecchia la toglie il prossimo */ } }
  };

  return async function conLucchetto(lavoro) {
    const gettone = randomUUID();
    const inizio = Date.now();
    let tenuto = false;
    for (;;) {
      let creato;
      try { mkdirSync(dirname(file), { recursive: true }); creato = creaEsclusivo(file, JSON.stringify({ pid, host, at: Date.now(), token: gettone })); }
      catch { break; } // il meccanismo non funziona: si lascia passare (vedi in testa)
      if (creato) { tenuto = true; break; }
      if (abbandonato()) prendiAbbandonato();
      if (Date.now() - inizio >= attesaMs) throw Object.assign(new Error(messaggio), { code: codice });
      await new Promise((r) => setTimeout(r, riprovaMs));
    }
    try { return await lavoro(); }
    finally {
      if (tenuto) { try { if (leggi(file)?.token === gettone) rmSync(file, { force: true }); } catch { /* lo prenderà il prossimo come abbandonato */ } }
    }
  };
}
