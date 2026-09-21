import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextTokenCounter, buildPreparedDesktopContextRequest } from '../src/context-token-counters.mjs';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';
import { buildPreparedProviderRequest } from '../src/context-provider-adapter.mjs';

const messages = [{ role: 'system', content: 'Help.' }, { role: 'user', content: [{ type: 'text', text: 'Inspect' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } }] }];
const tools = [{ type: 'function', function: { name: 'read', description: 'Read note', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } } }];
const models = { openai: 'gpt-5.4-mini', anthropic: 'claude-sonnet-5', gemini: 'gemini-3.8-flash', local: 'qwen', openrouter: 'provider/model' };
const model = provider => ({ provider, model: models[provider], windowTokens: 16384, responseReserve: 2048 });
const select = (body, keys) => Object.fromEntries(keys.filter(k => body[k] !== undefined).map(k => [k, body[k]]));

test('CTX-DESKTOP-COUNT-WIRE counts resolved images, shell schema and normalized chat reasoning', async () => {
  const shell = [{ type: 'function', function: { name: 'shell', parameters: { type: 'object', properties: { comando: { type: 'string' } }, required: ['comando'] } } }];
  const original = [{ role: 'user', content: [{ type: 'image_url', image_url: { url: '/api/v1/chat-images/' + 'a'.repeat(64) } }] }];
  const resolveImages = async input => input.map(m => ({ ...m, content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }] }));
  const readModelCapabilities = async () => ({ reasoning: { mandatory: true, supportedEfforts: ['low'], defaultEffort: 'low' } });
  const selected = { ...model('openrouter'), requestOptions: { reasoning: { effort: 'none' } } };
  let sent;
  const adapter = createOwnerRuntimeAdapter({ modulePath: 'C:/fixture/runtime.mjs', resolveImagesFn: resolveImages, modelCapabilityFn: readModelCapabilities,
    importFn: async () => ({ talosLavora: input => input.fetchDiRete('https://openrouter.ai/api/v1/chat/completions', { body: JSON.stringify({ model: selected.model, messages: original, tools: shell, tool_choice: 'auto', reasoning: selected.requestOptions.reasoning, max_tokens: selected.responseReserve }) }) }),
  });
  await adapter.talosLavora({ contextHooks: {}, fetchDiRete: async (_url, init) => { sent = JSON.parse(init.body); return Response.json({}); } });
  const compiled = await buildPreparedDesktopContextRequest({ messages: original, tools: shell, model: selected }, { resolveImages, readModelCapabilities });
  assert.deepEqual(compiled.body, sent);
  assert.match(original[0].content[0].image_url.url, /^\/api/);
  assert.ok(sent.tools[0].function.parameters.required.includes('descrizione'));
});

test('CTX-DESKTOP-SUMMARY-WIRE preserves the separate tool-free summary transport', async () => {
  let sent;
  const selected = model('openrouter');
  const adapter = createOwnerRuntimeAdapter({ destinazioneModelloDeps: { leggiChiave: () => 'fixture', leggiRuntime: () => ({ endpoint: 'https://openrouter.ai/api/v1' }) } });
  await adapter.callContextModel({ ...selected, messages, maxOutputTokens: selected.responseReserve, fetchDiRete: async (_url, init) => { sent = JSON.parse(init.body); return Response.json({ choices: [{ message: { content: 'Sintesi' }, finish_reason: 'stop' }] }); } });
  const compiled = await buildPreparedDesktopContextRequest({ messages, model: selected }, { readModelCapabilities: async () => { throw new Error('Summary does not use chat capability transforms'); } });
  delete sent.stream;
  assert.deepEqual(compiled.body, sent);
});

for (const provider of ['openai', 'anthropic', 'gemini']) test(`CTX-WIRE-${provider} count payload matches the real pinned SDK outbound semantic body`, async () => {
  let generation; let counting;
  const stop = new Error('capture-only');
  await assert.rejects(nativeProviderResponse({ provider, model: models[provider], apiKey: 'fixture-key', body: { messages, tools, stream: false }, fetchFn: async (_url, init) => { generation = JSON.parse(init.body); throw stop; } }));
  const counter = createContextTokenCounter({ resolveProfile: async () => ({ apiKey: 'injected-key' }), fetchFn: async (url, init) => { counting = { url: String(url), body: JSON.parse(init.body), headers: new Headers(init.headers) }; return Response.json(provider === 'gemini' ? { totalTokens: 731 } : { input_tokens: 731 }); } });
  const measurement = await counter.countPreparedContext({ messages, tools, model: model(provider) });
  const fields = provider === 'openai' ? ['model', 'input', 'instructions', 'tools', 'tool_choice', 'text', 'reasoning', 'parallel_tool_calls'] : ['model', 'messages', 'system', 'tools', 'tool_choice', 'thinking', 'output_config'];
  assert.deepEqual(counting.body, provider === 'gemini' ? { generateContentRequest: { ...generation, model: `models/${models.gemini}` } } : select(generation, fields));
  assert.match(counting.url, provider === 'openai' ? /\/responses\/input_tokens$/ : provider === 'anthropic' ? /\/messages\/count_tokens$/ : /:countTokens$/);
  assert.equal(measurement.inputTokens, 731); assert.equal(measurement.method, 'provider'); assert.equal(measurement.exact, false);
  assert.ok(!JSON.stringify(measurement).includes('injected-key')); assert.match(measurement.requestHash, /^[a-f0-9]{64}$/);
});

test('CTX-RUNTIME-COUNT local llama.cpp uses full chat body and runtime measurement', async () => {
  let wire;
  const counter = createContextTokenCounter({ resolveProfile: async () => ({ baseURL: 'http://127.0.0.1:9000/v1' }), fetchFn: async (url, init) => { wire = { url: String(url), body: JSON.parse(init.body) }; return Response.json({ input_tokens: 123 }); } });
  const count = await counter.countPreparedContext({ messages, tools, model: model('local') });
  assert.equal(wire.url, 'http://127.0.0.1:9000/v1/chat/completions/input_tokens'); assert.deepEqual(wire.body.messages, messages); assert.deepEqual(wire.body.tools, tools);
  assert.equal(count.method, 'runtime'); assert.equal(count.exact, true);
});

test('CTX-COUNT-FAILURE distinguishes absent endpoint from auth, network and malformed data', async () => {
  for (const [status, payload, code] of [[401, {}, 'CTX_TOKEN_AUTH'], [429, {}, 'CTX_TOKEN_HTTP'], [200, { input_tokens: -1 }, 'CTX_TOKEN_RESPONSE_INVALID'], [200, { input_tokens: '12' }, 'CTX_TOKEN_RESPONSE_INVALID']]) {
    const counter = createContextTokenCounter({ resolveProfile: async () => ({ baseURL: 'http://127.0.0.1:9000/v1' }), fetchFn: async () => Response.json(payload, { status }) });
    await assert.rejects(counter.countPreparedContext({ messages, model: model('local') }), { code });
  }
  const unavailable = createContextTokenCounter({ resolveProfile: async () => ({ baseURL: 'http://127.0.0.1:9000/v1' }), fetchFn: async () => new Response('', { status: 404 }) });
  assert.equal((await unavailable.countPreparedContext({ messages, model: model('local') })).method, 'heuristic');
});

test('CTX-NO-IMPLICIT-CLOUD missing cloud credentials cannot fall back to environment or another provider', async () => {
  let calls = 0;
  const counter = createContextTokenCounter({ resolveProfile: async () => ({}), fetchFn: async () => { calls++; } });
  await assert.rejects(counter.countPreparedContext({ messages, model: model('openai') }), { code: 'CTX_TOKEN_AUTH' });
  const result = await counter.countPreparedContext({ messages, tools, model: model('openrouter') });
  assert.equal(result.method, 'heuristic'); assert.equal(result.exact, false); assert.equal(calls, 0);
  assert.ok(result.estimatedMarginTokens > 0);
});

test('CTX-REQUEST-HASH includes tools and injected native options but excludes credentials', async () => {
  let credential = 'first'; let instruction = 'first';
  const counter = createContextTokenCounter({ resolveProfile: async () => ({ apiKey: credential, nativeRequestBuilder: async () => ({ body: { model: models.openai, input: [], instructions: instruction, tools }, headers: {} }) }), fetchFn: async () => Response.json({ input_tokens: 10 }) });
  const first = await counter.countPreparedContext({ messages, tools, model: model('openai') }); credential = 'second';
  assert.equal((await counter.countPreparedContext({ messages, tools, model: model('openai') })).requestHash, first.requestHash);
  instruction = 'second'; assert.notEqual((await counter.countPreparedContext({ messages, tools, model: model('openai') })).requestHash, first.requestHash);
});

for (const provider of ['openai', 'anthropic', 'gemini']) test(`CTX-WIRE-OPTIONS-${provider} shared compilation includes actual reasoning and generation options`, async () => {
  const requestOptions = { reasoning_effort: 'low', max_completion_tokens: 512, tool_choice: 'auto', top_p: 0.9 };
  let outbound;
  await assert.rejects(nativeProviderResponse({ provider, model: models[provider], apiKey: 'fixture-only', body: { messages, tools, ...requestOptions, stream: false }, fetchFn: async (_url, init) => { outbound = JSON.parse(init.body); throw new Error('local capture'); } }));
  const compiled = await buildPreparedProviderRequest({ messages, tools, model: model(provider), requestOptions });
  assert.deepEqual(compiled.body, outbound);
  assert.deepEqual(Object.keys(compiled.headers).filter(name => !['anthropic-version', 'anthropic-beta'].includes(name)), []);
  let counted;
  const counter = createContextTokenCounter({ resolveProfile: async () => ({ apiKey: 'injected', nativeRequestBuilder: args => buildPreparedProviderRequest({ ...args, requestOptions }) }), fetchFn: async (_url, init) => { counted = JSON.parse(init.body); return Response.json(provider === 'gemini' ? { totalTokens: 123 } : { input_tokens: 123 }); } });
  await counter.countPreparedContext({ messages, tools, model: model(provider) });
  if (provider === 'gemini') assert.deepEqual(counted.generateContentRequest, { ...outbound, model: `models/${models.gemini}` });
  if (provider === 'anthropic') assert.deepEqual(counted.thinking, outbound.thinking);
  if (provider === 'openai') assert.deepEqual(counted.reasoning, outbound.reasoning);
});

test('CTX-REQUEST-OPTIONS rejects auth overrides and output beyond reserved tokens', async () => {
  for (const requestOptions of [{ headers: { authorization: 'secret' } }, { max_tokens: 3000 }, { max_tokens: -1 }]) {
    await assert.rejects(buildPreparedProviderRequest({ messages, tools, model: model('openai'), requestOptions }), { code: 'CTX_PROVIDER_CONTEXT_INVALID' });
  }
});

test('CTX-COUNT-NETWORK provider failures retain no response secrets and do not retry', async () => {
  let calls = 0;
  const counter = createContextTokenCounter({ resolveProfile: async () => ({ apiKey: 'injected' }), fetchFn: async () => { calls++; throw new Error('secret upstream URL'); } });
  await assert.rejects(counter.countPreparedContext({ messages, model: model('openai') }), error => error.code === 'CTX_TOKEN_NETWORK' && !JSON.stringify(error).includes('secret') && !error.message.includes('secret'));
  assert.equal(calls, 1);
});

/*
 * 09/09 — trovato dal GIRO VERO (D1, glm-5.3-flash): la stima euristica contava i BYTE come token —
 * 70.903 «token» per un corpo di 39.513 byte che OpenRouter ha misurato in 10.073 token
 * (3,92 byte/token, 3,64 caratteri/token, italiano). Con la finestra a 16.384 ogni richiesta sembrava
 * un overflow e la compattazione partiva forzata a ogni giro. Qui la stima deve stare vicino al
 * conteggio vero, restando prudente: byte/3,5 sta a +12% e il margine dichiarato copre il resto.
 */
test('CTX-HEURISTIC-CALIBRATED bytes are not tokens: an Italian body of 39.5k bytes estimates near 10-11k, never 39k', async () => {
  const counter = createContextTokenCounter({ resolveProfile: async () => ({ apiKey: null }), fetchFn: async () => { throw new Error('nessuna rete attesa'); } });
  const body = [];
  for (let i = 0; i < 40; i++) {
    body.push({ role: 'user', content: `Punto ${i + 1}: come gestiamo la guardia di stallo nel registro dei processi? Dammi una proposta concreta.` });
    body.push({ role: 'assistant', content: `Proposta ${i + 1}. Decisione: adottiamo la regola R${i + 1}, che prevede tre passaggi. Primo, ogni processo avviato scrive una riga con identificatore, comando, cartella e istante di avvio, così il registro non dipende dalla memoria del processo padre. Secondo, il silenzio viene valutato ogni ${5 + (i % 7)} secondi con una finestra mobile di ${20 + i} eventi: se non arriva niente per ${30 + i * 2} secondi il processo è marcato «silenzioso», non «fallito», perché il silenzio non è un esito. Terzo, il verdetto resta nel registro con l'ora e la ragione, e chi legge domani trova la causa e non solo il numero. Vincolo aggiunto: nessun valore scritto a mano, tutto viene misurato dal processo stesso. Nota per il prossimo passo: la regola R${i + 1} va provata anche al contrario, cioè con un processo che parla ma non progredisce.` });
  }
  const bytes = Buffer.byteLength(JSON.stringify({ messages: body }), 'utf8');
  const result = await counter.countPreparedContext({ messages: body, tools: [], model: { provider: 'other-provider', model: 'x', windowTokens: 16384, responseReserve: 2048 } });
  assert.equal(result.method, 'heuristic');
  assert.ok(result.inputTokens < bytes * 0.4, `la stima (${result.inputTokens}) non può valere quanto i byte (${bytes}): misurati 3,92 byte per token`);
  assert.ok(result.inputTokens >= Math.floor(bytes / 3.92), `la stima (${result.inputTokens}) deve restare PRUDENTE, mai sotto il conteggio vero (${Math.floor(bytes / 3.92)})`);
  assert.ok(result.inputTokens <= Math.ceil(bytes / 3.92 * 1.2), `la stima (${result.inputTokens}) non deve superare il vero di oltre il 20%`);
});
