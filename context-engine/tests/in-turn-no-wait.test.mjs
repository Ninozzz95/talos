/*
 * C4 del contratto «la chat non aspetta mai il riassunto» (owner 27/10/2026 notte, «Sì, mai aspettare»; contratto con la CLI
 * `handoff-talos-2026-09-27/CONTRATTO-RIASSUNTO-MAI-ASPETTARE-2026-10-27.md`). `summaryCeilingMs: 0` vuol dire «non aspettare»:
 * quando la richiesta non entra e il riassunto non è pronto, il motore NON lo aspetta e non lo annulla — risponde subito
 * CTX_SUMMARY_NOT_READY (chi lo ospita manda la richiesta con un riassunto senza modello), il lavoro finisce in sottofondo e la
 * richiesta dopo lo usa. Verso contrario: un tetto positivo aspetta come prima (CEIL-03 in `in-turn-summary-ceiling.test.mjs`).
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

const modelProfile = { provider: 'openrouter', model: 'controlled-fixture', windowTokens: 16384, responseReserve: 2048 };
const now = '2026-10-28T00:00:00.000Z';
const TASK = 'Database SQLite: leggi i dieci file e dimmi cosa contengono.';
const readCall = k => ({ role: 'assistant', content: null, tool_calls: [{ id: `c${k}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${k}.txt` }) } }] });
const readResult = k => ({ role: 'tool', tool_call_id: `c${k}`, content: [{ type: 'text', text: `file ${k}: ` + 'riga di contenuto '.repeat(400) }] });

/* i riassunti tenuti ancora fermi a fine prova si lasciano andare, così una prova rossa non lascia il processo appeso */
const daLasciare = new Set();

/** Un riassunto valido che parte solo quando il test lo lascia andare (`lascia`). */
function riassuntoTenuto() {
  let lascia;
  const via = new Promise(r => { lascia = r; });
  daLasciare.add(() => lascia());
  let chiamate = 0;
  const summarize = async (request, { signal } = {}) => {
    chiamate += 1;
    await new Promise((risolvi, rifiuta) => {
      via.then(risolvi);
      signal?.addEventListener?.('abort', () => rifiuta(signal.reason ?? new Error('aborted')), { once: true });
    });
    const sourceIds = JSON.parse(request.messages.at(-1).content).sourceIds ?? [];
    const sourceId = sourceIds.find(id => id === 'u0' || id.startsWith('t')) ?? 'u0';
    const quote = sourceId === 'u0' ? 'Database SQLite' : `file ${sourceId.slice(1)}:`;
    return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'Letti i file.', goal: 'Leggere i file', decisions: [], constraints: [], completed: ['letti'], pending: [], resources: [], sources: [{ recordId: sourceId, quote }] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  };
  return { summarize, lascia: () => lascia(), get chiamate() { return chiamate; } };
}

async function fixture(t, { summarize }) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-nowait-'));
  const store = createSqliteContextStore({ databasePath: join(directory, 'context.sqlite') });
  await store.initSession({ sessionId: 's', settings: parseContextSettings({ auto: true, triggerRatio: 0.5, targetRatio: 0.49 }) });
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: profile }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: profile.windowTokens, responseReserve: profile.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: profile.provider, model: profile.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now });
  const append = (id, message) => engine.appendOriginal({ sessionId: 's', record: { id, message, createdAt: now } });
  await append('s0', { role: 'system', content: 'Sei un assistente.' });
  await append('u0', { role: 'user', content: TASK });
  for (let k = 1; k <= 10; k++) { await append(`a${k}`, readCall(k)); await append(`t${k}`, readResult(k)); }
  t.after(async () => {
    /* nessun lavoro resta appeso a fine prova, poi si chiude l'archivio */
    for (const l of daLasciare) l();
    daLasciare.clear();
    for (const job of (await engine.getContextState({ sessionId: 's' })).jobs) {
      try { await engine.cancelCompaction({ sessionId: 's', jobId: job.id }); } catch { /* già concluso */ }
    }
    await store.close(); await rm(directory, { recursive: true, force: true });
  });
  return engine;
}

const haMemoria = prepared => prepared.messages.some(m => typeof m.content === 'string' && m.content.includes('talos-context-memory'));
const attivi = async engine => (await engine.getContextState({ sessionId: 's' })).jobs.filter(j => !['committed', 'failed', 'cancelled'].includes(j.state));

test('NOWAIT-01 the request does not fit and nothing is ready: CTX_SUMMARY_NOT_READY at once, the job keeps running', async t => {
  const tenuto = riassuntoTenuto();
  const engine = await fixture(t, { summarize: tenuto.summarize });
  const attese = [];
  const inizio = Date.now();
  await assert.rejects(
    engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, summaryCeilingMs: 0, onInTurnWait: e => attese.push(e) }),
    { code: 'CTX_SUMMARY_NOT_READY' });
  assert.ok(Date.now() - inizio < 2_000, `${Date.now() - inizio} ms`);
  assert.deepEqual(attese, [], 'nothing waits, so no live row with Skip');
  assert.equal((await attivi(engine)).length, 1, 'the summary goes on in the background, not cancelled');
  /* contratto con la CLI (28/10/2026): il «non pronto» dice QUALE lavoro sta scrivendo il riassunto — chi ospita lega a lui la riga del
     rapido, e la versione che quel lavoro pubblicherà (`context.version.committed` col suo jobId) è il suo miglioramento, nessun'altra */
  const [lavoro] = await attivi(engine);
  const errore = await engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, summaryCeilingMs: 0 }).then(() => null, (e) => e);
  assert.equal(errore?.code, 'CTX_SUMMARY_NOT_READY');
  assert.deepEqual(errore.details, { jobId: lavoro.id }, 'the job that is writing the summary');
  tenuto.lascia();
});

test('NOWAIT-02 the summary that arrives later is used by the next request, without waiting', async t => {
  const tenuto = riassuntoTenuto();
  const engine = await fixture(t, { summarize: tenuto.summarize });
  await assert.rejects(engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, summaryCeilingMs: 0 }), { code: 'CTX_SUMMARY_NOT_READY' });
  const [job] = await attivi(engine);
  tenuto.lascia();
  assert.equal((await engine.waitForCompaction({ sessionId: 's', jobId: job.id })).state, 'committed');
  const prepared = await engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, summaryCeilingMs: 0 });
  assert.ok(haMemoria(prepared), 'the next request carries the model summary');
});

test('NOWAIT-03 a summary already in flight is not awaited and no second one is paid', async t => {
  const tenuto = riassuntoTenuto();
  const engine = await fixture(t, { summarize: tenuto.summarize });
  await assert.rejects(engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, summaryCeilingMs: 0 }), { code: 'CTX_SUMMARY_NOT_READY' });
  const chiamatePrima = tenuto.chiamate;
  await assert.rejects(engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, summaryCeilingMs: 0 }), { code: 'CTX_SUMMARY_NOT_READY' });
  assert.equal((await attivi(engine)).length, 1, 'still one job');
  assert.equal(tenuto.chiamate, chiamatePrima, 'no second summary call');
  tenuto.lascia();
});

test('NOWAIT-04 reverse: without «do not wait» the turn still waits for the summary and gets it', async t => {
  const tenuto = riassuntoTenuto();
  const engine = await fixture(t, { summarize: tenuto.summarize });
  setTimeout(() => tenuto.lascia(), 100);
  const prepared = await engine.prepareForRequest({ sessionId: 's', sessionModel: modelProfile, summaryCeilingMs: 10_000 });
  assert.ok(haMemoria(prepared));
});
