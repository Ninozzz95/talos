/*
 * S5 della 0.2.4 (18/11/2026): ogni richiesta di generazione a Gemini parte con `store: false` (Google, changelog del 26/10/2026:
 * «To opt out, set `store=false` on individual requests»). Fetch finto, nessuna rete, nessuna chiave vera.
 * GST-01..05 il corpo che ESCE; GST-06..09 al contrario; GST-10 il cancello «la libreria lo manda da sé».
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { nativeProviderResponse, fetchGeminiSenzaConservazione, googleRifiutaStore, corpoSenzaStore } from '../src/native-provider-adapter.mjs';
import { buildPreparedProviderRequest } from '../src/context-provider-adapter.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';
import { rispondiALato, riassumiPerCompattazione } from '../src/agent-service.mjs';

const messages = [{ role: 'system', content: 'Base.' }, { role: 'user', content: 'Ciao.' }];
const attrezzi = [{ type: 'function', function: { name: 'leggi', description: 'Legge un file', parameters: { type: 'object', properties: { percorso: { type: 'string' } }, required: ['percorso'] } } }];
const pezzo = (parts = [{ text: 'ok' }]) => ({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1, totalTokenCount: 6 } });
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const sse = (corpo) => new Response(`data: ${JSON.stringify(corpo)}\n\n`, { headers: { 'content-type': 'text/event-stream' } });

function cattura(rispondi = () => json(pezzo())) {
  const viste = [];
  const fetchFn = async (url, init) => { viste.push({ url: String(url), testo: init.body, corpo: JSON.parse(init.body), headers: init.headers }); return rispondi(String(url)); };
  return { viste, fetchFn };
}

test('GST-01 Gemini senza streaming: :generateContent parte con store=false in coda, il resto del corpo byte per byte', async () => {
  const c = cattura();
  await nativeProviderResponse({ provider: 'gemini', model: 'gemini-3.5-flash-lite', apiKey: 'test-only-key', body: { messages }, fetchFn: c.fetchFn });
  assert.equal(c.viste.length, 1);
  assert.match(c.viste[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.5-flash-lite:generateContent$/u);
  assert.equal(c.viste[0].corpo.store, false);
  assert.deepEqual(Object.keys(c.viste[0].corpo).at(-1), 'store');
  // Lo stesso corpo senza involucro (compilazione locale) è il prefisso esatto: niente riordinato né riscritto.
  const { body } = await buildPreparedProviderRequest({ messages, model: { provider: 'gemini', model: 'gemini-3.5-flash-lite' } });
  const { store: _s, ...senza } = c.viste[0].corpo;
  assert.deepEqual(senza, body);
  assert.equal(c.viste[0].testo, `${JSON.stringify(body).slice(0, -1)},"store":false}`);
});

test('GST-02 Gemini in streaming con attrezzi: :streamGenerateContent parte con store=false e gli attrezzi intatti', async () => {
  const c = cattura(() => sse(pezzo()));
  const r = await nativeProviderResponse({ provider: 'gemini', model: 'gemini-3.5-flash-lite', apiKey: 'test-only-key', body: { messages, tools: attrezzi, stream: true }, fetchFn: c.fetchFn });
  await r.text();
  assert.match(c.viste[0].url, /:streamGenerateContent\?alt=sse$/u);
  assert.equal(c.viste[0].corpo.store, false);
  assert.equal(c.viste[0].corpo.tools[0].functionDeclarations[0].name, 'leggi');
});

test('GST-03 dopo una ripresa (chiamata d\'attrezzo con firma, poi il risultato): anche la seconda richiesta porta store=false', async () => {
  const c = cattura((url) => json(pezzo(c.viste.length === 1 ? [{ functionCall: { name: 'leggi', args: { percorso: 'nota.txt' } }, thoughtSignature: 'firma' }] : [{ text: 'fatto' }])));
  const r1 = await nativeProviderResponse({ provider: 'gemini', model: 'gemini-3.5-flash-lite', apiKey: 'test-only-key', body: { messages, tools: attrezzi }, fetchFn: c.fetchFn });
  const assistente = (await r1.json()).choices[0].message;
  assert.ok(assistente.talos_provider_state, 'the native state comes back for the next turn');
  const storia = JSON.parse(JSON.stringify([...messages, assistente, { role: 'tool', tool_call_id: assistente.tool_calls[0].id, content: 'testo' }]));
  await nativeProviderResponse({ provider: 'gemini', model: 'gemini-3.5-flash-lite', apiKey: 'test-only-key', body: { messages: storia, tools: attrezzi }, fetchFn: c.fetchFn });
  assert.equal(c.viste.length, 2);
  assert.equal(c.viste[1].corpo.store, false);
  assert.equal(c.viste[1].corpo.contents.find((x) => x.role === 'model').parts.find((p) => p.functionCall).thoughtSignature, 'firma');
});

/* Il motore VERO (multi-fornitore + kernel), stessa forma di `gemini-quota-e-modello-ritirato.test.mjs:38-50`. Chiavi finte, mai l'ambiente. */
function banco({ rispondi = () => json(pezzo()), env = { GEMINI_API_KEY: 'AIza-FINTA' } } = {}) {
  const viste = [];
  const rete = async (url, init) => { viste.push({ url: String(url), corpo: JSON.parse(init.body) }); return rispondi(String(url)); };
  const custodia = new Map();
  const store = createProviderCredentialStore({ env, keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: () => true } });
  const dipendenze = { leggiChiave: (p) => { try { return store.getKey(p); } catch { return null; } }, leggiRuntime: (p) => { try { return store.getRuntime(p); } catch { return {}; } } };
  return { viste, trasporto: creaFetchMultiProvider(rete, { providerStore: store, dipendenze }) };
}

test('GST-04 filo intero (kernel → multi-fornitore → adattatore nativo): il giro, la risposta a lato e il riassunto partono con store=false', async () => {
  const b = banco();
  await chiamaConRitenta({ modello: 'gemini:gemini-3.5-flash-lite', chiave: 'unused', messaggi: [{ role: 'user', content: 'hi' }], attrezzi: [], maxOutputTokens: 5, fetchDiRete: b.trasporto, dormi: async () => {}, caso: () => 0 });
  await rispondiALato({ modello: 'gemini:gemini-3.5-flash-lite', chiave: 'unused', messaggi: [{ role: 'user', content: 'hi' }], attrezzi: [], fetchDiRete: b.trasporto }).catch(() => {});
  await riassumiPerCompattazione({ modello: 'gemini:gemini-3.5-flash-lite', chiave: 'unused', messaggi: [{ role: 'user', content: 'hi' }], maxOutputTokens: 50, fetchDiRete: b.trasporto }).catch(() => {});
  const generazioni = b.viste.filter((v) => /:(?:generateContent|streamGenerateContent)/u.test(v.url));
  assert.ok(generazioni.length >= 3, `three callers reached Gemini: ${generazioni.length}`);
  for (const v of generazioni) assert.equal(v.corpo.store, false, v.url);
});

test('GST-05 la compilazione locale per il conteggio dei token resta il corpo dell\'SDK, senza store (e quindi la sua impronta)', async () => {
  const { body } = await buildPreparedProviderRequest({ messages, tools: attrezzi, model: { provider: 'gemini', model: 'gemini-3.5-flash-lite' } });
  assert.equal(Object.hasOwn(body, 'store'), false);
});

test('GST-06 AL CONTRARIO sull\'host di Gemini: conteggio, cache, file, embedding, corpi non JSON, store già scelto passano INTATTI', async () => {
  const visti = [];
  const avvisi = [];
  const f = fetchGeminiSenzaConservazione(async (input, init) => { visti.push({ input, init }); return json({}); }, { avvisa: (m) => avvisi.push(m) });
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  const intestazioni = { 'x-goog-api-key': 'test-only-key', 'content-type': 'application/json' };
  const casi = [
    [`${base}/models/gemini-3.5-flash-lite:countTokens`, '{"contents":[]}'],
    [`${base}/cachedContents`, '{"model":"models/x","contents":[]}'],
    [`${base}/files`, '{"file":{"displayName":"a"}}'],
    [`${base}/models/gemini-embedding-2:embedContent`, '{"content":{"parts":[]}}'],
    [`${base}/models/gemini-3.5-flash-lite:batchGenerateContent`, '{"batch":{}}'],
    [`${base}/models/gemini-3.5-flash-lite:generateContentOther`, '{"contents":[]}'], // only starts like the generation path
    [`${base}/models/gemini-3.5-flash-lite:generateContent`, '{"contents":[],"store":true}'],
    [`${base}/models/gemini-3.5-flash-lite:generateContent`, '{"contents":[],"store":false}'],
    [`${base}/models/gemini-3.5-flash-lite:generateContent`, '[1,2]'],
    [`${base}/models/gemini-3.5-flash-lite:generateContent`, 'null'],
    ['http://generativelanguage.googleapis.com/v1beta/models/x:generateContent', '{"contents":[]}'],
  ];
  for (const [url, body] of casi) {
    const init = { method: 'POST', headers: intestazioni, body };
    await f(url, init);
    assert.equal(visti.at(-1).init, init, `${url} ${body}: same init object`);
    assert.equal(visti.at(-1).input, url);
  }
  // Un corpo che non si legge: passa intatto e si avvisa, mai una richiesta persa.
  const rotto = { method: 'POST', headers: intestazioni, body: '{"contents":[' };
  await f(`${base}/models/x:generateContent`, rotto);
  assert.equal(visti.at(-1).init, rotto);
  assert.equal(avvisi.length, 1);
  assert.doesNotMatch(avvisi[0], /contents|test-only-key/u, 'the warning never carries the body or the key');
  // Corpo non stringa (byte): intatto, senza avviso.
  const byte = { method: 'POST', body: new TextEncoder().encode('{"contents":[]}') };
  await f(`${base}/models/x:generateContent`, byte);
  assert.equal(visti.at(-1).init, byte);
  assert.equal(avvisi.length, 1);
  // La generazione vera: intestazioni (chiave compresa) passate per riferimento, solo il corpo cambia.
  const vero = { method: 'POST', headers: intestazioni, body: '{"contents":[]}' };
  await f(`${base}/models/x:generateContent`, vero);
  assert.equal(visti.at(-1).init.headers, intestazioni);
  assert.equal(visti.at(-1).init.body, '{"contents":[],"store":false}');
  await f(new URL(`${base}/models/x:streamGenerateContent?alt=sse`), { body: '{}' });
  assert.equal(visti.at(-1).init.body, '{"store":false}');
});

test('GST-07 AL CONTRARIO: un indirizzo che contiene «generateContent» ma non è di Google resta intatto', async () => {
  const visti = [];
  const f = fetchGeminiSenzaConservazione(async (input, init) => { visti.push(init); return json({}); });
  for (const url of ['https://example.com/v1beta/models/x:generateContent', 'https://generativelanguage.googleapis.com.evil.example/v1beta/models/x:generateContent',
    'https://proxy.example/generativelanguage.googleapis.com/models/x:generateContent', 'https://openrouter.ai/api/v1/chat/completions?x=:generateContent',
    'https://xgenerativelanguage.googleapis.com/v1beta/models/x:generateContent', 'https://eu.generativelanguage.googleapis.com/v1beta/models/x:generateContent']) { // giro 2: exact host, never endsWith
    const init = { body: '{"contents":[]}' };
    await f(url, init);
    assert.equal(visti.at(-1), init, url);
  }
});

test('GST-08 AL CONTRARIO sugli altri fornitori nativi: OpenAI tiene il suo store=false, Anthropic e Z.AI nessun campo nuovo', async () => {
  const anth = (model) => json({ id: 'msg', type: 'message', role: 'assistant', model, content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 5, output_tokens: 2 } });
  for (const [provider, model] of [['anthropic', 'claude-opus-5-5'], ['zai-anthropic', 'glm-5.3-flash']]) {
    const c = cattura(() => anth(model));
    await nativeProviderResponse({ provider, model, apiKey: 'test-only-key', body: { messages }, fetchFn: c.fetchFn });
    assert.equal(Object.hasOwn(c.viste[0].corpo, 'store'), false, provider);
  }
  const reply = { id: 'r1', created_at: 0, model: 'gpt-5-mini', status: 'completed', output: [{ type: 'message', id: 'm', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }], usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 }, error: null, incomplete_details: null };
  const c = cattura(() => json(reply));
  await nativeProviderResponse({ provider: 'openai', model: 'gpt-5-mini', apiKey: 'test-only-key', body: { messages }, fetchFn: c.fetchFn });
  assert.equal(c.viste[0].corpo.store, false);
});

test('GST-09 AL CONTRARIO: OpenRouter con un modello google/… (filo chat/completions) non riceve store', async () => {
  const b = banco({ env: { OPENROUTER_API_KEY: 'sk-or-FINTA' }, rispondi: () => json({ id: 'x', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) });
  await chiamaConRitenta({ modello: 'openrouter:google/gemini-3.5-flash-lite', chiave: 'unused', messaggi: [{ role: 'user', content: 'hi' }], attrezzi: [], maxOutputTokens: 5, fetchDiRete: b.trasporto, dormi: async () => {}, caso: () => 0 }).catch(() => {});
  const verso = b.viste.filter((v) => /openrouter\.ai/u.test(v.url));
  assert.ok(verso.length >= 1, `the request reached OpenRouter: ${b.viste.map((v) => v.url).join(' ')}`);
  for (const v of verso) assert.equal(Object.hasOwn(v.corpo, 'store'), false);
});

test('GST-10 CANCELLO: il giorno in cui @ai-sdk/google manda store da sé, questa prova diventa rossa', async () => {
  let corpo = null;
  const client = createGoogleGenerativeAI({ apiKey: 'test-only-key', fetch: async (_u, init) => { corpo = JSON.parse(init.body); return json(pezzo()); } });
  await generateText({ model: client.chat('gemini-3.5-flash-lite'), prompt: 'Ciao.', providerOptions: { google: { store: false } }, maxRetries: 0 });
  assert.equal(Object.hasOwn(corpo, 'store'), false,
    "@ai-sdk/google now sends `store` on generateContent by itself: togli l'involucro (remove fetchGeminiSenzaConservazione in src/native-provider-adapter.mjs) and pass providerOptions.google.store=false instead, so only one hand sets the field.");
});

/* Paracadute (giudice v2181): un 400 di Google che nomina PROPRIO `store` ⇒ una sola ripetizione senza il campo, con un avviso. */
const MSG_STORE = 'Invalid JSON payload received. Unknown name "store": Cannot find field.';
const rifiutoStore = (forma = 'piena') => json(forma === 'violazione'
  ? { error: { code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ field: 'store', description: 'Cannot find field.' }] }] } }
  : { error: { code: 400, message: MSG_STORE, status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ description: MSG_STORE }] }] } }, 400);
const URL_GEN = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';
function paracadute(risposte) {
  const chiamate = []; const avvisi = [];
  const f = fetchGeminiSenzaConservazione(async (input, init) => {
    chiamate.push({ input, init });
    const r = risposte[chiamate.length - 1];
    if (r instanceof Error) throw r;
    return typeof r === 'function' ? r(init) : r;
  }, { avvisa: (m) => avvisi.push(m) });
  return { f, chiamate, avvisi };
}

test('GST-11 PARACADUTE: un 400 che nomina store ⇒ 2 chiamate, la seconda col corpo originale, un avviso, torna la seconda risposta', async () => {
  for (const forma of ['piena', 'violazione']) {
    const seconda = json(pezzo([{ text: 'senza store' }]));
    const p = paracadute([rifiutoStore(forma), seconda]);
    const controller = new AbortController();
    const init = { method: 'POST', headers: { 'x-goog-api-key': 'test-only-key' }, body: '{"contents":[]}', signal: controller.signal };
    const r = await p.f(URL_GEN, init);
    assert.equal(p.chiamate.length, 2, forma);
    assert.equal(JSON.parse(p.chiamate[0].init.body).store, false);
    assert.equal(p.chiamate[1].init, init, 'the retry is the original request, same body and same abort signal');
    assert.equal(r, seconda);
    assert.equal(p.avvisi.length, 1);
    assert.match(p.avvisi[0], /rejected the store field/u);
    assert.doesNotMatch(p.avvisi[0], /contents|test-only-key/u);
  }
});

test('GST-12 PARACADUTE AL CONTRARIO: un 400 che NON nomina store ⇒ 1 chiamata, risposta intatta e ancora leggibile', async () => {
  for (const messaggio of ['API key not valid. Please pass a valid API key.', 'Invalid JSON payload received. Unknown name "stored": Cannot find field.',
    'Invalid JSON payload received. Unknown name "storeRequests": Cannot find field.', 'The datastore is not available for this store-front.', 'Invalid value at \'contents[0]\' (store)']) {
    const prima = json({ error: { code: 400, message: messaggio, status: 'INVALID_ARGUMENT' } }, 400);
    const p = paracadute([prima]);
    const r = await p.f(URL_GEN, { body: '{"contents":[]}' });
    assert.equal(p.chiamate.length, 1, messaggio);
    assert.equal(r, prima);
    assert.equal((await r.json()).error.message, messaggio, 'the caller can still read the original body');
    assert.equal(p.avvisi.length, 0);
  }
  assert.equal(googleRifiutaStore('Unknown name "store": Cannot find field.'), true, 'plain text, the whole sentence');
  assert.equal(googleRifiutaStore('not json, Unknown name "store": Cannot find field.'), false, 'giro 2: the sentence must be the whole text');
  assert.equal(googleRifiutaStore(JSON.stringify([{ error: { code: 400, message: MSG_STORE } }])), true, 'the array form of a streamed error');
  for (const testo of ['', 'store', '{"error":{"message":"store"}}', '{"error":{"details":[{"fieldViolations":[{"field":"storeX"}]}]}}', '{"store":true}', 'null']) assert.equal(googleRifiutaStore(testo), false, testo);
});

test('GST-13 PARACADUTE AL CONTRARIO: 401, 403, 404, 429, 500 (anche se nominano store), rete e annullamento ⇒ 1 chiamata, niente ripetizione', async () => {
  for (const stato of [401, 403, 404, 429, 500, 503]) {
    const prima = json({ error: { code: stato, message: MSG_STORE } }, stato);
    const p = paracadute([prima, json(pezzo())]);
    assert.equal(await p.f(URL_GEN, { body: '{"contents":[]}' }), prima);
    assert.equal(p.chiamate.length, 1, String(stato));
  }
  const rete = paracadute([new TypeError('fetch failed'), json(pezzo())]);
  await assert.rejects(rete.f(URL_GEN, { body: '{"contents":[]}' }), /fetch failed/u);
  assert.equal(rete.chiamate.length, 1);
  const annullo = paracadute([Object.assign(new Error('aborted'), { name: 'AbortError' }), json(pezzo())]);
  await assert.rejects(annullo.f(URL_GEN, { body: '{"contents":[]}' }), { name: 'AbortError' });
  assert.equal(annullo.chiamate.length, 1);
});

test('GST-14 PARACADUTE: se anche la seconda fallisce torna la seconda, mai una terza; ogni richiesta nuova riprova col campo (nessuna memoria)', async () => {
  const seconda = rifiutoStore();
  const p = paracadute([rifiutoStore(), seconda, json(pezzo())]);
  assert.equal(await p.f(URL_GEN, { body: '{"contents":[]}' }), seconda);
  assert.equal(p.chiamate.length, 2);
  await p.f(URL_GEN, { body: '{"contents":[]}' });
  assert.equal(JSON.parse(p.chiamate[2].init.body).store, false, 'after a rejection the next request still carries the field');
});

test('GST-15 PARACADUTE in streaming: 400 su store ⇒ ripetuta senza campo e il flusso arriva; 200 ⇒ mai ripetuta, flusso intatto', async () => {
  const viste = [];
  const r = await nativeProviderResponse({ provider: 'gemini', model: 'gemini-3.5-flash-lite', apiKey: 'test-only-key', body: { messages, stream: true },
    fetchFn: async (url, init) => { viste.push({ url: String(url), corpo: JSON.parse(init.body) }); return viste.length === 1 ? rifiutoStore() : sse(pezzo([{ text: 'flusso dopo il rifiuto' }])); } });
  assert.match(await r.text(), /flusso dopo il rifiuto/u);
  assert.equal(viste.length, 2);
  assert.match(viste[1].url, /:streamGenerateContent/u);
  assert.equal(viste[0].corpo.store, false);
  assert.equal(Object.hasOwn(viste[1].corpo, 'store'), false);
  const ok = [];
  const r2 = await nativeProviderResponse({ provider: 'gemini', model: 'gemini-3.5-flash-lite', apiKey: 'test-only-key', body: { messages, stream: true },
    fetchFn: async (url, init) => { ok.push(init); return sse(pezzo([{ text: 'flusso intatto' }])); } });
  assert.match(await r2.text(), /flusso intatto/u);
  assert.equal(ok.length, 1);
});

/* Giro 2 (revisore R1): il paracadute sul FILO VERO della chat, kernel `chiamaConRitenta` → `creaFetchMultiProvider` → `rete`. */
async function giroVero(rispondi) {
  const b = banco({ rispondi });
  const avvisi = [];
  const warn = console.warn; console.warn = (m) => { avvisi.push(String(m)); };
  let esito = null; let errore = null;
  try { esito = await chiamaConRitenta({ modello: 'gemini:gemini-3.5-flash-lite', chiave: 'unused', messaggi: [{ role: 'user', content: 'hi' }], attrezzi: [], maxOutputTokens: 5, fetchDiRete: b.trasporto, dormi: async () => {}, caso: () => 0 }); }
  catch (e) { errore = e; } finally { console.warn = warn; }
  const generazioni = b.viste.filter((v) => /:(?:generateContent|streamGenerateContent)/u.test(v.url));
  return { esito, errore, generazioni, avvisi: avvisi.filter((m) => /store/u.test(m)) };
}
const okPer = (url) => (/stream/u.test(url) ? sse(pezzo([{ text: 'Ciao dal filo.' }])) : json(pezzo([{ text: 'Ciao dal filo.' }])));

test('GST-16 FILO VERO: 400 che nomina store, poi 200 ⇒ 2 chiamate, la seconda senza il campo, giro riuscito, un avviso', async () => {
  for (const forma of ['piena', 'violazione']) {
    let n = 0;
    const g = await giroVero((url) => (n++ === 0 ? rifiutoStore(forma) : okPer(url)));
    assert.equal(g.errore, null, `${forma}: the turn succeeds (no stale contesto.errore): ${g.errore?.code} ${g.errore?.message}`);
    assert.match(JSON.stringify(g.esito), /Ciao dal filo\./u);
    assert.equal(g.generazioni.length, 2, forma);
    assert.equal(g.generazioni[0].corpo.store, false);
    assert.equal(Object.hasOwn(g.generazioni[1].corpo, 'store'), false);
    assert.deepEqual(g.generazioni[1].corpo, (({ store: _s, ...r }) => r)(g.generazioni[0].corpo), 'same request minus the field');
    assert.equal(g.generazioni[1].url, g.generazioni[0].url, 'same address, same port (stream or not)');
    assert.equal(g.avvisi.length, 1, `one warning: ${g.avvisi.join(' | ')}`);
    assert.doesNotMatch(g.avvisi[0], /AIza|contents/u);
  }
});

test('GST-17 FILO VERO AL CONTRARIO: 400 che non nomina store, campo annidato, testo della persona ⇒ 1 chiamata ed errore come sulla base', async () => {
  for (const messaggio of ['API key not valid. Please pass a valid API key.', 'Invalid JSON payload received. Unknown name "store" at \'generation_config\': Cannot find field.',
    'Invalid value at \'contents[0].parts[0].text\' (TYPE_STRING), "Unknown name \\"store\\": Cannot find field."']) {
    const g = await giroVero(() => json({ error: { code: 400, message: messaggio, status: 'INVALID_ARGUMENT' } }, 400));
    assert.equal(g.generazioni.length, 1, messaggio);
    assert.ok(g.errore, 'the turn fails as before');
    assert.equal(g.errore.code ?? g.errore.cause?.code, 'PROVIDER_REQUEST_ERROR', `${messaggio}: ${g.errore.code}`);
    assert.equal(g.avvisi.length, 0);
  }
  const annidato = await giroVero(() => json({ error: { code: 400, message: 'Request contains an invalid argument.', details: [{ '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ field: 'generation_config.store', description: 'Cannot find field.' }] }] } }, 400));
  assert.equal(annidato.generazioni.length, 1, 'a nested field violation does not trigger');
});

test('GST-18 FILO VERO: 503 sempre ⇒ le stesse chiamate della base (11); 400-store sempre ⇒ 2 e poi l\'errore; mai una terza per lo stesso invio', async () => {
  const g503 = await giroVero(() => json({ error: { code: 503, message: 'overloaded', status: 'UNAVAILABLE' } }, 503));
  assert.equal(g503.generazioni.length, 11, 'bb6d3799a: 1 + 10 kernel retries');
  assert.ok(g503.generazioni.every((v) => v.corpo.store === false), 'every kernel retry still carries the field');
  const sempre = await giroVero(() => rifiutoStore());
  assert.equal(sempre.generazioni.length, 2);
  assert.equal(sempre.errore.code ?? sempre.errore.cause?.code, 'PROVIDER_REQUEST_ERROR');
  assert.equal(sempre.avvisi.length, 1);
});

test('GST-20 FILO VERO, nessuna memoria fra invii: 400-store, 503, poi di nuovo 400-store e 200 ⇒ il secondo invio riprova col campo e ripete ancora', async () => {
  const risposte = [() => rifiutoStore(), () => json({ error: { code: 503, message: 'overloaded', status: 'UNAVAILABLE' } }, 503), () => rifiutoStore(), (url) => okPer(url)];
  let n = 0;
  const g = await giroVero((url) => risposte[Math.min(n++, risposte.length - 1)](url));
  assert.equal(g.errore, null, `${g.errore?.code}`);
  assert.deepEqual(g.generazioni.map((v) => v.corpo.store), [false, undefined, false, undefined]);
  assert.equal(g.avvisi.length, 2);
});

test('GST-19 corpo con spazi o a capo in coda: store aggiunto e JSON valido; il ritorno senza campo è il corpo originale', async () => {
  const visti = [];
  const f = fetchGeminiSenzaConservazione(async (_i, init) => { visti.push(init.body); return json({}); });
  for (const [corpo, atteso] of [['{"contents":[]}\n', '{"contents":[],"store":false}'], ['{"contents":[]}  \r\n', '{"contents":[],"store":false}'], ['{ }\n', '{"store":false}']]) {
    await f('https://generativelanguage.googleapis.com/v1beta/models/x:generateContent', { body: corpo });
    assert.equal(visti.at(-1), atteso, JSON.stringify(corpo));
    assert.equal(JSON.parse(visti.at(-1)).store, false);
  }
  assert.equal(corpoSenzaStore('{"contents":[],"store":false}'), '{"contents":[]}');
  assert.equal(corpoSenzaStore('{"store":false}'), '{}');
  assert.equal(corpoSenzaStore('{"store":false,"contents":[]}'), '{"contents":[]}');
  for (const t of ['{"contents":[]}', '{"store":true}', '[1]', 'x', null]) assert.equal(corpoSenzaStore(t), null, String(t));
});
