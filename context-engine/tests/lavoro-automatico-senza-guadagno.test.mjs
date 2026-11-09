/*
 * 05/11/2026 — cura della compattazione per Luna 6, voce B4 (forma `FORMA-CURA-COMPATTAZIONE-LUNA-2026-11-05.md`, sezione 3; OK di CLI,
 * Performance e Mobile, sezione 8: «guadagno > 0», con la stima che toglie il costo minimo di un riassunto, misurata PRIMA di pagarlo).
 * Reperto del banco (04/11, cinque sessioni: A 9, A 3, B 5, B 7, B 8): a metà del primo giro il motore faceva partire un lavoro
 * automatico che copriva solo fino al messaggio 6 — tre messaggi di sistema, la richiesta e l'elenco dei file. Un riassunto di quella
 * parte non può essere più corto di ciò che sostituisce: ogni lavoro pagava una chiamata, finiva CTX_NO_REDUCTION e apriva 60 secondi
 * di pausa per i lavori automatici. La verifica «c'è qualcosa da guadagnare» si faceva solo sui lavori chiesti (`engine.mjs:503`).
 * I record sono quelli veri della sessione A9 (c0ee1d5b), com'erano quando il lavoro 05ba4c6f è nato (dati finti del banco).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';

const banco = JSON.parse(await readFile(new URL('./fixtures/banco-luna-a9-lavoro-automatico.json', import.meta.url), 'utf8'));
const luna = { provider: 'chatgpt', model: 'gpt-6-luna', windowTokens: 131072, responseReserve: 8192 };

async function fixture(t, records) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-b4-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'a9', settings: parseContextSettings({}) });
  const riassunti = [];
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async request => {
    riassunti.push(request);
    const sourceId = JSON.parse(request.messages.at(-1).content).sourceIds?.[0] ?? 'message-4';
    const testo = records.find(r => r.id === sourceId)?.message.content ?? '';
    return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'Reading the six reports.', goal: 'Six codes', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: sourceId, quote: String(testo).slice(0, 40) }] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) {
    return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: m.provider, model: m.model };
  } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => '2026-11-05T03:12:23.176Z' });
  for (const record of records) await engine.appendOriginal({ sessionId: 'a9', record });
  return { engine, riassunti };
}

test('B4-01 (bench A9, red before the cure): an automatic job with covered=6 does not start — no summary is paid, no job, no pause', async t => {
  const f = await fixture(t, banco.records);
  await assert.rejects(
    f.engine.startCompaction({ sessionId: 'a9', idempotencyKey: 'auto-6-03d14642c32d7d3fcea16cdef133938893d3dcbfbe9336ec967b5c6f8a6c7f9d-turn', sessionModel: luna, withinTurn: true }),
    error => error.code === 'CTX_NOTHING_TO_COMPACT',
  );
  assert.equal(f.riassunti.length, 0, 'the check is made BEFORE paying the summary (Mobile and Performance, 05/11)');
  const stato = await f.engine.getContextState({ sessionId: 'a9' });
  assert.equal(stato.jobs.length, 0, 'no job is written: nothing fails, so no 60-second pause for automatic jobs opens');
});

test('B4-02 (the other way): an automatic job that frees real space still starts and pays its summary', async t => {
  // the same session one read later: the selection covers the first read of report1.txt (22k characters), which a summary does free
  const records = [...banco.records, { id: 'message-9', message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_b4_due', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"report2.txt"}' } }] }, createdAt: '2026-11-05T03:12:26.465Z' },
    { id: 'message-10', message: { role: 'tool', tool_call_id: 'call_b4_due', content: banco.records.at(-1).message.content.replaceAll('report1.txt', 'report2.txt') }, createdAt: '2026-11-05T03:12:26.471Z' }];
  const f = await fixture(t, records);
  const job = await f.engine.startCompaction({ sessionId: 'a9', idempotencyKey: 'auto-8-03d14642c32d7d3fcea16cdef133938893d3dcbfbe9336ec967b5c6f8a6c7f9d-turn', sessionModel: luna, withinTurn: true });
  assert.equal(job.coveredThrough, 8, 'it covers the first read');
  await f.engine.waitForCompaction({ sessionId: 'a9', jobId: job.id });
  assert.ok(f.riassunti.length >= 1, 'the summary was asked for');
});

test('B4-03: a requested /compact keeps its own rule (30%), untouched by the automatic gate', async t => {
  const f = await fixture(t, banco.records);
  await assert.rejects(
    f.engine.startCompaction({ sessionId: 'a9', idempotencyKey: 'compact-persona-1', sessionModel: luna }),
    error => error.code === 'CTX_NOTHING_TO_COMPACT',
  );
  assert.equal(f.riassunti.length, 0);
});

/* B4-c (adversarial review, 05/11): the gate is «gain > 0», measured in bytes of the compiled request. Padding the covered tool result of
   A9 moves the gain one byte per character (the covered part is replaced, the minimal summary does not quote it): with 89 characters the
   gain is 0 and the job does not start, with 90 it is exactly 1 and it starts. Both sides together pin the boundary: `> 1` fails the
   second, `>= 0` fails the first. The 89/90 threshold was measured on this fixture (probe in the cure's scratchpad, 05/11). */
const conRiempimento = (n) => banco.records.map((r) => (r.id === 'message-6' ? { ...r, message: { ...r.message, content: r.message.content + 'a'.repeat(n) } } : r));
const CHIAVE_AUTO_6 = 'auto-6-03d14642c32d7d3fcea16cdef133938893d3dcbfbe9336ec967b5c6f8a6c7f9d-turn';

test('B4-04 (B4-c): a gain of exactly 1 byte counts as a gain — the automatic job starts', async t => {
  const f = await fixture(t, conRiempimento(90));
  const job = await f.engine.startCompaction({ sessionId: 'a9', idempotencyKey: CHIAVE_AUTO_6, sessionModel: luna, withinTurn: true });
  assert.equal(job.coveredThrough, 6);
  await f.engine.waitForCompaction({ sessionId: 'a9', jobId: job.id });
  assert.ok(f.riassunti.length >= 1, 'the summary was asked for');
});

test('B4-05 (B4-c, the other way): one character less, the gain is 0 — no job, no summary', async t => {
  const f = await fixture(t, conRiempimento(89));
  await assert.rejects(
    f.engine.startCompaction({ sessionId: 'a9', idempotencyKey: CHIAVE_AUTO_6, sessionModel: luna, withinTurn: true }),
    error => error.code === 'CTX_NOTHING_TO_COMPACT',
  );
  assert.equal(f.riassunti.length, 0);
});
