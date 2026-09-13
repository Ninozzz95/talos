import assert from 'node:assert/strict';
import test from 'node:test';

import { createStreamPartitioner } from '../src/stream-partition.mjs';

test('tag think spezzato tra chunk resta solo nel canale ragionamento', () => {
  const parts = [];
  const add = (kind, value) => {
    const previous = parts.at(-1);
    if (previous?.[0] === kind) previous[1] += value;
    else parts.push([kind, value]);
  };
  const parser = createStreamPartitioner({
    onText: (value) => add('text', value),
    onReasoning: (value) => add('reasoning', value),
    onToolCall: (value) => parts.push(['tool', value]),
  });
  parser.push('prima<thi');
  parser.push('nk>passo');
  parser.push(' nascosto</think>finale');
  parser.finish();
  assert.deepEqual(parts, [
    ['text', 'prima'],
    ['reasoning', 'passo nascosto'],
    ['text', 'finale'],
  ]);
});

test('blocco tool call spezzato non raggiunge il testo e conserva il payload', () => {
  const parts = [];
  const parser = createStreamPartitioner({
    onText: (value) => {
      const previous = parts.at(-1);
      if (previous?.[0] === 'text') previous[1] += value;
      else parts.push(['text', value]);
    },
    onReasoning: (value) => parts.push(['reasoning', value]),
    onToolCall: (value) => parts.push(['tool', value]),
  });
  parser.push('risposta<tool_call_');
  parser.push('start>');
  parser.push('{"name":"library_search","arguments":{"query":"pollo"}}');
  parser.push('<tool_call_');
  parser.push('end>fine');
  parser.finish();
  assert.deepEqual(parts, [
    ['text', 'risposta'],
    ['tool', { name: 'library_search', arguments: '{"query":"pollo"}' }],
    ['text', 'fine'],
  ]);
});

test('un delimitatore think non chiuso resta ragionamento, mai testo visibile', () => {
  const parts = [];
  const parser = createStreamPartitioner({ onText: (value) => parts.push(['text', value]), onReasoning: (value) => parts.push(['reasoning', value]), onToolCall: () => {} });
  parser.push('<think>parziale');
  parser.finish();
  assert.deepEqual(parts, [['reasoning', 'parziale']]);
});
