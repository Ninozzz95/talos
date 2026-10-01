import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chiamaConRitenta, talosLavora } from '../src/kernel/talosHarness.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const risposta = (status) => status === 200
  ? Response.json({ choices: [{ message: { role: 'assistant', content: 'Verifica conclusa.' }, finish_reason: 'stop' }] })
  : new Response('private-provider-body-must-not-leak', { status, headers: { 'Retry-After': '2' } });
function banco(statuses, extra = {}) {
  const events = [], requests = [];
  return { events, requests, run: () => chiamaConRitenta({
    modello: 'test/model', chiave: 'test-secret-never-in-event', messaggi: [], attrezzi: [],
    fetchDiRete: async () => { requests.push(Date.now()); return risposta(statuses[Math.min(requests.length - 1, statuses.length - 1)]); },
    dormi: async () => {}, caso: () => 0,
    onRitenta: e => events.push(e), ...extra,
  }) };
}

test('RETRY06-EVENTS: attesa prima del sonno, invio prima del fetch, fine una sola volta', async () => {
  const b = banco([503, 200], { dormi: async () => {
    assert.equal(b.requests.length, 1);
    assert.equal(b.events.at(-1)?.fase, 'attesa');
  } });
  const before = Date.now();
  const result = await b.run();
  assert.equal(result.tentativi, 2);
  assert.deepEqual(b.events.map(e => e.fase), ['attesa', 'invio', 'fine']);
  assert.equal(b.events[0].tentativo, 2);
  assert.equal(b.events[0].tentativiMassimi, 4);
  assert.equal(b.events[0].httpStatus, 503);
  assert.equal(b.events[0].attesaMs, 2000);
  assert.ok(b.events[0].retryAt >= before + 2000 && b.events[0].retryAt <= Date.now() + 2000);
  assert.equal(new Set(b.events.map(e => e.requestId)).size, 1);
  assert.match(b.events[0].requestId, /^[\da-f-]{36}$/u);
  assert.doesNotMatch(JSON.stringify(b.events), /test-secret|private-provider-body/u);
});

test('RETRY06-EXHAUSTED: tre attese, quattro richieste e un solo fine', async () => {
  const b = banco([503]);
  await assert.rejects(b.run(), e => e.stato === 503);
  assert.equal(b.requests.length, 4);
  assert.deepEqual(b.events.filter(e => e.fase === 'attesa').map(e => e.tentativo), [2, 3, 4]);
  assert.equal(b.events.filter(e => e.fase === 'fine').length, 1);
});

test('RETRY06-STOP: attesa chiusa senza annunciare o inviare il secondo tentativo', async () => {
  const stop = new AbortController();
  const b = banco([429], { segnaleStop: stop.signal, dormi: async () => stop.abort() });
  await assert.rejects(b.run(), e => e.fermatoSuRichiesta);
  assert.equal(b.requests.length, 1);
  assert.deepEqual(b.events.map(e => e.fase), ['attesa', 'fine']);
});

for (const status of [200, 401, 402]) test(`RETRY06-NO-SPURIOUS-${status}`, async () => {
  const b = banco([status]);
  if (status === 200) await b.run(); else await assert.rejects(b.run());
  assert.deepEqual(b.events, []);
  assert.equal(b.requests.length, 1);
});

test('RETRY06-OBSERVER: un osservatore guasto non ripete richieste né cambia il risultato', async () => {
  for (const onRitenta of [() => { throw Error('observer'); }, async () => { throw Error('observer'); }]) {
    const b = banco([503, 200], { onRitenta });
    assert.equal((await b.run()).scelta.content, 'Verifica conclusa.');
    assert.equal(b.requests.length, 2);
  }
});

test('RETRY06-NETWORK-AFTER-WAIT: la fine si pubblica anche se il nuovo fetch fallisce', async () => {
  let n = 0;
  const b = banco([], { fetchDiRete: async () => { if (++n === 1) return risposta(503); throw Error('network'); } });
  await assert.rejects(b.run(), /network/u);
  assert.deepEqual(b.events.map(e => e.fase), ['attesa', 'invio', 'fine']);
  assert.equal(n, 2);
});

test('RETRY06-FALLBACK-IDENTITY: ogni provider chiude la propria richiesta senza confondere il successivo', async () => {
  let n = 0;
  const events = [];
  const transport = async (_url, request) => {
    n++;
    const modello = JSON.parse(request.body).model;
    if (modello === 'fallback/model' && n === 4) return risposta(200);
    if (n > 1 && modello === 'test/model') assert.equal(events.at(-1)?.fase, 'invio');
    return risposta(503);
  };
  transport.eseguiConFallback = async call => {
    try { return await call({ tentativiMassimi: 2 }); }
    catch { return call({ modello: 'fallback/model', tentativiMassimi: 2 }); }
  };
  await chiamaConRitenta({ modello: 'test/model', chiave: 'test-key', messaggi: [], attrezzi: [],
    fetchDiRete: transport, dormi: async () => {}, onRitenta: e => events.push(e), caso: () => 0 });
  assert.deepEqual(events.map(e => e.fase), ['attesa', 'invio', 'fine', 'attesa', 'invio', 'fine']);
  assert.ok(events.slice(0, 3).every(e => e.modello === 'test/model'));
  assert.ok(events.slice(3).every(e => e.modello === 'fallback/model'));
  assert.equal(new Set(events.map(e => e.requestId)).size, 2);
  assert.equal(n, 4);
});

test('RETRY06-SERVICE: kernel reale traduce i tentativi nel run AG-UI corretto', async t => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-retry06-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const events = [];
  let n = 0;
  await avviaSessione({ cartella, task: { consegna: 'Verifica e rispondi senza strumenti.' }, modello: 'test/model', chiave: 'test-key',
    onEvento: e => events.push(e),
    talosLavoraFn: opts => talosLavora({ ...opts, giriMassimi: 1, fetchDiRete: async () => ++n === 1
      ? new Response('private-provider-body-must-not-leak', { status: 503 }) : new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content: 'Verifica conclusa.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
        { headers: { 'Content-Type': 'text/event-stream' } }) }),
  });
  const start = events.find(e => e.type === 'RunStarted');
  const retries = events.filter(e => e.name === 'talos.provider-retry');
  assert.deepEqual(retries.map(e => e.value.fase), ['attesa', 'invio', 'fine']);
  for (const e of retries) {
    assert.equal(e.type, 'CUSTOM');
    assert.equal(e.value.schema, 'talos.provider-retry.v1');
    assert.equal(e.value.runId, start.runId);
    assert.equal(e.value.threadId, start.threadId);
    assert.equal(e.value.giro, 0);
  }
  assert.equal(n, 2);
  assert.doesNotMatch(JSON.stringify(retries), /private-provider|test-key/u);
  assert.ok(events.some(e => e.type === 'RunFinished'), JSON.stringify(events.filter(e => e.type === 'RunError')));
});
