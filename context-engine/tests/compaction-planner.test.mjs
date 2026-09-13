import test from 'node:test';
import assert from 'node:assert/strict';
import { computeContextBudget, selectClosedPrefix, planCompaction } from '../src/compaction-planner.mjs';
const record = (sequence, role, content, extra = {}) => ({ id: `m${sequence}`, sequence, message: { role, content, ...extra } });

test('CTX-SMALL-COMPLETE-TURN: manual fallback keeps the latest question and answer together', () => {
  const one = [record(1, 'user', 'ciao'), record(2, 'assistant', 'ciao!')];
  assert.deepEqual(selectClosedPrefix(one, { force: true }).prefix, []);
  const two = [...one, record(3, 'user', 'come va?'), record(4, 'assistant', 'bene')];
  const selected = selectClosedPrefix(two, { force: true });
  assert.deepEqual(selected.prefix, one);
  assert.deepEqual(selected.tail, two.slice(2));
  const withTool = [...one, record(3, 'user', 'leggi il file'), record(4, 'assistant', null, { tool_calls: [{ id: 'read', function: { name: 'read', arguments: '{}' } }] }), record(5, 'tool', 'contenuto', { tool_call_id: 'read' }), record(6, 'assistant', 'letto')];
  assert.deepEqual(selectClosedPrefix(withTool, { force: true }).tail, withTool.slice(2));
});

test('CTX-BUDGET: count complete request and reserve response before deciding available input', () => {
  const budget = computeContextBudget({ windowTokens: 16384, responseReserve: 4096, method: 'runtime', inputTokens: 12000 });
  assert.ok(budget.inputLimit < 12288);
  assert.equal(budget.fits, false);
  assert.ok(computeContextBudget({ windowTokens: 16384, responseReserve: 4096, method: 'heuristic' }).inputLimit < budget.inputLimit);
  assert.throws(() => computeContextBudget({ windowTokens: 4096, responseReserve: 4096 }), { code: 'CTX_CONTEXT_TOO_SMALL' });
});

test('CTX-TOOL-PAIRING: retained recent turns never cut a call away from its result', () => {
  const records = [record(1, 'system', 'regole'), record(2, 'user', 'prima'), record(3, 'assistant', null, { tool_calls: [{ id: 'a', type: 'function', function: { name: 'read', arguments: '{}' } }] }), record(4, 'tool', 'risultato', { tool_call_id: 'a' }), record(5, 'assistant', 'fatto'), record(6, 'user', 'seconda'), record(7, 'assistant', 'risposta'), record(8, 'user', 'terza')];
  const plan = selectClosedPrefix(records, { retainRecentTurns: 2 });
  assert.deepEqual(plan.prefix.map(r => r.sequence), [1, 2, 3, 4, 5]);
  assert.deepEqual(plan.tail.map(r => r.sequence), [6, 7, 8]);
  const missing = selectClosedPrefix(records.filter(r => r.sequence !== 4), { retainRecentTurns: 2 });
  assert.ok(missing.prefix.every(r => r.sequence < 3));
});

test('CTX-SEGMENT-OVERSIZE: a single huge tool result becomes bounded source excerpts, originals untouched', () => {
  const records = [record(1, 'user', 'controlla'), record(2, 'assistant', null, { tool_calls: [{ id: 'a', type: 'function', function: { name: 'read', arguments: '{}' } }] }), record(3, 'tool', 'x'.repeat(100000) + ' VALORE_IMPORTANTE_97', { tool_call_id: 'a' }), record(4, 'assistant', 'fatto'), record(5, 'user', 'riprendiamo')];
  const before = JSON.stringify(records);
  const plan = planCompaction(records, { windowTokens: 4096, responseReserve: 1024, method: 'runtime', retainRecentTurns: 1 });
  assert.ok(plan.segments.length > 2);
  assert.ok(plan.segments.every(s => s.text.length <= plan.maxSegmentChars));
  assert.ok(plan.segments.some(s => s.text.includes('VALORE_IMPORTANTE_97')));
  assert.equal(JSON.stringify(records), before);
  assert.equal(plan.coveredThrough, 4);
});
