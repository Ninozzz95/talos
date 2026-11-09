/* Revisione avversaria del Blocco 20 (01/11/2026): R4, le uscite finite in un riassunto si contano anche quando la richiesta dopo sta larga. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';

const now = '2026-11-01T00:00:00.000Z';
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const grande = (n) => `riga dell'uscita ${n}\n`.repeat(150) + `CODE: ${n}\n` + 'altra riga\n'.repeat(150);
const finestra = (tokens, ratio) => Math.ceil((tokens / ratio + 2048) / 0.85);
const lettura = (id, n) => [
  { role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${n}.txt` }) } }] },
  { role: 'tool', content: grande(n), tool_call_id: id },
];
function storia(dopo = 6) {
  const m = [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'Leggi i file e dammi i codici' }];
  for (let i = 0; i < dopo; i++) m.push(...lettura(`p${i}`, i));
  m.push({ role: 'assistant', content: 'proseguo' });
  return m;
}
const uscite = (messaggi) => messaggi.filter((m) => m.role === 'tool');
const conCodice = (messaggi) => uscite(messaggi).filter((m) => /CODE:/u.test(m.content)).length;

async function motore(t, messaggi, ratio, { summarize } = {}) {
  const pieno = Math.ceil(JSON.stringify({ messages: messaggi, tools: [] }).length / 4);
  const dir = await mkdtemp(join(tmpdir(), 'revisione-blocco20-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now, clearedToolPointer: 'Recover it with conversation_search.', summaryCeilingMs: 0 });
  t.after(async () => { await store.close().catch(() => {}); await rm(dir, { recursive: true, force: true }).catch(() => {}); });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  for (const [i, message] of messaggi.entries()) await engine.appendOriginal({ sessionId: 'chat', record: { id: `r${i}`, message, createdAt: now } });
  return { engine, profilo: { provider: 'cloud', model: 'fixture', windowTokens: finestra(pieno, ratio), responseReserve: 2048 } };
}

test('REV20-R4: uscite della richiesta finite in un riassunto, e la richiesta dopo sta larga: il numero lo dice', async (t) => {
  const m = storia(8);
  const sintesi = { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'sintesi', goal: 'g', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: 'r1', quote: 'Leggi i file e dammi i codici' }] }), finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
  const { engine, profilo } = await motore(t, m, 0.4, { summarize: async () => sintesi });
  const lavoro = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'a1', sessionModel: profilo, tools: [], withinTurn: true });
  await engine.waitForCompaction({ sessionId: 'chat', jobId: lavoro.id ?? lavoro.job?.id });
  const dopo = await engine.prepareForRequest({ sessionId: 'chat', messages: m, tools: [], sessionModel: { ...profilo, windowTokens: 200_000 }, summaryCeilingMs: 0 });
  assert.ok(uscite(dopo.messages).length < 8, 'premessa: parte delle uscite è nel riassunto');
  assert.ok(dopo.level1?.accorciateRichiesta > 0, 'la risposta poggia su uscite riassunte');
  assert.equal(dopo.toolOutputsCleared ?? 0, 0, 'la strada piena non ha tolto niente');
});

test('REV20-R4 — AL CONTRARIO: nessun riassunto e richiesta larga: nessun numero', async (t) => {
  const m = storia(3);
  const { engine, profilo } = await motore(t, m, 0.2, { summarize: () => { throw new Error('nessun riassunto atteso'); } });
  const dopo = await engine.prepareForRequest({ sessionId: 'chat', messages: m, tools: [], sessionModel: profilo, summaryCeilingMs: 0 });
  assert.equal(dopo.level1 ?? null, null);
});
