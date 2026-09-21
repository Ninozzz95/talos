import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBoundedResumeSink } from '../src/local-resume-diagnostics.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

test('100 explicitly gated writes reserve bytes before enqueue and hold flush until completion', async () => {
  for (let iteration = 0; iteration < 100; iteration++) {
    const started = deferred(), finish = deferred(), calls = [];
    const sink = createBoundedResumeSink({
      directory: '/unused', maxQueuedBytes: 20, maxDiskBytes: 50,
      write: async (...args) => { calls.push(args); started.resolve(); await finish.promise; },
    });
    let flushed = false;
    try {
      assert.equal(sink.privateRequest('r1', 'x'.repeat(15)), true);
      assert.equal(sink.privateRequest('r2', 'x'.repeat(15)), false);
      assert.equal(sink.stats().queuedBytes, 15);
      const completion = sink.flush().then(stats => { flushed = true; return stats; });
      await started.promise;
      assert.equal(flushed, false);
      assert.equal(calls.length, 1);
      finish.resolve();
      const stats = await completion;
      assert.deepEqual(stats, { queuedBytes: 0, reservedBytes: 15, dropped: 1, errors: 0 });
    } finally {
      finish.resolve();
      await sink.flush();
    }
  }
});

test('queued writers are serialized and total disk reservation survives completed writes', async () => {
  const firstStarted = deferred(), finishFirst = deferred(), calls = [];
  const sink = createBoundedResumeSink({
    directory: '/unused', maxQueuedBytes: 40, maxDiskBytes: 30,
    write: async (...args) => {
      calls.push(args);
      if (calls.length === 1) { firstStarted.resolve(); await finishFirst.promise; }
    },
  });
  try {
    assert.equal(sink.privateRequest('r1', 'x'.repeat(15)), true);
    assert.equal(sink.privateRequest('r2', 'x'.repeat(15)), true);
    await firstStarted.promise;
    assert.equal(calls.length, 1);
    assert.equal(sink.stats().queuedBytes, 30);
    finishFirst.resolve();
    await sink.flush();
    assert.equal(calls.length, 2);
    assert.equal(sink.privateRequest('r3', 'x'), false);
    assert.deepEqual(sink.stats(), { queuedBytes: 0, reservedBytes: 30, dropped: 1, errors: 0 });
  } finally { finishFirst.resolve(); await sink.flush(); }
});

test('a gated write failure releases queue bytes and prevents accepting later writes', async () => {
  const started = deferred(), fail = deferred();
  const sink = createBoundedResumeSink({ directory: '/unused', write: async () => {
    started.resolve(); await fail.promise; throw new Error('controlled-write-failure');
  } });
  try {
    assert.equal(sink.privateRequest('r1', 'abc'), true);
    await started.promise;
    fail.resolve();
    assert.deepEqual(await sink.flush(), { queuedBytes: 0, reservedBytes: 3, dropped: 0, errors: 1 });
    assert.equal(sink.privateRequest('r2', 'abc'), false);
    assert.equal(sink.stats().dropped, 1);
  } finally { fail.resolve(); await sink.flush(); }
});

test('real filesystem flush writes exact private bytes and metadata to distinct files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'talos-resume-sink-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'private'));
  const sink = createBoundedResumeSink({ directory });
  const body = '{ "messages": [{"content":"fixture à 😀"}], "tools": [] }';
  assert.equal(sink.privateRequest('r1', body), true);
  assert.equal(sink.record({ type: 'fixture-metadata', requestId: 'r1' }), true);
  const stats = await sink.flush();
  assert.equal(stats.errors, 0); assert.equal(stats.dropped, 0); assert.equal(stats.queuedBytes, 0);
  assert.equal(await readFile(join(directory, 'private', 'r1.request.json'), 'utf8'), body);
  assert.deepEqual((await readdir(directory)).sort(), ['events.jsonl', 'private']);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'events.jsonl'), 'utf8')), { type: 'fixture-metadata', requestId: 'r1' });
});
