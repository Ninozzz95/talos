import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextModelAdapter, prepareProviderContext, buildPreparedProviderRequest } from '../src/context-provider-adapter.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { parseContextSettings } from '../../context-engine/src/contracts.mjs';
import { REASONING_KEEP_CHARS } from '../../context-engine/src/tool-output-clearing.mjs';

const local = { provider: 'local', model: 'qwen', windowTokens: 16384, responseReserve: 2048, local: true, capabilities: {} };
const call = { id: 'c1', type: 'function', function: { name: 'read', arguments: '{"path":"note"}' } };
const history = provider => [
  { role: 'system', content: 'Instruction' }, { role: 'user', content: 'Read note' },
  { role: 'assistant', content: 'Reading', tool_calls: [call], talos_provider_state: { version: 1, provider, model: 'original', content: [{ type: 'reasoning', text: 'private', providerOptions: { anthropic: { signature: 'real-signature' } } }, { type: 'tool-call', toolCallId: 'c1', toolName: 'read', input: { path: 'note' }, providerOptions: { google: { thoughtSignature: 'real-signature' } } }] } },
  { role: 'tool', tool_call_id: 'c1', content: 'answer' },
];

test('CTX-NO-IMPLICIT-CLOUD resolves only the selected session or explicit model', async () => {
  const model = createContextModelAdapter({ resolveModel: async ({ settings, sessionModel }) => settings.model.mode === 'explicit' ? { ...local, ...settings.model } : sessionModel, callModel: async () => ({}) });
  assert.deepEqual(await model.resolveModel({ sessionModel: local, settings: { model: { mode: 'follow-session' } } }), local);
  assert.equal((await model.resolveModel({ sessionModel: local, settings: { model: { mode: 'explicit', provider: 'local', model: 'gemma' } } })).model, 'gemma');
  const wrong = createContextModelAdapter({ resolveModel: async () => ({ ...local, provider: 'openai' }), callModel: async () => ({}) });
  await assert.rejects(wrong.resolveModel({ sessionModel: local, settings: { model: { mode: 'follow-session' } } }), { code: 'CTX_MODEL_MISMATCH' });
});

test('CTX-MODEL-SUMMARY calls one injected model without tools or retries and preserves usage', async () => {
  let request;
  const model = createContextModelAdapter({ resolveModel: async () => local, callModel: async args => { request = args; args.messages[0].content = 'mutated'; return { text: 'summary', finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 4 } }; } });
  const messages = [{ role: 'user', content: 'summarize' }];
  const result = await model.summarize({ model: local, messages, maxOutputTokens: 500, operationId: 'op' });
  assert.equal(result.text, 'summary'); assert.equal(result.usage.inputTokens, 10);
  assert.deepEqual(request.tools, []); assert.equal(request.maxRetries, 0); assert.equal(request.model, 'qwen');
  assert.equal(messages[0].content, 'summarize');
});

test('CTX-MODEL-SUMMARY rejects absent finish reason and keeps billed usage on failure', async () => {
  const model = createContextModelAdapter({ resolveModel: async () => local, callModel: async () => ({ text: 'partial', usage: { inputTokens: 12 } }) });
  await assert.rejects(model.summarize({ model: local, messages: [], maxOutputTokens: 20 }), e => e.code === 'CTX_SUMMARY_RESPONSE_INVALID' && e.usage.inputTokens === 12);
});

/* R-49 (banco del 01/11/2026): dopo un riassunto `reset` vale per ogni richiesta, e toglieva il ragionamento in chiaro da tutta la coda.
   `reflection/beam` su DigitalOcean rifiutava con 400 «missing its reasoning», DeepSeek con `tools` lo pretende su tutti i turni. */
test('R49-01: il reset da riassunto toglie lo stato opaco e tiene il ragionamento in chiaro di TUTTI i turni dello stesso modello', () => {
  const stato = { version: 1, provider: 'openrouter', model: 'r/beam', content: [{ type: 'reasoning', text: 'x' }] };
  const messaggi = [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b', reasoning_content: 'vecchio' }, { role: 'user', content: 'c' },
    { role: 'assistant', content: 'd', reasoning_content: 'nuovo', talos_provider_state: stato }, { role: 'user', content: 'e' }];
  const prepared = prepareProviderContext({ messages: messaggi, provider: 'openrouter', model: 'r/beam', reset: true });
  assert.equal(prepared.messages[1].reasoning_content, 'vecchio', 'non solo il più nuovo: i byte della coda restano fermi per la cache');
  assert.equal(prepared.messages[3].reasoning_content, 'nuovo');
  assert.equal(prepared.messages[3].talos_provider_state, undefined, 'lo stato opaco si toglie sempre');
  assert.equal(prepared.resetApplied, true);
  assert.deepEqual(prepared.warnings, ['CTX_NATIVE_STATE_RESET']);
});

test('R49-03: i motori locali restano come prima: sul reset il ragionamento in chiaro va via (Mobile, finestre piccole); senza reset resta', () => {
  const messaggi = () => [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b', reasoning_content: 'pensato' }, { role: 'user', content: 'c' }];
  for (const provider of ['local', 'locale-ospite', 'ollama', 'lmstudio', 'llama.cpp']) {
    assert.equal(prepareProviderContext({ messages: messaggi(), provider, model: 'm', reset: true }).messages[1].reasoning_content, undefined, provider);
    assert.equal(prepareProviderContext({ messages: messaggi(), provider, model: 'm', reset: false }).messages[1].reasoning_content, 'pensato', provider);
  }
});

/* D3 (revisione di fine fase, 01/11/2026): R-49 tornava dal livello 1, che toglieva il ragionamento dai turni vecchi: motore e archivio veri, porta vera */
const pensiero = (i) => `Devo controllare il file ${i} e poi decidere. `.repeat(30);
function giroLungo(turni) {
  const messaggi = [{ role: 'user', content: 'Leggi tutti i file.' }];
  for (let i = 0; i < turni; i++) {
    messaggi.push({ role: 'assistant', content: '', tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${i}` }) } }], reasoning_content: pensiero(i) });
    messaggi.push({ role: 'tool', content: `riga ${i}\n`.repeat(300), tool_call_id: `c${i}` });
  }
  return [...messaggi, { role: 'assistant', content: 'Fatto.', reasoning_content: 'ok' }, { role: 'user', content: 'Ora dimmi quanti sono.' }];
}
async function preparaSottoPressione(t, provider) {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  const porta = createContextModelAdapter({ resolveModel: async () => { throw new Error('nessun riassunto in questa prova'); }, callModel: async () => { throw new Error('nessun riassunto in questa prova'); } });
  const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
  const engine = createContextEngine({ store, model: { ...porta, resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('nessun riassunto in questa prova'); } }, tokenCounter: contatore });
  const at = '2026-11-01T10:00:00.000Z';
  for (const [i, message] of giroLungo(30).entries()) await engine.appendOriginal({ sessionId: 'chat', record: { id: `m${i}`, message, createdAt: at } });
  return engine.prepareForRequest({ sessionId: 'chat', sessionModel: { provider, model: 'reflection/beam-1.0-501b-a23b', windowTokens: 33_024, responseReserve: 2048 }, summaryCeilingMs: 0 });
}
const turniConAttrezzi = (messaggi) => messaggi.filter((m) => m.role === 'assistant' && m.tool_calls?.length);

test('R49-04: il livello 1 sopra la soglia: su un fornitore in rete ogni turno con attrezzi tiene il suo ragionamento, accorciato sui vecchi e intero sui recenti', async (t) => {
  const preparata = await preparaSottoPressione(t, 'openrouter');
  assert.equal(preparata.level1?.cleared, 16, 'premessa: le uscite vecchie si sono tolte');
  const turni = turniConAttrezzi(preparata.messages);
  assert.equal(turni.length, 30);
  for (const [i, turno] of turni.entries()) {
    const intero = pensiero(i);
    assert.ok(turno.reasoning_content, `turno ${i}: un fornitore severo risponde 400 senza il campo`);
    assert.equal(turno.reasoning_content, i < 16 ? intero.slice(0, REASONING_KEEP_CHARS) : intero, `turno ${i}`);
  }
});

test('R49-06: senza un modello la porta risponde «no» invece di esplodere: il livello 1 non fa cadere la richiesta', () => {
  const porta = createContextModelAdapter({ resolveModel: async () => null, callModel: async () => null });
  assert.equal(porta.accorciaIlRagionamento(undefined), false);
  assert.equal(porta.accorciaIlRagionamento({ provider: 'openrouter' }), true);
  assert.equal(porta.accorciaIlRagionamento({ provider: 'local' }), false);
});

test('R49-07: Z.AI e Qwen diretti restano sul togliere: la loro documentazione vieta il blocco modificato; OpenRouter accorcia anche z-ai', async (t) => {
  for (const provider of ['zai', 'qwen']) {
    const preparata = await preparaSottoPressione(t, provider);
    assert.equal(preparata.level1?.cleared, 16, provider);
    for (const [i, turno] of turniConAttrezzi(preparata.messages).entries()) {
      assert.equal(turno.reasoning_content, i < 16 ? undefined : pensiero(i), `${provider}, turno ${i}`);
    }
  }
  const porta = createContextModelAdapter({ resolveModel: async () => null, callModel: async () => null });
  assert.equal(porta.accorciaIlRagionamento({ provider: 'openrouter', model: 'z-ai/glm-5.3-flash' }), true);
  assert.equal(porta.accorciaIlRagionamento({ provider: 'fornitore-sconosciuto' }), true);
});

test('R49-05: i motori locali restano come oggi: il livello 1 toglie il ragionamento vecchio; un solo elenco, lo stesso del reset', async (t) => {
  const preparata = await preparaSottoPressione(t, 'local');
  const turni = turniConAttrezzi(preparata.messages);
  assert.equal(preparata.level1?.cleared, 16);
  assert.equal(turni.filter((turno) => Object.hasOwn(turno, 'reasoning_content')).length, 14, 'restano solo i recenti');
  const porta = createContextModelAdapter({ resolveModel: async () => ({}), callModel: async () => ({}) });
  for (const provider of ['local', 'locale-ospite', 'ollama', 'lmstudio', 'llama.cpp']) assert.equal(porta.accorciaIlRagionamento({ provider }), false, provider);
  for (const provider of ['openrouter', 'deepseek', 'chatgpt', 'anthropic', 'ollama-cloud']) assert.equal(porta.accorciaIlRagionamento({ provider }), true, provider);
});

test('R49-02: AL CONTRARIO: il cambio di modello toglie ancora il ragionamento, con o senza reset', () => {
  const stato = { version: 1, provider: 'openrouter', model: 'r/altro', content: [{ type: 'reasoning', text: 'x' }] };
  const messaggi = () => [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b', reasoning_content: 'di un altro modello', talos_provider_state: stato }, { role: 'user', content: 'c' }];
  for (const reset of [true, false]) {
    const prepared = prepareProviderContext({ messages: messaggi(), provider: 'deepseek', model: 'r/beam', reset });
    assert.equal(prepared.messages[1].reasoning_content, undefined, `reset ${reset}`);
    assert.equal(prepared.messages[1].talos_provider_state, undefined, `reset ${reset}`);
  }
});

test('CTX-NATIVE-PREFIX reset strips stale opaque state on a copy and keeps the exchange native', () => {
  const original = history('anthropic'); const before = structuredClone(original);
  const prepared = prepareProviderContext({ messages: original, provider: 'anthropic', model: 'original', reset: true });
  assert.equal(prepared.resetApplied, true); assert.deepEqual(original, before);
  /* revisione stall (major 4, 06/10/2026): anche l'ASSENZA di warning spurio va pinnata — il reset
     emette CTX_NATIVE_STATE_RESET e nient'altro. */
  assert.deepEqual(prepared.warnings, ['CTX_NATIVE_STATE_RESET']);
  assert.ok(prepared.messages.every(m => !m.talos_provider_state && !m.reasoning_content));
  assert.ok(prepared.messages[2].tool_calls?.length === 1);
  assert.equal(prepared.messages[3].role, 'tool'); assert.equal(prepared.messages[3].tool_call_id, 'c1');
  assert.ok(JSON.stringify(prepared.messages).includes('answer'));
  assert.ok(!JSON.stringify(prepared.messages).includes('real-signature'));
  assert.ok(!JSON.stringify(prepared.messages).includes('Historical tool calls'));
});

test('CTX-NATIVE-PREFIX unchanged native state is preserved byte-for-byte through JSON', () => {
  const original = history('anthropic');
  assert.deepEqual(prepareProviderContext({ messages: original, provider: 'anthropic', model: 'original' }).messages, original);
});

test('CTX-MODEL-SWITCH Gemini replays foreign tools natively without carrying foreign signatures', async () => {
  const prepared = prepareProviderContext({ messages: history('anthropic'), provider: 'gemini', model: 'gemini-3.8-flash' });
  const { body } = await buildPreparedProviderRequest({ messages: prepared.messages, model: { provider: 'gemini', model: 'gemini-3.8-flash' } });
  assert.ok(!JSON.stringify(body).includes('real-signature'));
  assert.ok(!JSON.stringify(body).includes('skip_thought_signature_validator') || JSON.stringify(body).includes('functionCall'));
  assert.ok(JSON.stringify(body).includes('functionCall'));
});

test('CTX-TOOL-PAIRING reset refuses orphan tool results and mid-history structural breaks', () => {
  assert.throws(() => prepareProviderContext({ messages: [{ role: 'tool', tool_call_id: 'missing', content: 'bad' }], provider: 'local', model: 'qwen', reset: true }), { code: 'CTX_PENDING_TOOLS' });
  const broken = history('gemini').slice(0, -1); broken.splice(3, 0, { role: 'user', content: 'meanwhile' });
  assert.throws(() => prepareProviderContext({ messages: broken, provider: 'local', model: 'qwen', reset: true }), { code: 'CTX_PENDING_TOOLS' });
});

test('CTX-CANCEL summary and local SDK compilation honor already aborted signal', async () => {
  const signal = AbortSignal.abort(); let calls = 0;
  const model = createContextModelAdapter({ resolveModel: async () => local, callModel: async () => { calls++; } });
  await assert.rejects(model.summarize({ model: local, messages: [], maxOutputTokens: 30, signal }), { name: 'AbortError' });
  await assert.rejects(buildPreparedProviderRequest({ messages: [], model: { provider: 'openai', model: 'gpt-5.4-mini' }, signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('CTX-NATIVE-SIGNATURE-ORDER the pinned SDK bypasses its validator for unsigned replay while real signatures stay attached to their own calls', async () => {
  const original = history('gemini');
  original[2].talos_provider_state.model = 'gemini-3.8-flash';
  const signed = original[2].talos_provider_state.content.at(-1);
  original[2].talos_provider_state.content = [{ ...signed, toolCallId: 'unsigned', providerOptions: {} }, signed];
  original[2].tool_calls.unshift({ ...call, id: 'unsigned' });
  original.splice(3, 0, { role: 'tool', tool_call_id: 'unsigned', content: 'first result' });
  const prepared = prepareProviderContext({ messages: original, provider: 'gemini', model: 'gemini-3.8-flash' });
  assert.deepEqual(prepared.warnings, ['CTX_GEMINI_SIGNATURE_MISSING']);
  const { body } = await buildPreparedProviderRequest({ messages: prepared.messages, model: { provider: 'gemini', model: 'gemini-3.8-flash' } });
  const serialized = JSON.stringify(body);
  assert.ok(serialized.includes('functionCall'));
  assert.ok(serialized.includes('real-signature'));
  assert.ok(serialized.includes('skip_thought_signature_validator'));
});
