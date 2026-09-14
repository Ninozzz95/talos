import { rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';

/*
 * BC-09 — la rimozione della cartella temporanea di un test, coi ritentativi che Windows richiede.
 *
 * 13/09/2026 — il job del tag `desktop-v0.1.2` e' morto ai cancelli con UN solo test rosso su
 * 2881: `LOCAL-RESUME-JSON-02` in `tests/session-registry.test.mjs`. Non era il prodotto, era la
 * PULIZIA del test: `rmSync(cartella, { recursive: true, force: true })` uscito con ENOTEMPTY.
 * La spia che era una CORSA e non un difetto: lo stesso test passava in locale ed era passato sul
 * runner al giro precedente.
 *
 * `maxRetries` e `retryDelay` sono le opzioni ufficiali di `rm`/`rmSync` per questo caso
 * (documentazione Node v24, modulo fs, letta il 13/09/2026 — «If an EBUSY, EMFILE, ENFILE,
 * ENOTEMPTY, or EPERM error is encountered, Node.js will retry the operation with a linear
 * backoff wait of retryDelay milliseconds longer on each try… Default: 0», cioe' di serie NON
 * si ritenta nemmeno una volta).
 *
 * ⛔⛔ CIO' CHE E' STATO MISURATO SU QUESTA MACCHINA, e non dedotto (Windows 11, Node v24.18.0,
 * 13/09/2026; gli script stanno nello scratchpad della sessione, i numeri sono quelli letti):
 *
 *   1. ⛔ UN FILE APERTO **NON** BLOCCA PIU' LA RIMOZIONE. Cinque premesse provate — handle di
 *      file aperto (`openSync` r+), `fs.watch` sulla cartella, `fs.watch` su una sottocartella,
 *      200 file, cartella normale: TUTTE hanno dato «nessun errore, cartella sparita». Chi scrive
 *      una prova su «apro un file e la cancellazione fallisce» scrive una prova VERDE PER IL
 *      MOTIVO SBAGLIATO. (E' esattamente cio' che era stato scritto qui prima di questa nota: due
 *      prove su quattro erano ROSSE per questo, misurato lanciandole.)
 *   2. ✅ DUE premesse producono davvero l'errore: un PROCESSO con il cwd dentro la cartella
 *      (`rmSync` → EPERM, `rm` → EBUSY) e uno SCRITTORE concorrente che crea file mentre si
 *      cancella (→ ENOTEMPTY, lo stesso codice del runner).
 *   3. ⛔⛔ I RITENTATIVI NON COPRONO TUTTO, e l'asimmetria e' MISURATA, non supposta:
 *        · ENOTEMPTY: ritentato da entrambi (`rmSync` 131 ms → riuscita a 157 ms; `rm` 62 ms →
 *          riuscita a 242 ms, col disturbo che finiva a 400 ms);
 *        · processo col cwd dentro: `rm` (asincrona) vede EBUSY, ritenta e recupera (303 ms);
 *          ⛔ `rmSync` vede EPERM e **non ritenta affatto** — fallisce in 1 ms, 8 giri su 8, con
 *          `maxRetries: 20`. Su Windows la via sincrona passa per la correzione EPERM e rilancia.
 *      ⇒ Per una cartella tenuta aperta da un PROCESSO, la via sincrona non ha cura: e' un limite
 *        dichiarato, non un difetto di questo aiuto. La via giusta e' non lasciare processi vivi.
 *
 * ⛔ Un aiuto che INGHIOTTE sempre sarebbe peggio del guasto che cura: un ritentativo silenzioso
 * nasconderebbe anche il caso vero — un file che nessuno ha chiuso — che invece e' una cosa da
 * sapere. Quindi qui:
 *   1. il PRIMO tentativo e' quello di prima, senza ritentativi: se la cartella e' pulita come
 *      dovrebbe, non cambia niente e non costa niente;
 *   2. solo se esce uno dei codici della corsa si ritenta, e il ritentativo LASCIA UN AVVISO su
 *      stderr con il nome della cartella e il codice — la corsa resta visibile, non sparisce;
 *   3. se dopo i ritentativi la cartella resta piena, l'errore ARRIVA AL CHIAMANTE e il test
 *      diventa rosso, esattamente come prima.
 *
 * ⛔ E NON si adotta ovunque: dove la prova tiene viva una risorsa che il PRODOTTO deve chiudere
 * (un server, un watcher, un runtime, un processo figlio, un browser), una cancellazione fallita
 * e' il sintomo, non il rumore, e deve restare rossa SUBITO. L'elenco di quei file — con il
 * motivo, uno per uno — sta in `tests/bc09-classificazione-rimozioni.test.mjs`, che lo fa
 * rispettare in tutti e due i versi.
 *
 * La prova di questo aiuto e' `tests/aiuto-rimozione-ritentativi.test.mjs`: sei prove, quattro sul
 * contratto (con la primitiva iniettata, quindi deterministiche) e due sul filesystem vero con le
 * premesse misurate qui sopra.
 */

const CODICI_DELLA_CORSA = new Set(['EBUSY', 'EMFILE', 'ENFILE', 'ENOTEMPTY', 'EPERM']);
const RITENTATIVI = { maxRetries: 10, retryDelay: 50 };
const SENZA_RITENTATIVI = { recursive: true, force: true };
const CON_RITENTATIVI = { ...SENZA_RITENTATIVI, ...RITENTATIVI };

function avvisa(cartella, errore) {
  process.emitWarning(
    `rimozione di prova riuscita solo dopo i ritentativi (${errore.code}): ${cartella} — qualcuno ha lasciato un handle aperto`,
    'RimozioneDiProvaRitentata',
  );
}

/**
 * Rimuove una cartella di prova. Sincrona, per i `finally` e i teardown sincroni.
 * `rimuovi` esiste solo per la prova del contratto: in produzione e' sempre `rmSync`.
 */
export function rimuoviCartellaDiProva(cartella, { rimuovi = rmSync } = {}) {
  try {
    rimuovi(cartella, SENZA_RITENTATIVI);
  } catch (errore) {
    if (!CODICI_DELLA_CORSA.has(errore?.code)) throw errore;
    rimuovi(cartella, CON_RITENTATIVI);
    avvisa(cartella, errore);
  }
}

/** La stessa cosa per i teardown asincroni, che gia' aspettavano `rm` di `node:fs/promises`. */
export async function rimuoviCartellaDiProvaAttesa(cartella, { rimuovi = rm } = {}) {
  try {
    await rimuovi(cartella, SENZA_RITENTATIVI);
  } catch (errore) {
    if (!CODICI_DELLA_CORSA.has(errore?.code)) throw errore;
    await rimuovi(cartella, CON_RITENTATIVI);
    avvisa(cartella, errore);
  }
}
