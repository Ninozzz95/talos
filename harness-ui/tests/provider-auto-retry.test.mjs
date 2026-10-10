import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';

async function banco(t, respond) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ url: req.url, body: JSON.parse(Buffer.concat(chunks)) });
    respond(res, requests.length);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  assert.notEqual(server.address().port, 4174);
  const store = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: 'test-retry-local-only' } });
  store.setRuntime('openrouter', { endpoint: `http://127.0.0.1:${server.address().port}/openrouter` });
  const transport = creaFetchMultiProvider(fetch, {
    providerStore: store,
    dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) },
  });
  const run = extra => chiamaConRitenta({
    modello: 'openai/gpt-5-nano', chiave: 'unused-test-key',
    messaggi: [{ role: 'user', content: 'contnua dalla nota già letta' }], attrezzi: [],
    fetchDiRete: transport, dormi: async () => {}, caso: () => 0, ...extra,
  });
  return { requests, store, run };
}

function success(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Recuperato.' } }] }));
}
function failure(res, status = 503, headers = {}) {
  res.writeHead(status, headers);
  res.end(status === 401 ? 'invalid api key' : 'Service unavailable');
}

test('PROVIDER-503-TRANSIENT-RETRY: una chiave, 503 poi successo, due richieste vere', async t => {
  const b = await banco(t, (res, n) => n === 1 ? failure(res) : success(res));
  const result = await b.run();
  assert.equal(result.scelta.content, 'Recuperato.');
  assert.equal(result.tentativi, 2);
  assert.equal(b.requests.length, 2);
  assert.deepEqual(b.requests[0], b.requests[1], 'stesso modello e testo, nessun reinvio di tool');
});

test('PROVIDER-503-NO-LONG-BENCH: chiave disponibile durante attesa e dopo successo', async t => {
  const b = await banco(t, (res, n) => n === 1 ? failure(res) : success(res));
  const during = [];
  let error;
  try { await b.run({ dormi: async () => during.push(b.store.elencaPool('openrouter')[0].stato) }); }
  catch (e) { error = e; }
  assert.deepEqual(during, ['disponibile']);
  assert.equal(b.store.elencaPool('openrouter')[0].inPanchinaFino, null);
  assert.equal(error, undefined);
});

test('PROVIDER-503-RETRY-AFTER: header conservato attraverso adapter e kernel', async t => {
  const b = await banco(t, (res, n) => n === 1 ? failure(res, 503, { 'Retry-After': '2' }) : success(res));
  const delays = [];
  await b.run({ dormi: async ms => delays.push(ms) });
  assert.deepEqual(delays, [2000]);
  assert.equal(b.requests.length, 2);
});

test('PROVIDER-503-EXHAUSTED: undici richieste reali prima della panchina', async t => {
  const b = await banco(t, res => failure(res));
  await assert.rejects(b.run(), e => e.stato === 503);
  assert.equal(b.requests.length, 11); /* 09/10/2026, owner «come Claude Code»: 1 + 10 tentativi (ritenti-429-come-claude-code.test.mjs) */
  assert.equal(b.store.elencaPool('openrouter')[0].causa, 'guasto-fornitore');
});

test('PROVIDER-503-SINGLE-ATTEMPT: un solo rifiuto non sospende la chiave', async t => {
  const b = await banco(t, res => failure(res));
  await assert.rejects(b.run({ tentativiMassimi: 1 }));
  assert.equal(b.requests.length, 1);
  assert.equal(b.store.elencaPool('openrouter')[0].inPanchinaFino, null);
});

test('PROVIDER-STOP-DURING-BACKOFF: timer cancellato, nessun secondo invio o panchina', async t => {
  const b = await banco(t, res => failure(res, 503, { 'Retry-After': '60' }));
  const stop = new AbortController();
  let entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const outcome = b.run({ segnaleStop: stop.signal, dormi: (ms, signal) => {
    entered();
    return sleep(ms, undefined, { signal });
  } });
  const rejected = assert.rejects(outcome, e => e.fermatoSuRichiesta || e.name === 'AbortError');
  await waiting;
  stop.abort();
  await rejected;
  assert.equal(b.requests.length, 1);
  assert.equal(b.store.elencaPool('openrouter')[0].inPanchinaFino, null);
});

test('PROVIDER-401-NO-RETRY: credenziale rifiutata non viene reinviata', async t => {
  const b = await banco(t, res => failure(res, 401));
  const delays = [];
  await assert.rejects(b.run({ dormi: async ms => delays.push(ms) }), e => e.classe === 'credenziale');
  assert.equal(b.requests.length, 1);
  assert.deepEqual(delays, []);
  assert.equal(b.store.elencaPool('openrouter')[0].causa, 'credenziale');
});

test('PROVIDER-429-SINGLE-KEY: dopo Retry-After la stessa chiave raggiunge davvero il provider', async t => {
  const b = await banco(t, (res, n) => n === 1 ? failure(res, 429, { 'Retry-After': '2' }) : success(res));
  const delays = [];
  await b.run({ dormi: async ms => delays.push(ms) });
  assert.deepEqual(delays, [2000]);
  assert.equal(b.requests.length, 2);
  assert.equal(b.store.elencaPool('openrouter')[0].inPanchinaFino, null);
});
test('PROVIDER-429-EXHAUSTED: undici rifiuti reali, non risposte locali inventate', async t => {
  const b = await banco(t, res => failure(res, 429));
  await assert.rejects(b.run(), e => e.classe === 'traffico');
  assert.equal(b.requests.length, 11); /* 09/10/2026, owner «come Claude Code»: 1 + 10 tentativi (ritenti-429-come-claude-code.test.mjs) */
  assert.equal(b.store.elencaPool('openrouter')[0].causa, 'traffico');
});
test('PROVIDER-429-STOP: stop durante attesa impedisce invio successivo', async t => {
  const b = await banco(t, res => failure(res, 429, { 'Retry-After': '60' }));
  const stop = new AbortController();
  await assert.rejects(b.run({ segnaleStop: stop.signal, dormi: async () => stop.abort() }));
  assert.equal(b.requests.length, 1);
  assert.equal(b.store.elencaPool('openrouter')[0].inPanchinaFino, null);
});
for (const [status, body, classe] of [[429, 'insufficient_quota', 'credito'], [503, 'context_length exceeded', 'contesto']]) {
  test(`PROVIDER-PERMANENT-HTTP-${status}: ${classe} senza attesa o reinvio`, async t => {
    const b = await banco(t, res => { res.writeHead(status); res.end(body); });
    const delays = [];
    await assert.rejects(b.run({ dormi: async ms => delays.push(ms) }), e => e.classe === classe && e.transitorio === false);
    assert.equal(b.requests.length, 1);
    assert.deepEqual(delays, []);
  });
}
