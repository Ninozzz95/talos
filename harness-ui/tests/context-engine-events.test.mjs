import test from 'node:test';
import assert from 'node:assert/strict';
import { contextEngineEvent } from '../src/agui-events.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { registraRiga } from '../src/session-store.mjs';

const event = sessionId => ({ schema: 'talos.context.event.v1', id: 'event-one', sessionId, versionId: 'version-one', kind: 'version.committed', createdAt: '2026-09-09T08:00:00.000Z', payload: { coveredThrough: 20 } });
const tick = () => new Promise(resolve => setImmediate(resolve));
function registry(extra = {}) {
  return createSessionRegistry({ modello: 'local:test', chiave: 'fixture', cartellaStore: 'C:/fixture',
    registraRigaSyncFn: () => {}, registraRigaFn: async () => {}, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: () => ({ cartella: 'C:/fixture', task: { id: 'test', consegna: 'Riprendiamo' }, comandoProva: 'node --test' }),
    avviaSessioneFn: async ({ onEvento }) => { onEvento({ type: 'RunFinished' }); return { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } }; }, ...extra });
}

test('CTX-EVENT-AGUI validates and clones a canonical event in the documented CUSTOM envelope', () => {
  const input = event('chat'); const output = contextEngineEvent(input);
  assert.deepEqual(output, { type: 'CUSTOM', name: 'talos.context', timestamp: Date.parse(input.createdAt), value: input });
  input.payload.coveredThrough = 99;
  assert.equal(output.value.payload.coveredThrough, 20);
  assert.throws(() => contextEngineEvent({ ...input, schema: 'future' }));
});

test('CTX-EVENT-DURABLE explicitly flushes context records without changing legacy append options', async () => {
  const options = []; const deps = { mkdirFn: async () => {}, appendFileFn: async (_path, _line, value) => { options.push(value); } };
  await registraRiga({ cartellaStore: 'C:/fixture', sessionId: 'chat', record: {}, durable: true }, deps);
  await registraRiga({ cartellaStore: 'C:/fixture', sessionId: 'chat', record: {} }, deps);
  assert.deepEqual(options, [{ encoding: 'utf8', flush: true }, 'utf8']);
});

test('CTX-EVENT-RETRY waits for persistence, rejects failed writes and deduplicates concurrent delivery', { timeout: 2000 }, async () => {
  let release; let writes = 0; const observed = [];
  const r = registry({ registraRigaFn: async ({ record, durable }) => {
    if (record.type !== 'CUSTOM') return;
    assert.equal(durable, true); writes++;
    if (writes === 1) { await new Promise(resolve => { release = resolve; }); throw Object.assign(new Error('disk unavailable'), { code: 'ENOSPC' }); }
  } });
  const { sessionId } = r.avvia('test'); await tick(); r.iscriviti(sessionId, value => observed.push(value));
  const input = event(sessionId);
  const first = r.pubblicaEventoContesto({ sessionId, event: input });
  const second = r.pubblicaEventoContesto({ sessionId, event: input });
  const conflict = assert.rejects(r.pubblicaEventoContesto({ sessionId, event: { ...input, payload: { coveredThrough: 99 } } }), { code: 'CTX_EVENT_CONFLICT' });
  const failures = Promise.all([assert.rejects(first, { code: 'ENOSPC' }), assert.rejects(second, { code: 'ENOSPC' })]);
  await tick(); assert.equal(writes, 1); release(); await failures; await conflict;
  const saved = await r.pubblicaEventoContesto({ sessionId, event: input });
  assert.equal(writes, 2);
  assert.equal(observed.filter(value => value.type === 'CUSTOM').length, 1);
  assert.equal((await r.pubblicaEventoContesto({ sessionId, event: input }))._sequenza, saved._sequenza);
  assert.equal(writes, 2);
  await assert.rejects(r.pubblicaEventoContesto({ sessionId, event: { ...input, payload: { coveredThrough: 99 } } }), { code: 'CTX_EVENT_CONFLICT' });
  await assert.rejects(r.pubblicaEventoContesto({ sessionId, event: event('other') }), { code: 'CTX_SESSION_MISMATCH' });
});

test('CTX-EVENT-RESTART replay from the durable session log does not append a second event', async () => {
  let writes = 0; const input = event('chat');
  const wire = { ...contextEngineEvent(input), _sequenza: 2 };
  const r = registry({ elencaSessioniPersistiteFn: async () => ['chat'], leggiRegistroFn: async () => [
    { tipo: 'intestazione', sessionId: 'chat', taskId: 'test', cartella: 'C:/fixture', modello: 'local:test', avviataAlle: '2026-09-09T08:00:00.000Z' },
    { type: 'RunFinished', _sequenza: 1 }, wire, structuredClone(wire),
  ], registraRigaFn: async () => { writes++; } });
  await r.ripristina();
  const saved = await r.pubblicaEventoContesto({ sessionId: 'chat', event: input });
  assert.deepEqual(saved, wire); assert.equal(writes, 0);
  const replay = []; r.iscriviti('chat', value => replay.push(value));
  assert.equal(replay.filter(value => value.type === 'CUSTOM').length, 1);
});
