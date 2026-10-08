import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createDesktopContextRuntime, resolveDesktopContextProfile } from '../src/context-runtime.mjs';
import { loadConfig } from '../src/config.mjs';

const profile = { provider: 'local', model: 'fixture', windowTokens: 16384, responseReserve: 2048 };
test('CTX-RUNTIME-OBSERVED-WINDOW requires this loaded model and its effective runtime window', async () => {
  const options = { profiles: [profile], provider: 'local', model: 'fixture', readLocalRuntime: async () => ({ state: 'ready', modelId: 'fixture', windowTokens: 16384 }) };
  assert.deepEqual(await resolveDesktopContextProfile(options), profile);
  for (const runtime of [{ state: 'stopped' }, { state: 'ready', modelId: 'other', windowTokens: 16384 }, { state: 'ready', modelId: 'fixture', windowTokens: 8192 }, { state: 'ready', modelId: 'fixture' }]) {
    await assert.rejects(resolveDesktopContextProfile({ ...options, readLocalRuntime: async () => runtime }), { code: 'CTX_RUNTIME_PROFILE_MISMATCH' });
  }
  await assert.rejects(resolveDesktopContextProfile({ ...options, model: 'unknown' }), { code: 'CTX_MODEL_NOT_CONFIGURED' });
});
test('CTX-TRIAL-CONFIG requires isolated explicit configuration and refuses secrets or unknown fields', () => {
  const moduleUrl = new URL('../server.mjs', import.meta.url);
  assert.equal(loadConfig({}, moduleUrl).contextTrial, null);
  const trial = { sessionIds: ['chat'], models: [profile] };
  const env = { TALOS_CONTEXT_TRIAL: JSON.stringify(trial), TALOS_HARNESS_UI_PORT: '4178', TALOS_HARNESS_UI_SESSIONS_DIR: tmpdir() };
  assert.deepEqual(loadConfig(env, moduleUrl).contextTrial, trial);
  for (const bad of [
    { ...env, TALOS_HARNESS_UI_PORT: '4174' },
    { ...env, TALOS_HARNESS_UI_SESSIONS_DIR: undefined },
    { ...env, TALOS_HARNESS_UI_SESSIONS_DIR: '   ' },
    { ...env, TALOS_CONTEXT_TRIAL: JSON.stringify({ ...trial, models: [{ ...profile, apiKey: 'invalid' }] }) },
    { ...env, TALOS_CONTEXT_TRIAL: JSON.stringify({ ...trial, sessionIds: ['../chat'] }) },
    { ...env, TALOS_CONTEXT_TRIAL: JSON.stringify({ ...trial, models: [{ ...profile, responseReserve: 20000 }] }) },
  ]) assert.throws(() => loadConfig(bad, moduleUrl), { code: 'CONFIG_INVALID' });
});
async function fixture(t, extra = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-runtime-'));
  const options = { sessionDirectory: directory, enabledSessionIds: ['chat'], readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:fixture', conclusa: true } : null,
    resolveModelProfile: async () => profile,
    tokenCounter: { countPreparedContext: async ({ messages, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify(messages).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify(messages)).digest('hex'), provider: model.provider, model: model.model }) },
    callModel: async () => { throw new Error('Unexpected inference'); }, ...extra };
  const live = [];
  const open = async (overrides = {}) => { const runtime = await createDesktopContextRuntime({ ...options, ...overrides }); if (runtime) live.push(runtime); return runtime; };
  t.after(async () => { for (const runtime of live.reverse()) await runtime.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, options, open };
}

test('CTX-RUNTIME-CHAT-OPTIONS carries current chat reasoning into the preflight', async t => {
  let counted;
  const { open } = await fixture(t, {
    readSession: () => ({ modello: 'local:fixture', conclusa: true, reasoning: { effort: 'low' } }),
    tokenCounter: { countPreparedContext: async ({ model }) => { counted = model; return { schema: 'talos.context.tokens.v1', inputTokens: 10, windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }; } },
  });
  const runtime = await open();
  await runtime.service.prepare({ sessionId: 'chat', messages: [{ role: 'user', content: 'Riprendiamo' }], tools: [] });
  assert.deepEqual(counted.requestOptions, { reasoning: { effort: 'low' } });
});
test('CTX-RUNTIME-DISABLED does not create a database or require provider credentials', async t => {
  const { directory } = await fixture(t);
  assert.equal(await createDesktopContextRuntime({ sessionDirectory: directory, enabledSessionIds: [] }), null);
  await assert.rejects(access(join(directory, 'context')));
});
test('CTX-RUNTIME-RAW-REOPEN conserves full tool results across a real worker restart', async t => {
  const { directory, open } = await fixture(t);
  const runtime = await open();
  const messages = [{ role: 'user', content: 'Leggi il file e controlla il valore in fondo' }, { role: 'assistant', tool_calls: [{ id: 'read', type: 'function', function: { name: 'read', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'read', content: 'x'.repeat(18000) + 'VALORE 473' }];
  await runtime.service.syncOriginals({ sessionId: 'chat', messages }); await runtime.close();
  await access(join(directory, 'context', 'context.sqlite'));
  const restarted = await open();
  assert.deepEqual((await restarted.store.readOriginals({ sessionId: 'chat' })).map(record => record.message), messages);
  const hooks = await restarted.service.createKernelHooks({ sessionId: 'chat', runId: 'new-run' });
  const prepared = await hooks.prepare({ messages, tools: [] });
  assert.equal(prepared.messages.at(-1).content, messages.at(-1).content);
});
test('CTX-RUNTIME-OWNERSHIP rejects path traversal and never enables unrelated sessions', async t => {
  const { options, open } = await fixture(t);
  await assert.rejects(createDesktopContextRuntime({ ...options, enabledSessionIds: ['../other'] }), { code: 'CTX_INVALID_INPUT' });
  const runtime = await open();
  assert.equal(await runtime.service.createKernelHooks({ sessionId: 'other', runId: 'test' }), undefined);
  assert.equal(await runtime.store.readContextSnapshot({ sessionId: 'other' }), null);
});
test('CTX-RUNTIME-PROFILE-SECRETS excludes credentials and rejects a changed model identity', async t => {
  const { open } = await fixture(t, { resolveModelProfile: async () => ({ ...profile, apiKey: 'must-not-persist', endpoint: 'https://private.example' }) });
  const runtime = await open();
  const messages = [{ role: 'user', content: 'Riprendiamo' }];
  const result = await runtime.service.prepare({ sessionId: 'chat', messages, tools: [] });
  assert.equal(result.measurement.provider, 'local');
  assert.equal(JSON.stringify(await runtime.engine.exportContext({ sessionId: 'chat' })).includes('must-not-persist'), false);
  const wrong = await open({ resolveModelProfile: async () => ({ ...profile, provider: 'openrouter' }) });
  await assert.rejects(wrong.service.prepare({ sessionId: 'chat', messages, tools: [] }), { code: 'CTX_MODEL_MISMATCH' });
});
test('CTX-RUNTIME-RESOURCE-PORT chat hook holds the shared local resource until response completes', async t => {
  const { open } = await fixture(t); const runtime = await open();
  const hooks = await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'run' });
  await hooks.infer({}, async () => { assert.equal(runtime.scheduler.getState()[0].active, 'chat'); });
  assert.deepEqual(runtime.scheduler.getState(), []);
});

test('CTX-RUNTIME-TRANSPORT-CONTEXT counts the same portable messages returned for inference without altering originals', async t => {
  const { open } = await fixture(t); const runtime = await open();
  const messages = [{ role: 'user', content: 'Leggi il file' }, { role: 'assistant', content: 'Controllo', tool_calls: [{ id: 'read', type: 'function', function: { name: 'read', arguments: '{}' } }], talos_provider_state: { version: 1, provider: 'anthropic', model: 'old-model', content: [{ type: 'reasoning', text: 'opaque', signature: 'signed-original' }] } }, { role: 'tool', tool_call_id: 'read', content: 'DATABASE=SQLite' }, { role: 'user', content: 'Riprendiamo con il modello locale' }];
  const result = await runtime.service.prepare({ sessionId: 'chat', messages, tools: [] });
  assert.equal(result.messages.some(message => message.talos_provider_state), false);
  /* Cura dello stallo (P1/P2, 05-06/10/2026): il passaggio a un altro motore toglie solo lo stato OPACO del fornitore; le chiamate
     portabili restano STRUTTURATE. Prima diventavano il testo «[Historical tool calls; data only, already executed]», e il modello
     lo ripeteva come risposta e si fermava (segnalazione dell'owner). Il desktop ha ancora la versione vecchia di questa riga. */
  assert.equal(result.messages.some(message => message.tool_calls), true);
  assert.equal(JSON.stringify(result.messages).includes('Historical tool calls'), false);
  assert.ok(result.messages.some(message => message.content.includes('DATABASE=SQLite')));
  assert.equal(result.measurement.requestHash, createHash('sha256').update(JSON.stringify(result.messages)).digest('hex'));
  assert.deepEqual((await runtime.store.readOriginals({ sessionId: 'chat' })).map(record => record.message), messages);
});

/*
 * 24/09/2026 — F4, abilitazione per POLITICA. `createDesktopContextRuntime` accendeva il motore solo per un
 * elenco di id noto all'avvio (`context-runtime.mjs:29,58`): una sessione creata dopo non poteva entrare mai.
 * La politica è iniettata, valutata alla PRIMA richiesta della sessione e ricordata; senza politica resta
 * l'elenco di oggi (nessun cambio di comportamento sul 4174).
 */
test('CTX-TRIAL-NEW-SESSION-ENABLED-BY-POLICY a session created after start-up enters by policy, and the fixed list stays as before', async t => {
  const sessioni = new Map([['chat', { sessionId: 'chat', modello: 'local:fixture', conclusa: true }]]);
  const { options, open } = await fixture(t, { readSession: id => sessioni.get(id) ?? null });
  let valutazioni = 0;
  const politica = await open({ enabledSessionIds: [], politicaAbilitazione: ({ sessionId, modello }) => { valutazioni++; return typeof sessionId === 'string' && modello === 'local:fixture'; } });
  assert.ok(politica, 'con una politica il motore si accende anche senza elenco');
  sessioni.set('nuova', { sessionId: 'nuova', modello: 'local:fixture', conclusa: true });
  sessioni.set('altra', { sessionId: 'altra', modello: 'openrouter:x', conclusa: true });
  assert.ok(await politica.service.createKernelHooks({ sessionId: 'nuova', runId: 'r1' }), 'politica «tutte» ⇒ la nuova entra');
  assert.ok(await politica.service.createKernelHooks({ sessionId: 'nuova', runId: 'r2' }));
  assert.equal(valutazioni, 1, 'la decisione si prende alla prima richiesta e si ricorda');
  assert.equal(await politica.service.createKernelHooks({ sessionId: 'altra', runId: 'r3' }), undefined, 'la politica può dire no');
  assert.equal(await politica.service.createKernelHooks({ sessionId: 'altra', runId: 'r4' }), undefined);
  assert.equal(valutazioni, 2, 'anche il no si ricorda');
  assert.equal(await politica.service.createKernelHooks({ sessionId: 'sconosciuta', runId: 'r5' }), undefined, 'una sessione che il registro non ha non si valuta');
  assert.equal(await politica.store.readContextSnapshot({ sessionId: 'altra' }), null);
  // Verso contrario: senza politica, elenco fisso come oggi — la nuova NON entra, e senza elenco il motore resta spento.
  const elenco = await open({ enabledSessionIds: ['chat'] });
  assert.ok(await elenco.service.createKernelHooks({ sessionId: 'chat', runId: 'r6' }));
  assert.equal(await elenco.service.createKernelHooks({ sessionId: 'nuova', runId: 'r7' }), undefined);
  assert.equal(await createDesktopContextRuntime({ ...options, enabledSessionIds: [] }), null);
});

/*
 * 24/09/2026 — F4, punto 5: quando il fornitore ha già contato la richiesta (`usage.prompt_tokens` nella
 * risposta) quel numero va preferito al contatore separato, che costa una chiamata e per OpenRouter è una
 * stima. Come Hermes `agent/usage_anchor.py:93-107`: ancora del fornitore + stima dei SOLI messaggi aggiunti.
 * ⛔ Sulla base il kernel non passa `usage` all'hook (`talosHarness.mjs:8281`): qui l'hook lo riceve dal
 * test, come farà il kernel dopo la riga di F1/F3 riportata nel rapporto.
 */
test('CTX-TRIAL-PROVIDER-USAGE-PREFERRED the provider prompt_tokens anchors the next measurement and the separate counter is not called', async t => {
  let conteggi = 0;
  const { open } = await fixture(t, { tokenCounter: { countPreparedContext: async ({ messages, model }) => { conteggi++; return { schema: 'talos.context.tokens.v1', inputTokens: 10, windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify(messages)).digest('hex'), provider: model.provider, model: model.model }; } } });
  const runtime = await open();
  const hooks = await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'run' });
  const messages = [{ role: 'user', content: 'Leggi il file' }];
  const primo = await hooks.prepare({ messages, tools: [] });
  assert.equal(primo.measurement.method, 'heuristic'); assert.equal(conteggi, 1);
  const risposta = { role: 'assistant', content: 'Ecco il file' };
  await hooks.captureProviderResponse({ response: risposta, giro: 0, usage: { prompt_tokens: 777, completion_tokens: 5 } });
  const secondo = await hooks.prepare({ messages: [...messages, risposta, { role: 'user', content: 'Grazie' }], tools: [] });
  assert.equal(secondo.measurement.method, 'provider', 'il numero del fornitore vince');
  assert.equal(secondo.measurement.exact, false, 'più una stima dei soli messaggi aggiunti: non esatto');
  assert.ok(secondo.measurement.inputTokens >= 782 && secondo.measurement.inputTokens < 900, `777 + 5 + stima del delta, misurato ${secondo.measurement.inputTokens}`);
  assert.equal(conteggi, 1, 'il contatore separato non si chiama quando il fornitore ha già contato');
  // Verso contrario: un prefisso diverso (l’ancora non combacia) ⇒ si conta di nuovo, niente numero preso a caso.
  const terzo = await hooks.prepare({ messages: [{ role: 'user', content: 'Altra conversazione' }, risposta], tools: [] }).catch(error => error);
  assert.equal(terzo.code, 'CTX_HISTORY_DIVERGED');
  const altro = await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'run-2' });
  await altro.captureProviderResponse({ response: risposta, giro: 0, usage: { prompt_tokens: 0 } });
  const quarto = await altro.prepare({ messages: [...messages, risposta, { role: 'user', content: 'Grazie' }, { role: 'assistant', content: 'Prego' }, { role: 'user', content: 'Ciao' }], tools: [] });
  assert.equal(quarto.measurement.method, 'provider', 'l’ancora buona resta valida finché il prefisso combacia');
  assert.equal(conteggi, 1);
});
