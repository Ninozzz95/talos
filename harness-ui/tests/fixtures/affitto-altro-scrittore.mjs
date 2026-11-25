/*
 * Un ALTRO processo TALOS VERO che scrive giri suoi nello stesso giornale, per `tests/affitto-mai-scartare.test.mjs` (13/11/2026).
 * argv: <cartellaStore>
 *   È il caso che la forma assegna al recinto: un TALOS il cui affitto non funziona (il meccanismo che fallisce, `catch { return; }`
 *   di `garantisciAffittoPerScrittura`, o l'affitto cancellato a mano) e che quindi scrive senza affitto. Qui l'affitto NON si accende:
 *   lo store vero scrive senza recinto, numerando dal più alto sul disco, come lo farebbe quel processo.
 *   Comandi via IPC (`process.send`): `{ giro: <testo>, sessionId }` ⇒ accoda un giro di 5 eventi (una scrittura vera per riga) e
 *   risponde `{ fatto: <ultimo numero> }`; `{ fine: true }` ⇒ esce. All'avvio manda `{ pronto: pid }`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registraRiga } from '../../src/session-store.mjs';

const [cartellaStore] = process.argv.slice(2);
const ultimoSulDisco = (sessionId) => {
  let massimo = 0;
  for (const testo of readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').split('\n')) {
    if (!testo) continue;
    try { const n = JSON.parse(testo)._sequenza; if (Number.isSafeInteger(n) && n > massimo) massimo = n; } catch { /* una riga a metà di chi scrive adesso */ }
  }
  return massimo;
};

process.on('message', async (messaggio) => {
  if (messaggio?.fine) { process.exit(0); }
  const { sessionId, giro: detto } = messaggio ?? {};
  let n = ultimoSulDisco(sessionId);
  const runId = `altrove-${n}`;
  const messageId = `m-altrove-${n}`;
  const ev = (type, extra) => ({ type, _sequenza: ++n, ...extra });
  const giro = [ev('RunStarted', { threadId: sessionId, runId }), ev('TextMessageStart', { messageId, role: 'assistant' }),
    ev('TextMessageContent', { messageId, delta: detto }), ev('TextMessageEnd', { messageId }),
    ev('RunFinished', { threadId: sessionId, runId, result: { detto } })];
  for (const record of giro) await registraRiga({ cartellaStore, sessionId, record });
  process.send({ fatto: n });
});
process.send({ pronto: process.pid });
