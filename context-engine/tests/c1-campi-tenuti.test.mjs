/*
 * C1 (owner 10/10/2026, «Sì, come campi»): ciò che la compattazione ha TENUTO arriva alla scheda Contesto come dati, non come
 * testo da interpretare — le richieste della persona nel registro e l'indice salvati nella versione (`retained`), e quante uscite
 * le regole hanno tolto o accorciato in ogni richiesta (`level1` nel ritorno di `prepareForRequest`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings, ContextVersionV1 } from '../src/contracts.mjs';
import { personRequestsKept, personRequestRegister } from '../src/summary.mjs';
import { CLEARING_STEP, KEEP_RECENT_TOOL_OUTPUTS } from '../src/tool-output-clearing.mjs';

const now = '2026-10-10T00:00:00.000Z';
const profilo = { provider: 'local', model: 'fixture', windowTokens: 131072, responseReserve: 2048, local: true };
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const valido = (request) => {
  const sourceId = JSON.parse(request.messages.at(-1).content).sourceIds?.[0] ?? 'u0';
  const quote = sourceId === 'u0' ? 'Database SQLite' : sourceId.startsWith('a') ? 'risposta' : 'richiesta 2';
  return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'sintesi', goal: 'g', decisions: ['Database SQLite'], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: sourceId, quote }] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 300 } };
};
const contatore = { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model }; } };

async function motore(t, messaggi, { anchorIndex } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'c1-campi-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async (request) => valido(request) };
  const engine = createContextEngine({ store, model, tokenCounter: contatore, clock: () => now, ...(anchorIndex ? { anchorIndex } : {}) });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  for (const [i, message] of messaggi.entries()) await engine.appendOriginal({ sessionId: 'chat', record: { id: `${i % 2 ? 'a' : 'u'}${i}`, message, createdAt: now } });
  return { engine, store };
}
const lungo = ' ' + 'dettaglio '.repeat(400);
const conversazione = [
  { role: 'user', content: 'Database SQLite' + lungo },
  { role: 'assistant', content: 'risposta: il file src/db/schema.sql ha impronta 9f2c4e7a1b3d' + lungo },
  { role: 'user', content: 'richiesta 2' + lungo },
  { role: 'assistant', content: 'risposta' + lungo },
];

test('C1-CAMPI-01: the committed version carries the requests kept in the register and the index, the SAME the text shows', async (t) => {
  const { engine, store } = await motore(t, conversazione, { anchorIndex: () => 'INDICE: src/db/schema.sql · 9f2c4e7a1b3d' });
  const job = await engine.startCompaction({ sessionId: 'chat', sessionModel: profilo, idempotencyKey: 'k' });
  assert.equal((await engine.waitForCompaction({ sessionId: 'chat', jobId: job.id })).state, 'committed');
  const versione = (await store.readContextSnapshot({ sessionId: 'chat' })).activeVersion;
  assert.ok(versione.retained, 'the field exists');
  assert.equal(versione.retained.anchorIndex, 'INDICE: src/db/schema.sql · 9f2c4e7a1b3d');
  assert.ok(versione.retained.personRequests.total >= 1);
  const testo = versione.activeMessages.find((m) => String(m.content).includes('talos-context-memory')).content;
  for (const { n, text } of versione.retained.personRequests.kept) assert.ok(testo.includes(`[${n}] ${text}`), `the field matches the register text: [${n}]`);
});

test('C1-CAMPI-02: the register text and the kept list are the same list (budget, omissions, numbering)', () => {
  const richieste = Array.from({ length: 12 }, (_, i) => `richiesta ${i + 1} ` + 'x'.repeat(900));
  const { total, kept } = personRequestsKept(richieste, { budget: 4000 });
  assert.equal(total, 12);
  assert.equal(kept[0].n, 1, 'the first request always stays');
  const registro = personRequestRegister(richieste, { budget: 4000 });
  for (const { n } of kept) assert.ok(registro.includes(`[${n}] `));
  const omesse = total - kept.length;
  assert.ok(omesse > 0); assert.ok(registro.includes(`(${omesse} other requests omitted here`));
  assert.deepEqual(personRequestsKept([], {}), { total: 0, kept: [] });
});

test('C1-CAMPI-03: a version written before the field (no `retained`) still parses: old archives stay valid', () => {
  const vecchia = { schema: 'talos.context.version.v1', id: 'v1', sessionId: 'chat', coveredThrough: 2, sourceIds: ['u0'], sourceHash: 'a'.repeat(64), summary: { schema: 'talos.context.summary.v1', text: 's', goal: 'g', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources: [] }, activeMessages: [], model: { provider: 'local', model: 'fixture' }, measurement: { schema: 'talos.context.tokens.v1', inputTokens: 1, windowTokens: 10, responseReserve: 1, method: 'heuristic', exact: false, requestHash: 'b'.repeat(64), provider: 'local', model: 'fixture' }, createdAt: now };
  const r = ContextVersionV1.safeParse(vecchia);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues?.slice(0, 2)));
});

test('C1-CAMPI-04: prepareForRequest says how many outputs the rules cleared and how many they shortened in THIS request', async (t) => {
  const messaggi = [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'Leggi tutto' }];
  for (let i = 0; i < CLEARING_STEP + KEEP_RECENT_TOOL_OUTPUTS; i++) {
    messaggi.push({ role: 'assistant', content: '', tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${i}` }) } }] });
    messaggi.push({ role: 'tool', content: `uscita ${i}\n`.repeat(300), tool_call_id: `c${i}` });
  }
  messaggi.push({ role: 'assistant', content: 'fatto' });
  const pieno = Math.ceil(JSON.stringify({ messages: messaggi, tools: [] }).length / 4);
  const { engine } = await motore(t, messaggi);
  const finestra = Math.ceil((pieno / 0.8 + 2048) / 0.85);
  const p = await engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: { ...profilo, windowTokens: finestra } });
  assert.ok(p.level1, 'the counts are there');
  assert.ok(p.level1.cleared > 0);
  assert.equal(p.level1.cleared + p.level1.shortened, p.toolOutputsCleared, 'the old total stays the sum, for whoever reads it');
  const sotto = await motore(t, messaggi);
  const p2 = await sotto.engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: { ...profilo, windowTokens: pieno * 10 } });
  assert.equal(p2.level1, undefined, 'the other way round: under the trigger nothing was cleared, nothing is said');
});
