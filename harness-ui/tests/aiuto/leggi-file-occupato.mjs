import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

/*
 * Legge un file che un ALTRO processo può ancora tenere aperto (CI #91, 09/11/2026: GS-06/08/09 rosso su Windows con EBUSY: il `set > file`
 * lanciato dalla rotta della shell teneva ancora `ambiente.txt` quando la prova lo scansionava). Su Windows la violazione di condivisione
 * arriva come EBUSY e sparisce appena il figlio chiude il file: si aspetta con un tetto, poi si FALLISCE con l'ultimo errore.
 * ⛔ Mai saltare il file e mai restituire un contenuto vuoto: «il gettone non è in nessun file» vale solo se li ha letti tutti.
 * Ogni altro codice (ENOENT, EACCES, EISDIR…) non passa aspettando: esce subito.
 * Hermes fa la stessa cosa con le stesse attese: `scripts/build/frontend-common.mjs:83-99` (`retryHeld`, [100, 200, 400, 800, 1600],
 * poi rilancia l'errore) e `hermes_cli/main_desktop.py:201-209` («retries a transient PermissionError with bounded backoff; re-raises
 * the last one»).
 * `leggi` e `attese` esistono solo per la prova del contratto (`tests/aiuto-leggi-file-occupato.test.mjs`).
 */
export const ATTESE_FILE_OCCUPATO_MS = Object.freeze([100, 200, 400, 800, 1600]);

export async function leggiFileOccupato(percorso, { leggi = readFileSync, attese = ATTESE_FILE_OCCUPATO_MS } = {}) {
  for (const attesa of [...attese, undefined]) {
    try {
      return leggi(percorso);
    } catch (errore) {
      if (attesa === undefined || errore?.code !== 'EBUSY') throw errore;
      await delay(attesa);
    }
  }
  throw new Error('irraggiungibile');
}
