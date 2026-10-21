/*
 * A1 (owner 21/10/2026 sera; contratto riga viva §4): il riassunto che il GIRO aspetta ha un tetto. Dal vivo sul Pad un lavoro è
 * durato 22 minuti con la chat su «Elaborazione». Allo scadere il lavoro si annulla e il giro riceve CTX_COMPACTION_TIMEOUT (chi lo
 * ospita prosegue senza modello). Verso contrario: un riassunto che arriva in tempo si usa come prima.
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

const modelProfile = { provider: 'local', model: 'controlled-fixture', windowTokens: 16384, responseReserve: 2048, local: true };
const now = '2026-10-21T00:00:00.000Z';
const TASK = 'Database SQLite: leggi i dieci file e dimmi cosa contengono.';
const readCall = k => ({ role: 'assistant', content: null, tool_calls: [{ id: `c${k}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${k}.txt` }) } }] });
const readResult = k => ({ role: 'tool', tool_call_id: `c${k}`, content: [{ type: 'text', text: `file ${k}: ` + 'riga di contenuto '.repeat(400) }] });

async function fixture(t, { summarize, inTurnSummaryCeilingMs }) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-ceiling-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 's', settings: parseContextSettings({ auto: true, triggerRatio: 0.5, targetRatio: 0.49 }) });
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: profile }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: profile.windowTokens, responseReserve: profile.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: profile.provider, model: profile.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now, ...(inTurnSummaryCeilingMs ? { inTurnSummaryCeilingMs } : {}) });
  const append = (id, message) => engine.appendOriginal({ sessionId: 's', record: { id, message, createdAt: now } });
  await append('s0', { role: 'system', content: 'Sei un assistente.' });
  await append('u0', { role: 'user', content: TASK });
  for (let k = 1; k <= 10; k++) { await append(`a${k}`, readCall(k)); await append(`t${k}`, readResult(k)); }
  return engine;
}
const maiFinito = ({ signal }) => new Promise((_, rifiuta) => { signal?.addEventListener('abort', () => rifiuta(signal.reason ?? new Error('aborted')), { once: true }); });

test('CEIL-01 a summary the turn waits for that never finishes: CTX_COMPACTION_TIMEOUT at the ceiling, and the job is cancelled', async t => {
  const engine = await fixture(t, { summarize: maiFinito });
  const inizio = Date.now();
  await assert.rejects(engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, summaryCeilingMs: 200 }), { code: 'CTX_COMPACTION_TIMEOUT' });
  assert.ok(Date.now() - inizio < 5_000, `${Date.now() - inizio} ms`);
  const jobs = (await engine.getContextState({ sessionId: 's' })).jobs;
  assert.ok(jobs.length >= 1 && jobs.every(j => j.state === 'cancelled'), JSON.stringify(jobs.map(j => j.state)));
});

test('CEIL-02 the engine option sets the ceiling when the call does not', async t => {
  const engine = await fixture(t, { summarize: maiFinito, inTurnSummaryCeilingMs: 150 });
  await assert.rejects(engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile }), { code: 'CTX_COMPACTION_TIMEOUT' });
});

test('CEIL-03 reverse: a summary that arrives within the ceiling is used as before', async t => {
  const summarize = async request => {
    await new Promise(r => { setTimeout(r, 50); });
    const sourceIds = JSON.parse(request.messages.at(-1).content).sourceIds ?? [];
    const sourceId = sourceIds.find(id => id === 'u0' || id.startsWith('t')) ?? 'u0';
    const quote = sourceId === 'u0' ? 'Database SQLite' : `file ${sourceId.slice(1)}:`;
    return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'Letti i file.', goal: 'Leggere i file', decisions: [], constraints: [], completed: ['letti'], pending: [], resources: [], sources: [{ recordId: sourceId, quote }] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  };
  const engine = await fixture(t, { summarize });
  const prepared = await engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, summaryCeilingMs: 10_000 });
  assert.ok(prepared.messages.some(m => typeof m.content === 'string' && m.content.includes('talos-context-memory')));
});

/* B1 (21/10/2026, revisione del Mobile): chi ospita il motore sa quando il giro aspetta un riassunto — senza, la riga viva con «Skip»
   non compariva mai sulla strada del motore, quella di serie per le conversazioni nuove. */
const riassuntoBuono = async request => {
  await new Promise(r => { setTimeout(r, 30); });
  const sourceIds = JSON.parse(request.messages.at(-1).content).sourceIds ?? [];
  const sourceId = sourceIds.find(id => id === 'u0' || id.startsWith('t')) ?? 'u0';
  const quote = sourceId === 'u0' ? 'Database SQLite' : `file ${sourceId.slice(1)}:`;
  return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'Letti i file.', goal: 'Leggere i file', decisions: [], constraints: [], completed: ['letti'], pending: [], resources: [], sources: [{ recordId: sourceId, quote }] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
};

test('CEIL-04 onInTurnWait: «waiting» when the turn starts waiting, «done» with the outcome when it stops (published)', async t => {
  const engine = await fixture(t, { summarize: riassuntoBuono });
  const visti = [];
  await engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, summaryCeilingMs: 10_000, onInTurnWait: e => visti.push(e) });
  assert.ok(visti.length >= 2, JSON.stringify(visti));
  assert.equal(visti[0].state, 'waiting');
  assert.equal(typeof visti[0].jobId, 'string');
  assert.equal(visti[1].state, 'done');
  assert.equal(visti[1].jobId, visti[0].jobId);
  assert.equal(visti[1].outcome, 'committed');
  for (let i = 0; i < visti.length; i += 2) assert.deepEqual([visti[i].state, visti[i + 1]?.state], ['waiting', 'done'], 'always in pairs');
});

test('CEIL-05 onInTurnWait at the ceiling: «done» with outcome «timeout», before the error reaches the turn', async t => {
  const engine = await fixture(t, { summarize: maiFinito });
  const visti = [];
  await assert.rejects(engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, summaryCeilingMs: 150, onInTurnWait: e => visti.push(e) }), { code: 'CTX_COMPACTION_TIMEOUT' });
  assert.deepEqual(visti.map(e => [e.state, e.outcome ?? null]), [['waiting', null], ['done', 'timeout']]);
});

test('CEIL-06 a listener that throws does not touch the turn; without a listener nothing changes', async t => {
  const engine = await fixture(t, { summarize: riassuntoBuono });
  const prepared = await engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, summaryCeilingMs: 10_000, onInTurnWait: () => { throw new Error('rotto'); } });
  assert.ok(prepared.messages.some(m => typeof m.content === 'string' && m.content.includes('talos-context-memory')));
});
