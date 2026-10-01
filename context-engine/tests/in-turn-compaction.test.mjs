/*
 * G02 (CLI lane, owner decision 01/10; desktop decision 26/09 «compattazione come Hermes, soglia anche nel giro»): a long
 * FIRST turn can be compacted. Before, `selectClosedPrefix` kept the latest exchange whole and, with one person's message
 * only, found no earlier exchange: CTX_NOTHING_TO_COMPACT, then CTX_CONTEXT_OVERFLOW. Measured through the CLI (10 reads of
 * 9 KB, window 65,536): 40,702 tokens against a 39,321 limit, no summary ever requested. The old kernel hid it with a fake
 * person's message («checkpoint di riflessione», removed in e5b271ebb because it impersonated the person).
 * Like Hermes (agent/context_compressor.py: protect_first_n, protect_last_n) and Codex (core/src/session/turn.rs
 * `run_auto_compact`, mid-turn): when no earlier exchange exists, the closed tool exchanges of the current turn are
 * summarised, the latest closed exchange stays whole, an open call is never split, and the person's message of that turn
 * is shown verbatim before the summary.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { computeContextBudget, selectClosedPrefix } from '../src/compaction-planner.mjs';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';

const record = (sequence, role, content, extra = {}) => ({ id: `m${sequence}`, sequence, message: { role, content, ...extra } });
const call = (sequence, id) => record(sequence, 'assistant', null, { tool_calls: [{ id, type: 'function', function: { name: 'leggi', arguments: '{}' } }] });
const result = (sequence, id, text = `contenuto ${id}`) => record(sequence, 'tool', text, { tool_call_id: id });

test('IN-TURN: a first turn with closed exchanges keeps its latest exchange whole and summarises the ones before', () => {
  const records = [record(1, 'system', 'regole'), record(2, 'user', 'leggi i tre file'), call(3, 'a'), result(4, 'a'), call(5, 'b'), result(6, 'b'), call(7, 'c'), result(8, 'c')];
  assert.deepEqual(selectClosedPrefix(records, { force: true }).prefix, [], 'without withinTurn a first turn is still not cut (the soft trigger)');
  const selected = selectClosedPrefix(records, { force: true, withinTurn: true });
  assert.deepEqual(selected.prefix.map(r => r.sequence), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(selected.tail.map(r => r.sequence), [7, 8]);
  assert.equal(selected.coveredThrough, 6);
});

test('IN-TURN: an open call is never split from its call, and the latest CLOSED exchange stays whole', () => {
  const records = [record(1, 'user', 'leggi'), call(2, 'a'), result(3, 'a'), call(4, 'b'), result(5, 'b'), call(6, 'c')];
  const selected = selectClosedPrefix(records, { force: true, withinTurn: true });
  assert.deepEqual(selected.prefix.map(r => r.sequence), [1, 2, 3]);
  assert.deepEqual(selected.tail.map(r => r.sequence), [4, 5, 6]);
  assert.deepEqual(selected.pendingCalls, ['c']);
});

test('IN-TURN: one exchange, or none, is still nothing to compact; a turn boundary still wins when there is one', () => {
  assert.deepEqual(selectClosedPrefix([record(1, 'user', 'leggi'), call(2, 'a'), result(3, 'a')], { force: true, withinTurn: true }).prefix, []);
  assert.deepEqual(selectClosedPrefix([record(1, 'user', 'ciao'), record(2, 'assistant', 'ciao!')], { force: true, withinTurn: true }).prefix, []);
  const twoTurns = [record(1, 'user', 'prima'), record(2, 'assistant', 'fatto'), record(3, 'user', 'leggi'), call(4, 'a'), result(5, 'a'), call(6, 'b'), result(7, 'b')];
  assert.deepEqual(selectClosedPrefix(twoTurns, { force: true, withinTurn: true }).prefix.map(r => r.sequence), [1, 2], 'an earlier turn is compacted first, as before');
  assert.deepEqual(selectClosedPrefix(twoTurns.slice(2), { force: false, withinTurn: true }).prefix, [], 'only a forced selection reaches into the turn');
});

const modelProfile = { provider: 'local', model: 'controlled-fixture', windowTokens: 16384, responseReserve: 2048, local: true };
const now = '2026-10-01T00:00:00.000Z';
const TASK = 'Database SQLite: leggi i dieci file e dimmi cosa contengono.';

async function engineFixture(t, settings = { auto: true, triggerRatio: 0.5, targetRatio: 0.49 }) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-in-turn-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'turn', settings: parseContextSettings(settings) });
  const calls = [];
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async request => {
    calls.push(request);
    /* a long prefix is summarised in segments: each summary cites a sentence that is really in a record it was given */
    const sourceIds = JSON.parse(request.messages.at(-1).content).sourceIds ?? [];
    /* the final merge of the segment summaries names no source: like the desktop fixture, it cites the person's message */
    const sourceId = sourceIds.find(id => id === 'u0' || id.startsWith('t')) ?? 'u0';
    const quote = sourceId === 'u0' ? 'Database SQLite' : `file ${sourceId.slice(1)}:`;
    const summary = { schema: 'talos.context.summary.v1', text: 'La persona ha chiesto di leggere dieci file; i primi sono stati letti.', goal: 'Leggere i dieci file', decisions: [], constraints: [], completed: ['letti i primi file'], pending: ['leggere gli altri'], resources: [], sources: [{ recordId: sourceId, quote }] };
    return { text: JSON.stringify(summary), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: profile }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: profile.windowTokens, responseReserve: profile.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: profile.provider, model: profile.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now });
  const append = (id, message) => engine.appendOriginal({ sessionId: 'turn', record: { id, message, createdAt: now } });
  return { engine, append, calls };
}
const readCall = k => ({ role: 'assistant', content: null, tool_calls: [{ id: `c${k}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${k}.txt` }) } }] });
const readResult = k => ({ role: 'tool', tool_call_id: `c${k}`, content: `file ${k}: ` + 'riga di contenuto '.repeat(400) });

test('IN-TURN through the engine: a first turn past the limit asks for a summary and ends below it, the task verbatim', async t => {
  const { engine, append, calls } = await engineFixture(t);
  await append('s0', { role: 'system', content: 'Sei un assistente.' });
  await append('u0', { role: 'user', content: TASK });
  for (let k = 1; k <= 10; k++) { await append(`a${k}`, readCall(k)); await append(`t${k}`, readResult(k)); }
  const prepared = await engine.prepareForRequest({ sessionId: 'turn', sessionModel: modelProfile });
  assert.ok(calls.length >= 1, 'a summary was requested');
  const roles = prepared.messages.map(m => m.role);
  assert.equal(prepared.messages[0].content, 'Sei un assistente.');
  assert.deepEqual(prepared.messages[1], { role: 'user', content: TASK }, 'the person\'s message of the turn, verbatim, before the summary');
  assert.equal(JSON.parse(prepared.messages[2].content).kind, 'talos-context-memory', 'then the summary');
  assert.deepEqual(roles.slice(3), ['assistant', 'tool'], 'then the latest exchange, whole');
  assert.equal(prepared.messages.at(-1).tool_call_id, 'c10');
  const limit = modelProfile.windowTokens - modelProfile.responseReserve;
  assert.ok(prepared.measurement.inputTokens < limit, `below the input limit: ${prepared.measurement.inputTokens}`);
});

test('IN-TURN: a summary that ends at a turn boundary pins nothing: the next turn starts with its own message, once', async t => {
  const { engine, append } = await engineFixture(t, { auto: false, retainRecentTurns: 1 });
  await append('s0', { role: 'system', content: 'Sei un assistente.' });
  await append('u0', { role: 'user', content: TASK });
  await append('a1', readCall(1)); await append('t1', readResult(1));
  await append('r1', { role: 'assistant', content: 'Letto il primo file.' });
  await append('u2', { role: 'user', content: 'Ora il secondo.' });
  const job = await engine.startCompaction({ sessionId: 'turn', idempotencyKey: 'manual', sessionModel: modelProfile });
  assert.equal((await engine.waitForCompaction({ sessionId: 'turn', jobId: job.id })).state, 'committed');
  const prepared = await engine.prepareForRequest({ sessionId: 'turn', sessionModel: modelProfile });
  assert.deepEqual(prepared.messages.map(m => m.role), ['system', 'user', 'user']);
  assert.equal(JSON.parse(prepared.messages[1].content).kind, 'talos-context-memory');
  assert.deepEqual(prepared.messages[2], { role: 'user', content: 'Ora il secondo.' });
  assert.equal(prepared.messages.filter(m => m.content === TASK).length, 0, 'the summarised turn\'s message is not brought back');
});

test('IN-TURN: past the soft trigger but within the limit, a first turn is NOT compacted (no summary at every step)', async t => {
  const { engine, append, calls } = await engineFixture(t);
  await append('s0', { role: 'system', content: 'Sei un assistente.' });
  await append('u0', { role: 'user', content: TASK });
  for (let k = 1; k <= 5; k++) { await append(`a${k}`, readCall(k)); await append(`t${k}`, readResult(k)); }
  const prepared = await engine.prepareForRequest({ sessionId: 'turn', sessionModel: modelProfile });
  const budget = computeContextBudget({ ...modelProfile, method: prepared.measurement.method, inputTokens: prepared.measurement.inputTokens, settings: { triggerRatio: 0.5, targetRatio: 0.49 } });
  assert.ok(budget.shouldPrepare && budget.fits, `the scenario is past the soft trigger and within the limit: ${prepared.measurement.inputTokens} of ${budget.inputLimit}`);
  /* a soft-trigger job would run in the background, unawaited: what matters is that none was started */
  assert.deepEqual((await engine.getContextState({ sessionId: 'turn' })).jobs, [], 'no compaction job inside the turn while the context fits');
  assert.equal(calls.length, 0);
  assert.equal(prepared.messages.filter(m => m.role === 'tool').length, 5, 'the turn is sent whole');
});
