import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * B1 (owner 10/10/2026, «le ultime 3 chat pronte, con un tetto di memoria»): una chat tenuta pronta riapre il flusso da dove l'aveva
 *   lasciato. `EventSource` non manda `Last-Event-ID` alla PRIMA apertura, quindi la rotta accetta `?after=<n>` (una chiave sola,
 *   come il flusso dei Workflow); alla riconnessione nativa `Last-Event-ID` vince.
 */
const SESSIONE = '0f0f0f0f-0000-4000-8000-0000000000b1';
let seq = 0;
const ev = (type, extra = {}) => ({ type, _sequenza: ++seq, ...extra });

async function banco(t) {
  const store = mkdtempSync(join(tmpdir(), 'talos-b1-dopo-'));
  t.after(() => rimuoviCartellaDiProva(store));
  seq = 0;
  const righe = [
    { tipo: 'intestazione', schema: 1, sessionId: SESSIONE, taskId: 'libero:b1', cartella: store, task: { consegna: 'ciao', consegnaCorta: 'ciao' },
      avviataAlle: '2026-10-10T08:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true },
    ev('RunStarted', { threadId: SESSIONE, runId: 'r1' }), ev('TextMessageContent', { messageId: 'm1', delta: 'uno' }), ev('RunFinished', { threadId: SESSIONE, runId: 'r1', result: { detto: 'uno' } }),
    ev('RunStarted', { threadId: SESSIONE, runId: 'r2' }), ev('TextMessageContent', { messageId: 'm2', delta: 'due' }), ev('RunFinished', { threadId: SESSIONE, runId: 'r2', result: { detto: 'due' } }),
  ];
  writeFileSync(join(store, `${SESSIONE}.jsonl`), righe.map((r) => `${JSON.stringify(r)}\n`).join(''));
  const registro = createSessionRegistry({ cartellaStore: store, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  await registro.ripristina();
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registro }));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); }));
  return `http://127.0.0.1:${server.address().port}`;
}

/* Legge il flusso fino al confine della storia e torna le sequenze degli eventi arrivati prima. */
async function sequenzeFinoAlConfine(url, headers = {}) {
  const controller = new AbortController();
  const risposta = await fetch(url, { headers, signal: controller.signal });
  if (!risposta.ok) { const corpo = await risposta.text().catch(() => ''); controller.abort(); return { status: risposta.status, corpo }; }
  const lettore = risposta.body.getReader();
  const decoder = new TextDecoder();
  let testo = '';
  const sequenze = [];
  try {
    for (;;) {
      const { value, done } = await lettore.read();
      if (done) break;
      testo += decoder.decode(value, { stream: true });
      let fine;
      while ((fine = testo.indexOf('\n\n')) >= 0) {
        const frame = testo.slice(0, fine); testo = testo.slice(fine + 2);
        const dati = frame.split('\n').filter((r) => r.startsWith('data: ')).map((r) => r.slice(6)).join('\n');
        if (!dati) continue;
        const evento = JSON.parse(dati);
        if (evento.type === 'CUSTOM' && evento.name === 'talos.fine-rigiocata') return { status: 200, sequenze };
        if (typeof evento._sequenza === 'number') sequenze.push(evento._sequenza);
      }
    }
  } finally { controller.abort(); }
  return { status: 200, sequenze };
}

test('B1-DOPO-01: ?after=<n> on the first opening sends only the events after n, then the history boundary', async (t) => {
  const base = await banco(t);
  const tutti = await sequenzeFinoAlConfine(`${base}/api/v1/sessions/${SESSIONE}/events`);
  assert.deepEqual(tutti.sequenze, [1, 2, 3, 4, 5, 6], 'premise: without a cursor, the whole history');
  const dopo = await sequenzeFinoAlConfine(`${base}/api/v1/sessions/${SESSIONE}/events?after=3`);
  assert.deepEqual(dopo.sequenze, [4, 5, 6]);
  const niente = await sequenzeFinoAlConfine(`${base}/api/v1/sessions/${SESSIONE}/events?after=6`);
  assert.deepEqual(niente.sequenze, [], 'a chat that is already up to date gets nothing old, only the boundary');
});

test('B1-DOPO-02: Last-Event-ID (a native reconnection) wins over ?after', async (t) => {
  const base = await banco(t);
  const esito = await sequenzeFinoAlConfine(`${base}/api/v1/sessions/${SESSIONE}/events?after=1`, { 'Last-Event-ID': '5' });
  assert.deepEqual(esito.sequenze, [6]);
});

test('B1-DOPO-03: anything but one non-negative integer `after` is QUERY_INVALID', async (t) => {
  const base = await banco(t);
  for (const q of ['after=abc', 'after=-1', 'after=1&after=2', 'dopo=1', 'after=1&x=2', 'after=']) { // `after=` vuoto: review del desktop
    const esito = await sequenzeFinoAlConfine(`${base}/api/v1/sessions/${SESSIONE}/events?${q}`);
    assert.equal(esito.status, 400, q);
    assert.match(esito.corpo, /QUERY_INVALID/u, q);
  }
});
