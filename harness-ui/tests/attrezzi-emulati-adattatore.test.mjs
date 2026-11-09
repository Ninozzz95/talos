/*
 * The one point of the shared adapter where the emulated tools enter (`FORMA-ATTREZZI-EMULATI-2026-11-01.md`). The conditions of the sessions on 01/11/2026, each one a test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { creaEmulatore } from '../src/attrezzi-emulati.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';

const URL_CHAT = 'https://openrouter.ai/api/v1/chat/completions';
const LEGGI = { type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } };
const corpoDi = (model, altro = {}) => JSON.stringify({ model, stream: true, messages: [{ role: 'user', content: 'x' }], tools: [LEGGI], ...altro });
const CHAT = () => new Response('data: {"choices":[{"delta":{"content":"chat"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const EMULATA = () => new Response('data: {"choices":[{"delta":{"content":"emulata"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

function banco({ attrezziEmulati, chiamaLocale = async () => CHAT(), chiamaLocaleOspite = async () => CHAT() } = {}) {
  const fuori = [];
  const dipendenze = { leggiChiave: () => 'k', leggiRuntime: () => ({ endpoint: 'https://openrouter.ai/api/v1' }), localePronto: () => true, ospitePronto: () => true, chiamaLocale, chiamaLocaleOspite, ...(attrezziEmulati ? { attrezziEmulati } : {}) };
  const f = creaFetchMultiProvider(async (url) => { fuori.push(String(url)); return CHAT(); }, { dipendenze });
  return { f, fuori };
}

test('the engine of this PC with the door: the emulated answer goes back, and the chat route is not called', async () => {
  const dati = [];
  let chat = 0;
  const b = banco({ attrezziEmulati: async (corpo, o) => { dati.push({ corpo, o }); return EMULATA(); }, chiamaLocale: async () => { chat += 1; return CHAT(); } });
  const r = await b.f(URL_CHAT, { method: 'POST', headers: {}, body: corpoDi('local:m') });
  assert.match(await r.text(), /emulata/u);
  assert.equal(chat, 0);
  assert.equal(dati[0].corpo.model, 'm', 'the name the engine knows');
  assert.equal(dati[0].corpo.tools.length, 1);
});

test('the door says null: the request goes the way of today, with its tools', async () => {
  const corpi = [];
  const b = banco({ attrezziEmulati: async () => null, chiamaLocale: async (_p, o) => { corpi.push(JSON.parse(o.body)); return CHAT(); } });
  const r = await b.f(URL_CHAT, { method: 'POST', headers: {}, body: corpoDi('local:m') });
  assert.match(await r.text(), /chat/u);
  assert.equal(corpi[0].tools.length, 1);
});

test('Desktop 2: a request with no tools stays on the chat route: summaries, judges and titles never pass from here', async () => {
  let chiesto = 0;
  const b = banco({ attrezziEmulati: async () => { chiesto += 1; return EMULATA(); } });
  await (await b.f(URL_CHAT, { method: 'POST', headers: {}, body: corpoDi('local:m', { tools: [] }) })).text();
  assert.equal(chiesto, 0);
});

test('Desktop 3: the Stop of the turn is the signal of the door', async () => {
  const stop = new AbortController();
  let visto = null;
  const b = banco({ attrezziEmulati: async (_c, o) => { visto = o.signal; return EMULATA(); } });
  await (await b.f(URL_CHAT, { method: 'POST', headers: {}, body: corpoDi('local:m'), signal: stop.signal })).text();
  assert.ok(visto, 'a signal arrives');
  stop.abort(new Error('fermato'));
  assert.equal(visto.aborted, true, 'and it is the one of the turn');
});

test('Mobile and Desktop 4: the engine of the app stays out', async () => {
  let chiesto = 0;
  let ospite = 0;
  const b = banco({ attrezziEmulati: async () => { chiesto += 1; return EMULATA(); }, chiamaLocaleOspite: async () => { ospite += 1; return CHAT(); } });
  await (await b.f(URL_CHAT, { method: 'POST', headers: {}, body: corpoDi('locale-ospite:m') })).text();
  assert.equal(chiesto, 0);
  assert.equal(ospite, 1);
});

test('Desktop 5: who is not on the local engine does not reach the door, and the shared file does not even read the module', async () => {
  let chiesto = 0;
  const b = banco({ attrezziEmulati: async () => { chiesto += 1; return EMULATA(); } });
  for (const modello of ['z-ai/glm-5.3-flash', 'deepseek:deepseek-x', 'ollama:m']) await (await b.f(URL_CHAT, { method: 'POST', headers: {}, body: corpoDi(modello) })).text();
  assert.equal(chiesto, 0, 'a cloud road, and a local engine that is not ours: Ollama has no such door');
  assert.equal(b.fuori.length, 3);
  const fonte = readFileSync(new URL('../src/runtime-owner-adapter.mjs', import.meta.url), 'utf8');
  assert.equal(/from '.*attrezzi-emulati/u.test(fonte), false);
  assert.equal(/import\(.*attrezzi-emulati/u.test(fonte), false);
});

test('without the switch nothing changes: no door in the dependencies, the way of today', async () => {
  let chat = 0;
  const b = banco({ chiamaLocale: async () => { chat += 1; return CHAT(); } });
  await (await b.f(URL_CHAT, { method: 'POST', headers: {}, body: corpoDi('local:m') })).text();
  assert.equal(chat, 1);
});

test('Desktop 1 and Mobile: end to end through the adapter, with `/props` failing or silent the form is never emulated', async () => {
  for (const props of [() => new Response('', { status: 503 }), () => new Response(JSON.stringify({}), { status: 200 }), () => new Response(JSON.stringify({ chat_template_caps: {} }), { status: 200 })]) {
    const rotte = [];
    const chiama = async (percorso, o) => { rotte.push(percorso); return percorso.startsWith('/props') ? props() : o; };
    const b = banco({ attrezziEmulati: creaEmulatore({ chiama }).genera });
    assert.match(await (await b.f(URL_CHAT, { method: 'POST', headers: {}, body: corpoDi('local:m') })).text(), /chat/u);
    assert.equal(rotte.includes('/completion'), false);
  }
});

test('Desktop 3: usage and timings pass through the door as the chat route gives them', async () => {
  const fine = { content: '', stop: true, stop_type: 'eos', tokens_evaluated: 5, tokens_predicted: 2, timings: { prompt_n: 1, prompt_ms: 2 } };
  const chiama = async (percorso) => {
    if (percorso.startsWith('/props')) return new Response(JSON.stringify({ chat_template_caps: { supports_tools: false } }), { status: 200 });
    if (percorso === '/tokenize') return new Response(JSON.stringify({ tokens: [1, 2] }), { status: 200 });
    if (percorso === '/apply-template') return new Response(JSON.stringify({ prompt: 'P' }), { status: 200 });
    return new Response(`data: ${JSON.stringify({ content: 'ok' })}\n\ndata: ${JSON.stringify(fine)}\n\n`, { status: 200 });
  };
  const b = banco({ attrezziEmulati: creaEmulatore({ chiama }).genera });
  const testo = await (await b.f(URL_CHAT, { method: 'POST', headers: {}, body: corpoDi('local:m') })).text();
  assert.match(testo, /"usage":\{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7\}/u);
  assert.match(testo, /"timings":\{"prompt_n":1,"prompt_ms":2\}/u);
  assert.match(testo, /data: \[DONE\]/u);
});
