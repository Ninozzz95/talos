import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { creaFlussoSidebar, collegaFlussoSidebar, interessaSidebar, SIDEBAR_MAX_BUFFER } from '../src/sidebar-feed.mjs';
import { creaProiezioneAttivitaSidebar } from '../src/sidebar-activity.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { createHttpApp } from '../src/http-app.mjs';

const turn = () => new Promise(resolve => setImmediate(resolve));
function hub(size = 0) {
  const rows = new Map(Array.from({ length: size }, (_, n) => [String(n), { sessionId: String(n), conclusa: true }]));
  let reads = 0;
  const feed = creaFlussoSidebar({ ids: () => rows.keys(), leggi: id => { reads++; return rows.get(id); }, epoca: 'epoch-test' });
  return { rows, feed, get reads() { return reads; } };
}
for (const size of [0, 5, 50, 200, 1000]) test(`sidebar feed ${size}: snapshot and one changed id, not a full list`, async () => {
  const h = hub(size), frames = [];
  const stop = h.feed.subscribe(f => frames.push(f));
  assert.equal(frames[0].kind, 'snapshot'); assert.equal(frames[0].items.length, size);
  const before = h.reads;
  h.rows.set('changed', { sessionId: 'changed', conclusa: false });
  for (let i = 0; i < 300; i++) h.feed.changed('changed');
  await turn();
  assert.equal(frames.length, 2); assert.equal(frames[1].revision, 1);
  assert.equal(frames[1].items.length, 1); assert.equal(h.reads - before, 1);
  stop(); stop();
  assert.equal(h.feed.subscribers, 0);
  h.feed.changed('changed'); await turn(); assert.equal(frames.length, 2);
});

test('sidebar feed: late snapshot, removals, two windows and observer isolation', async () => {
  const h = hub(3), a = [], b = [];
  const stopA = h.feed.subscribe(f => a.push(f));
  h.rows.delete('1'); h.feed.changed('1');
  const stopB = h.feed.subscribe(f => b.push(f));
  assert.deepEqual(a.at(-1).removed, ['1']);
  assert.deepEqual(b[0].items.map(s => s.sessionId), ['0', '2']);
  assert.equal(a.at(-1).revision, b[0].revision);
  const stopBad = h.feed.subscribe(() => { throw new Error('a dead observer'); });
  h.rows.set('3', { sessionId: '3' }); h.feed.changed('3'); await turn();
  assert.equal(a.at(-1).revision, 2); assert.equal(b.at(-1).revision, 2);
  assert.equal(h.feed.subscribers, 2);
  stopBad(); stopA(); stopB();
});

test('sidebar relevance: tokens, raw outputs and watcher noise do not trigger refresh', () => {
  for (const type of ['TextMessageContent', 'ReasoningMessageContent', 'ToolCallArgs', 'ToolCallOutput', 'WorkspaceChanged']) assert.equal(interessaSidebar({ type }), false);
  for (const type of ['RunStarted', 'RunFinished', 'RunError', 'ReasoningMessageStart', 'TextMessageStart', 'ToolCallStart', 'ToolCallResult', 'ApprovalRequested', 'ApprovalResolved']) assert.equal(interessaSidebar({ type }), true);
  assert.equal(interessaSidebar({ type: 'StateDelta', delta: [{ path: '/file/src/a.js' }] }), true);
  assert.equal(interessaSidebar({ type: 'StateDelta', delta: [{ path: '/usage' }] }), true);
  for (const name of ['talos.coda', 'talos.context', 'consumo-fornitore']) assert.equal(interessaSidebar({ type: 'CUSTOM', name }), true);
  assert.equal(interessaSidebar(null), false);
});

function activityFixture() {
  const read = creaProiezioneAttivitaSidebar();
  const entry = { eventi: [], istantiEvento: new Map(), conclusa: false, codaMessaggi: [] };
  let seq = 0;
  const emit = (event, time = Date.UTC(2026, 8, 17, 12, 0, seq)) => {
    entry.eventi.push({ ...event, _sequenza: ++seq }); entry.istantiEvento.set(seq, time);
    return read(entry);
  };
  return { read, entry, emit };
}

test('sidebar activity: actual phases, approval, counts and no secret payload', () => {
  const { read, entry, emit } = activityFixture();
  assert.equal(emit({ type: 'RunStarted', input: 'private prompt' }).fase, 'avvio');
  assert.equal(emit({ type: 'ReasoningMessageStart', messageId: 'r' }).fase, 'ragionamento');
  emit({ type: 'ReasoningMessageContent', messageId: 'r', delta: 'private reasoning' });
  assert.equal(emit({ type: 'ToolCallStart', toolCallId: 't', toolCallName: 'shell' }).fase, 'strumento');
  emit({ type: 'ToolCallArgs', toolCallId: 't', delta: 'secret arguments' });
  const waiting = emit({ type: 'ApprovalRequested', requestId: 'p', azione: 'secret action' });
  assert.equal(waiting.fase, 'approvazione'); assert.equal(waiting.chiamate, 1);
  assert.equal(emit({ type: 'ApprovalResolved', requestId: 'p' }).fase, 'strumento');
  emit({ type: 'ToolCallResult', toolCallId: 't', content: 'secret output' });
  emit({ type: 'StateDelta', delta: [{ path: '/file/C:\\private\\src\\a.js', value: 'secret file' }] });
  emit({ type: 'StateDelta', delta: [{ path: '/file/C:\\private\\src\\a.js' }] });
  emit({ type: 'TextMessageStart', messageId: 'u', role: 'user' }); emit({ type: 'TextMessageEnd', messageId: 'u' });
  emit({ type: 'TextMessageStart', messageId: 'a', role: 'assistant' }); emit({ type: 'TextMessageEnd', messageId: 'a' });
  emit({ type: 'RunFinished' }); entry.conclusa = true;
  const done = read(entry);
  assert.equal(done.fase, null); assert.equal(done.strumentiAttivi, 0); assert.equal(done.risposte, 1);
  assert.equal(done.fileModificati, 1); assert.equal(done.errori, 0); assert.ok(done.terminataAlle);
  assert.doesNotMatch(JSON.stringify(done), /secret|private|reasoning|C:\\/u);
});

test('sidebar activity: duplicate sequence, queue, stops and restored timestamps', () => {
  const { read, entry, emit } = activityFixture();
  emit({ type: 'RunStarted' }); emit({ type: 'ToolCallStart', toolCallId: 't', toolCallName: 'shell' });
  entry.eventi.push(entry.eventi.at(-1));
  assert.equal(read(entry).chiamate, 1);
  emit({ type: 'RunError', code: 'fermato' }); entry.conclusa = true;
  assert.equal(read(entry).errori, 0);
  entry.codaMessaggi = [{ testo: 'never exposed' }]; entry.codaInPausa = true;
  assert.equal(read(entry).coda, 1); assert.equal(read(entry).codaInPausa, true);
  const restored = { ...entry, istantiEvento: undefined, conclusa: false, interrotta: true };
  const a = read(restored);
  assert.equal(a.fase, null); assert.equal(a.ultimoEventoAlle, null); assert.equal(a.iniziataAlle, null);
  assert.equal(a.strumentiAttivi, 0); assert.equal(a.chiamate, 1);
});

function fakeResponse() {
  const r = new EventEmitter(); r.frames = []; r.writableLength = 0;
  r.socket = { setNoDelay(v) { r.noDelay = v; } };
  r.writeHead = (status, headers) => { r.status = status; r.headers = headers; };
  r.write = s => { r.frames.push(s); return true; };
  r.end = () => { r.writableEnded = true; };
  r.destroy = () => { r.destroyed = true; r.emit('close'); };
  return r;
}

test('sidebar SSE: heartbeat, HEAD, cleanup, bounded buffer and no event history ids', () => {
  const h = hub(1), response = fakeResponse(); let tick, cancelled = 0;
  const stop = collegaFlussoSidebar({ response, subscribe: h.feed.subscribe, heartbeat: h.feed.heartbeat,
    setIntervalFn: fn => { tick = fn; return 42; }, clearIntervalFn: id => { assert.equal(id, 42); cancelled++; } });
  assert.equal(response.status, 200); assert.equal(response.noDelay, true);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  tick(); assert.match(response.frames.at(-1), /"kind":"heartbeat"/u);
  assert.doesNotMatch(response.frames.join(''), /\nid:/u);
  response.writableLength = SIDEBAR_MAX_BUFFER + 1; tick(); stop();
  assert.equal(response.destroyed, true); assert.equal(cancelled, 1); assert.equal(h.feed.subscribers, 0);
  const head = fakeResponse();
  collegaFlussoSidebar({ response: head, head: true, subscribe: () => assert.fail('HEAD must not subscribe') });
  assert.equal(head.writableEnded, true); assert.equal(head.frames.length, 0);
});

function registryFixture() {
  const callbacks = new Map(), finish = new Map(); let n = 0, watchers = 0;
  const registry = createSessionRegistry({
    modello: 'test-model', chiave: 'NEVER-EXPOSE-KEY', cartellaStore: null,
    preparaEsecuzioneFn: taskId => ({ cartella: '/private/project', task: { id: taskId, consegna: 'private prompt' } }),
    randomUUIDFn: () => `sidebar-session-${++n}`,
    guardaWorkspaceFn: () => { watchers++; return () => {}; },
    avviaSessioneFn: async input => {
      callbacks.set(input.task.id, input.onEvento);
      input.onEvento({ type: 'RunStarted', threadId: input.task.id, runId: `run-${n}` });
      return new Promise(resolve => finish.set(input.task.id, resolve));
    },
  });
  return { registry, callbacks, finish, get watchers() { return watchers; } };
}

test('sidebar registry: creation, live phases, cumulative usage, rename, delete and subscriber cleanup', async () => {
  const f = registryFixture(), frames = [];
  const stop = f.registry.iscrivitiSidebar(x => frames.push(x));
  const a = f.registry.avvia('task-a');
  await turn();
  assert.ok(a.sessionId); assert.equal(frames.at(-1).items[0].sessionId, a.sessionId);
  const emit = f.callbacks.get('task-a');
  emit({ type: 'ReasoningMessageStart', messageId: 'r' }); await turn();
  assert.equal(frames.at(-1).items[0].attivitaSidebar.fase, 'ragionamento');
  const prior = frames.length;
  for (let i = 0; i < 500; i++) emit({ type: 'ReasoningMessageContent', messageId: 'r', delta: 'x' });
  await turn(); assert.equal(frames.length, prior);
  emit({ type: 'StateDelta', delta: [{ path: '/usage', value: { giri: 2, prompt_tokens: 10, completion_tokens: 5 } }] });
  emit({ type: 'CUSTOM', name: 'consumo-fornitore', value: { esito: 'fermato' } });
  await turn(); assert.equal(frames.at(-1).items[0].usageSessione.giri, 2); assert.equal(frames.at(-1).items[0].giriFermati, 1);
  emit({ type: 'RunError', code: 'fermato', message: 'Stopped' }); f.finish.get('task-a')({ ok: true }); await turn();
  const terminal = frames.at(-1).items[0];
  assert.equal(terminal.conclusa, true); assert.equal(terminal.motivoChiusura, 'fermata');
  assert.doesNotMatch(JSON.stringify(terminal), /NEVER-EXPOSE-KEY|private\/project|private prompt/u);
  await f.registry.rinomina(a.sessionId, 'Renamed'); await turn(); assert.equal(frames.at(-1).items[0].nome, 'Renamed');
  const watchers = f.watchers;
  const again = []; const stop2 = f.registry.iscrivitiSidebar(x => again.push(x));
  assert.equal(f.watchers, watchers, 'aggregate subscriptions do not activate filesystem watchers');
  await f.registry.elimina(a.sessionId); await turn(); assert.deepEqual(frames.at(-1).removed, [a.sessionId]);
  stop(); stop2();
});

test('sidebar HTTP: real stream snapshot/delta, HEAD, method/query guards and disconnect', async t => {
  const h = hub(1);
  const app = createHttpApp({ sessionRegistry: { iscrivitiSidebar: h.feed.subscribe, battitoSidebar: h.feed.heartbeat } });
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/v1/sidebar/events`;
  assert.equal((await fetch(url, { method: 'HEAD' })).status, 200);
  assert.equal(h.feed.subscribers, 0);
  assert.equal((await fetch(url + '?extra=1')).status, 400);
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  const abort = new AbortController();
  const res = await fetch(url, { signal: abort.signal });
  assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /text\/event-stream/u);
  const reader = res.body.getReader(); let text = '';
  while (!text.includes('"kind":"snapshot"')) text += new TextDecoder().decode((await reader.read()).value);
  h.rows.delete('0'); h.feed.changed('0');
  while (!text.includes('"kind":"delta"')) text += new TextDecoder().decode((await reader.read()).value);
  assert.match(text, /"removed":\["0"\]/u);
  abort.abort();
  for (let i = 0; i < 20 && h.feed.subscribers; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(h.feed.subscribers, 0);
});

test('sidebar resource invalidation is one bounded delta, also with no sessions', async () => {
  const h = hub(), a = [], b = [];
  const stopA = h.feed.subscribe(value => a.push(value)), stopB = h.feed.subscribe(value => b.push(value));
  for (let i = 0; i < 200; i++) h.feed.resourcesChanged();
  await turn();
  assert.equal(a.length, 2); assert.equal(b.length, 2);
  assert.equal(a[1].resources, true); assert.equal(a[1].revision, 1);
  assert.deepEqual(a[1].items, []); assert.equal(h.reads, 0);
  stopA(); stopB(); h.feed.resourcesChanged(); await turn();
  assert.equal(a.length, 2);
});

test('sidebar HTTP resources: confirmed writes notify both windows, reads and rejected writes do not', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'talos-sidebar-resource-'));
  const h = hub(), a = [], b = [];
  const stopA = h.feed.subscribe(frame => a.push(frame)), stopB = h.feed.subscribe(frame => b.push(frame));
  const app = createHttpApp({ cartellaNote: directory, sessionRegistry: {
    esiste: id => id === 'resource-session', notificaRisorseSidebar: h.feed.resourcesChanged,
    iscrivitiSidebar: h.feed.subscribe, battitoSidebar: h.feed.heartbeat,
  } });
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { stopA(); stopB(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/api/v1/sessions/resource-session/notes`;
  const create = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titolo: 'Nota', contenuto: 'Contenuto privato' }) });
  assert.equal(create.status, 201); const payload = await create.json();
  await turn(); assert.equal(a.length, 2); assert.equal(b.length, 2); assert.equal(a[1].resources, true);
  assert.deepEqual(a[1].items, []); assert.doesNotMatch(JSON.stringify(a[1]), /Contenuto privato/);
  const id = payload.data.nota.id;
  assert.equal((await fetch(`${url}/${id}`)).status, 200);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
  await turn(); assert.equal(a.length, 2);
  assert.equal((await fetch(`${url}/${id}`, { method: 'DELETE' })).status, 200);
  await turn(); assert.equal(a.length, 3); assert.equal(b.length, 3);
});
