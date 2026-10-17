/*
 * Revisione avversaria di bfa7103d6 (16/10/2026) — il riassunto del giro in corso in sottofondo, «con una guardia».
 *
 * La guardia stima ciò che resta dopo il riassunto come `misura − byte(prefisso)/3,5 + riserva/2`. Ma il prefisso di
 * `selectClosedPrefix` parte dal record 0: dentro ci sono il prompt di SISTEMA iniziale e il messaggio della persona, che dopo il
 * riassunto restano (sistema in testa, messaggio della persona ripetuto alla lettera: `compiled`, engine.mjs) — e dopo il primo
 * riassunto ci sono anche tutti i record GIÀ coperti, che nella misura non ci sono più. La stima scende sotto l'obiettivo anche
 * quando ciò che resta sta sopra la soglia: è il caso che la regola G02 voleva evitare, un riassunto (una chiamata al modello) a
 * ogni passo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { computeContextBudget } from '../src/compaction-planner.mjs';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';

const modelProfile = { provider: 'local', model: 'controlled-fixture', windowTokens: 16384, responseReserve: 2048, local: true };
const now = '2026-10-01T00:00:00.000Z';
const TASK = 'Database SQLite: leggi i dieci file e dimmi cosa contengono.';
const SETTINGS = { auto: true, triggerRatio: 0.5, targetRatio: 0.49 };

/* la fixture di `in-turn-compaction.test.mjs`, copiata (un file di prova non si importa) */
async function engineFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-bg-rev-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'turn', settings: parseContextSettings(SETTINGS) });
  const calls = [];
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async request => {
    calls.push(request);
    const sourceIds = JSON.parse(request.messages.at(-1).content).sourceIds ?? [];
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
const readResult = k => ({ role: 'tool', tool_call_id: `c${k}`, content: [{ type: 'text', text: `file ${k}: ` + 'riga di contenuto '.repeat(100) }] });
const SISTEMA = 'Regole del sistema: rispondi con cura, usa gli attrezzi, cita i file. '.repeat(330); // ~5.700 token come un prompt vero

async function finisciLavori(engine) {
  for (const job of (await engine.getContextState({ sessionId: 'turn' })).jobs) await engine.waitForCompaction({ sessionId: 'turn', jobId: job.id });
}
const budgetDi = (m) => computeContextBudget({ ...modelProfile, method: m.method, inputTokens: m.inputTokens, settings: SETTINGS });

test('SOTT-REV-01 — con un prompt di sistema grande, ciò che resta dopo il riassunto sta SOPRA la soglia: la guardia non deve far partire un riassunto a ogni passo', async t => {
  const { engine, append } = await engineFixture(t);
  await append('s0', { role: 'system', content: SISTEMA });
  await append('u0', { role: 'user', content: TASK });
  const passi = [];
  for (let k = 1; k <= 6; k++) {
    await append(`a${k}`, readCall(k)); await append(`t${k}`, readResult(k));
    const prepared = await engine.prepareForRequest({ sessionId: 'turn', sessionModel: modelProfile });
    const lavori = (await engine.getContextState({ sessionId: 'turn' })).jobs.filter(j => /-turn-bg$/u.test(j.idempotencyKey)).length;
    passi.push({ k, misura: prepared.measurement.inputTokens, soglia: budgetDi(prepared.measurement).triggerTokens, obiettivo: budgetDi(prepared.measurement).targetTokens, lavori });
    await finisciLavori(engine);
  }
  // ciò che resta dopo un riassunto (sistema + messaggio della persona + riassunto + ultimo scambio) sta sopra la soglia per costruzione:
  // al più UN riassunto (il primo, se la stima lo concede) — mai uno a ogni passo
  const totale = passi.at(-1).lavori;
  assert.ok(totale <= 1, `un riassunto in sottofondo a ogni passo: ${totale} in ${passi.length} passi — ${JSON.stringify(passi)}`);
});

test('SOTT-REV-02 — AL CONTRARIO: il primo riassunto non doveva partire, perché sistema + ultimo scambio stanno già sopra l\'obiettivo', async t => {
  const { engine, append } = await engineFixture(t);
  await append('s0', { role: 'system', content: SISTEMA });
  await append('u0', { role: 'user', content: TASK });
  let primo = null;
  for (let k = 1; k <= 6 && !primo; k++) {
    await append(`a${k}`, readCall(k)); await append(`t${k}`, readResult(k));
    const prepared = await engine.prepareForRequest({ sessionId: 'turn', sessionModel: modelProfile });
    const jobs = (await engine.getContextState({ sessionId: 'turn' })).jobs;
    if (jobs.length) primo = { k, misura: prepared.measurement.inputTokens };
  }
  // il minimo che resta dopo qualunque riassunto del giro: il sistema, il messaggio della persona e l'ultimo scambio interi
  const minimo = Math.ceil(JSON.stringify({ messages: [{ role: 'system', content: SISTEMA }, { role: 'user', content: TASK }, readCall(1), readResult(1)], tools: [] }).length / 4);
  const obiettivo = budgetDi({ method: 'heuristic', inputTokens: 0 }).targetTokens;
  assert.ok(minimo >= obiettivo, `premessa: ${minimo} >= ${obiettivo}`);
  assert.equal(primo, null, `è partito un riassunto che non può portare sotto l'obiettivo (${minimo} di minimo contro ${obiettivo}): ${JSON.stringify(primo)}`);
});
