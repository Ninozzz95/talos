/*
 * Un ALTRO processo TALOS sullo stesso archivio, per `tests/affitto-archivio.test.mjs` (10/10/2026).
 * argv: <cartellaStore> <sessionId> <modo> [righeJson]
 *   · `tieni`: accende l'affitto, scrive una riga ogni 15 ms finché non lo uccidono; stampa `PRONTO <pid>` alla prima riga.
 *   · `a-meta`: scrive una riga intera e META' della successiva, e resta vivo (un append sorpreso a metà, deterministico).
 *   · `scrivi-ed-esci`: scrive le righe date (un array JSON) e esce rilasciando l'affitto; stampa `FATTO`.
 */
import { attivaAffittiArchivio, registraRiga } from '../../src/session-store.mjs';

const [cartellaStore, sessionId, modo, righeJson = '[]'] = process.argv.slice(2);
attivaAffittiArchivio(cartellaStore, { etichetta: 'the test child', battitoMs: 200 });

if (modo === 'tieni') {
  let n = 0;
  await registraRiga({ cartellaStore, sessionId, record: { tipo: 'nota-figlio', n: n++ } });
  process.stdout.write(`PRONTO ${process.pid}\n`);
  // righe lunghe: un append che il lettore può sorprendere a metà
  const lunga = 'x'.repeat(256 * 1024);
  setInterval(() => { void registraRiga({ cartellaStore, sessionId, record: { tipo: 'nota-figlio', n: n++, lunga } }).catch(() => {}); }, 15);
} else if (modo === 'a-meta') {
  // un append SORPRESO a metà, deterministico: la riga intera, poi metà della successiva scritta a mano, e si resta lì
  await registraRiga({ cartellaStore, sessionId, record: { tipo: 'nota-figlio', n: 0 } });
  const { appendFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  appendFileSync(join(cartellaStore, `${sessionId}.jsonl`), '{"tipo":"nota-figlio","n":1,"testo":"a me');
  process.stdout.write(`PRONTO ${process.pid}\n`);
  setInterval(() => {}, 1_000);
} else if (modo === 'scrivi-ed-esci') {
  for (const record of JSON.parse(righeJson)) await registraRiga({ cartellaStore, sessionId, record });
  process.stdout.write('FATTO\n');
  process.exit(0); // l'uscita rilascia l'affitto (`process.once('exit')` dello store)
} else {
  process.stderr.write(`unknown mode ${modo}\n`);
  process.exit(2);
}
