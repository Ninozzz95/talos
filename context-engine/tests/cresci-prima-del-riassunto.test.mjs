/*
 * L1 1.3 (owner 26/10/2026 notte, «col motore del contesto acceso si allarga anche lì prima di riassumere»; revisione del blocco 6,
 * A-R1..A-R3): `prepareForRequest({ growWindow })` chiede a chi ospita di allargare la finestra del motore locale AL CANCELLO della
 * compressione — la richiesta non entra e il riassunto partirebbe dentro il giro — sulla proiezione misurata QUI, come Hermes
 * (`agent/turn_preflight.py:96-112`: «grow the context window before compressing», poi ricalibra e non comprime).
 * Ogni prova ha il suo verso contrario; senza `growWindow` il motore resta byte per byte com'era (le altre prove del pacchetto).
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

/* un motore locale: a posto unico (`singleSlot`), quindi il riassunto parte solo quando la richiesta non entra */
const piccolo = { provider: 'local', model: 'controlled-fixture', windowTokens: 16384, responseReserve: 2048, local: true, singleSlot: true };
const grande = { ...piccolo, windowTokens: 65536, responseReserve: 8192 };
const now = '2026-10-26T00:00:00.000Z';
const TASK = 'Database SQLite: leggi i dieci file e dimmi cosa contengono.';

async function engineFixture(t, settings = { auto: true }) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-cresci-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'turn', settings: parseContextSettings(settings) });
  const calls = [];
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async request => {
    calls.push(request);
    const sourceIds = JSON.parse(request.messages.at(-1).content).sourceIds ?? [];
    const sourceId = sourceIds.find(id => id === 'u0' || id.startsWith('t')) ?? 'u0';
    const quote = sourceId === 'u0' ? 'Database SQLite' : `file ${sourceId.slice(1)}:`;
    const summary = { schema: 'talos.context.summary.v1', text: 'La persona ha chiesto di leggere dieci file.', goal: 'Leggere i dieci file', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: sourceId, quote }] };
    return { text: JSON.stringify(summary), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: profile }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: profile.windowTokens, responseReserve: profile.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: profile.provider, model: profile.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now });
  const append = (id, message) => engine.appendOriginal({ sessionId: 'turn', record: { id, message, createdAt: now } });
  return { engine, append, calls };
}
const readCall = k => ({ role: 'assistant', content: null, tool_calls: [{ id: `c${k}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${k}.txt` }) } }] });
/* parti di testo: l'accorciamento sotto pressione non le tocca, così il percorso provato resta quello del riassunto */
const readResult = k => ({ role: 'tool', tool_call_id: `c${k}`, content: [{ type: 'text', text: `file ${k}: ` + 'riga di contenuto '.repeat(400) }] });
async function storia(append, letture) {
  await append('s0', { role: 'system', content: 'Sei un assistente.' });
  await append('u0', { role: 'user', content: TASK });
  for (let k = 1; k <= letture; k++) { await append(`a${k}`, readCall(k)); await append(`t${k}`, readResult(k)); }
}

test('GROW-01 la richiesta non entra: si chiede di crescere sulla NOSTRA misura; cresciuta, si rimisura sulla finestra nuova e non si riassume', async t => {
  const { engine, append, calls } = await engineFixture(t);
  await storia(append, 10);
  const chieste = [];
  const prepared = await engine.prepareForRequest({ sessionId: 'turn', sessionModel: piccolo, growWindow: async (info) => { chieste.push(info); return { grown: true, sessionModel: grande }; } });
  assert.equal(chieste.length, 1, 'una richiesta di crescita');
  assert.ok(chieste[0].inputTokens > chieste[0].inputLimit, `al cancello: la richiesta non entra (${chieste[0].inputTokens} > ${chieste[0].inputLimit})`);
  assert.equal(chieste[0].windowTokens, 16384);
  assert.equal(calls.length, 0, 'nessun riassunto: la finestra è cresciuta');
  assert.equal(prepared.measurement.windowTokens, 65536, 'la misura è sulla finestra nuova');
  assert.equal(prepared.messages.filter(m => m.role === 'tool').length, 10, 'la storia parte intera');
});

test('GROW-02 «Chiedimi»: niente riassunto senza la persona — la proiezione parte com\'è, segnata oltre la finestra, senza errore', async t => {
  const { engine, append, calls } = await engineFixture(t);
  await storia(append, 10);
  const prepared = await engine.prepareForRequest({ sessionId: 'turn', sessionModel: piccolo, growWindow: async () => ({ sendAsIs: true }) });
  assert.equal(calls.length, 0, 'nessun riassunto');
  assert.equal(prepared.overWindow, true);
  assert.equal(prepared.messages.filter(m => m.role === 'tool').length, 10);
  assert.ok(prepared.measurement.inputTokens > piccolo.windowTokens - piccolo.responseReserve, 'è davvero oltre: la carta del motore lo dirà coi numeri di questa proiezione');
});

test('GROW-03 AL CONTRARIO: nessuna crescita («Riassumi», motore condiviso, nessun gradino) ⇒ il riassunto di sempre, come senza il gancio', async t => {
  const { engine, append, calls } = await engineFixture(t);
  await storia(append, 10);
  let chieste = 0;
  const prepared = await engine.prepareForRequest({ sessionId: 'turn', sessionModel: piccolo, growWindow: async () => { chieste += 1; return { grown: false }; } });
  assert.equal(chieste, 1);
  assert.ok(calls.length >= 1, 'il riassunto c\'è');
  assert.ok(prepared.measurement.inputTokens < piccolo.windowTokens - piccolo.responseReserve, 'e la richiesta entra');
  assert.equal(prepared.overWindow, undefined);
});

test('GROW-04 AL CONTRARIO: una richiesta che entra non chiede mai di crescere (né alla soglia morbida, né sotto)', async t => {
  const { engine, append, calls } = await engineFixture(t, { auto: true, triggerRatio: 0.5, targetRatio: 0.49 });
  await storia(append, 5);
  let chieste = 0;
  const prepared = await engine.prepareForRequest({ sessionId: 'turn', sessionModel: piccolo, growWindow: async () => { chieste += 1; return { grown: true, sessionModel: grande }; } });
  assert.ok(prepared.measurement.inputTokens > (piccolo.windowTokens - piccolo.responseReserve) * 0.5, 'premessa: oltre la soglia morbida');
  assert.equal(chieste, 0);
  assert.equal(calls.length, 0, 'posto unico: alla soglia morbida niente riassunto in sottofondo');
});

test('GROW-05 AL CONTRARIO: con la compattazione automatica spenta il gancio non si chiama, e l\'errore resta quello di prima', async t => {
  const { engine, append } = await engineFixture(t, { auto: false });
  await storia(append, 10);
  let chieste = 0;
  await assert.rejects(() => engine.prepareForRequest({ sessionId: 'turn', sessionModel: piccolo, growWindow: async () => { chieste += 1; return { grown: true, sessionModel: grande }; } }), { code: 'CTX_CONTEXT_OVERFLOW' });
  assert.equal(chieste, 0);
});
