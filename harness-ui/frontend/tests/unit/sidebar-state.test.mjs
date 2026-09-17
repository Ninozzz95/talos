import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creaStatoSidebar, SIDEBAR_SCHEMA, statoSidebar, modelloRigaSidebar, durataSidebar, leggiPreferenzeSidebar, selezionaRigheSidebar } from '../../src/components/sidebar-state.js';
import { creaControllerSidebar, SIDEBAR_STALE_MS } from '../../src/components/sidebar-desktop.js';

const row = (id = 's1', extra = {}) => ({ sessionId: id, nome: id, conclusa: false, avviataAlle: '2026-09-17T12:00:00Z', ...extra });
const message = (kind, revision, items = [], extra = {}) => ({ schema: SIDEBAR_SCHEMA, epoch: 'server-1', kind, revision, items, removed: [], ...extra });
const turns = n => ({ risposte: n, chiamate: 0, fileModificati: 0 });
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function harness({ fetchList = async () => [] } = {}) {
  let time = 0, tick, clocks = 0, cleared = 0;
  const streams = [], changes = [], facts = [];
  const state = creaStatoSidebar();
  const controller = creaControllerSidebar({ state, fetchList,
    openStream() { const s = { readyState: 1, closes: 0, close() { this.closes++; } }; streams.push(s); return s; },
    onChange: change => changes.push(change), onFacts: values => facts.push(values), now: () => time, wallNow: () => time,
    onClock: () => clocks++, setIntervalFn(fn, ms) { assert.equal(ms, 1000); tick = fn; return 7; },
    clearIntervalFn(id) { assert.equal(id, 7); cleared++; },
  });
  return { state, controller, streams, changes, facts, receive: m => streams.at(-1).onmessage({ data: JSON.stringify(m) }),
    advance(ms) { time += ms; tick(); }, get clocks() { return clocks; }, get cleared() { return cleared; } };
}

for (const size of [0, 5, 50, 200, 1000]) test(`snapshot ${size}: updates retain every untouched row object`, () => {
  const state = creaStatoSidebar();
  const initial = Array.from({ length: size }, (_, i) => row(`s${i}`, { attivitaSidebar: turns(10) }));
  const first = state.apply(message('snapshot', 1, initial));
  assert.equal(first.accepted, true); assert.equal(state.rows.size, size); assert.equal(state.freshness, 'live');
  if (!size) return;
  const before = [...state.rows.values()];
  const result = state.apply(message('delta', 2, [row('s0', { attivitaSidebar: turns(11) })]));
  assert.deepEqual([...result.changed], ['s0']); assert.equal(state.unread('s0'), 1);
  for (let i = 1; i < size; i++) assert.equal(state.rows.get(`s${i}`), before[i]);
});
test('duplicate, gap and old-server events cannot overwrite current facts', () => {
  const s = creaStatoSidebar(); s.apply(message('snapshot', 2, [row()]));
  assert.equal(s.apply(message('delta', 2, [row('s1', { nome: 'old' })])).duplicate, true);
  assert.equal(s.apply(message('delta', 4, [])).invalid, true);
  assert.equal(s.apply(message('delta', 3, [], { epoch: 'old-server' })).invalid, true);
  assert.equal(s.apply(message('heartbeat', 3)).invalid, true);
  assert.equal(s.rows.get('s1').nome, 's1'); assert.equal(s.revision, 2);
  assert.equal(s.apply(message('heartbeat', 2)).heartbeat, true);
});
test('reconnect starts from an authoritative snapshot and handles process restart', () => {
  const s = creaStatoSidebar(); s.apply(message('snapshot', 20, [row()]));
  s.connection('riconnessione'); assert.equal(s.synced, false);
  assert.equal(s.apply(message('delta', 21, [])).invalid, true);
  const result = s.apply(message('snapshot', 0, [row('new')], { epoch: 'server-2' }));
  assert.equal(result.accepted, true); assert.deepEqual([...result.removed], ['s1']);
  assert.equal(s.epoch, 'server-2'); assert.equal(s.rows.size, 1); assert.equal(s.freshness, 'live');
});
test('REST racing with SSE is ignored; invalid input is never treated as an empty list', () => {
  const s = creaStatoSidebar(), generation = s.generation;
  assert.equal(s.applyRest(undefined, generation).invalid, true); assert.equal(s.loaded, false);
  s.apply(message('snapshot', 0, [row()]));
  assert.equal(s.applyRest([], generation).ignored, true); assert.equal(s.rows.size, 1);
  s.connection('stale'); const fresh = s.generation;
  assert.equal(s.applyRest([row('fallback')], fresh).accepted, true); assert.equal(s.freshness, 'stale');
  assert.equal(s.applyRest([], fresh).ignored, true); assert.equal(s.rows.size, 1);
});
test('malformed/duplicate IDs and conflicting deletes reject the whole message', () => {
  const s = creaStatoSidebar();
  for (const items of [null, {}, [null], [{}], [row('')], [row(), row()]]) assert.equal(s.apply(message('snapshot', 0, items)).invalid, true);
  s.apply(message('snapshot', 0, [row()]));
  assert.equal(s.apply(message('delta', 1, [row()], { removed: ['s1'] })).invalid, true);
  assert.equal(s.apply(message('delta', 1, [], { removed: [null] })).invalid, true);
  assert.equal(s.rows.size, 1);
});
test('reading baseline is seeded only from the first authoritative snapshot, not REST', () => {
  const s = creaStatoSidebar(); s.applyRest([row()], 0);
  s.apply(message('snapshot', 0, [row('s1', { attivitaSidebar: turns(20) })]));
  assert.equal(s.unread('s1'), 0);
  s.apply(message('delta', 1, [row('s1', { attivitaSidebar: turns(22) })])); assert.equal(s.unread('s1'), 2);
  assert.equal(s.markRead('s1'), true); assert.equal(s.markRead('s1'), false); assert.equal(s.unread('s1'), 0);
});
test('pin and read preferences are local, validated and survive reload', () => {
  const s = creaStatoSidebar(); s.apply(message('snapshot', 0, [row('s1', { attivitaSidebar: turns(1) })]));
  s.togglePin('s1'); const preferences = s.preferences();
  assert.equal(s.rows.get('s1').pinned, undefined);
  const next = creaStatoSidebar({ preferences }); next.apply(message('snapshot', 0, [row('s1', { attivitaSidebar: turns(2) })]));
  assert.equal(next.local.pinned.has('s1'), true); assert.equal(next.unread('s1'), 1);
  next.apply(message('delta', 1, [], { removed: ['s1'] }));
  assert.equal(next.local.pinned.size, 0); assert.equal(next.local.read.size, 0);
  assert.equal(leggiPreferenzeSidebar('{bad').filter, 'tutte');
  assert.equal(leggiPreferenzeSidebar({ read: [['x', -1], [null, 2], ['s', 3]], pinned: [null, 'x'], filter: 'bad' }).read.size, 1);
});
test('snapshot deletion cleans local metadata too', () => {
  const s = creaStatoSidebar(); s.apply(message('snapshot', 0, [row('s1', { attivitaSidebar: turns(1) })]));
  s.togglePin('s1'); s.connection('riconnessione'); s.apply(message('snapshot', 1, []));
  assert.equal(s.local.pinned.size, 0); assert.equal(s.local.read.size, 0);
});
test('search retains ancestor context, hides whole unmatched rows and preserves hierarchy', () => {
  const s = creaStatoSidebar(); s.apply(message('snapshot', 0, [row('parent'), row('child', { padreId: 'parent', nome: 'Auth module' }), row('other')]));
  const result = selezionaRigheSidebar(s, { query: 'AUTH' });
  assert.deepEqual(result.filter(r => !r.hidden).map(r => r.sessione.sessionId), ['parent', 'child']);
  assert.equal(result.find(r => r.sessione.sessionId === 'parent').context, true);
  assert.equal(result.find(r => r.sessione.sessionId === 'other').hidden, true);
  assert.deepEqual(selezionaRigheSidebar(s, { query: 'impossible' }).filter(r => !r.hidden), []);
});
test('pinning a child moves its tree, not an orphaned row; filters use real facts', () => {
  const s = creaStatoSidebar(); s.apply(message('snapshot', 0, [row('other'), row('parent', { conclusa: true }), row('child', { padreId: 'parent', conclusa: true })]));
  s.togglePin('child');
  assert.deepEqual(selezionaRigheSidebar(s).map(r => r.sessione.sessionId), ['parent', 'child', 'other']);
  assert.deepEqual(selezionaRigheSidebar(s, { filter: 'fissate' }).filter(r => !r.hidden).map(r => r.sessione.sessionId), ['parent', 'child']);
  assert.deepEqual(selezionaRigheSidebar(s, { filter: 'attive' }).filter(r => !r.hidden).map(r => r.sessione.sessionId), ['other']);
});
test('cycles and orphaned children are finite and no session disappears', () => {
  const s = creaStatoSidebar(); s.apply(message('snapshot', 0, [row('a', { padreId: 'b' }), row('b', { padreId: 'a' }), row('orphan', { padreId: 'missing' })]));
  const result = selezionaRigheSidebar(s, { query: 'a' });
  assert.equal(result.length, 3); assert.equal(new Set(result.map(r => r.sessione.sessionId)).size, 3);
});
test('partial or unsupported state is not silently reported as running/completed', () => {
  assert.equal(statoSidebar({}).key, 'sconosciuto');
  assert.equal(statoSidebar({ conclusa: 'false' }).active, false);
  assert.equal(statoSidebar({ conclusa: false, interrotta: true }).key, 'interrotto');
  assert.equal(statoSidebar({ conclusa: true }).key, 'ignoto');
  assert.equal(statoSidebar({ conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'fermata' }).key, 'fermata');
  assert.equal(statoSidebar({ conclusa: false, inAttesaApprovazione: true }).key, 'attesa');
  assert.equal(statoSidebar({ conclusa: false, attivitaSidebar: { fase: 'inventato' } }).label, 'in corso');
});
test('phase symbols and labels use observed activity, never claim requested tools are already executing', () => {
  const m = modelloRigaSidebar(row('s', { attivitaSidebar: { fase: 'strumento', strumento: 'shell', ...turns(0) } }));
  assert.equal(m.state.icon, 'i-code'); assert.equal(m.detail, 'Terminale');
  assert.match(m.tooltip, /Strumento richiesto/); assert.match(m.tooltip, /preparazione/);
  assert.doesNotMatch(m.tooltip, /0 giri|costo|retry/i);
});
test('durations are bounded by recorded timestamps; stopped/unknown and disconnected clocks do not fabricate time', () => {
  const now = Date.parse('2026-09-17T12:03:42Z');
  assert.equal(durataSidebar('2026-09-17T12:00:00Z', now), '3m 42s');
  assert.equal(durataSidebar('bad', now), null); assert.equal(durataSidebar('2026-09-18T12:00:00Z', now), null);
  assert.equal(modelloRigaSidebar(row('s', { conclusa: true, attivitaSidebar: { iniziataAlle: '2026-09-17T12:00:00Z' } }), { now }).elapsed, null);
  assert.equal(modelloRigaSidebar(row('s', { attivitaSidebar: { iniziataAlle: '2026-09-17T12:00:00Z' } }), { now, fresh: false }).elapsed, null);
  assert.equal(modelloRigaSidebar(row('s', { conclusa: true, attivitaSidebar: { iniziataAlle: '2026-09-17T12:00:00Z', terminataAlle: '2026-09-17T12:01:00Z' } }), { now }).elapsed, '1m 0s');
});
test('an actual direct command has its own clock, not the closed agent run clock', () => {
  const now = Date.parse('2026-09-17T12:03:42Z');
  const m = modelloRigaSidebar(row('s', { conclusa: true, attivitaSidebar: { comandiAttivi: 1, comandoAlle: '2026-09-17T12:03:00Z', iniziataAlle: '2026-09-17T12:00:00Z' } }), { now });
  assert.equal(m.state.key, 'comando'); assert.equal(m.elapsed, '42s');
});
test('controller owns one clock and stream, disconnect cleanup is idempotent', async () => {
  const h = harness(); await settle(); assert.equal(h.streams.length, 1);
  h.receive(message('snapshot', 0, [row()])); assert.equal(h.state.freshness, 'live');
  assert.equal(h.changes.at(-1).connection, true, 'snapshot repaints stale row labels even when values did not change');
  h.advance(1000); assert.equal(h.clocks, 1);
  h.controller.destroy(); h.controller.destroy(); assert.equal(h.cleared, 1); assert.equal(h.streams[0].closes, 1);
  h.advance(1000); assert.equal(h.clocks, 1);
});
test('late REST response cannot erase the newer stream snapshot', async () => {
  let resolve; const h = harness({ fetchList: () => new Promise(r => { resolve = r; }) }); await settle();
  h.receive(message('snapshot', 1, [row()])); resolve([]); await settle();
  assert.equal(h.state.rows.size, 1); assert.equal(h.state.freshness, 'live'); h.controller.destroy();
});
test('SSE open/health alone is not live; malformed/gapped events reconnect and reject old handlers', async () => {
  const h = harness(); await settle(); h.streams[0].onopen(); assert.notEqual(h.state.freshness, 'live');
  h.receive(message('snapshot', 0, [row()])); const oldHandler = h.streams[0].onmessage;
  h.receive(message('delta', 2, [])); assert.notEqual(h.state.freshness, 'live'); assert.equal(h.streams[0].closes, 1);
  await settle(); h.advance(2001); assert.equal(h.streams.length, 2);
  h.receive(message('snapshot', 0, [row('new')], { epoch: 'server-2' }));
  oldHandler({ data: JSON.stringify(message('snapshot', 999, [])) });
  assert.equal(h.state.rows.has('new'), true); h.controller.destroy();
});
test('heartbeat staleness and offline state never leave the list apparently live', async () => {
  const h = harness(); await settle(); h.receive(message('snapshot', 0, [row()]));
  h.advance(SIDEBAR_STALE_MS + 1); assert.notEqual(h.state.freshness, 'live'); assert.equal(h.streams[0].closes, 1);
  h.controller.online(false); assert.equal(h.state.freshness, 'offline');
  const n = h.streams.length; h.advance(60_000); assert.equal(h.streams.length, n);
  h.controller.online(true); assert.equal(h.streams.length, n + 1);
  h.receive(message('snapshot', 0, [row()], { epoch: 'restart' })); assert.equal(h.state.freshness, 'live'); h.controller.destroy();
});
test('fetch timeout aborts and releases the request; destruction ignores delayed callbacks', async () => {
  const calls = []; let resolve;
  const h = harness({ fetchList: signal => { calls.push(signal); return new Promise(r => { resolve = r; }); } });
  await settle(); h.advance(10001); assert.equal(calls[0].aborted, true);
  assert.equal(h.state.freshness, 'errore'); h.advance(5000); await settle(); assert.equal(calls.length, 2);
  h.controller.destroy(); assert.equal(calls[1].aborted, true); resolve([row()]); await settle(); assert.equal(h.state.rows.size, 0);
});
test('live current-session refresh reads in-memory state, not another GET', async () => {
  let requests = 0; const h = harness({ fetchList: async () => { requests++; return []; } }); await settle();
  h.receive(message('snapshot', 0, [row()]));
  await Promise.all(Array.from({ length: 100 }, () => h.controller.refresh()));
  assert.equal(requests, 1); assert.equal(h.state.rows.size, 1); h.controller.destroy();
});

test('resource invalidation travels through the same revision guard without changing rows', () => {
  const s = creaStatoSidebar(); s.apply(message('snapshot', 0, [row()])); const before = s.rows.get('s1');
  const change = s.apply(message('delta', 1, [], { resources: true }));
  assert.equal(change.resources, true); assert.equal(change.changed.size, 0); assert.equal(s.rows.get('s1'), before);
  assert.equal(s.apply(message('delta', 1, [], { resources: true })).duplicate, true);
});
