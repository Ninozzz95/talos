import assert from 'node:assert/strict';
import test from 'node:test';

import {toolCallResult} from '../src/agui-events.mjs';
import {avviaSessione} from '../src/agent-service.mjs';
import {talosLavora} from '../src/kernel/talosHarness.mjs';

function receipt(toolCallId, exitCode, sandboxEnforcement) {
  return {
    schema_version: 1,
    azione: 'shell',
    toolCallId,
    consentito: true,
    via: 'sessione',
    motivo: null,
    status: exitCode === 0 ? 'succeeded' : 'failed',
    evidence: {exitCode, sandboxEnforcement},
  };
}

test('M4-E RED: ToolCallResult carries an optional structured receipt without changing legacy shape when absent', () => {
  const r = receipt('c1', 0, 'windows-sandbox');

  assert.deepEqual(
    toolCallResult({messageId: 'm1', toolCallId: 'c1', content: 'exit 0', receipt: r}),
    {type: 'ToolCallResult', messageId: 'm1', toolCallId: 'c1', content: 'exit 0', role: 'tool', receipt: r},
  );

  assert.deepEqual(
    toolCallResult({messageId: 'm2', toolCallId: 'c2', content: 'done'}),
    {type: 'ToolCallResult', messageId: 'm2', toolCallId: 'c2', content: 'done', role: 'tool'},
    'legacy consumers must not see a synthetic receipt key when the kernel reported none',
  );
});

test('M4-E RED: agent-service correlates receipts by toolCallId and consumes each receipt once', async () => {
  const events = [];
  const receiptOne = receipt('c1', 0, 'windows-sandbox');
  const receiptTwo = receipt('c2', 7, 'none');

  const talosLavoraFn = async (input) => {
    input.onGiro?.({giro: 0, tipo: 'ricevuta', ricevuta: receiptTwo});
    input.onGiro?.({giro: 0, tipo: 'ricevuta', ricevuta: receiptOne});
    input.onGiro?.({giro: 0, tipo: 'tool-esito', toolCallId: 'c1', content: 'exit 0'});
    input.onGiro?.({giro: 0, tipo: 'tool-esito', toolCallId: 'c2', content: 'exit 7'});
    input.onGiro?.({giro: 0, tipo: 'tool-esito', toolCallId: 'c1', content: 'duplicate terminal event'});
    return {comeFinita: 'concluso', detto: 'fatto'};
  };

  await avviaSessione({
    cartella: '/tmp/x',
    task: {consegna: 'm4e'},
    modello: 'm',
    chiave: 'k',
    onEvento: (event) => events.push(event),
    talosLavoraFn,
  });

  const toolResults = events.filter((event) => event.type === 'ToolCallResult');
  assert.equal(toolResults.length, 3);
  assert.deepEqual(toolResults[0].receipt, receiptOne, 'c1 receives only c1 receipt');
  assert.deepEqual(toolResults[1].receipt, receiptTwo, 'c2 receives only c2 receipt');
  assert.equal(
    Object.hasOwn(toolResults[2], 'receipt'),
    false,
    'a consumed receipt must not leak onto a duplicate terminal event',
  );
});

test('M4-E RED: approval action carries the exact current toolCallId without changing the decision', async () => {
  const responses = [
    {
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'approval-call-17',
        function: {name: 'scrivi', arguments: '{"percorso":"x.txt","contenuto":"ciao"}'},
      }],
    },
    {role: 'assistant', content: 'done', tool_calls: []},
  ];
  let index = 0;
  const seenApprovals = [];
  const fetchDiRete = async (_url, options) => {
    const message = responses[Math.min(index++, responses.length - 1)];
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{message}],
        usage: {prompt_tokens: 1, completion_tokens: 1},
      }),
      text: async () => '',
    };
  };

  await talosLavora({
    cartella: process.cwd(),
    task: {consegna: 'm4e approval correlation'},
    modello: 'x',
    chiave: 'y',
    fetchDiRete,
    livelloAccesso: 'accesso-pieno',
    permessiPerAttrezzo: {scrivi: 'chiedi'},
    chiediApprovazioneFn: async (action) => {
      seenApprovals.push(action);
      return false;
    },
  });

  assert.equal(seenApprovals.length, 1);
  assert.equal(
    seenApprovals[0].toolCallId,
    'approval-call-17',
    'approval must identify the exact tool row; order/text inference is not acceptable',
  );
});

test('M4-E RED: explicit tool-annullato remains a structured cancelled terminal outcome', async () => {
  const events = [];
  const talosLavoraFn = async (input) => {
    input.onDelta?.({
      tipo: 'tool-annullato',
      indice: 0,
      toolCallId: 'cancel-1',
      nome: 'shell',
      motivo: 'stopped before execution',
    });
    return {comeFinita: 'fermato', detto: 'stopped'};
  };

  await avviaSessione({
    cartella: '/tmp/x',
    task: {consegna: 'm4e cancellation'},
    modello: 'm',
    chiave: 'k',
    onEvento: (event) => events.push(event),
    talosLavoraFn,
  });

  const result = events.find((event) => event.type === 'ToolCallResult' && event.toolCallId === 'cancel-1');
  assert.ok(result, 'cancelled announced tool must still receive a terminal ToolCallResult');
  assert.equal(result.content, 'stopped before execution');
  assert.equal(result.outcome, 'cancelled', 'the kernel already reported cancellation explicitly; do not recover it from prose');
});

