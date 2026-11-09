/*
 * Owner 06/11/2026 14:20, from the chat: «Il contesto ha superato la soglia (196.482 su 165.999 token).» — «this notice must not show any
 * more: compaction is handled automatically unless the person wants to change something».
 * Measured on the real engine with the profile of that conversation (DeepSeek V4.1 Flash via OpenRouter, window 266.667, reserve 32.000,
 * trigger 165.999 with the provider anchor — `nucleo-174-tetto-fermo.test.mjs`):
 *  · AUTO-1: past the trigger while the request still fits the input limit (221.333), the engine ALREADY compacts on its own (level 1 clears
 *    an old read, the summary
 *    starts in the background, the request is not held). The provider's `prompt_tokens` for it is over the trigger by construction, and
 *    that is the number the chat's notice compared (`numeriSogliaContesto` in `app.js`): the notice fired at every crossing, while the
 *    automatic compaction was already running.
 *  · AUTO-2: auto compaction turned off by the person (`settings.auto:false`) ⇒ nothing starts: the only case where «Compact now» is theirs.
 * Competitors: Hermes `agent/context_compressor.py:3007` (`should_compress_info`: over the threshold ⇒ compress; a warning only when
 * compression is needed but blocked); Codex `codex-rs/core/src/session/context_window.rs:108` (limit reached ⇒ compact, no notice).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { conAncoraDelFornitore } from '../src/context-token-counters.mjs';
import { budgetDellaMisura } from '../src/context-desktop-service.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { parseContextSettings } from '../../context-engine/src/contracts.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const now = '2026-11-06T13:00:00.000Z';
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const PROFILO = { provider: 'openrouter', model: 'deepseek/deepseek-v4.1-flash', windowTokens: 266_667, responseReserve: 32_000 };
const FINITI = new Set(['committed', 'failed', 'cancelled', 'superseded']);

function contatoreDiOpenRouter() {
  return {
    countPreparedContext: async ({ messages, tools = [], model: m }) => {
      const inputTokens = Math.ceil(Buffer.byteLength(JSON.stringify({ messages, tools }), 'utf8') / 3.5) + messages.length * 4;
      return { schema: 'talos.context.tokens.v1', inputTokens, windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model, estimatedMarginTokens: Math.max(256, Math.ceil(inputTokens * 0.15)) };
    },
  };
}

/** three closed turns of the person, each with a few big reads (no newlines: bytes/3,5 ≈ tokens) */
function storia(token, turni = 3) {
  const messaggi = [{ role: 'system', content: 'sistema' }];
  const letture = 3;
  const lunga = Math.floor((token * 3.5) / (turni * letture));
  for (let g = 0; g < turni; g++) {
    messaggi.push({ role: 'user', content: `Richiesta ${g}` });
    for (let i = 0; i < letture; i++) {
      const id = `c-${g}-${i}`;
      messaggi.push({ role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `src/f${g}-${i}.mjs` }) } }] });
      messaggi.push({ role: 'tool', content: `riga ${g}-${i} `.repeat(Math.ceil(lunga / 10)).slice(0, lunga), tool_call_id: id });
    }
    messaggi.push({ role: 'assistant', content: `fatto ${g}` });
  }
  return messaggi;
}

async function banco(t, { settings = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'auto-compatta-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  let sblocca;
  const cancello = new Promise((r) => { sblocca = r; });
  const chiamate = [];
  t.after(async () => { sblocca(); await new Promise((r) => setTimeout(r, 100)); await store.close(); await rimuoviCartellaDiProvaAttesa(dir); });
  const contatore = conAncoraDelFornitore(contatoreDiOpenRouter());
  // the summary never comes back while the test looks: we only check WHAT the engine decides at the trigger
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async (req) => { chiamate.push(req); await cancello; throw new Error('fine prova'); } };
  const engine = createContextEngine({ store, model, tokenCounter: contatore, clock: () => now, clearedToolPointer: 'Recover it with conversation_search.' });
  const sessionId = 'chat-auto';
  await store.initSession({ sessionId, settings: parseContextSettings(settings) });
  const prima = storia(150_000);
  for (const [i, message] of prima.entries()) await engine.appendOriginal({ sessionId, record: { id: `r${i}`, message, createdAt: now } });
  // the turn before: sent whole (a wide window touches nothing), and the provider's answer anchors the count
  const spedita = await engine.prepareForRequest({ sessionId, messages: prima, tools: [], sessionModel: { ...PROFILO, windowTokens: 1_000_000 } });
  const stima = await contatoreDiOpenRouter().countPreparedContext({ messages: spedita.messages, tools: [], model: PROFILO });
  assert.ok(contatore.registraAncora({ provider: PROFILO.provider, model: PROFILO.model, messages: spedita.messages, usage: { prompt_tokens: stima.inputTokens, completion_tokens: 5 } }));
  // this turn: the person writes, the model reads one more big file ⇒ ~196k: over 165.999, under the input limit 221.333
  const nuovi = [
    { role: 'user', content: 'Adesso correggi tutto.' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'c-x', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"src/grande.mjs"}' } }] },
    { role: 'tool', content: 'grande '.repeat(Math.ceil((44_000 * 3.5) / 7)), tool_call_id: 'c-x' },
  ];
  for (const [i, message] of nuovi.entries()) await engine.appendOriginal({ sessionId, record: { id: `n${i}`, message, createdAt: now } });
  const messaggi = [...prima, ...nuovi];
  const preparata = await engine.prepareForRequest({ sessionId, messages: messaggi, tools: [], sessionModel: PROFILO });
  const snapshot = await store.readContextSnapshot({ sessionId });
  return { preparata, snapshot, chiamate, messaggi, stima };
}

test('AUTO-1 — past 165.999 the engine already compacts on its own: the summary starts in the background, the request is not held', async (t) => {
  const { preparata, snapshot, stima } = await banco(t);
  const budget = budgetDellaMisura(snapshot);
  assert.equal(snapshot.settings.auto, true, 'auto compaction is on by default');
  assert.ok(stima.inputTokens + 44_000 > budget.triggerTokens, `the turn crosses the threshold: ${stima.inputTokens} + 44k`);
  // measured 06/11: level 1 clears one old read (165.309 estimated after it) AND the summary starts: nobody has to press anything
  assert.ok(preparata.job, 'an automatic summary has started');
  assert.match(preparata.job.idempotencyKey, /^auto-/u);
  assert.equal(preparata.waiting, false, 'the request is not held: the summary works in the background');
  const lavoro = (snapshot.jobs ?? []).find((j) => j.id === preparata.job.id);
  assert.ok(lavoro && !FINITI.has(lavoro.state), `the snapshot the chat reads shows it in flight: ${lavoro?.state}`);
  assert.ok(preparata.toolOutputsCleared >= 1, 'level 1 too, before the summary');
});

test('AUTO-2 — the other way round: auto compaction turned off ⇒ nothing starts (the only case where «Compact now» is the person\'s)', async (t) => {
  const { snapshot, chiamate } = await banco(t, { settings: { auto: false } });
  assert.equal(snapshot.settings.auto, false);
  assert.equal((snapshot.jobs ?? []).filter((j) => !FINITI.has(j.state)).length, 0, JSON.stringify(snapshot.jobs));
  assert.equal(chiamate.length, 0);
  assert.ok(snapshot.measurement.tokens.inputTokens > budgetDellaMisura(snapshot).triggerTokens);
});
