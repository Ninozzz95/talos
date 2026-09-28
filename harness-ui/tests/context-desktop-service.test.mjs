import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';

async function fixture(t) {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('Not used'); } }, tokenCounter: { countPreparedContext: async () => { throw new Error('Not used'); } } });
  const service = createDesktopContextService({ store, engine, readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:test' } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: async () => ({ provider: 'local', model: 'test', windowTokens: 16384, responseReserve: 2048 }), clock: () => '2026-09-09T00:00:00.000Z' });
  t.after(() => service.close());
  return { store, engine, service };
}
const request = (service, method, path, body) => service.request({ sessionId: 'chat', method, path, body });

test('CTX-OUTBOX-SINGLE-FLIGHT drains all pages once and acknowledges only successful delivery', { timeout: 2000 }, async () => {
  const pending = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
  const delivered = []; const releases = []; let failOnce = true;
  const store = { readContextSnapshot: async () => ({ sessionId: 'chat' }), readUsage: async () => [],
    readContextOutbox: async () => pending.slice(0, 1), ackContextEvent: async ({ eventId }) => { assert.equal(pending[0].id, eventId); pending.shift(); } };
  const service = createDesktopContextService({ store, engine: {}, readSession: () => ({}), isSessionEnabled: () => true, resolveSessionModel: () => ({}), onEvent: async ({ event }) => {
    delivered.push(event.id);
    if (failOnce) { await new Promise(resolve => { releases.push(resolve); }); throw new Error('not persisted'); }
  } });
  const first = request(service, 'GET', '/');
  const second = request(service, 'GET', '/');
  const rejected = Promise.all([assert.rejects(first, /not persisted/), assert.rejects(second, /not persisted/)]);
  await new Promise(resolve => setImmediate(resolve));
  const during = [...delivered]; const waiting = pending.length;
  failOnce = false; for (const release of releases) release(); await rejected;
  assert.deepEqual(during, ['one']); assert.equal(waiting, 3);
  await request(service, 'GET', '/');
  assert.deepEqual(delivered, ['one', 'one', 'two', 'three']);
  assert.deepEqual(pending, []);
  await service.close();
});
test('CTX-DESKTOP-ISOLATION unknown session cannot initialize archive or access originals', async t => {
  const { service, store } = await fixture(t);
  await assert.rejects(service.request({ sessionId: 'unknown', method: 'GET', path: '/' }), { code: 'CTX_SESSION_NOT_FOUND' });
  assert.equal(await store.readContextSnapshot({ sessionId: 'unknown' }), null);
});
test('CTX-DESKTOP-SETTINGS persistent idempotence and expected revision control updates', async t => {
  const { service } = await fixture(t);
  const initial = await request(service, 'GET', '/');
  const body = { patch: { auto: false }, expectedRevision: initial.revision, idempotencyKey: 'one' };
  const first = await request(service, 'PATCH', '/settings', body);
  assert.equal(first.settings.auto, false);
  assert.deepEqual(await request(service, 'PATCH', '/settings', body), first);
  await assert.rejects(request(service, 'PATCH', '/settings', { ...body, patch: { auto: true } }), { code: 'CTX_IDEMPOTENCY_CONFLICT' });
  await assert.rejects(request(service, 'PATCH', '/settings', { ...body, idempotencyKey: 'two' }), { code: 'CTX_STALE_REVISION' });
});
test('CTX-DESKTOP-RAW retains full tool output with deterministic append identity', async t => {
  const { service, store } = await fixture(t);
  const messages = [{ role: 'user', content: 'leggi il file' }, { role: 'assistant', tool_calls: [{ id: 'call', type: 'function', function: { name: 'leggi', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'call', content: 'x'.repeat(18000) + 'VALORE FINALE' }];
  await service.syncOriginals({ sessionId: 'chat', messages });
  await service.syncOriginals({ sessionId: 'chat', messages });
  const records = await store.readOriginals({ sessionId: 'chat' });
  assert.equal(records.length, 3);
  assert.equal(records.at(-1).message.content, messages.at(-1).content);
  await assert.rejects(service.syncOriginals({ sessionId: 'chat', messages: [{ role: 'user', content: 'sostituito' }] }), { code: 'CTX_HISTORY_DIVERGED' });
});
test('CTX-DESKTOP-FACTS owner changes and deletion expose real persisted state', async t => {
  const { service } = await fixture(t);
  const state = await request(service, 'GET', '/');
  const result = await request(service, 'POST', '/facts', { fact: { id: 'db', text: 'SQLite', sources: [] }, expectedRevision: state.revision, idempotencyKey: 'fact' });
  assert.equal(result.fact.text, 'SQLite');
  const next = await request(service, 'GET', '/');
  await request(service, 'DELETE', '/facts/db', { expectedRevision: next.revision, idempotencyKey: 'remove' });
  assert.deepEqual((await request(service, 'GET', '/facts')).facts.filter(f => f.status !== 'removed'), []);
});

test('CTX-DESKTOP-PROVIDER-RAW archives the untouched provider response before normalization', async t => {
  const { service, store } = await fixture(t);
  const hooks = await service.createKernelHooks({ sessionId: 'chat', runId: 'run-one' });
  const response = { role: 'assistant', tool_calls: [{ id: 'call', type: 'function', function: { name: 'read', arguments: '{' } }] };
  await hooks.captureProviderResponse({ response, giro: 0 });
  response.tool_calls[0].function.arguments = '{}';
  const exported = await store.exportSession({ sessionId: 'chat' });
  const raw = exported.blobs.find(blob => blob.id.startsWith('provider-response-'));
  assert.ok(raw);
  assert.equal(JSON.parse(Buffer.from(raw.base64, 'base64').toString('utf8')).response.tool_calls[0].function.arguments, '{');
  assert.equal((await store.readOriginals({ sessionId: 'chat' })).length, 0, 'raw transport evidence must not create a second assistant message');
  await hooks.capture({ messages: [{ role: 'user', content: 'Leggi il file' }, response], reason: 'response' });
  assert.equal((await store.readOriginals({ sessionId: 'chat' })).length, 2);
});

test('CTX-DESKTOP-HOOK-NOT-ENABLED leaves unrelated sessions on the legacy path', async t => {
  const { store, engine } = await fixture(t);
  const service = createDesktopContextService({ store, engine, readSession: () => ({ sessionId: 'other' }), isSessionEnabled: () => false, resolveSessionModel: () => { throw new Error('Not called'); } });
  t.after(() => service.close());
  assert.equal(await service.createKernelHooks({ sessionId: 'other', runId: 'other-run' }), undefined);
  assert.equal(await service.compact({ sessionId: 'other', messages: [] }), undefined);
  assert.equal(await store.readContextSnapshot({ sessionId: 'other' }), null);
});

/*
 * 24/09/2026 — F4, archivio ≠ proiezione (T1/T2 della ricognizione). L'adapter desktop corregge gli esiti
 * degli attrezzi PRIMA di preparare la richiesta; il servizio archiviava la proiezione e alla richiesta
 * successiva l'archivio (grezzo, da `capture`) non combaciava più: `CTX_HISTORY_DIVERGED` alla seconda
 * richiesta, riprodotto dalla sonda T2. Contratto con F1: `prepare({ messages: <corretto>, originali: <grezzo> })`.
 * Come Hermes (`hermes_state_messages.py:735-741`, `65ad529`): gli originali restano in tabella, ciò che il
 * modello vede è un insieme separato.
 */
const riassuntoFinto = { schema: 'talos.context.summary.v1', text: 'Sintesi operativa.', goal: 'Continuare', decisions: [], constraints: [], completed: [], pending: [], resources: [] };
const grezzo = [
  { role: 'user', content: 'Leggi il file e dimmi il valore' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'elenca', arguments: '{"percorso":"src"}' } }] },
  { role: 'tool', tool_call_id: 'call-1', content: 'GREZZO: "src" is not a readable folder of this workspace' },
  { role: 'assistant', content: 'Non riesco a leggere la cartella.' },
  { role: 'user', content: 'Riprendiamo ' + 'dati '.repeat(12000) },
  { role: 'assistant', content: 'risposta' },
  { role: 'user', content: 'Avanti' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'Continua' },
];
const corretto = grezzo.map((m, i) => i === 2 ? { ...m, content: 'CORRETTO: "src" is a FILE, not a folder. Use `leggi` to read it.' } : m);
const contatoreEuristico = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const riassumiFinto = visti => async request => {
  visti?.push(JSON.stringify(request.messages));
  const ids = JSON.parse(request.messages.at(-1).content).sourceIds ?? [];
  const fonte = !ids.length || ids.includes('message-1') ? { recordId: 'message-1', quote: 'Leggi il file' } : { recordId: 'message-5', quote: 'dati dati dati dati dati' };
  return { text: JSON.stringify({ ...riassuntoFinto, sources: [fonte] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
};
async function fixtureConMotore(t, { windowTokens = 16384 } = {}) {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const visti = [];
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: riassumiFinto(visti) }, tokenCounter: contatoreEuristico, clock: () => '2026-09-24T00:00:00.000Z' });
  const service = createDesktopContextService({ store, engine, readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:test' } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: async () => ({ provider: 'local', model: 'test', windowTokens, responseReserve: 2048 }), clock: () => '2026-09-24T00:00:00.000Z' });
  t.after(() => service.close());
  return { store, engine, service, visti };
}

test('CTX-TRIAL-CAPTURE-RAW-PREPARE-PROJECTED capture archives the raw history, prepare projects and summarizes the corrected one', async t => {
  const { store, service, visti } = await fixtureConMotore(t);
  const hooks = await service.createKernelHooks({ sessionId: 'chat', runId: 'run-1' });
  await hooks.capture({ messages: grezzo, reason: 'response' });
  const prepared = await hooks.prepare({ messages: corretto, originali: grezzo, tools: [] });
  assert.ok(prepared.versionId, 'la storia non entra nella finestra: la compattazione deve essere avvenuta');
  assert.ok(visti.length >= 1, 'il riassuntore è stato chiamato');
  assert.ok(visti.some(testo => testo.includes('CORRETTO')), 'il riassuntore vede il testo CORRETTO');
  assert.equal(visti.some(testo => testo.includes('GREZZO')), false, 'il riassuntore non vede mai il testo grezzo');
  assert.equal(JSON.stringify(prepared.messages).includes('GREZZO'), false);
  const archivio = (await store.readOriginals({ sessionId: 'chat' })).map(record => record.message);
  assert.deepEqual(archivio, grezzo, 'l’archivio conserva gli originali grezzi, intatti');
  const versioni = await service.request({ sessionId: 'chat', method: 'GET', path: '/versions' });
  assert.equal(versioni.versions.length, 1);
  assert.ok(versioni.versions[0].summary.sources.length >= 1, 'le citazioni della versione sono verificate sugli originali');
  // Verso contrario: originali che divergono DAVVERO dall’archivio ⇒ DIVERGED resta.
  const divergenti = grezzo.map((m, i) => i === 0 ? { ...m, content: 'sostituito' } : m);
  await assert.rejects(hooks.prepare({ messages: divergenti, originali: divergenti, tools: [] }), { code: 'CTX_HISTORY_DIVERGED' });
  // E una proiezione non allineata (lunghezza diversa) non entra: né archivio né richiesta.
  await assert.rejects(hooks.prepare({ messages: corretto.slice(0, 3), originali: grezzo, tools: [] }), { code: 'CTX_INVALID_INPUT' });
});

test('CTX-TRIAL-PLAN-MODE-NO-DIVERGE two requests in a row with the same raw prefix and one more message both conclude', async t => {
  const { store, service } = await fixtureConMotore(t, { windowTokens: 262144 });
  const hooks = await service.createKernelHooks({ sessionId: 'chat', runId: 'run-2' });
  const primo = await hooks.prepare({ messages: corretto.slice(0, 4), originali: grezzo.slice(0, 4), tools: [] });
  assert.ok(primo.messages[2].content.startsWith('CORRETTO'), 'la richiesta porta la proiezione corretta');
  assert.equal(primo.versionId, null, 'storia piccola ⇒ nessuna compattazione (verso in cui non deve scattare)');
  const secondo = await hooks.prepare({ messages: corretto.slice(0, 5), originali: grezzo.slice(0, 5), tools: [] });
  assert.equal(secondo.messages.length, 5);
  assert.ok(secondo.messages[2].content.startsWith('CORRETTO'));
  const archivio = (await store.readOriginals({ sessionId: 'chat' })).map(record => record.message);
  assert.deepEqual(archivio, grezzo.slice(0, 5));
  // Ripiego dichiarato: senza `originali` l’archivio è `messages`, come prima (nessun cambio per chi non passa il campo).
  const terzo = await hooks.prepare({ messages: grezzo.slice(0, 6), tools: [] });
  assert.equal(terzo.messages.length, 6);
  assert.equal((await store.readOriginals({ sessionId: 'chat' })).length, 6);
});

/*
 * 24/09/2026 — F4, `CTX-RESTART-ACTIVE-JOB-RECOVERY` lato servizio: un job lasciato `summarizing` da un
 * processo morto deve comparire alla persona come interrotto (non «in corso» per sempre) e la sessione
 * deve poter compattare di nuovo. La prova simula la morte del processo con un secondo motore + servizio
 * sullo STESSO archivio: la mappa `running` del motore muore col processo, SQLite no.
 */
test('CTX-TRIAL-RESTART-JOB-VISIBLE-TO-SERVICE an orphaned running job is reported as interrupted and a new compaction can start', async t => {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const sessionModel = { provider: 'local', model: 'test', windowTokens: 16384, responseReserve: 2048 };
  const morto = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: () => new Promise(() => {}) }, tokenCounter: contatoreEuristico });
  const servizioMorto = createDesktopContextService({ store, engine: morto, readSession: () => ({ sessionId: 'chat', modello: 'local:test' }), isSessionEnabled: () => true, resolveSessionModel: async () => sessionModel });
  await servizioMorto.syncOriginals({ sessionId: 'chat', messages: grezzo });
  const stato = await servizioMorto.request({ sessionId: 'chat', method: 'GET', path: '/' });
  const { job } = await servizioMorto.request({ sessionId: 'chat', method: 'POST', path: '/jobs', body: { kind: 'compact', expectedRevision: stato.revision, idempotencyKey: 'prima-del-crash' } });
  for (let giro = 0; giro < 100 && (await store.readContextJob({ sessionId: 'chat', jobId: job.id })).state !== 'summarizing'; giro++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await store.readContextJob({ sessionId: 'chat', jobId: job.id })).state, 'summarizing', 'il processo muore qui');
  // Il processo nuovo: stesso archivio, motore e servizio nuovi.
  const vivo = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: riassumiFinto() }, tokenCounter: contatoreEuristico });
  const servizio = createDesktopContextService({ store, engine: vivo, readSession: () => ({ sessionId: 'chat', modello: 'local:test' }), isSessionEnabled: () => true, resolveSessionModel: async () => sessionModel });
  const dopo = await servizio.request({ sessionId: 'chat', method: 'GET', path: '/' });
  const orfano = dopo.jobs.find(entry => entry.id === job.id);
  assert.equal(orfano.state, 'paused', 'non più «in corso»');
  assert.equal(orfano.error?.code, 'CTX_JOB_INTERRUPTED');
  assert.equal(dopo.activeVersion, null, 'nessuna versione pubblicata dal job interrotto');
  const nuovo = await servizio.request({ sessionId: 'chat', method: 'POST', path: '/jobs', body: { kind: 'compact', expectedRevision: dopo.revision, idempotencyKey: 'dopo-il-riavvio' } });
  const finito = await vivo.waitForCompaction({ sessionId: 'chat', jobId: nuovo.job.id });
  assert.equal(finito.state, 'committed', JSON.stringify(finito.error));
  await servizio.close(); // prima dello store (registrato in `t.after`): il servizio con un job proprio lo interroga
});
/*
 * 25/09/2026 — ticket della CLI sui riassunti rifiutati: l'avviso «compattazione automatica in pausa» nasce anche nella
 * richiesta che MUORE (contesto che non entra). Prima di oggi `prepare` consegnava la coda solo dopo un successo: l'avviso
 * restava fermo fino alla richiesta dopo. E una consegna che fallisce non copre l'errore vero della richiesta.
 */
test('CTX-DESKTOP-NOTICE-ON-FAILED-PREPARE delivers the queued notice when the request fails, and keeps the request error', async t => {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const notice = { schema: 'talos.context.event.v1', id: 'cooling-j1', sessionId: 'chat', jobId: 'j1', kind: 'context.compaction.cooling', state: 'failed', createdAt: '2026-09-25T10:00:00.000Z', payload: { code: 'CTX_INVALID_SUMMARY', attempts: 1, waitSeconds: 60, retryAfter: '2026-09-25T10:01:00.000Z' } };
  const engine = { prepareForRequest: async ({ sessionId }) => {
    await store.recordContextNotice({ sessionId, event: notice });
    throw Object.assign(new Error('Il contesto supera la finestra.'), { code: 'CTX_CONTEXT_OVERFLOW' });
  } };
  const delivered = []; let rompiConsegna = false;
  const service = createDesktopContextService({ store, engine, readSession: id => id === 'chat' ? { sessionId: id } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: async () => ({ provider: 'local', model: 'test', windowTokens: 16384, responseReserve: 2048 }), onEvent: async ({ event }) => {
    if (rompiConsegna) throw new Error('delivery broken');
    delivered.push(event.id);
  } });
  t.after(() => service.close());
  const messages = [{ role: 'user', content: 'ciao' }];
  await assert.rejects(service.prepare({ sessionId: 'chat', messages }), { code: 'CTX_CONTEXT_OVERFLOW' });
  assert.deepEqual(delivered, ['cooling-j1'], 'the notice must reach the screen in the failing request');
  // la stessa pausa ripetuta non si riconsegna; una consegna rotta non sostituisce l'errore della richiesta
  rompiConsegna = true;
  await assert.rejects(service.prepare({ sessionId: 'chat', messages }), { code: 'CTX_CONTEXT_OVERFLOW' });
  assert.deepEqual(delivered, ['cooling-j1']);
  await store.recordContextNotice({ sessionId: 'chat', event: { ...notice, id: 'cooling-j2', jobId: 'j2' } });
  await assert.rejects(service.prepare({ sessionId: 'chat', messages }), { code: 'CTX_CONTEXT_OVERFLOW' });
});
