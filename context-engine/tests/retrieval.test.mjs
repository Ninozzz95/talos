import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkContextRecords, rankContextSources, selectContextEvidence } from '../src/retrieval.mjs';

const record = (id, content, sequence = 1) => ({ id, sessionId: 'chat-a', sequence, message: { role: 'user', content } });

test('CTX-RETRIEVAL-UNICODE chunks cover exact text without broken surrogate offsets', () => {
  const text = 'abc😀é世界🐘 xyz'.repeat(4);
  const chunks = chunkContextRecords([record('r', text)], { maxChars: 8, overlapChars: 2 });
  assert.deepEqual(chunkContextRecords([record('r', text)], { maxChars: 8, overlapChars: 2 }), chunks);
  assert.equal(new Set(chunks.map(c => c.id)).size, chunks.length);
  const covered = new Set();
  for (const chunk of chunks) {
    assert.equal(chunk.text, text.slice(chunk.start, chunk.end));
    assert.ok(chunk.text.isWellFormed());
    assert.ok(chunk.text.length <= 8);
    for (let i = chunk.start; i < chunk.end; i++) covered.add(i);
  }
  assert.equal(covered.size, text.length);
  assert.throws(() => chunkContextRecords([], { maxChars: 1, overlapChars: 0 }), { code: 'CTX_RETRIEVAL_INVALID' });
  assert.throws(() => chunkContextRecords([], { maxChars: 8, overlapChars: 8 }), { code: 'CTX_RETRIEVAL_INVALID' });
});

test('CTX-RETRIEVAL-OPAQUE excludes image bytes and provider signatures from indexing', () => {
  const rows = [record('r', [{ type: 'text', text: 'prima' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,SECRET' } }, { type: 'thinking', thinking: 'opaque', signature: 'SECRET' }, { type: 'input_text', text: 'dopo' }])];
  rows[0].message.talos_provider_state = { secret: 'SECRET' };
  assert.equal(chunkContextRecords(rows)[0].text, 'prima\ndopo');
  assert.deepEqual(chunkContextRecords([record('empty', [{ type: 'image', source: { data: 'SECRET' } }])]), []);
});

test('CTX-SESSION-ISOLATION refuses mixed record and hit sessions', () => {
  assert.throws(() => chunkContextRecords([record('a', 'a'), { ...record('b', 'b'), sessionId: 'chat-b' }]), { code: 'CTX_SESSION_ISOLATION' });
  const a = { ...chunkContextRecords([record('a', 'a')])[0], sessionId: 'a' };
  assert.throws(() => rankContextSources({ lexical: [a], semantic: [{ ...a, sessionId: 'b' }] }), { code: 'CTX_SESSION_ISOLATION' });
});

test('CTX-RETRIEVAL-RRF deduplicates each list and gives deterministic reciprocal ranks', () => {
  const [a, b, c] = ['a', 'b', 'c'].map((id, i) => ({ ...chunkContextRecords([record(id, id, i + 1)])[0], score: 900 - i }));
  const ranked = rankContextSources({ lexical: [a, a, b], semantic: [b, c] });
  assert.deepEqual(ranked.map(h => h.recordId), ['b', 'a', 'c']);
  assert.equal(ranked[0].score, 1 / 62 + 1 / 61);
  assert.equal(a.score, 900);
  assert.throws(() => rankContextSources({ lexical: [a], semantic: [{ ...a, text: 'z' }] }), { code: 'CTX_SOURCE_CONFLICT' });
});

test('CTX-RETRIEVAL-EVIDENCE preserves whole hits when possible and clips with valid offsets', () => {
  const hits = chunkContextRecords([record('r', '😀éabcdef'), record('s', 'ok', 2)]);
  const selected = selectContextEvidence(hits, { maxChars: 6 });
  assert.equal(selected.reduce((n, h) => n + h.text.length, 0), 6);
  for (const hit of selected) {
    const source = hits.find(h => h.id === hit.id);
    assert.ok(hit.text.isWellFormed());
    assert.equal(source.text.slice(hit.start - source.start, hit.end - source.start), hit.text);
  }
  assert.equal(selected.find(h => h.recordId === 's').text, 'ok');
  assert.deepEqual(selectContextEvidence(hits, { maxChars: 0 }), []);
});
