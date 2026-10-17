/*
 * Owner 16/10/2026 sera («Non aspettare se entra»), dopo la misura dal vivo (tetto 60.000, glm-5.3-flash, 12 file letti in catena):
 * il riassunto in sottofondo partiva 2-3 passi prima del limite e durava 26 s, e il giro lo aspettava lo stesso (22 s). Al limite,
 * se un riassunto è GIÀ in corso e la richiesta entra ancora nella finestra vera (finestra meno la riserva della risposta, senza il
 * margine di sicurezza della stima), la si manda subito; si aspetta solo quando non entra davvero.
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

async function engineFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-non-aspettare-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'turn', settings: parseContextSettings(SETTINGS) });
  let apri; const cancello = new Promise((r) => { apri = r; }); // il riassunto resta «in corso» finché la prova non lo libera
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async request => {
    await cancello;
    const sourceIds = JSON.parse(request.messages.at(-1).content).sourceIds ?? [];
    const sourceId = sourceIds.find(id => id === 'u0' || id.startsWith('t')) ?? 'u0';
    const quote = sourceId === 'u0' ? 'Database SQLite' : `file ${sourceId.slice(1)}:`;
    const summary = { schema: 'talos.context.summary.v1', text: 'La persona ha chiesto di leggere dieci file; i primi sono stati letti.', goal: 'Leggere i dieci file', decisions: [], constraints: [], completed: ['letti i primi file'], pending: ['leggere gli altri'], resources: [], sources: [{ recordId: sourceId, quote }] };
    return { text: JSON.stringify(summary), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: profile }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: profile.windowTokens, responseReserve: profile.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: profile.provider, model: profile.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now });
  const append = (id, message) => engine.appendOriginal({ sessionId: 'turn', record: { id, message, createdAt: now } });
  await append('s0', { role: 'system', content: 'Sei un assistente.' });
  await append('u0', { role: 'user', content: TASK });
  return { engine, append, apri };
}
const readCall = k => ({ role: 'assistant', content: null, tool_calls: [{ id: `c${k}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${k}.txt` }) } }] });
const readResult = (k, ripetizioni = 100) => ({ role: 'tool', tool_call_id: `c${k}`, content: [{ type: 'text', text: `file ${k}: ` + 'riga di contenuto '.repeat(ripetizioni) }] });
const prepara = (engine) => engine.prepareForRequest({ sessionId: 'turn', sessionModel: modelProfile });
const SOSPESA = Symbol('sospesa');
const entro = (promessa, ms = 300) => Promise.race([promessa, new Promise((r) => setTimeout(() => r(SOSPESA), ms))]);
const limiti = (m) => computeContextBudget({ ...modelProfile, method: m.method, inputTokens: m.inputTokens, settings: SETTINGS });

// fino al riassunto in sottofondo (resta in corso: il cancello è chiuso), poi un'uscita grande che porta oltre il limite prudente
async function finoAlRiassuntoInCorso(engine, append) {
  for (let k = 1; k <= 12; k++) {
    await append(`a${k}`, readCall(k)); await append(`t${k}`, readResult(k));
    await prepara(engine);
    const jobs = (await engine.getContextState({ sessionId: 'turn' })).jobs;
    if (jobs.some(j => /-turn-bg$/u.test(j.idempotencyKey))) return k;
  }
  assert.fail('premessa: un riassunto in sottofondo doveva partire');
}

test('NON-ASPETTARE-01 — oltre il limite prudente ma dentro la finestra vera, con un riassunto già in corso: la richiesta parte subito, intera', async t => {
  const { engine, append, apri } = await engineFixture(t);
  const k = await finoAlRiassuntoInCorso(engine, append);
  await append('a99', readCall(99)); await append('t99', readResult(99, 1400));
  const esito = await entro(prepara(engine));
  assert.notEqual(esito, SOSPESA, 'la richiesta aspettava il riassunto in corso');
  const b = limiti(esito.measurement);
  assert.ok(!b.fits && esito.measurement.inputTokens <= b.windowTokens - b.responseReserve, `premessa: oltre il limite prudente (${b.inputLimit}) e dentro la finestra vera (${b.windowTokens - b.responseReserve}): ${esito.measurement.inputTokens}`);
  assert.ok(esito.messages.some(m => m.tool_call_id === 'c99'), 'l ultima uscita c è, intera');
  assert.ok(esito.job && /-turn-bg$/u.test(esito.job.idempotencyKey), 'il riassunto resta in corso, per la richiesta dopo');
  apri();
  await engine.waitForCompaction({ sessionId: 'turn', jobId: esito.job.id });
  assert.ok(k >= 1);
});

test('NON-ASPETTARE-02 — AL CONTRARIO: oltre la finestra vera si aspetta il riassunto in corso', async t => {
  const { engine, append, apri } = await engineFixture(t);
  await finoAlRiassuntoInCorso(engine, append);
  await append('a99', readCall(99)); await append('t99', readResult(99, 1900));
  const attesa = prepara(engine);
  assert.equal(await entro(attesa), SOSPESA, 'oltre la finestra vera non si manda: si aspetta il riassunto');
  apri();
  const esito = await attesa.catch((error) => error);
  // dopo il riassunto la richiesta entra (o, se non basta, è l'overflow di sempre): in ogni caso NON è partita prima
  if (esito?.measurement) assert.ok(limiti(esito.measurement).fits, `dopo il riassunto entra: ${esito.measurement.inputTokens}`);
  else assert.equal(esito?.code, 'CTX_CONTEXT_OVERFLOW');
});

test('NON-ASPETTARE-03 — AL CONTRARIO: un riassunto in PAUSA (una chiamata era aperta) si riprende e si aspetta, non si scavalca', async t => {
  const { engine, append, apri } = await engineFixture(t);
  await finoAlRiassuntoInCorso(engine, append);
  await append('a100', readCall(100)); // una chiamata aperta mentre il riassunto lavora: alla pubblicazione va in pausa
  apri();
  const [lavoro] = (await engine.getContextState({ sessionId: 'turn' })).jobs;
  assert.equal((await engine.waitForCompaction({ sessionId: 'turn', jobId: lavoro.id })).state, 'paused', 'premessa: il riassunto è in pausa');
  await append('t100', readResult(100, 1400));
  const esito = await prepara(engine);
  // il `job` restituito è quello della ripresa (ancora «queued»): il fatto è che questa richiesta porta già il riassunto
  assert.ok(esito.versionId, 'il riassunto in pausa è stato ripreso e atteso: la richiesta usa la sua versione');
  assert.ok(esito.messages.some(m => typeof m.content === 'string' && m.content.includes('talos-context-memory')));
});

test('NON-ASPETTARE-04 — il ritentativo dopo un «contesto pieno» (waitForInFlight) aspetta il riassunto in corso anche se entrerebbe', async t => {
  const { engine, append, apri } = await engineFixture(t);
  await finoAlRiassuntoInCorso(engine, append);
  await append('a99', readCall(99)); await append('t99', readResult(99, 1400));
  const attesa = engine.prepareForRequest({ sessionId: 'turn', sessionModel: modelProfile, waitForInFlight: true });
  assert.equal(await entro(attesa), SOSPESA, 'col ritentativo si aspetta il riassunto in corso');
  apri();
  const esito = await attesa;
  assert.ok(esito.versionId && !esito.sentWithoutWaiting, 'la richiesta riprovata porta il riassunto');
});
