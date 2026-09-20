/*
 * ⛔ LA MISURA LUNGA DELLA ROTTA SSE — non entra nella suite perché dura oltre 135 secondi.
 *
 * Domanda: con il battito ogni 15 s (`INTERVALLO_BATTITO_SSE_MS`) e i tempi che `server.mjs`
 * dichiara, un canale SSE regge oltre i vecchi muri (60 s del fornitore, 120 s del vecchio default
 * `server.timeout`, 180 s del kernel) senza che Node chiuda il socket?
 *
 * ⛔ Client VERO su porta effimera, mai il 4174. Si contano i battiti arrivati DALL'ALTRA PARTE,
 *   non quelli scritti: scrivere e arrivare sono due misure diverse.
 *
 * Uso:  node tests/aiuto/misura-sse-oltre-130s-corsia-d.mjs
 */
import { createServer } from 'node:http';
import { once } from 'node:events';

import { TEMPI_SERVER_HTTP, applicaTempiDelServer, createSseSession } from '../../src/http-lifecycle.mjs';

const DURATA_MS = 135_000;          // oltre i 130 s chiesti, e oltre i 120 s del vecchio server.timeout
const BATTITO_MS = 15_000;          // lo stesso INTERVALLO_BATTITO_SSE_MS di http-app.mjs

const server = createServer((req, res) => {
  const sessione = createSseSession({ response: res, heartbeatMs: BATTITO_MS });
  sessione.start();
  setTimeout(() => { sessione.close(); res.end(); }, DURATA_MS).unref();
});
const applicati = applicaTempiDelServer(server);
console.log('tempi chiesti :', JSON.stringify(TEMPI_SERVER_HTTP));
console.log('tempi applicati:', JSON.stringify(applicati));

server.listen(0, '127.0.0.1');
await once(server, 'listening');
const porta = server.address().port;
if ([4174, 4177, 9333].includes(porta)) throw new Error('porta riservata');
console.log('porta effimera:', porta);

const t0 = Date.now();
const risposta = await fetch(`http://127.0.0.1:${porta}/api/v1/events`);
const lettore = risposta.body.getReader();
const decoder = new TextDecoder();
let battiti = 0;
let ultimoByteMs = 0;
let errore = null;
try {
  while (true) {
    const { done, value } = await lettore.read();
    if (done) break;
    ultimoByteMs = Date.now() - t0;
    const testo = decoder.decode(value, { stream: true });
    battiti += testo.split(':battito').length - 1;
    if (battiti && battiti % 3 === 0) console.log(`  ${battiti} battiti arrivati a ${ultimoByteMs} ms`);
  }
} catch (e) {
  errore = e;
}
const durata = Date.now() - t0;
console.log(`ESITO : ${errore ? `INTERROTTO (${errore.cause?.code ?? errore.code ?? errore.name}: ${errore.message})` : 'CHIUSO DAL SERVER'}`);
console.log(`        durata ${durata} ms · battiti ricevuti ${battiti} · ultimo byte a ${ultimoByteMs} ms`);
console.log(`        atteso: ~${Math.floor(DURATA_MS / BATTITO_MS)} battiti, durata >= ${DURATA_MS} ms, nessun errore`);
server.closeAllConnections();
server.close();
