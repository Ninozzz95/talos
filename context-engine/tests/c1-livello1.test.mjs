/*
 * C1, livello 1 del metodo approvato dall'owner il 09/10/2026 sera: prima del riassunto, le REGOLE (CliffCompaction +
 * `clear_tool_uses`, `src/tool-output-clearing.mjs`). Nessuna chiamata al modello quando basta togliere le uscite vecchie.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';
import { clearOldToolOutputs, shortenRecentLargeOutputs, KEEP_RECENT_TOOL_OUTPUTS, CLEARING_STEP } from '../src/tool-output-clearing.mjs';

const now = '2026-10-09T00:00:00.000Z';
/** The window whose input limit (heuristic margin 15%, reserve 2048: `profiles.mjs:6`) puts `tokens` at `ratio`. */
const finestra = (tokens, ratio) => Math.ceil((tokens / ratio + 2048) / 0.85);
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const grande = (n) => `riga dell'uscita ${n}\n`.repeat(200);

/** A person message, then `n` call/output pairs; output `i` is long unless `corte` says otherwise. */
function storia(n, { corte = new Set(), richieste = ['Leggi i file e dimmi cosa non va'] } = {}) {
  const messaggi = [{ role: 'system', content: 'sistema' }];
  for (const [r, richiesta] of richieste.entries()) {
    messaggi.push({ role: 'user', content: richiesta });
    for (let i = 0; i < n; i++) {
      const id = `c${r}-${i}`;
      // key order as the archive parses it (`contracts.mjs:16`: role, content, tool_call_id, tool_calls, then the rest)
      messaggi.push({ role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `src/f${i}.mjs`, contenuto: 'x'.repeat(i === 0 ? 900 : 10) }) } }], reasoning_content: 'penso '.repeat(120) });
      messaggi.push({ role: 'tool', content: corte.has(i) ? 'ok' : grande(i), tool_call_id: id });
    }
    messaggi.push({ role: 'assistant', content: `fatto ${r}` });
  }
  return messaggi;
}

test('C1-L1-PURE: old long outputs become signature + pointer; recent outputs, short outputs, person and system messages stay verbatim', () => {
  // a LONG person message in the old part: the rules must never touch it (Lost in Compaction, the side constraints)
  const messaggi = storia(CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS + 3, { corte: new Set([2]), richieste: ['Leggi i file e dimmi cosa non va. ' + 'Vincolo: niente dipendenze nuove. '.repeat(30)] });
  const { messages, cleared } = clearOldToolOutputs(messaggi, { pointer: 'Recover it with conversation_search.' });
  assert.equal(messages.length, messaggi.length, 'no message disappears');
  const esiti = messages.flatMap((m, i) => (m.role === 'tool' ? [[m, messaggi[i]]] : []));
  assert.equal(cleared, CLEARING_STEP - 1, 'one complete block, minus the short output');
  for (const [k, [dopo, prima]] of esiti.entries()) {
    if (k < CLEARING_STEP && k !== 2) {
      assert.match(dopo.content, /^\[Old tool output cleared to save context: leggi\(\{"percorso":"src\/f\d+\.mjs"/u);
      assert.match(dopo.content, /returned \d+ characters, 201 lines\. Recover it with conversation_search\.\]$/u);
      assert.equal(dopo.tool_call_id, prima.tool_call_id);
    } else assert.equal(dopo, prima, `output ${k} stays the same object`);
  }
  for (const [i, m] of messages.entries()) if (['user', 'system'].includes(m.role)) assert.equal(m, messaggi[i]);
  const primaChiamata = messages.find((m) => m.tool_calls)?.tool_calls[0].function.arguments;
  assert.doesNotThrow(() => JSON.parse(primaChiamata), 'shortened arguments stay valid JSON');
  assert.ok(primaChiamata.length < 400 && /characters cleared to save context/u.test(primaChiamata));
  assert.ok(messages[2].reasoning_content.length <= 301, 'old reasoning shortened');
  assert.equal(messages.at(-3).reasoning_content, messaggi.at(-3).reasoning_content, 'recent reasoning untouched');
});

test('C1-L1-STEPS: the cut moves only by whole blocks, so the cleared prefix (and its cache) stays identical between steps', () => {
  const base = CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS;
  const a = clearOldToolOutputs(storia(base)).messages;
  const b = clearOldToolOutputs(storia(base + CLEARING_STEP - 1)).messages;
  assert.deepEqual(b.slice(0, a.length - 1), a.slice(0, a.length - 1), 'adding outputs inside the block does not rewrite the prefix');
  const c = clearOldToolOutputs(storia(base + CLEARING_STEP)).messages;
  assert.ok(c.filter((m) => /^\[Old tool output cleared/u.test(m.content ?? '')).length === 2 * CLEARING_STEP, 'a full new block clears the next block');
  const sotto = storia(base - 1);
  assert.equal(clearOldToolOutputs(sotto).messages, sotto, 'below one block: the same array, nothing rewritten');
});

async function banco(t, messaggi, { windowTokens }) {
  const dir = await mkdtemp(join(tmpdir(), 'c1-livello1-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const richieste = [];
  const model = {
    resolveModel: async ({ sessionModel }) => sessionModel,
    summarize: async (request) => {
      richieste.push(request);
      const sourceId = JSON.parse(request.messages.at(-1).content).sourceIds?.[0] ?? 'r1';
      return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'sintesi', goal: 'g', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: sourceId, quote: '' }] }), finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now, clearedToolPointer: 'Recover it with conversation_search.' });
  const sessionId = 'chat';
  await store.initSession({ sessionId, settings: parseContextSettings({}) });
  for (const [i, message] of messaggi.entries()) await engine.appendOriginal({ sessionId, record: { id: `r${i}`, message, createdAt: now } });
  const profilo = { provider: 'local', model: 'fixture', windowTokens, responseReserve: 2048, local: true };
  return { engine, richieste, sessionId, profilo };
}

test('C1-L1-ENGINE: over the trigger because of old outputs, the engine clears them and calls NO model; every person message stays verbatim', async (t) => {
  const messaggi = storia(CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS, { richieste: ['Prima richiesta: usa SQLite', 'Seconda: niente dipendenze nuove'] });
  const pieno = Math.ceil(JSON.stringify({ messages: messaggi, tools: [] }).length / 4);
  const b = await banco(t, messaggi, { windowTokens: finestra(pieno, 0.8) }); // ~80% of the input limit: over 0.75
  const preparata = await b.engine.prepareForRequest({ sessionId: b.sessionId, messages: messaggi, tools: [], sessionModel: b.profilo });
  assert.equal(b.richieste.length, 0, 'level 1 is enough: no summary request');
  assert.equal(preparata.job, undefined, 'no compaction job');
  assert.ok(preparata.toolOutputsCleared > 0);
  assert.ok(preparata.measurement.inputTokens < pieno / 2);
  assert.deepEqual(preparata.messages.filter((m) => m.role === 'user').map((m) => m.content), ['Prima richiesta: usa SQLite', 'Seconda: niente dipendenze nuove']);
  assert.ok(preparata.messages.some((m) => /Recover it with conversation_search\.\]$/u.test(m.content ?? '')));
});

test('C1-L1-BELOW: under the trigger nothing is cleared, the request is the archive verbatim', async (t) => {
  const messaggi = storia(CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS);
  const pieno = Math.ceil(JSON.stringify({ messages: messaggi, tools: [] }).length / 4);
  const b = await banco(t, messaggi, { windowTokens: finestra(pieno, 0.3) });
  const preparata = await b.engine.prepareForRequest({ sessionId: b.sessionId, messages: messaggi, tools: [], sessionModel: b.profilo });
  assert.deepEqual(preparata.messages, messaggi);
  assert.equal(preparata.toolOutputsCleared ?? 0, 0);
});

test('C1-L1-NOT-ENOUGH: when clearing cannot bring it under the trigger, level 2 (the summary) starts as before', async (t) => {
  const messaggi = storia(CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS, { richieste: ['a', 'b', 'c'] });
  // il livello 1 intero, accorciamento sotto pressione compreso (09/10, «Tutti e due»): anche così deve restare sopra la soglia
  const pulita = shortenRecentLargeOutputs(clearOldToolOutputs(messaggi).messages).messages;
  const dopo = Math.ceil(JSON.stringify({ messages: pulita, tools: [] }).length / 4);
  const b = await banco(t, messaggi, { windowTokens: finestra(dopo, 0.9) }); // even cleared: ~90% > 75%
  const preparata = await b.engine.prepareForRequest({ sessionId: b.sessionId, messages: messaggi, tools: [], sessionModel: b.profilo });
  assert.ok(preparata.job, 'level 2 starts');
});

/* ── Review YELLOW del bugfixer (09/10/2026, `bugfixer/REVIEW-C1-METODO-BUGFIXER-2026-10-09.md`) ─────────────────────────── */

/* Y1 — col livello 1 attivo la storia PIENA non trova mai l'àncora del contatore (si registra coi messaggi spediti, quelli
   leggeri): contarla a ogni richiesta vuol dire un conteggio HTTP pieno (anthropic/openai/gemini) su una storia che cresce
   senza limite, e se quel conteggio fallisce cadeva tutta la richiesta. Sopra la soglia la piena si STIMA, mai si conta. */
const contiene = (messages, testo) => JSON.stringify(messages).includes(testo);
const USCITA_VECCHIA = JSON.stringify(grande(0)).slice(1, 40); // il testo dell'uscita più vecchia, com'è dentro il JSON

async function bancoContato(t, messaggi, { windowTokens, fallisceSullaPiena = false }) {
  const dir = await mkdtemp(join(tmpdir(), 'c1-livello1-conto-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const conteggi = { piena: 0, leggera: 0 };
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('nessun riassunto in questa prova'); } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) {
    const piena = contiene(messages, USCITA_VECCHIA);
    conteggi[piena ? 'piena' : 'leggera'] += 1;
    if (piena && fallisceSullaPiena) throw Object.assign(new Error('prompt is too long'), { code: 'CTX_TOKEN_HTTP' });
    return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model };
  } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  for (const [i, message] of messaggi.entries()) await engine.appendOriginal({ sessionId: 'chat', record: { id: `r${i}`, message, createdAt: now } });
  return { engine, conteggi, profilo: { provider: 'local', model: 'fixture', windowTokens, responseReserve: 2048, local: true } };
}

test('C1-L1-Y1-NO-FULL-COUNT: over the trigger the full history is estimated, never sent to the counter, on every request', async (t) => {
  const messaggi = storia(CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS, { richieste: ['Prima', 'Seconda'] });
  const pieno = Math.ceil(JSON.stringify({ messages: messaggi, tools: [] }).length / 4);
  const b = await bancoContato(t, messaggi, { windowTokens: finestra(pieno, 0.8) });
  for (let giro = 0; giro < 3; giro++) {
    const preparata = await b.engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: b.profilo });
    assert.ok(preparata.toolOutputsCleared > 0);
  }
  assert.equal(b.conteggi.piena, 0, 'the full history never reaches the counter');
  assert.ok(b.conteggi.leggera >= 3);
});

test('C1-L1-Y1-FULL-COUNT-FAILS: a counter that refuses the full history does not take the request down', async (t) => {
  const messaggi = storia(CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS, { richieste: ['Prima', 'Seconda'] });
  const pieno = Math.ceil(JSON.stringify({ messages: messaggi, tools: [] }).length / 4);
  const b = await bancoContato(t, messaggi, { windowTokens: finestra(pieno, 1.3), fallisceSullaPiena: true }); // over the window
  const preparata = await b.engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: b.profilo });
  assert.ok(preparata.toolOutputsCleared > 0);
  assert.equal(contiene(preparata.messages, USCITA_VECCHIA), false);
});

test('C1-L1-Y1-BELOW-ONE-COUNT: under the trigger nothing changes, one count of the full history as before', async (t) => {
  const messaggi = storia(CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS);
  const pieno = Math.ceil(JSON.stringify({ messages: messaggi, tools: [] }).length / 4);
  const b = await bancoContato(t, messaggi, { windowTokens: finestra(pieno, 0.3) });
  const preparata = await b.engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: b.profilo });
  assert.deepEqual(preparata.messages, messaggi);
  assert.deepEqual(b.conteggi, { piena: 1, leggera: 0 });
});

/* Y2 — un'uscita mista (testo lungo + immagine) veniva tolta per intero, immagine compresa. Le uscite con parti non testuali
   non si toccano (Hermes ritira le immagini con una regola sua, `_MAX_KEEP_TOOL_IMAGES`): qui si dichiara e si lascia stare. */
test('C1-L1-Y2-IMAGES: an old output with an image part stays whole', () => {
  const messaggi = storia(CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS);
  const i = messaggi.findIndex((m) => m.role === 'tool');
  messaggi[i] = { ...messaggi[i], content: [{ type: 'text', text: 'x'.repeat(2000) }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] };
  const { messages } = clearOldToolOutputs(messaggi);
  assert.equal(messages[i], messaggi[i]);
});

test('C1-L1-Y1-COUNT-FAILS-UNDER: the estimate says «under», the full count is tried and fails: the request goes out light', async (t) => {
  const messaggi = storia(CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS, { richieste: ['Prima', 'Seconda'] });
  // the window where the quick check (bytes/3.5) says «over» and the estimate (light count + removed bytes/3.5) says «under»
  const byte = (m) => Buffer.byteLength(JSON.stringify(m), 'utf8');
  const leggera = clearOldToolOutputs(messaggi).messages;
  const rapida = byte(messaggi) / 3.5;
  const stima = Math.ceil(JSON.stringify({ messages: leggera, tools: [] }).length / 4) + (byte(messaggi) - byte(leggera)) / 3.5;
  const soglia = (rapida + stima) / 2;
  const b = await bancoContato(t, messaggi, { windowTokens: Math.ceil((soglia / 0.75 + 2048) / 0.85), fallisceSullaPiena: true });
  const preparata = await b.engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: b.profilo });
  assert.equal(b.conteggi.piena, 1, 'the full count was tried');
  assert.ok(preparata.toolOutputsCleared > 0, 'and the light request went out');
});
