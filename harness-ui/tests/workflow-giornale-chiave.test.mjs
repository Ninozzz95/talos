/*
 * Keyed journal of a Workflow program (decision 234, block 1): key = sha256 of the canonical JSON of [prompt, options without
 * label/phase, repetition index]; values in the existing CAS (result-store.mjs), index under <root>/replay/<workflowId>/,
 * published exclusively (first writer wins), value before index. Survives a new journal object (= a restart).
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalHash } from '../src/workflow/canonical-json.mjs';
import { REPAIR_AFTER_MS, chiaveDellaChiamata, createKeyedJournal } from '../src/workflow/giornale-chiave.mjs';
import { MAX_STABLE_DEPTH, jsonStabile } from '../src/workflow/json-stabile.mjs';
import { putResultBytes } from '../src/workflow/result-store.mjs';
import { createWorkflowStore } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function rootFor(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-giornale-chiave-'));
  t.after(() => rimuoviCartellaDiProva(root));
  return root;
}
const WF = '7b0f4a52-3f7e-4d55-9a71-2a1c5f0e8b11';

test('the key is canonicalHash([prompt, options without label/phase, rep]): every field counts, label and phase do not', () => {
  const base = chiaveDellaChiamata('find bugs', { schema: { type: 'string' }, model: 'small' }, 0);
  assert.equal(base, canonicalHash(['find bugs', { model: 'small', schema: { type: 'string' } }, 0]));
  assert.match(base, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(chiaveDellaChiamata('find bugs', { model: 'small', schema: { type: 'string' }, label: 'x', phase: 'Find' }, 0), base, 'label/phase/key order do not matter');
  assert.notEqual(chiaveDellaChiamata('find bugs!', { schema: { type: 'string' }, model: 'small' }, 0), base, 'prompt counts');
  assert.notEqual(chiaveDellaChiamata('find bugs', { schema: { type: 'string' }, model: 'large' }, 0), base, 'options count');
  assert.notEqual(chiaveDellaChiamata('find bugs', { schema: { type: 'string' }, model: 'small' }, 1), base, 'repetition counts');
  assert.equal(chiaveDellaChiamata('p', undefined, 0), chiaveDellaChiamata('p', {}, 0));
});

test('beginRun numbers repetitions of the same (prompt, options) pair, independently of other calls and of label', () => {
  const journal = createKeyedJournal({ workflowDataRoot: join(tmpdir(), 'unused-root'), workflowId: WF });
  const run = journal.beginRun('run-1');
  const k0 = run.nextKey('same', { label: 'a' });
  run.nextKey('other', {});
  const k1 = run.nextKey('same', { label: 'b' });
  assert.equal(k0, chiaveDellaChiamata('same', {}, 0));
  assert.equal(k1, chiaveDellaChiamata('same', {}, 1));
  assert.equal(journal.beginRun('run-2').nextKey('same', {}), k0, 'a new run starts again from 0');
});

test('record then lookup from a NEW journal object (restart) returns the value; the index lives under replay/<workflowId>/', async (t) => {
  const root = rootFor(t);
  const key = chiaveDellaChiamata('p', {}, 0);
  const first = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  assert.equal(await first.lookup(key), null);
  assert.equal(await first.record(key, { value: { ok: [1, 'two'] }, costUsd: 0.25, runId: 'run-1' }), 'recorded');
  const hex = key.slice('sha256:'.length);
  const indexPath = join(root, 'replay', WF, hex.slice(0, 2), `${hex}.json`);
  assert.ok(existsSync(indexPath));
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  assert.equal(index.schema, 'talos.workflow-replay.v1');
  assert.equal(index.key, key);
  const again = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const hit = await again.lookup(key);
  assert.deepEqual(hit.value, { ok: [1, 'two'] });
  assert.equal(hit.costUsd, 0.25);
  assert.equal(await createKeyedJournal({ workflowDataRoot: root, workflowId: 'other-workflow' }).lookup(key), null, 'scoped to the workflow');
});

test('two writers of the same key: the first wins, the second is told, nothing is overwritten', async (t) => {
  const root = rootFor(t);
  const key = chiaveDellaChiamata('p', {}, 0);
  const a = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const b = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const results = await Promise.all([a.record(key, { value: 'A', runId: 'r1' }), b.record(key, { value: 'B', runId: 'r2' })]);
  assert.deepEqual(results.sort(), ['already', 'recorded']);
  const hit = await a.lookup(key);
  assert.ok(hit.value === 'A' || hit.value === 'B');
  assert.equal(await a.record(key, { value: 'C', runId: 'r3' }), 'already');
  assert.equal((await b.lookup(key)).value, hit.value);
});

test('a crash between value and index leaves a miss, never an index without a value; a later record works', async (t) => {
  const root = rootFor(t);
  const key = chiaveDellaChiamata('p', {}, 0);
  await putResultBytes({ workflowDataRoot: root, bytes: Buffer.from('"orphan"'), maxBytes: 1024 });
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  assert.equal(await journal.lookup(key), null);
  assert.equal(await journal.record(key, { value: 'orphan', runId: 'r' }), 'recorded');
  assert.equal((await journal.lookup(key)).value, 'orphan');
});

test('a damaged value or an index for another key is a miss with a diagnostic, never a wrong answer', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const key = chiaveDellaChiamata('p', {}, 0);
  await journal.record(key, { value: 'good', runId: 'r' });
  const hex = key.slice(7);
  const index = JSON.parse(readFileSync(join(root, 'replay', WF, hex.slice(0, 2), `${hex}.json`), 'utf8'));
  const casHex = index.resultSha256.slice(7);
  writeFileSync(join(root, 'cas', 'sha256', casHex.slice(0, 2), casHex), '"evil"');
  assert.equal(await journal.lookup(key), null);
  assert.ok(journal.diagnostics.some((d) => d.code === 'WORKFLOW_RESULT_CORRUPT'), JSON.stringify(journal.diagnostics));

  const other = chiaveDellaChiamata('q', {}, 0);
  const ohex = other.slice(7);
  const { mkdirSync } = await import('node:fs');
  mkdirSync(join(root, 'replay', WF, ohex.slice(0, 2)), { recursive: true });
  writeFileSync(join(root, 'replay', WF, ohex.slice(0, 2), `${ohex}.json`), JSON.stringify({ ...index, key }));
  assert.equal(await journal.lookup(other), null);
  assert.ok(journal.diagnostics.some((d) => d.code === 'WORKFLOW_REPLAY_INDEX_INVALID'));
});

test('a value that cannot be JSON or exceeds the byte cap is not recorded', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF, maxResultBytes: 64 });
  const key = chiaveDellaChiamata('p', {}, 0);
  await assert.rejects(journal.record(key, { value: 'x'.repeat(100), runId: 'r' }), (e) => e.code === 'WORKFLOW_LIMIT_EXCEEDED');
  await assert.rejects(journal.record(key, { value: 1n, runId: 'r' }), (e) => e.code === 'WORKFLOW_STABLE_JSON_INVALID');
  assert.equal(await journal.lookup(key), null);
});

test('workflowId and key are validated: no path escape', async () => {
  for (const bad of ['../x', 'a/b', '', '.', '..', 'x'.repeat(200), 'W1', 'con', 'NUL', 'com1.txt', 'lpt9', 'abc.']) {
    assert.throws(() => createKeyedJournal({ workflowDataRoot: tmpdir(), workflowId: bad }), (e) => e.code === 'WORKFLOW_REPLAY_INVALID', bad);
  }
  for (const good of ['w1', 'console', 'com', 'a.b-c_d', 'x'.repeat(128)]) assert.doesNotThrow(() => createKeyedJournal({ workflowDataRoot: tmpdir(), workflowId: good }), good);
  assert.throws(() => createKeyedJournal({ workflowDataRoot: 'relative/root', workflowId: WF }), (e) => e.code === 'WORKFLOW_REPLAY_INVALID');
  const journal = createKeyedJournal({ workflowDataRoot: tmpdir(), workflowId: WF });
  await assert.rejects(journal.lookup('sha256:../../x'), (e) => e.code === 'WORKFLOW_REPLAY_INVALID');
});

test('the replay/ folder does not disturb the Workflow store startup scan', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  await journal.record(chiaveDellaChiamata('p', {}, 0), { value: 'v', runId: 'r' });
  const store = await createWorkflowStore({ workflowDataRoot: root, resultLimits: { maxItemBytes: 1024 * 1024, maxRunBytes: 4 * 1024 * 1024 } });
  try {
    assert.equal(store.state, 'ready', JSON.stringify(store.diagnostics));
    assert.deepEqual(store.diagnostics, []);
  } finally { await store.close(); }
  assert.ok(readdirSync(join(root, 'replay', WF)).length === 1);
});

/* ---- Review cures of 05/11/2026 (WF-BLOCCO1-REVISIONE-GIORNALE): each test was RED on b735b0dbe or kills a live mutant. ---- */

const OLD = (Date.now() - 2 * REPAIR_AFTER_MS) / 1000;
const indexFile = (root, key) => join(root, 'replay', WF, key.slice(7, 9), `${key.slice(7)}.json`);
const casFile = (root, sha) => join(root, 'cas', 'sha256', sha.slice(7, 9), sha.slice(7));

test('non-characters and lone surrogates get a key and record: a prompt is never refused for its text', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const keys = ['￿', '﷐', '\uD800', 'a\uDC00b'].map((p) => chiaveDellaChiamata(p, { note: p }, 0));
  for (const key of keys) assert.match(key, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(new Set(keys).size, 4);
  await journal.record(keys[2], { value: { text: 'x\uD800y￿' }, runId: 'r' });
  assert.deepEqual((await journal.lookup(keys[2])).value, { text: 'x\uD800y￿' });
});

test('undefined fields, -0 and a Date record and come back as JSON would hand them', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const cases = [[{ a: undefined, b: 1 }, { b: 1 }], [-0, 0], [new Date(0), '1970-01-01T00:00:00.000Z'], [[undefined], [null]]];
  for (const [i, [value, expected]] of cases.entries()) {
    const key = chiaveDellaChiamata('p', {}, i);
    assert.equal(await journal.record(key, { value, runId: 'r' }), 'recorded');
    assert.deepEqual((await journal.lookup(key)).value, expected);
  }
});

test('a truncated or empty index older than a minute is removed, and the next record writes it again', async (t) => {
  for (const damage of ['', '{"schema":"talos.wor']) {
    const root = rootFor(t);
    const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
    const key = chiaveDellaChiamata('p', {}, 0);
    await journal.record(key, { value: 'v', runId: 'r' });
    writeFileSync(indexFile(root, key), damage);
    utimesSync(indexFile(root, key), OLD, OLD);
    assert.equal(await journal.lookup(key), null);
    assert.ok(journal.diagnostics.some((d) => d.code === 'WORKFLOW_REPLAY_REPAIRED'), JSON.stringify(journal.diagnostics));
    assert.equal(existsSync(indexFile(root, key)), false);
    assert.equal(await journal.record(key, { value: 'again', runId: 'r2' }), 'recorded');
    assert.equal((await journal.lookup(key)).value, 'again');
  }
});

test('a damaged index younger than a minute is left alone: it may still be being written', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const key = chiaveDellaChiamata('p', {}, 0);
  await journal.record(key, { value: 'v', runId: 'r' });
  writeFileSync(indexFile(root, key), '{"sch');
  assert.equal(await journal.lookup(key), null);
  assert.ok(existsSync(indexFile(root, key)));
  assert.ok(!journal.diagnostics.some((d) => d.code === 'WORKFLOW_REPLAY_REPAIRED'));
  // record() reads what holds the key: a broken index is never answered 'already' (review 2, LOW 5); a young one is not removed.
  await assert.rejects(journal.record(key, { value: 'w', runId: 'r' }), (e) => e.code === 'WORKFLOW_REPLAY_INDEX_INVALID');
  assert.equal(readFileSync(indexFile(root, key), 'utf8'), '{"sch');
  for (const damage of ['{}', JSON.stringify({ schema: 'talos.workflow-replay.v1', workflowId: WF, key: chiaveDellaChiamata('other', {}, 0), resultSha256: `sha256:${'a'.repeat(64)}` })]) {
    writeFileSync(indexFile(root, key), damage);
    await assert.rejects(journal.record(key, { value: 'w', runId: 'r' }), (e) => e.code === 'WORKFLOW_REPLAY_INDEX_INVALID', damage);
  }
});

// 17/11/2026 (PR 96, list item 96): on the runner the test above went red 2 runs out of 3. Date.now() is a whole millisecond and
// NTFS keeps the fraction, so the index just written had a negative age and "future = old" removed it. Here the lead is set by
// hand (1.5 s, inside the 2 s grain) so the order of two clocks does not decide; an hour ahead is still old (review 3, note 2).
test('a damaged index whose mtime leads the clock by the grain of the file system is young; an hour ahead is still old', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const key = chiaveDellaChiamata('p', {}, 0);
  await journal.record(key, { value: 'v', runId: 'r' });
  writeFileSync(indexFile(root, key), '{"sch');
  const justAhead = (Date.now() + 1500) / 1000;
  utimesSync(indexFile(root, key), justAhead, justAhead);
  assert.equal(await journal.lookup(key), null);
  assert.ok(existsSync(indexFile(root, key)), 'a file written "1.5 s from now" may still be being written: left alone');
  assert.ok(!journal.diagnostics.some((d) => d.code === 'WORKFLOW_REPLAY_REPAIRED'), JSON.stringify(journal.diagnostics));
  const anHourAhead = (Date.now() + 60 * 60 * 1000) / 1000;
  utimesSync(indexFile(root, key), anHourAhead, anHourAhead);
  assert.equal(await journal.lookup(key), null);
  assert.ok(!existsSync(indexFile(root, key)), 'an mtime an hour in the future is a moved clock or a copied file: old, removed');
  assert.ok(journal.diagnostics.some((d) => d.code === 'WORKFLOW_REPLAY_REPAIRED'), JSON.stringify(journal.diagnostics));
});

test('record() on a valid index written by another run answers already; on a broken index older than a minute it repairs and records', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const key = chiaveDellaChiamata('p', {}, 0);
  assert.equal(await journal.record(key, { value: 'v', runId: 'r1' }), 'recorded');
  assert.equal(await journal.record(key, { value: 'other', runId: 'r2' }), 'already', 'first writer wins, a different value is not an error');
  assert.equal((await journal.lookup(key)).value, 'v');
  writeFileSync(indexFile(root, key), '{"sch');
  utimesSync(indexFile(root, key), OLD, OLD);
  assert.equal(await journal.record(key, { value: 'fresh', runId: 'r3' }), 'recorded');
  assert.ok(journal.diagnostics.some((d) => d.code === 'WORKFLOW_REPLAY_REPAIRED'), JSON.stringify(journal.diagnostics));
  assert.equal((await journal.lookup(key)).value, 'fresh');
});

test('a corrupt value older than a minute is removed with its index (value first); the call can be recorded again', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const key = chiaveDellaChiamata('p', {}, 0);
  await journal.record(key, { value: 'good', runId: 'r' });
  const sha = JSON.parse(readFileSync(indexFile(root, key), 'utf8')).resultSha256;
  writeFileSync(casFile(root, sha), '"evil"');
  utimesSync(casFile(root, sha), OLD, OLD);
  utimesSync(indexFile(root, key), OLD, OLD);
  assert.equal(await journal.lookup(key), null);
  assert.equal(existsSync(casFile(root, sha)), false);
  assert.equal(existsSync(indexFile(root, key)), false);
  assert.equal(await journal.record(key, { value: 'good', runId: 'r2' }), 'recorded');
  assert.equal((await journal.lookup(key)).value, 'good');
});

test('an index whose value is missing (older than a minute) is removed', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const key = chiaveDellaChiamata('p', {}, 0);
  await journal.record(key, { value: 'v', runId: 'r' });
  const sha = JSON.parse(readFileSync(indexFile(root, key), 'utf8')).resultSha256;
  unlinkSync(casFile(root, sha));
  utimesSync(indexFile(root, key), OLD, OLD);
  assert.equal(await journal.lookup(key), null);
  assert.equal(existsSync(indexFile(root, key)), false);
});

test('an index naming another workflow, or larger than 16 KB, is a miss, never a hit', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const key = chiaveDellaChiamata('p', {}, 0);
  await journal.record(key, { value: 'v', runId: 'r' });
  const index = JSON.parse(readFileSync(indexFile(root, key), 'utf8'));
  writeFileSync(indexFile(root, key), JSON.stringify({ ...index, workflowId: 'another-workflow' }));
  assert.equal(await journal.lookup(key), null);
  writeFileSync(indexFile(root, key), JSON.stringify({ ...index, pad: 'x'.repeat(17 * 1024) }));
  assert.equal(await journal.lookup(key), null);
  writeFileSync(indexFile(root, key), JSON.stringify({ ...index, pad: 'x'.repeat(15 * 1024) }));
  assert.equal((await journal.lookup(key)).value, 'v', 'a well-formed index under the cap still hits');
});

test('a negative or non-finite cost is stored and served as 0', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const key = chiaveDellaChiamata('p', {}, 0);
  await journal.record(key, { value: 'v', costUsd: -1, runId: 'r' });
  assert.equal(JSON.parse(readFileSync(indexFile(root, key), 'utf8')).costUsd, 0);
  assert.equal((await journal.lookup(key)).costUsd, 0);
  const index = JSON.parse(readFileSync(indexFile(root, key), 'utf8'));
  for (const costUsd of [-5, 'x']) {
    writeFileSync(indexFile(root, key), JSON.stringify({ ...index, costUsd }));
    assert.equal((await journal.lookup(key)).costUsd, 0, String(costUsd));
  }
  writeFileSync(indexFile(root, key), JSON.stringify({ ...index, costUsd: 0.5 }));
  assert.equal((await journal.lookup(key)).costUsd, 0.5);
});

test('sweepTemporaries removes index temporaries older than an hour, nothing else', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  assert.equal(await journal.sweepTemporaries(), 0, 'no folder yet');
  const folder = join(root, 'temp', 'replay');
  mkdirSync(folder, { recursive: true });
  const twoHoursAgo = (Date.now() - 2 * 60 * 60 * 1000) / 1000;
  for (const name of ['old.tmp', 'young.tmp', 'old.keep']) writeFileSync(join(folder, name), 'x');
  utimesSync(join(folder, 'old.tmp'), twoHoursAgo, twoHoursAgo);
  utimesSync(join(folder, 'old.keep'), twoHoursAgo, twoHoursAgo);
  const halfAnHourAgo = (Date.now() - 30 * 60 * 1000) / 1000;
  utimesSync(join(folder, 'young.tmp'), halfAnHourAgo, halfAnHourAgo);
  assert.equal(await journal.sweepTemporaries(), 1);
  assert.deepEqual(readdirSync(folder).sort(), ['old.keep', 'young.tmp']);
  assert.equal(await journal.sweepTemporaries({ now: Date.now() + 2 * 60 * 60 * 1000 }), 1, 'the young one ages out');
});

test('an index naming another workflow, older than a minute, is removed and the call can be recorded again', async (t) => {
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  const key = chiaveDellaChiamata('p', {}, 0);
  await journal.record(key, { value: 'v', runId: 'r' });
  const index = JSON.parse(readFileSync(indexFile(root, key), 'utf8'));
  writeFileSync(indexFile(root, key), JSON.stringify({ ...index, workflowId: 'another-workflow' }));
  utimesSync(indexFile(root, key), OLD, OLD);
  assert.equal(await journal.lookup(key), null);
  assert.equal(existsSync(indexFile(root, key)), false, 'the foreign index is removed');
  assert.ok(journal.diagnostics.some((d) => d.code === 'WORKFLOW_REPLAY_REPAIRED'), JSON.stringify(journal.diagnostics));
  assert.equal(await journal.record(key, { value: 'v', runId: 'r2' }), 'recorded');
  assert.equal((await journal.lookup(key)).value, 'v');
});

test('stable JSON refuses a value nested deeper than MAX_STABLE_DEPTH with its own code, and accepts one level less', async (t) => {
  const nest = (n) => { let v = 0; for (let i = 0; i < n; i += 1) v = [v]; return v; };
  assert.equal(jsonStabile(nest(MAX_STABLE_DEPTH)).length, 2 * MAX_STABLE_DEPTH + 1);
  assert.throws(() => jsonStabile(nest(MAX_STABLE_DEPTH + 1)), { code: 'WORKFLOW_STABLE_JSON_INVALID' });
  const root = rootFor(t);
  const journal = createKeyedJournal({ workflowDataRoot: root, workflowId: WF });
  await assert.rejects(journal.record(chiaveDellaChiamata('p', {}, 0), { value: nest(MAX_STABLE_DEPTH + 1) }), { code: 'WORKFLOW_STABLE_JSON_INVALID' });
});
