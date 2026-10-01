import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta, talosLavora } from '../src/kernel/talosHarness.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const metadata = { limit_source: 'openrouter_in_flight_budget', reason: 'in_flight_budget_exhausted' };
const rejection = (meta = metadata) => ({ error: { code: 402, message: 'private-body-not-for-logs', metadata: meta } });
function reject(res, body = rejection(), headers = {}) {
  res.writeHead(402, { 'Content-Type': 'application/json', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function success(res, stream = false) {
  res.writeHead(200, { 'Content-Type': stream ? 'text/event-stream' : 'application/json' });
  const message = { role: 'assistant', content: 'Verifica conclusa.' };
  res.end(stream ? `data: ${JSON.stringify({ choices: [{ delta: message, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`
    : JSON.stringify({ choices: [{ message, finish_reason: 'stop' }] }));
}
async function banco(t, respond, { fallback = false, provider = 'openrouter' } = {}) {
  const requests = [], changes = [], usage = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks));
    // Synthetic identity only; never retain authorization values in evidence.
    requests.push({ url: req.url, body, sameKey: req.headers.authorization === 'Bearer retry09-local-first' });
    respond(res, requests.length, body);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  assert.notEqual(server.address().port, 4174);
  const keys = new Map();
  const store = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: 'retry09-local-first', DEEPSEEK_API_KEY: 'retry09-local-other' },
    keyring: { get: (service, key) => keys.get(`${service}:${key}`),
      set: (service, key, value) => { keys.set(`${service}:${key}`, value); return true; },
      remove: (service, key) => { keys.delete(`${service}:${key}`); return true; } },
  });
  for (const p of ['openrouter', 'deepseek']) store.setRuntime(p, { endpoint: `http://127.0.0.1:${server.address().port}/${p}` });
  const transport = creaFetchMultiProvider(fetch, { providerStore: store,
    dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) },
    ...(fallback ? { fallbackProviders: [{ provider: 'deepseek', model: 'deepseek-chat' }],
      onCambioFornitore: e => changes.push(e), onConsumoFornitore: e => usage.push(e) } : {}),
  });
  const options = { modello: provider === 'openrouter' ? 'openai/gpt-5-nano' : 'deepseek:deepseek-chat',
    chiave: 'unused-local-only', messaggi: [{ role: 'user', content: 'Contnua la verifica, senza scrivere.' }],
    attrezzi: [], maxOutputTokens: 123, fetchDiRete: transport, dormi: async () => {}, caso: () => 0 };
  return { requests, store, changes, usage, transport, options, run: extra => chiamaConRitenta({ ...options, ...extra }) };
}
function available(store) {
  assert.ok(store.elencaPool('openrouter').every(k => k.stato === 'disponibile' && k.inPanchinaFino === null));
}

test('RETRY09-TRANSIENT: rifiuto402 prima del provider, header e richiesta identica', async t => {
  const b = await banco(t, (r, n) => n === 1 ? reject(r, rejection(), { 'Retry-After': '2' }) : success(r));
  const delays = [], events = [];
  const result = await b.run({ dormi: async ms => { available(b.store); delays.push(ms); }, onRitenta: e => events.push(e) });
  assert.equal(result.tentativi, 2); assert.deepEqual(delays, [2000]);
  assert.equal(b.requests.length, 2); assert.deepEqual(b.requests[0], b.requests[1]);
  assert.equal(b.requests[0].body.max_tokens, 123);
  assert.deepEqual(events.map(e => [e.fase, e.httpStatus, e.motivo]), ['attesa', 'invio', 'fine'].map(f => [f, 402, 'budget-occupato']));
  assert.doesNotMatch(JSON.stringify(events), /private-body|retry09-local/u); available(b.store);
});

test('RETRY09-EXHAUSTED: quattro richieste, nessuna rotazione o fallback', async t => {
  const b = await banco(t, r => reject(r), { fallback: true });
  b.store.aggiungiChiave('openrouter', 'retry09-local-second');
  await assert.rejects(b.run(), e => e.code === 'PROVIDER_BUDGET_OCCUPIED' && e.stato === 402 && e.transitorio === true);
  assert.equal(b.requests.length, 4); assert.ok(b.requests.every(r => r.sameKey));
  assert.deepEqual(b.changes, []); assert.equal(b.usage.length, 1); assert.equal(b.usage[0].costoDichiarato, null);
  available(b.store);
});

test('RETRY09-STOP: nessun secondo invio dopo Stop durante attesa', async t => {
  const b = await banco(t, r => reject(r, rejection(), { 'Retry-After': '60' }));
  const stop = new AbortController();
  await assert.rejects(b.run({ segnaleStop: stop.signal, dormi: async () => stop.abort() }), e => e.fermatoSuRichiesta);
  assert.equal(b.requests.length, 1); available(b.store);
});

test('RETRY09-OVERFLOW: attesa fuori portata non diventa timer immediato', async t => {
  const b = await banco(t, r => reject(r, rejection(), { 'Retry-After': '999999999999999999999999' }));
  await assert.rejects(b.run({ dormi: async () => assert.fail('overflow wait') }), e => e.code === 'PROVIDER_BUDGET_OCCUPIED');
  assert.equal(b.requests.length, 1); available(b.store);
});

test('RETRY09-BOUNDED-READ: corpo eccessivo cancellato durante la lettura', async () => {
  let chunks = 0, cancelled = false;
  const store = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: 'retry09-local-only' } });
  const transport = creaFetchMultiProvider(async () => new Response(new ReadableStream({
    pull(controller) { chunks++; controller.enqueue(new Uint8Array(2048).fill(32)); if (chunks === 256) controller.close(); },
    cancel() { cancelled = true; },
  }), { status: 402 }), { providerStore: store,
    dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) },
  });
  await assert.rejects(chiamaConRitenta({ modello: 'openai/gpt-5-nano', chiave: 'unused-local-only',
    messaggi: [], attrezzi: [], fetchDiRete: transport }), e => e.code === 'PROVIDER_PAYMENT_REQUIRED');
  assert.equal(cancelled, true); assert.ok(chunks <= 10, `chunks=${chunks}`); available(store);
});

for (const [name, body, code] of [
  ['KEY', rejection({ limit_source: 'openrouter_key_limit' }), 'PROVIDER_KEY_SPEND_LIMIT'],
  ['CREDIT', rejection({ limit_source: 'openrouter_credits' }), 'PROVIDER_CREDIT_LIMIT'],
  ['WEIGHT', rejection({ limit_source: 'openrouter_credits', reason: 'weight_exceeds_budget' }), 'PROVIDER_REQUEST_BUDGET'],
  ['UNKNOWN', rejection({ limit_source: 'new_unknown_limit' }), 'PROVIDER_PAYMENT_REQUIRED'],
  ['MALFORMED', '{"error":', 'PROVIDER_PAYMENT_REQUIRED'],
  ['ARRAY', { error: [rejection().error] }, 'PROVIDER_PAYMENT_REQUIRED'],
  ['WRONG-CODE', { error: { ...rejection().error, code: 503 } }, 'PROVIDER_PAYMENT_REQUIRED'],
  ['WRONG-REASON', rejection({ ...metadata, reason: 'unknown' }), 'PROVIDER_PAYMENT_REQUIRED'],
  ['HINT', { error: { code: 402, message: 'openrouter_in_flight_budget', metadata: { remedy_hint: 'in_flight_budget_exhausted' } } }, 'PROVIDER_PAYMENT_REQUIRED'],
  ['OVERSIZE', JSON.stringify({ padding: 'x'.repeat(17_000), ...rejection() }), 'PROVIDER_PAYMENT_REQUIRED'],
]) test(`RETRY09-PERMANENT-${name}: un invio, nessuna panchina o diagnosi da testo`, async t => {
  const b = await banco(t, r => reject(r, body, { 'Retry-After': '1', 'X-Talos-Provider-Rejection': 'budget-occupato' }), { fallback: true });
  const events = [];
  await assert.rejects(b.run({ onRitenta: e => events.push(e), dormi: async () => assert.fail('no wait') }), e => {
    assert.equal(e.code, code); assert.equal(e.transitorio, false); assert.equal(e.stato, 402);
    assert.doesNotMatch(e.message, /private-body|retry09-local|credenziale rifiutata/iu); return true;
  });
  assert.equal(b.requests.length, 1); assert.deepEqual(events, []); assert.deepEqual(b.changes, []); available(b.store);
});

test('RETRY09-OTHER-PROVIDER: metadati OpenRouter non autorizzano retry altrove', async t => {
  const b = await banco(t, r => reject(r), { provider: 'deepseek' });
  await assert.rejects(b.run()); assert.equal(b.requests.length, 1);
});

test('RETRY09-ACCEPTED-STREAM: errore402 dopo HTTP200 resta esito incerto', async t => {
  const b = await banco(t, r => {
    r.writeHead(200, { 'Content-Type': 'text/event-stream' });
    r.end(`data: ${JSON.stringify(rejection())}\n\ndata: [DONE]\n\n`);
  }, { fallback: true });
  await assert.rejects(b.run({ onDelta: () => {} }), e => e.code === 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(b.requests.length, 1); assert.deepEqual(b.changes, []); available(b.store);
});

test('RETRY09-DIRECT-BUNDLE: Response e contratto identico fra moduli, nessun header fidato', async t => {
  const b = await banco(t, r => reject(r));
  const response = await b.transport('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: b.options.modello, messages: [] }) });
  assert.ok(response instanceof Response); assert.equal(response.status, 402);
  const first = await import('../src/provider-retry.mjs');
  const second = await import('../src/provider-retry.mjs?second-module-copy');
  assert.equal(typeof second.leggiRifiutoProvider, 'function');
  assert.equal(second.leggiRifiutoProvider(response)?.motivo, 'budget-occupato');
  const marked = first.marcaRifiutoProvider(new Response('', { status: 402 }), 'budget-occupato');
  assert.equal(second.leggiRifiutoProvider(marked)?.motivo, 'budget-occupato');
  assert.equal(second.leggiRifiutoProvider(new Response('', { status: 402, headers: { 'X-Talos-Provider-Rejection': 'budget-occupato' } })), null);
  assert.doesNotMatch(await response.text(), /private-body/u); available(b.store);
});

test('RETRY09-SERVICE: motivo nel run reale, messaggi e header non entrano negli eventi', async t => {
  const b = await banco(t, (r, n, body) => n === 1 ? reject(r) : success(r, body.stream));
  const cartella = mkdtempSync(join(tmpdir(), 'talos-retry09-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const events = [];
  await avviaSessione({ cartella, task: { consegna: 'Controlla e rispondi senza strumenti.' }, modello: b.options.modello,
    chiave: 'unused-local-only', onEvento: e => events.push(e),
    talosLavoraFn: opts => talosLavora({ ...opts, giriMassimi: 1, fetchDiRete: b.transport }),
  });
  const start = events.find(e => e.type === 'RunStarted');
  const retries = events.filter(e => e.name === 'talos.provider-retry');
  assert.deepEqual(retries.map(e => e.value.fase), ['attesa', 'invio', 'fine']);
  for (const e of retries) {
    assert.equal(e.value.motivo, 'budget-occupato'); assert.equal(e.value.httpStatus, 402);
    assert.equal(e.value.runId, start.runId); assert.equal(e.value.threadId, start.threadId);
  }
  assert.equal(b.requests.length, 2); assert.ok(events.some(e => e.type === 'RunFinished'));
  assert.doesNotMatch(JSON.stringify(retries), /private-body|retry09-local/u);
});

test('RETRY09-SERVICE-PERMANENT: il codice del limite arriva alla carta UI', async t => {
  const b = await banco(t, r => reject(r, rejection({ limit_source: 'openrouter_key_limit' })));
  const cartella = mkdtempSync(join(tmpdir(), 'talos-retry09-error-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const events = [];
  await avviaSessione({ cartella, task: { consegna: 'Controlla senza strumenti.' }, modello: b.options.modello,
    chiave: 'unused-local-only', onEvento: e => events.push(e),
    talosLavoraFn: opts => talosLavora({ ...opts, giriMassimi: 1, fetchDiRete: b.transport }),
  });
  const error = events.find(e => e.type === 'RunError');
  assert.equal(error?.code, 'PROVIDER_KEY_SPEND_LIMIT'); assert.equal(error?.classe, 'limite-chiave');
  assert.doesNotMatch(JSON.stringify(error), /private-body|retry09-local/u);
  assert.equal(b.requests.length, 1); available(b.store);
});
