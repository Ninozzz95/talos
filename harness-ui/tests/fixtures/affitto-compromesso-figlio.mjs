/*
 * Un ALTRO processo TALOS che si FERMA oltre la scadenza tenendo l'affitto, per `tests/affitto-compromesso.test.mjs` (13/11/2026).
 * argv: <cartellaStore> <sessionId>
 *   Accende l'affitto con una scadenza corta (600 ms, battito 100 ms), scrive tre righe numerate 1..3, stampa `FERMO`, poi blocca il
 *   proprio ciclo per 2 s (`Atomics.wait`: niente battiti, come un PC sospeso o un programma bloccato). Al risveglio scrive la riga 4
 *   col SUO contatore (vecchio) e stampa `ESITO <codice dell'errore | SCRITTA>`. Esce da solo.
 */
import { attivaAffittiArchivio, registraRiga } from '../../src/session-store.mjs';

const [cartellaStore, sessionId] = process.argv.slice(2);
attivaAffittiArchivio(cartellaStore, { etichetta: 'the stalled child', battitoMs: 100, scadenzaMs: 600 });

for (let n = 1; n <= 3; n += 1) await registraRiga({ cartellaStore, sessionId, record: { type: 'X', da: 'figlio', _sequenza: n } });
process.stdout.write('FERMO\n');
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
await new Promise((r) => setTimeout(r, 150)); // i timer arretrati (il battito) girano come al risveglio vero
let esito = 'SCRITTA';
try { await registraRiga({ cartellaStore, sessionId, record: { type: 'X', da: 'figlio-sveglio', _sequenza: 4 } }); }
catch (errore) { esito = errore?.code ?? 'ERRORE'; }
process.stdout.write(`ESITO ${esito}\n`);
process.exit(0);
