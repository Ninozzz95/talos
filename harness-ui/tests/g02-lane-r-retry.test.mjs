/*
 * G02 feature 10, lane R (CLI lane 22acdb1f7), reconciled with the desktop's RETRY01–09 contract (desktop agreement,
 * 30/09/2026, points 2, 3, 5 of lavoro/G02-laneR-contratto.md):
 * (3) `retry-after-ms` wins over `retry-after` when a provider sends it (pi-mono packages/ai/src/utils/provider-retry.ts
 *     `getRetryDelayMs`, bf8e4b9: retry-after-ms first, then retry-after), read by ONE helper shared by the kernel loop and
 *     the owner adapter, which today normalizes only `retry-after` and would drop the milliseconds;
 * (2) `attesaRitentaMassimaMs`: an OPTIONAL host cap on the wait a provider asks for; a longer request ends the retries at
 *     once. Absent = today's behaviour (the desktop never sets one; the CLI passes 60 s);
 * (5) the last wait the provider asked for travels on the final error as `retryAfterMs`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as providerRetry from '../src/provider-retry.mjs';
import {chiamaConRitenta, talosLavora} from '../src/kernel/talosHarness.mjs';
import {creaFetchMultiProvider} from '../src/runtime-owner-adapter.mjs';
import {createProviderCredentialStore} from '../src/provider-credential-store.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

async function run(headers, extra = {}, {failures = 1} = {}) {
  let requests = 0; const delays = []; let error, result;
  try {
    result = await chiamaConRitenta({modello: 'fixture', chiave: 'fixture', messaggi: [], attrezzi: [], caso: () => 0, dormi: async (ms) => delays.push(ms),
      fetchDiRete: async () => ++requests <= failures ? new Response('Too many requests', {status: 429, headers}) : Response.json({choices: [{message: {content: 'OK'}}]}),
      ...extra});
  } catch (e) { error = e; }
  return {requests, delays, error, result};
}

test('G02-10 one helper reads the requested wait: retry-after-ms wins, a malformed one falls back to retry-after', () => {
  assert.equal(typeof providerRetry.leggiAttesaRichiestaDalFornitore, 'function');
  const h = (o) => new Headers(o);
  assert.equal(providerRetry.leggiAttesaRichiestaDalFornitore(h({'retry-after-ms': '1500', 'retry-after': '30'})), 1500);
  assert.equal(providerRetry.leggiAttesaRichiestaDalFornitore(h({'retry-after-ms': '250.4'})), 250);
  for (const bad of ['abc', '-5', '', '1e3']) assert.equal(providerRetry.leggiAttesaRichiestaDalFornitore(h({'retry-after-ms': bad, 'retry-after': '2'})), 2000, bad);
  assert.equal(providerRetry.leggiAttesaRichiestaDalFornitore(h({})), null);
  assert.equal(providerRetry.leggiAttesaRichiestaDalFornitore(null), null);
});

test('G02-10 the kernel loop waits what retry-after-ms asks', async () => {
  assert.deepEqual((await run({'retry-after-ms': '1500', 'retry-after': '30'})).delays, [1500]);
});

test('G02-10 an optional host cap stops at once on a longer requested wait, and says how long', async () => {
  const capped = await run({'retry-after': '120'}, {attesaRitentaMassimaMs: 60_000});
  assert.deepEqual([capped.requests, capped.delays, capped.error?.stato, capped.error?.retryAfterMs], [1, [], 429, 120_000]);
  const within = await run({'retry-after': '30'}, {attesaRitentaMassimaMs: 60_000});
  assert.deepEqual([within.delays, within.result?.scelta?.content], [[30_000], 'OK']);
  assert.deepEqual((await run({'retry-after': '120'})).delays, [120_000], 'no cap: today\'s behaviour');
  for (const bad of [-1, Number.NaN, '60', Infinity]) await assert.rejects(chiamaConRitenta({modello: 'm', chiave: 'k', messaggi: [], attrezzi: [], attesaRitentaMassimaMs: bad, fetchDiRete: async () => Response.json({})}), (e) => e.code === 'RETRY_CAP_INVALID', String(bad));
});

test('G02-10 the final error carries the last requested wait; without one it has none', async () => {
  const exhausted = await run({'retry-after': '1'}, {}, {failures: 99}); /* 09/10/2026, owner «come Claude Code»: 1 + 10 tentativi (ritenti-429-come-claude-code.test.mjs) */
  assert.equal(exhausted.error?.retryAfterMs, 1000);
  const plain = await run({}, {}, {failures: 99});
  assert.equal('retryAfterMs' in plain.error, false);
});

test('G02-10 talosLavora hands the cap to the model call (no hour-long silent wait)', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-g02-laner-'));
  t.after(() => rimuoviCartellaDiProva(root));
  let requests = 0;
  const stop = new AbortController();
  const run = talosLavora({cartella: root, task: {consegna: 't'}, modello: 'x', chiave: 'y', _giriMassimiInterno: 2, attesaRitentaMassimaMs: 60_000,
    messaggiIniziali: [{role: 'system', content: 't'}, {role: 'user', content: 't'}], segnaleStop: stop.signal,
    fetchDiRete: async () => {requests++; return new Response('Too many requests', {status: 429, headers: {'Retry-After': '3600'}});}}).then(() => 'returned', () => 'threw');
  let timer;
  const outcome = await Promise.race([run, new Promise((resolve) => {timer = setTimeout(() => resolve('still waiting'), 3_000);})]);
  clearTimeout(timer);
  stop.abort(); // without the cap the kernel would still be asleep: the stop wakes it, so the test never hangs
  await run;
  assert.notEqual(outcome, 'still waiting');
  assert.equal(requests, 1);
});

test('G02-10 the owner adapter keeps retry-after-ms through to the kernel loop', async (t) => {
  let n = 0;
  const server = createServer(async (req, res) => {
    for await (const _ of req);
    if (++n === 1) {res.writeHead(429, {'retry-after-ms': '1500', 'Retry-After': '30'}); res.end('slow down'); return;}
    res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({choices: [{message: {role: 'assistant', content: 'OK'}}]}));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => {server.closeAllConnections(); server.close(resolve);}));
  assert.notEqual(server.address().port, 4174);
  const store = createProviderCredentialStore({env: {OPENROUTER_API_KEY: 'test-retry-local-only'}});
  store.setRuntime('openrouter', {endpoint: `http://127.0.0.1:${server.address().port}/openrouter`});
  const transport = creaFetchMultiProvider(fetch, {providerStore: store, dipendenze: {leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p)}});
  const delays = [];
  await chiamaConRitenta({modello: 'openai/gpt-5-nano', chiave: 'unused', messaggi: [{role: 'user', content: 'x'}], attrezzi: [], fetchDiRete: transport, dormi: async (ms) => delays.push(ms), caso: () => 0});
  assert.deepEqual(delays, [1500]);
});
