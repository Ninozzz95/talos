/*
 * Workflow block 1, third review cures of 06/11/2026 (decision 234, REVISIONE-API-WF-BLOCCO1-CURE-2-2026-11-06.md).
 * Each test was RED on commit 303eac8a4:
 *   - LOW 1: an index that exists but cannot be read (a directory at its path; EPERM/EBUSY on Windows) was read as «missing»:
 *     record() published again, found the path taken and answered 'already', while lookup() answered null forever;
 *   - note 2: a broken index with an mtime in the future was never old enough to be repaired;
 *   - note 3: a program error message had no cap (15 MB reached the result);
 *   - note 4: journal diagnostics carry absolute paths: each one now has a path-free safeMessage for the model;
 *   - note 6: caps.maxValueDepth accepted up to 10000, but values deeper than MAX_STABLE_DEPTH (256) never record.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { eseguiProgramma } from '../src/workflow/esegui-programma.mjs';
import { chiaveDellaChiamata, createKeyedJournal } from '../src/workflow/giornale-chiave.mjs';
import { MAX_STABLE_DEPTH } from '../src/workflow/json-stabile.mjs';
import { LIMITI_RECINTO, eseguiNelRecinto } from '../src/workflow/recinto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const WF = '5e2b9c0a-1d4f-4a7e-9b3c-8f6d2e1a0c47';
function rootFor(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-wf-cure3-'));
  t.after(() => rimuoviCartellaDiProva(root));
  return root;
}
const indexPathOf = (root, key) => {
  const hex = key.slice(7);
  return join(root, 'replay', WF, hex.slice(0, 2), `${hex}.json`);
};
const META = "export const meta = { name: 'probe', description: 'sandbox probe', maxAgents: 5 }\n";
const CAPS = { maxUsd: 1, estimateUsd: 0.01, maxWallMs: 20_000 };
const noAgent = async () => ({ value: null, costUsd: 0 });

// ---- LOW 1: only ENOENT is «missing» ---------------------------------------------------------------------------------------

test('LOW 1: a directory at the index path makes record() refuse with a typed error, never already; lookup misses and nothing is removed', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const key = chiaveDellaChiamata('hello', {}, 0);
  const path = indexPathOf(root, key);
  mkdirSync(path, { recursive: true });
  const old = new Date(Date.now() - 3_600_000);
  utimesSync(path, old, old);
  await assert.rejects(journal.record(key, { value: 1, runId: 'r1' }), (error) => error.code === 'WORKFLOW_REPLAY_INDEX_UNREADABLE');
  assert.equal(await journal.lookup(key), null);
  assert.ok(statSync(path).isDirectory(), 'an index that cannot be read is never removed: it may be valid behind a lock');
  assert.ok(journal.diagnostics.some((d) => d.code === 'WORKFLOW_REPLAY_INDEX_UNREADABLE'), JSON.stringify(journal.diagnostics));
  assert.ok(!journal.diagnostics.some((d) => d.code === 'WORKFLOW_REPLAY_REPAIRED'));
});

test('LOW 1: through the runner, an unreadable index is a counted record failure and the call stays live', async (t) => {
  const root = rootFor(t);
  const key = chiaveDellaChiamata('p', undefined, 0);
  mkdirSync(indexPathOf(root, key), { recursive: true });
  const calls = [];
  const host = { agent: async (prompt) => { calls.push(prompt); return { value: `R(${prompt})`, costUsd: 0 }; } };
  const src = "export const meta = { name: 'r', description: 'd', maxAgents: 1 }\nreturn await agent('p')";
  const out = await eseguiProgramma({ source: src, workflowDataRoot: root, workflowId: WF, runId: 'a', host, caps: { maxUsd: 1, estimateUsd: 0.01 } });
  assert.equal(out.outcome, 'ok', JSON.stringify(out.error));
  assert.equal(out.value, 'R(p)');
  assert.equal(out.usage.journal.recordFailures, 1);
  assert.ok(out.diagnostics.some((d) => d.code === 'WORKFLOW_REPLAY_INDEX_UNREADABLE' && d.key === key), JSON.stringify(out.diagnostics));
  assert.deepEqual(calls, ['p']);
});

// 19/11/2026 (0.2.4 block 4, item 3): an obstacle TALOS never writes (a folder at the index path) is refused, never removed
// (Hermes hermes_state.py:278-281), and it is ONE diagnostic per run: measured before, 3 per run (lookup, record, runner).
test('item 3: a folder at the index path is one diagnostic per run, in every run; the folder stays and the answers are right', async (t) => {
  const root = rootFor(t);
  const key = chiaveDellaChiamata('p0', undefined, 0);
  mkdirSync(join(indexPathOf(root, key), 'inside'), { recursive: true });
  const src = "export const meta = { name: 'r', description: 'd', maxAgents: 4 }\nreturn [await agent('p0'), await agent('p1'), await agent('p2')]";
  for (const runId of ['a', 'b']) {
    const host = { agent: async (prompt) => ({ value: `R(${prompt})`, costUsd: 0 }) };
    const out = await eseguiProgramma({ source: src, workflowDataRoot: root, workflowId: WF, runId, host, caps: { maxUsd: 1, estimateUsd: 0.01 } });
    assert.equal(out.outcome, 'ok', JSON.stringify(out.error));
    assert.deepEqual(out.value, ['R(p0)', 'R(p1)', 'R(p2)']);
    assert.equal(out.usage.journal.recordFailures, 1);
    assert.deepEqual(out.diagnostics.map((d) => [d.code, d.key]), [['WORKFLOW_REPLAY_INDEX_UNREADABLE', key]], JSON.stringify(out.diagnostics));
  }
  assert.ok(statSync(join(indexPathOf(root, key), 'inside')).isDirectory(), 'the obstacle is never removed');
});

// Item 3, review of its mutants: the dedupe is per key. Two obstacles are two diagnostics, and two keys with the same damage
// (the same message, no path in it) are two diagnostics too.
test('item 3: two obstacles in one run are two diagnostics, one for each key; the same damage under two keys is two diagnostics', async (t) => {
  const root = rootFor(t);
  const k0 = chiaveDellaChiamata('p0', undefined, 0);
  const k1 = chiaveDellaChiamata('p1', undefined, 0);
  for (const key of [k0, k1]) mkdirSync(join(indexPathOf(root, key), 'inside'), { recursive: true });
  const src = "export const meta = { name: 'r', description: 'd', maxAgents: 4 }\nreturn [await agent('p0'), await agent('p1')]";
  const host = { agent: async (prompt) => ({ value: `R(${prompt})`, costUsd: 0 }) };
  const out = await eseguiProgramma({ source: src, workflowDataRoot: root, workflowId: WF, runId: 'a', host, caps: { maxUsd: 1, estimateUsd: 0.01 } });
  assert.deepEqual(out.value, ['R(p0)', 'R(p1)']);
  assert.equal(out.usage.journal.recordFailures, 2);
  assert.deepEqual(out.diagnostics.map((d) => [d.code, d.key]), [['WORKFLOW_REPLAY_INDEX_UNREADABLE', k0], ['WORKFLOW_REPLAY_INDEX_UNREADABLE', k1]], JSON.stringify(out.diagnostics));
  const other = mkdtempSync(join(tmpdir(), 'talos-wf-cure3-'));
  t.after(() => rimuoviCartellaDiProva(other));
  const journal = createKeyedJournal({ workflowDataRoot: other, workflowId: WF });
  for (const key of [k0, k1]) { mkdirSync(join(indexPathOf(other, key), '..'), { recursive: true }); writeFileSync(indexPathOf(other, key), '{"sch'); }
  assert.equal(await journal.lookup(k0), null);
  assert.equal(await journal.lookup(k1), null);
  assert.deepEqual(journal.diagnostics.map((d) => [d.code, d.key]), [['WORKFLOW_REPLAY_INDEX_INVALID', k0], ['WORKFLOW_REPLAY_INDEX_INVALID', k1]], JSON.stringify(journal.diagnostics));
});

test('LOW 1: an index that does not exist is still a plain miss with no diagnostic', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const key = chiaveDellaChiamata('nothing', {}, 0);
  assert.equal(await journal.lookup(key), null);
  assert.deepEqual(journal.diagnostics, []);
  assert.equal(await journal.record(key, { value: 2 }), 'recorded');
  assert.deepEqual(await journal.lookup(key), { value: 2, costUsd: 0 });
});

// ---- note 2: a future mtime is old ------------------------------------------------------------------------------------------

test('note 2: a broken index with an mtime in the future is repaired and recorded again', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const key = chiaveDellaChiamata('future', {}, 0);
  const path = indexPathOf(root, key);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, '{"broken');
  const future = new Date(Date.now() + 3_600_000);
  utimesSync(path, future, future);
  assert.equal(await journal.record(key, { value: 7, runId: 'r1' }), 'recorded');
  assert.deepEqual(await journal.lookup(key), { value: 7, costUsd: 0 });
  assert.ok(journal.diagnostics.some((d) => d.code === 'WORKFLOW_REPLAY_REPAIRED'));
});

test('note 2: a broken index written a moment ago is still left alone', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const key = chiaveDellaChiamata('young', {}, 0);
  const path = indexPathOf(root, key);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, '{"broken');
  await assert.rejects(journal.record(key, { value: 1 }), (error) => error.code === 'WORKFLOW_REPLAY_INDEX_INVALID');
  assert.ok(existsSync(path));
});

// ---- note 4: a path-free form of every diagnostic ---------------------------------------------------------------------------

test('note 4: every journal diagnostic keeps its message for the log and has a path-free safeMessage for the model', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const broken = chiaveDellaChiamata('broken', {}, 0);
  const path = indexPathOf(root, broken);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, '{"broken');
  const old = new Date(Date.now() - 3_600_000);
  utimesSync(path, old, old);
  assert.equal(await journal.lookup(broken), null);
  const dir = chiaveDellaChiamata('dir', {}, 0);
  mkdirSync(indexPathOf(root, dir), { recursive: true });
  assert.equal(await journal.lookup(dir), null);
  const codes = journal.diagnostics.map((d) => d.code);
  assert.deepEqual(codes, ['WORKFLOW_REPLAY_INDEX_INVALID', 'WORKFLOW_REPLAY_REPAIRED', 'WORKFLOW_REPLAY_INDEX_UNREADABLE']);
  const repaired = journal.diagnostics.find((d) => d.code === 'WORKFLOW_REPLAY_REPAIRED');
  assert.ok(repaired.message.includes(root), 'the log keeps the path');
  const tail = root.split(/[\\/]/u).pop();
  for (const d of journal.diagnostics) {
    assert.equal(typeof d.safeMessage, 'string', JSON.stringify(d));
    assert.ok(d.safeMessage.length > 0 && d.safeMessage.length <= 200);
    assert.ok(!d.safeMessage.includes(tail) && !/[\\/]/u.test(d.safeMessage), `a path in ${d.safeMessage}`);
  }
});

test('note 4: the runner result gives a safeMessage on every diagnostic, record failures included', async (t) => {
  const root = rootFor(t);
  const src = "export const meta = { name: 'r', description: 'd', maxAgents: 1 }\nreturn await agent('big')";
  const host = { agent: async () => ({ value: 'x'.repeat(200), costUsd: 0 }) };
  const out = await eseguiProgramma({ source: src, workflowDataRoot: root, workflowId: WF, runId: 'a', host, caps: { maxUsd: 1, estimateUsd: 0.01 }, maxResultBytes: 64 });
  assert.equal(out.usage.journal.recordFailures, 1);
  assert.ok(out.diagnostics.length >= 1);
  for (const d of out.diagnostics) {
    assert.equal(typeof d.safeMessage, 'string', JSON.stringify(d));
    assert.ok(!/[\\/]/u.test(d.safeMessage), d.safeMessage);
  }
});

// ---- note 3: the program error message is capped ---------------------------------------------------------------------------

const MARK = /… \[truncated: \d+ of \d+ bytes omitted\]$/u;

test('note 3: a 3 MB program error message is cut to the cap in UTF-8 bytes, with a clear truncation mark', async () => {
  const out = await eseguiNelRecinto({ source: `${META}throw new Error('x'.repeat(3e6))`, agent: noAgent, caps: CAPS });
  assert.equal(out.outcome, 'error');
  assert.equal(out.error.code, 'WORKFLOW_PROGRAM_FAILED');
  assert.ok(Buffer.byteLength(out.error.message) <= LIMITI_RECINTO.maxErrorBytes + 64, `${Buffer.byteLength(out.error.message)} bytes`);
  assert.match(out.error.message, /^Error: x{100}/u);
  assert.match(out.error.message, MARK);
  const omitted = Number(/truncated: (\d+) of (\d+)/u.exec(out.error.message)[1]);
  const total = Number(/truncated: (\d+) of (\d+)/u.exec(out.error.message)[2]);
  assert.equal(total, 3e6 + 'Error: '.length);
  assert.equal(total - omitted, Buffer.byteLength(out.error.message.replace(MARK, '')));
});

test('note 3: a multibyte message is never cut inside a character, and a short message is untouched', async () => {
  const wide = await eseguiNelRecinto({ source: `${META}throw new Error('é\u{1F600}'.repeat(5000))`, agent: noAgent, caps: CAPS });
  assert.match(wide.error.message, MARK);
  assert.ok(!wide.error.message.includes('�'));
  assert.match(wide.error.message, new RegExp(`of ${'Error: '.length + 5000 * (2 + 4)} bytes omitted`, 'u'), 'the total is counted in UTF-8 bytes');
  assert.ok(Buffer.byteLength(wide.error.message.replace(MARK, '')) <= LIMITI_RECINTO.maxErrorBytes);
  assert.ok(Buffer.byteLength(wide.error.message.replace(MARK, '')) > LIMITI_RECINTO.maxErrorBytes - 4);
  const short = await eseguiNelRecinto({ source: `${META}throw new Error('plain')`, agent: noAgent, caps: CAPS });
  assert.equal(short.error.message, 'Error: plain');
  const exact = await eseguiNelRecinto({ source: `${META}throw new Error('y'.repeat(${LIMITI_RECINTO.maxErrorBytes - 'Error: '.length}))`, agent: noAgent, caps: CAPS });
  assert.equal(Buffer.byteLength(exact.error.message), LIMITI_RECINTO.maxErrorBytes);
  assert.doesNotMatch(exact.error.message, MARK);
  const over = await eseguiNelRecinto({ source: `${META}throw new Error('y'.repeat(${LIMITI_RECINTO.maxErrorBytes - 'Error: '.length + 1}))`, agent: noAgent, caps: CAPS });
  assert.match(over.error.message, /truncated: 1 of \d+ bytes omitted/u);
});

test('note 3: a huge thrown non-Error value and a huge error name are capped too', async () => {
  const value = await eseguiNelRecinto({ source: `${META}throw 'z'.repeat(1e6)`, agent: noAgent, caps: CAPS });
  assert.match(value.error.message, MARK);
  assert.ok(Buffer.byteLength(value.error.message) <= LIMITI_RECINTO.maxErrorBytes + 64);
  const named = await eseguiNelRecinto({ source: `${META}const e = new Error('m'); e.name = 'N'.repeat(1e6); throw e`, agent: noAgent, caps: CAPS });
  assert.match(named.error.message, MARK);
  assert.ok(Buffer.byteLength(named.error.message) <= LIMITI_RECINTO.maxErrorBytes + 64);
});

// ---- note 6: maxValueDepth says the truth -----------------------------------------------------------------------------------

test('note 6: caps.maxValueDepth accepts 1..MAX_STABLE_DEPTH and refuses anything above with a typed error', async () => {
  assert.equal(MAX_STABLE_DEPTH, 256);
  for (const bad of [MAX_STABLE_DEPTH + 1, 10_000, 0, -2, 1.5, '8']) {
    await assert.rejects(
      eseguiNelRecinto({ source: `${META}return 1`, agent: noAgent, caps: { ...CAPS, maxValueDepth: bad } }),
      (error) => error.code === 'WORKFLOW_PROGRAM_INVALID_CAPS' && error.message === `caps.maxValueDepth must be -1 (no cap, tests only) or an integer from 1 to ${MAX_STABLE_DEPTH}`,
    );
  }
  for (const good of [1, MAX_STABLE_DEPTH]) {
    const out = await eseguiNelRecinto({ source: `${META}return 1`, agent: noAgent, caps: { ...CAPS, maxValueDepth: good } });
    assert.equal(out.outcome, 'ok', JSON.stringify(out.error));
  }
});

// 0.2.4 block 4, round 2, item E2 (review of the mutants): the runner skips only a refusal the journal already wrote with the SAME
// code for that key; a refusal of another code (here the size cap after a damaged index) is still written.
test('item 3, round 2: a record refusal of a different code than the journal diagnosis for that key is still written', async (t) => {
  const root = rootFor(t);
  const key = chiaveDellaChiamata('p0', undefined, 0);
  mkdirSync(join(indexPathOf(root, key), '..'), { recursive: true });
  writeFileSync(indexPathOf(root, key), '{"young');
  const src = "export const meta = { name: 'r', description: 'd', maxAgents: 2 }\nreturn await agent('p0')";
  const host = { agent: async () => ({ value: 'x'.repeat(200), costUsd: 0 }) };
  const out = await eseguiProgramma({ source: src, workflowDataRoot: root, workflowId: WF, runId: 'a', host, caps: { maxUsd: 1, estimateUsd: 0.01 }, maxResultBytes: 64 });
  assert.equal(out.outcome, 'ok', JSON.stringify(out.error));
  assert.equal(out.usage.journal.recordFailures, 1);
  assert.deepEqual(out.diagnostics.map((d) => [d.code, d.key]), [['WORKFLOW_REPLAY_INDEX_INVALID', key], ['WORKFLOW_LIMIT_EXCEEDED', key]], JSON.stringify(out.diagnostics));
});
