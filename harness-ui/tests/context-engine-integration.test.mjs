import test from 'node:test';
import assert from 'node:assert/strict';
import { avviaSessione } from '../src/agent-service.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const history = [{ role: 'user', content: 'Riprendiamo da dove eravamo' }, { role: 'assistant', content: 'Controllo le decisioni.' }];
const completed = { ok: true, esito: { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: history } };

test('CTX-OPENROUTER-NO-DOUBLE-COMPRESSION disables the documented plugin only on context-owned requests', async () => {
  let sent;
  const capture = async (_url, init) => { sent = JSON.parse(init.body); return Response.json({ choices: [{ message: { content: 'Sintesi' }, finish_reason: 'stop' }] }); };
  const plugins = [{ id: 'web' }, { id: 'context-compression', enabled: true }];
  const adapter = createOwnerRuntimeAdapter({
    modulePath: 'C:/fixture/runtime.mjs',
    importFn: async () => ({ talosLavora: input => input.fetchDiRete('https://openrouter.ai/api/v1/chat/completions', { body: JSON.stringify({ model: 'provider/model', messages: history, plugins }) }) }),
    destinazioneModelloDeps: { leggiChiave: () => 'fixture-key', leggiRuntime: () => ({ endpoint: 'https://openrouter.ai/api/v1' }) },
  });
  await adapter.talosLavora({ fetchDiRete: capture });
  assert.deepEqual(sent.plugins, plugins);
  await adapter.talosLavora({ contextHooks: {}, fetchDiRete: capture });
  assert.deepEqual(sent.plugins, [{ id: 'web' }, { id: 'context-compression', enabled: false }]);
  await adapter.callContextModel({ provider: 'openrouter', model: 'provider/model', messages: history, maxOutputTokens: 128, fetchDiRete: capture });
  assert.deepEqual(sent.plugins, [{ id: 'context-compression', enabled: false }]);
});

test('CTX-CONTEXT-TRANSPORT-LOCAL uses the existing supervisor without cloud fallback or tools', async () => {
  let body; let clouds = 0;
  const adapter = createOwnerRuntimeAdapter({ destinazioneModelloDeps: { leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true, chiamaLocale: async (path, options) => {
    assert.equal(path, '/v1/chat/completions'); body = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: 'Sintesi verificabile' }, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 30 } });
  } } });
  const result = await adapter.callContextModel({ provider: 'local', model: 'fixture', messages: history, maxOutputTokens: 2048, fetchDiRete: async () => { clouds++; throw new Error('No cloud'); } });
  assert.equal(result.text, 'Sintesi verificabile'); assert.equal(result.finishReason, 'stop');
  assert.equal(result.usage.prompt_tokens, 120); assert.equal(body.max_tokens, 2048);
  assert.equal(body.model, 'fixture'); assert.deepEqual(body.tools, []); assert.equal(clouds, 0);
});

test('CTX-CONTEXT-TRANSPORT-NO-FALLBACK refuses an unavailable local transport before network', async () => {
  let called = false;
  const adapter = createOwnerRuntimeAdapter();
  await assert.rejects(adapter.callContextModel({ provider: 'local', model: 'fixture', messages: history, maxOutputTokens: 2048, fetchDiRete: async () => { called = true } }), { code: 'CTX_TRANSPORT_UNAVAILABLE' });
  assert.equal(called, false);
});

test('CTX-CONTEXT-TRANSPORT-TOOLS refuses tool calls from a summary and retains billed usage', async () => {
  const adapter = createOwnerRuntimeAdapter({ destinazioneModelloDeps: { leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true, chiamaLocale: async () => Response.json({ choices: [{ message: { content: 'Sintesi', tool_calls: [{ id: 'bad' }] }, finish_reason: 'tool_calls' }], usage: { completion_tokens: 20 } }) } });
  await assert.rejects(adapter.callContextModel({ provider: 'local', model: 'fixture', messages: history, maxOutputTokens: 2048 }), error => error.code === 'CTX_SUMMARY_TOOLS' && error.usage.completion_tokens === 20);
});
function registry(options = {}) {
  return createSessionRegistry({
    modello: 'local:test', chiave: 'test-routing-only',
    guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: () => ({ cartella: '/fixture', task: { id: 'test', consegna: history[0].content }, comandoProva: 'node --test' }),
    avviaSessioneFn: async input => { input.onEvento({ type: 'RunFinished' }); return structuredClone(completed); },
    ...options,
  });
}

test('CTX-AGENT-HOOK-PASS forwards the owned context hooks to the kernel unchanged', async () => {
  const contextHooks = { capture: async () => {}, prepare: async () => ({ messages: history }) };
  let received;
  const result = await avviaSessione({ cartella: '/fixture', task: { consegna: 'Leggi il file e controlla' }, modello: 'local:test', chiave: 'test', onEvento: () => {}, contextHooks,
    talosLavoraFn: async input => { received = input.contextHooks; return completed.esito; } });
  assert.equal(result.ok, true);
  assert.equal(received, contextHooks);
});

test('CTX-REGISTRY-HOOK-ISOLATION binds hooks to this run and keeps sync launch compatibility', async () => {
  const calls = [], hooks = { capture: async () => {} }; let received;
  const r = registry({ contextHooksFn: async input => { calls.push(input); return hooks; }, avviaSessioneFn: async input => { received = input; input.onEvento({ type: 'RunFinished' }); return completed; } });
  const started = r.avvia('test');
  assert.equal(typeof started.sessionId, 'string');
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sessionId, started.sessionId);
  assert.equal(received.contextHooks, hooks);
  assert.equal(r.leggiSessioneContesto(started.sessionId).modello, 'local:test');
  assert.equal(r.leggiSessioneContesto('absent'), null);
});

test('CTX-REGISTRY-COMPACT-COMMON delegates manual compaction without replacing original history', async () => {
  let request; let legacy = 0;
  const r = registry({ contextCompactFn: async input => { request = input; return { ok: true, compattato: true }; }, compattaSessioneFn: async () => { legacy++; throw new Error('Legacy must not run'); } });
  const started = r.avvia('test'); await tick();
  assert.deepEqual(await r.compatta(started.sessionId), { ok: true, compattato: true });
  assert.equal(request.sessionId, started.sessionId);
  assert.deepEqual(request.messages, history);
  assert.equal(legacy, 0);
});

test('CTX-REGISTRY-PREPARE-FAILURE refuses inference after archive preparation fails', async () => {
  let calls = 0;
  const r = registry({ contextHooksFn: async () => { throw Object.assign(new Error('Archivio non disponibile'), { code: 'CTX_PERSIST_FAILED' }); }, avviaSessioneFn: async () => { calls++; return completed; } });
  const started = r.avvia('test'); await tick();
  assert.equal(calls, 0);
  assert.equal(r.elenca().find(s => s.sessionId === started.sessionId).conclusa, true);
});

/*
 * 09/09 — trovato dal GIRO VERO (D1, glm-5.3-flash via OpenRouter): la sintesi tornava senza `content`
 * perché il modello ragiona per difetto e il ragionamento si mangiava il budget («Reasoning is mandatory
 * for this endpoint and cannot be disabled» quando si prova a spegnerlo). Misurato con quattro chiamate:
 * senza campo reasoning 133 token di ragionamento; con `reasoning.effort: 'low'` 0 token, `finish_reason:
 * stop`, costo più basso. Una sintesi non ha bisogno di pensare a lungo: chiede poco ragionamento, nel
 * rispetto delle capacità dichiarate dal catalogo (mai `none` a un modello che lo vieta).
 */
test('CTX-SUMMARY-LOW-REASONING a summary asks the provider for low reasoning effort, within the model capability rules', async () => {
  let sent = null;
  const adapter = createOwnerRuntimeAdapter({
    destinazioneModelloDeps: { leggiChiave: () => 'k', leggiRuntime: () => ({ endpoint: 'https://openrouter.ai/api/v1' }), localePronto: () => false, chiamaLocale: async () => { throw new Error('no'); } },
    modelCapabilityFn: async () => ({ reasoning: { mandatory: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' } }),
  });
  const result = await adapter.callContextModel({ provider: 'openrouter', model: 'z-ai/glm-5.3-flash', messages: history, maxOutputTokens: 2048,
    fetchDiRete: async (_url, init) => { sent = JSON.parse(init.body); return Response.json({ choices: [{ message: { content: '{"text":"ok"}' }, finish_reason: 'stop' }], usage: { completion_tokens: 12 } }); } });
  assert.deepEqual(sent.reasoning, { effort: 'low' }, 'la sintesi chiede poco ragionamento, esplicitamente');
  assert.equal(result.text, '{"text":"ok"}');
});

test('CTX-SUMMARY-LOW-REASONING-CAPABILITY a model that only supports "high" gets high, never a value it refuses', async () => {
  let sent = null;
  const adapter = createOwnerRuntimeAdapter({
    destinazioneModelloDeps: { leggiChiave: () => 'k', leggiRuntime: () => ({ endpoint: 'https://openrouter.ai/api/v1' }), localePronto: () => false, chiamaLocale: async () => { throw new Error('no'); } },
    modelCapabilityFn: async () => ({ reasoning: { mandatory: true, supportedEfforts: ['high'], defaultEffort: 'high' } }),
  });
  await adapter.callContextModel({ provider: 'openrouter', model: 'x/solo-high', messages: history, maxOutputTokens: 2048,
    fetchDiRete: async (_url, init) => { sent = JSON.parse(init.body); return Response.json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: {} }); } });
  assert.deepEqual(sent.reasoning, { effort: 'high' });
});

test('CTX-SUMMARY-REASONING-ATE-BUDGET a reply with no text but reasoning tokens is a truncation, said in words', async () => {
  const adapter = createOwnerRuntimeAdapter({ destinazioneModelloDeps: { leggiChiave: () => 'k', leggiRuntime: () => ({ endpoint: 'https://openrouter.ai/api/v1' }), localePronto: () => false, chiamaLocale: async () => { throw new Error('no'); } } });
  await assert.rejects(adapter.callContextModel({ provider: 'openrouter', model: 'z-ai/glm-5.3-flash', messages: history, maxOutputTokens: 512,
    fetchDiRete: async () => Response.json({ choices: [{ message: { content: null, reasoning: 'pensa pensa' }, finish_reason: 'length' }], usage: { completion_tokens: 512, completion_tokens_details: { reasoning_tokens: 512 } } }) }),
    error => error.code === 'CTX_TRUNCATED_SUMMARY' && /512 token/.test(error.message) && /ragionamento/.test(error.message) && error.usage?.completion_tokens === 512);
});
