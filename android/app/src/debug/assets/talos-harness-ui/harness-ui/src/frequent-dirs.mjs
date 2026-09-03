/**
 * frequent-dirs.mjs — owner, coda del piano `elegant-spinning-dongarra.md`:
 * "nella lista file quando si crea una sessione, bisogna mettere directory
 * più usate (tipo desktop downloads etc)". Solo LETTURA, solo suggerimenti:
 * questo file non decide se una cartella è AMMESSA — quello resta
 * `custom-task.mjs`/`avviaLibero` (permesso "Full access", vedi la sua doc
 * sul perché niente denylist), qui si limita a proporre percorsi VERI e
 * VERIFICATI, mai una scorciatoia verso il nulla.
 *
 * ⛔ Deliberatamente SEPARATO da `config.mjs#parseCartelleProgetto`: quella
 * è l'allowlist fissa dell'amministratore, validata fail-closed all'AVVIO
 * del server. Questa è un elenco DINAMICO, calcolato a ogni richiesta
 * dalle cartelle utente standard di Windows (`os.homedir()`) — le due
 * liste non si mescolano MAI: le cartelle frequenti sono solo suggerimenti
 * per il campo "Full access" (percorso a piacere), non una seconda
 * allowlist che aggirerebbe il permesso.
 *
 * ⭐ 29/8 — porta canonico verbatim (b3df4e98, ledger §27/§28-bis): copia
 * embedded on-device. Su questo Node bundlato per Android, `os.homedir()`
 * risolve alla home del processo (non "Desktop/Downloads/Documents" in
 * senso Windows) — la funzione resta comunque ONESTA per costruzione:
 * `statSyncFn(...).isDirectory()` fallisce in silenzio e la cartella non
 * compare, mai un percorso inventato. Se su questo device nessuna delle
 * tre sottocartelle esiste, l'elenco torna vuoto — esito legittimo, non
 * un bug.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { statSync } from 'node:fs';

/**
 * ⭐ Le stesse quattro cartelle che ogni file manager Windows mostra per
 * default nella barra laterale ("Quick access") — non inventate, sono i
 * nomi di cartella standard sotto il profilo utente su ogni installazione
 * Windows moderna.
 */
const CANDIDATE = Object.freeze([
  { etichetta: 'Desktop', sottocartella: 'Desktop' },
  { etichetta: 'Download', sottocartella: 'Downloads' },
  { etichetta: 'Documenti', sottocartella: 'Documents' },
]);

/**
 * @param {{homedirFn?: typeof homedir, statSyncFn?: typeof statSync}} [deps] — SOLO per test.
 * @returns {Array<{etichetta:string, percorso:string}>} — SOLO le cartelle che esistono
 *   davvero sul disco in questo momento, mai una candidata a occhio: una
 *   cartella Download cancellata dall'owner non deve comparire come
 *   scorciatoia verso il nulla.
 */
export function cartelleFrequenti({ homedirFn = homedir, statSyncFn = statSync } = {}) {
  const home = homedirFn();
  const trovate = [];
  for (const { etichetta, sottocartella } of CANDIDATE) {
    const percorso = join(home, sottocartella);
    try {
      if (statSyncFn(percorso).isDirectory()) trovate.push({ etichetta, percorso });
    } catch {
      // ⛔ non esiste o non leggibile: si salta, mai un errore che blocca le altre — stesso principio di ogni altra lista "onesta" di questo progetto.
    }
  }
  return trovate;
}
